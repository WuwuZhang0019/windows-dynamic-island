// Date: 2026-11-11. Simulation-only adapter; no service or credential access.
import { useCallback, useEffect, useRef, useState } from "react";
import { MockWorkbenchClient, type ScenarioId, scenarios } from "./contract/fixtures";
import { acceptEnvelope, type WorkbenchEnvelope } from "./contract/protocol";

export function useWorkbench() {
	const client = useRef(new MockWorkbenchClient());
	const request = useRef(0);
	const current = useRef<WorkbenchEnvelope | null>(null);
	const [envelope, setEnvelope] = useState<WorkbenchEnvelope | null>(null);
	const [scenario, updateScenario] = useState<ScenarioId>("multi-project");
	const read = useCallback(async () => {
		const token = ++request.current;
		try {
			const incoming = await client.current.read();
			if (token !== request.current) return;
			const next = acceptEnvelope(current.current, incoming);
			current.current = next;
			setEnvelope(next);
		} catch (error) {
			if (token !== request.current || !current.current) return;
			const next: WorkbenchEnvelope = {
				...current.current,
				connection: { ...current.current.connection, state: "incompatible", healthy: false, message: String(error) },
			};
			current.current = next;
			setEnvelope(next);
		}
	}, []);
	const setScenario = useCallback(
		(id: string) => {
			if (!scenarios.some((item) => item.id === id)) return;
			++request.current;
			// Scenario selection is an explicit isolated preview, not a connection fallback.
			client.current.selectScenario(id as ScenarioId);
			updateScenario(id as ScenarioId);
			void read();
		},
		[read],
	);
	const queryPending = useCallback(async () => {
		const eventId = current.current?.pendingOperation?.eventId;
		if (!eventId) return;
		const result = await client.current.queryEvent(eventId);
		if (current.current?.pendingOperation?.eventId !== eventId) return;
		if (result.state === "committed") await read();
	}, [read]);
	useEffect(() => {
		void read();
	}, [read]);
	useEffect(() => {
		// Hidden windows refresh less often. Visibility never triggers a business write.
		let timer: ReturnType<typeof setTimeout>;
		const poll = () => {
			timer = setTimeout(
				async () => {
					await read();
					poll();
				},
				document.hidden ? 30000 : 10000,
			);
		};
		const visible = () => {
			if (!document.hidden) void read();
		};
		poll();
		document.addEventListener("visibilitychange", visible);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", visible);
		};
	}, [read]);
	return { envelope, scenario, setScenario, scenarios, refresh: read, queryPending };
}
export type WorkbenchState = ReturnType<typeof useWorkbench>;
