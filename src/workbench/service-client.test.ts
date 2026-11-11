// Date: 2026-11-12. Isolated transport failures and genuine response mapping; no real credentials.
import { describe, expect, test } from "bun:test";
import { createScenario } from "./contract/fixtures";
import { blankPreferences, checkedPreferences, type NativeCall, ServiceWorkbenchClient } from "./service-client";

function panel(revision = 1) {
	const snapshot = structuredClone(createScenario("multi-project").snapshot);
	if (!snapshot) throw Error("Fixture required");
	snapshot.mode = "service";
	snapshot.revision = revision;
	for (const group of [
		snapshot.projects,
		snapshot.plans,
		snapshot.steps,
		snapshot.routes,
		snapshot.bindings,
		snapshot.executions,
		snapshot.supplements,
	])
		for (const item of group) item.id = `${item.key}/real`;
	return { snapshot, preferences: { ...blankPreferences(), selected: snapshot.steps[1]?.key ?? "" } };
}
const call =
	(handler: (command: string, args?: Record<string, unknown>) => unknown): NativeCall =>
	async <T>(command: string, args?: Record<string, unknown>) =>
		(await handler(command, args)) as T;
describe("native service client", () => {
	test("first read errors expose offline without mock fallback, then reconnects", async () => {
		let fail = true;
		const client = new ServiceWorkbenchClient(
			call(() => {
				if (fail) throw Error("OWNER_UNAVAILABLE");
				return panel();
			}),
		);
		const first = await client.read();
		expect(first.mode).toBe("service");
		expect(first.snapshot).toBeNull();
		expect(first.connection.state).toBe("offline");
		fail = false;
		const ready = await client.read();
		expect(ready.connection.state).toBe("ready");
		expect(ready.snapshot?.revision).toBe(1);
		expect(ready.capabilities.businessWrite).toBe(false);
	});
	test("denial, timeout and incompatible data preserve previous snapshot and success time", async () => {
		let response: unknown = panel(4);
		const client = new ServiceWorkbenchClient(
			call(() => {
				if (response instanceof Error) throw response;
				return response;
			}),
		);
		const valid = await client.read();
		for (const [value, state] of [
			[Error("UNAUTHORIZED"), "unauthorized"],
			[Error("OWNER_UNAVAILABLE"), "offline"],
			[{ snapshot: { schemaVersion: "other" }, preferences: null }, "incompatible"],
		] as const) {
			response = value;
			const next = await client.read();
			expect(next.connection.state).toBe(state);
			expect(next.snapshot).toEqual(valid.snapshot);
			expect(next.connection.lastSuccessAt).toBe(valid.connection.lastSuccessAt);
		}
	});
	test("old revision cannot replace newer data", async () => {
		let value = panel(9);
		const client = new ServiceWorkbenchClient(call(() => value));
		await client.read();
		value = panel(8);
		const old = await client.read();
		expect(old.snapshot?.revision).toBe(9);
		expect(old.connection.state).toBe("stale");
	});
	test("reading preferences require successful hydration, preserve supplied keys and use narrow command", async () => {
		const operations: string[] = [];
		const client = new ServiceWorkbenchClient(
			call((command) => {
				operations.push(command);
				return command === "island_workbench_read" ? panel() : { saved: true };
			}),
		);
		await expect(client.savePreferences(blankPreferences())).rejects.toThrow("PREFERENCES_NOT_READY");
		await client.read();
		expect(client.preferences?.selected).toBe(panel().preferences.selected);
		const prefs = {
			...blankPreferences(),
			selected: "stage",
			y: { "island/list": 50 },
			scroll: { "island/route/main": 120 },
		};
		await client.savePreferences(prefs);
		expect(client.preferences).toEqual(prefs);
		expect(operations).toEqual(["island_workbench_read", "island_workbench_save_preferences"]);
		const copy = client.preferences;
		if (copy) copy.selected = "tampered";
		expect(client.preferences?.selected).toBe("stage");
	});
	test("saving positions is serialized and failed saves never claim persisted", async () => {
		let inFlight = 0;
		let maxFlight = 0;
		let reject = false;
		const client = new ServiceWorkbenchClient(
			call(async (command) => {
				if (command === "island_workbench_read") return panel();
				++inFlight;
				maxFlight = Math.max(maxFlight, inFlight);
				await new Promise((r) => setTimeout(r, 5));
				--inFlight;
				if (reject) throw Error("OWNER_UNAVAILABLE");
				return { saved: true };
			}),
		);
		await client.read();
		await Promise.all([
			client.savePreferences({ ...blankPreferences(), selected: "first" }),
			client.savePreferences({ ...blankPreferences(), selected: "latest" }),
		]);
		expect(maxFlight).toBe(1);
		expect(client.preferences?.selected).toBe("latest");
		reject = true;
		await expect(client.savePreferences(blankPreferences())).rejects.toThrow();
		expect(client.preferences?.selected).toBe("latest");
	});
	test("query without original principal/project/operation stays unknown without transport calls", async () => {
		const client = new ServiceWorkbenchClient(
			call(() => {
				throw Error("Should not call transport");
			}),
		);
		expect(await client.queryEvent("original-event")).toEqual({
			eventId: "original-event",
			state: "unknown",
			committedRevision: null,
		});
	});
	test("invalid preferences and service identities fail closed", async () => {
		for (const value of [
			{ ...blankPreferences(), y: { list: -1 } },
			{ ...blankPreferences(), token: "never" },
		])
			expect(() => checkedPreferences(value)).toThrow();
		const client = new ServiceWorkbenchClient(
			call(() => ({ ...panel(), snapshot: createScenario("multi-project").snapshot })),
		);
		const e = await client.read();
		expect(e.snapshot).toBeNull();
		expect(e.connection.state).toBe("incompatible");
	});
	test("superseded read failures never replace a newer ready state or block preferences", async () => {
		for (const error of ["UNAUTHORIZED", "OWNER_UNAVAILABLE"]) {
			let rejectFirst: (error: Error) => void = () => {
				throw Error("Missing deferred read");
			};
			let reads = 0;
			const client = new ServiceWorkbenchClient(
				call((command) => {
					if (command !== "island_workbench_read") return { saved: true };
					if (++reads === 1)
						return new Promise((_, reject) => {
							rejectFirst = reject;
						});
					return panel(9);
				}),
			);
			const first = client.read();
			const latest = await client.read();
			rejectFirst(Error(error));
			const outdated = await first;
			expect(latest.connection.state).toBe("ready");
			expect(outdated.connection.state).toBe("ready");
			expect(outdated.snapshot?.revision).toBe(9);
			await client.savePreferences({ ...blankPreferences(), selected: "latest" });
			expect(client.preferences?.selected).toBe("latest");
		}
	});
	test("superseded old revisions cannot downgrade connection or hydrate stale preferences", async () => {
		let resolveFirst: (value: ReturnType<typeof panel>) => void = () => {
			throw Error("Missing deferred read");
		};
		let reads = 0;
		const newest = panel(9);
		newest.preferences.selected = "newest-selection";
		const client = new ServiceWorkbenchClient(
			call((command) => {
				if (command !== "island_workbench_read") return { saved: true };
				if (++reads === 1)
					return new Promise((resolve) => {
						resolveFirst = resolve;
					});
				return newest;
			}),
		);
		const first = client.read();
		await client.read();
		const older = panel(8);
		older.preferences.selected = "old-selection";
		resolveFirst(older);
		const result = await first;
		expect(result.connection.state).toBe("ready");
		expect(result.snapshot?.revision).toBe(9);
		expect(client.preferences?.selected).toBe("newest-selection");
		await expect(client.savePreferences(blankPreferences())).resolves.toBeUndefined();
	});
});
