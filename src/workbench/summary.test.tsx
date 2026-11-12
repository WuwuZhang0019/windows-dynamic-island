// Date: 2026-11-12. Regressions for the single-route, text-free thumbnail.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createScenario } from "./contract/fixtures";
import type { Preferences } from "./contract/protocol";
import { WorkbenchSummary, WorkbenchView } from "./WorkbenchView";

const preferences = (selected: string): Preferences => ({ collapsed: [], selected, focus: [], scroll: {}, y: {} });
const keys = (html: string) => [...html.matchAll(/data-step-key="([^"]+)"/g)].map((match) => match[1]);

describe("single-route thumbnail", () => {
	test("renders one whole route instead of all routes and unassigned stages", () => {
		const envelope = createScenario("multi-project");
		const route = envelope.snapshot?.routes[0];
		const html = renderToStaticMarkup(<WorkbenchSummary envelope={envelope} />);
		expect(html.match(/class="wb-mini-route"/g)).toHaveLength(1);
		expect(keys(html)).toEqual(route?.stepKeys ?? []);
		expect(html.replace(/<[^>]*>/g, "")).toBe("");
	});

	test("uses the route selected in the expanded panel, preserving station states", () => {
		const envelope = createScenario("multi-project");
		const route = envelope.snapshot?.routes[5];
		if (!route) throw Error("Missing fixture route");
		const html = renderToStaticMarkup(
			<WorkbenchSummary envelope={envelope} preferences={preferences(route.stepKeys[0])} />,
		);
		expect(keys(html)).toEqual(route.stepKeys);
		for (const key of route.stepKeys) {
			const step = envelope.snapshot?.steps.find((item) => item.key === key);
			expect(html).toContain(`wb-mini-stop wb-step-${step?.status}`);
		}
	});

	test("an unlisted child selects its ancestor's route without adding another lane", () => {
		const envelope = createScenario("multi-project");
		const child = envelope.snapshot?.steps.find((step) => step.parentKey);
		if (!child) throw Error("Missing fixture child");
		const route = envelope.snapshot?.routes.find((item) => item.stepKeys.includes(child.parentKey ?? ""));
		const html = renderToStaticMarkup(<WorkbenchSummary envelope={envelope} preferences={preferences(child.key)} />);
		expect(keys(html)).toEqual(route?.stepKeys ?? []);
		expect(keys(html)).not.toContain(child.key);
		expect(html.match(/class="wb-mini-route"/g)).toHaveLength(1);
	});

	test("retains all 60 stations in a long route, including the first and last", () => {
		const envelope = createScenario("long-route");
		const html = renderToStaticMarkup(<WorkbenchSummary envelope={envelope} />);
		expect(keys(html)).toHaveLength(60);
		expect(keys(html)).toEqual(envelope.snapshot?.routes[0].stepKeys ?? []);
	});

	test("empty data does not invent a route or station", () => {
		const html = renderToStaticMarkup(<WorkbenchSummary envelope={createScenario("empty")} />);
		expect(keys(html)).toHaveLength(0);
		expect(html).not.toContain('class="wb-mini-route"');
	});

	test("connects adjacent stations using the destination state, with no leading or trailing segment", () => {
		const envelope = createScenario("long-route");
		const route = envelope.snapshot?.routes[0];
		if (!route) throw Error("Missing fixture route");
		route.stepKeys = route.stepKeys.slice(0, 6);
		const html = renderToStaticMarkup(<WorkbenchSummary envelope={envelope} />);
		const segments = [...html.matchAll(/class="wb-route-segment" data-status="([^"]+)"/g)].map((match) => match[1]);
		expect(segments).toEqual(["completed", "running", "blocked", "pending", "cancelled"]);
		expect(keys(html)).toEqual(route.stepKeys);
	});

	test("expanded tracks use the same state on both halves of each connection", () => {
		const envelope = createScenario("long-route");
		const route = envelope.snapshot?.routes[0];
		if (!route) throw Error("Missing fixture route");
		route.stepKeys = route.stepKeys.slice(0, 6);
		const html = renderToStaticMarkup(
			<WorkbenchView envelope={envelope} scenario="long-route" setScenario={() => {}} refresh={() => {}} />,
		);
		const tracks = [...html.matchAll(/class="wb-step-track"([^>]*)>/g)].map((match) => match[1]);
		expect(tracks).toHaveLength(6);
		expect(tracks[0]).not.toContain("data-before");
		expect(tracks[tracks.length - 1]).not.toContain("data-after");
		const expected = ["completed", "running", "blocked", "pending", "cancelled"];
		for (const [index, state] of expected.entries()) {
			expect(tracks[index]).toContain(`data-after="${state}"`);
			expect(tracks[index + 1]).toContain(`data-before="${state}"`);
		}
	});
});
