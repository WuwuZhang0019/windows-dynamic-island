// Date: 2026-11-12. Explicit simulation preview is isolated from the native service client.
import { useCallback, useEffect, useRef, useState } from "react";
import { onEvent } from "../core/bridge";
import type { AppFilter } from "./agent-apps";
import { MockWorkbenchClient, type ScenarioId, scenarios } from "./contract/fixtures";
import { acceptEnvelope, type Preferences, type WorkbenchEnvelope } from "./contract/protocol";
import { failedEnvelope, ServiceWorkbenchClient } from "./service-client";
import { changeTaskLibrary } from "./task-library";

export function useWorkbench() {
	const [selectedApp, setSelectedApp] = useState<AppFilter>("all");
	const [client] = useState(() =>
		new URLSearchParams(window.location.search).get("workbench") === "simulation"
			? new MockWorkbenchClient()
			: new ServiceWorkbenchClient(),
	);
	const request = useRef(0);
	const current = useRef<WorkbenchEnvelope | null>(null);
	const alive = useRef(false);
	const [envelope, setEnvelope] = useState<WorkbenchEnvelope | null>(null);
	const [archivedKeys, setArchivedKeys] = useState<string[]>([]);
	const [librarySupported, setLibrarySupported] = useState(false);
	const [preferences, setPreferences] = useState<Preferences | null>(null);
	const [preferenceMessage, setPreferenceMessage] = useState("");
	const [scenario, updateScenario] = useState<ScenarioId>("multi-project");
	const read = useCallback(async () => {
		const token = ++request.current;
		try {
			const incoming = await client.read();
			if (token !== request.current || !alive.current) return;
			const next = acceptEnvelope(current.current, incoming);
			if (
				current.current?.snapshot &&
				(next.snapshot?.plans.some((plan) => !current.current?.snapshot?.plans.some((old) => old.key === plan.key)) ||
					next.snapshot?.events.some(
						(event) =>
							event.toStatus === "running" &&
							!current.current?.snapshot?.events.some((old) => old.eventId === event.eventId),
					))
			)
				setSelectedApp("all");
			current.current = next;
			setEnvelope(next);
			if (client instanceof ServiceWorkbenchClient) {
				setPreferences(client.preferences);
				setArchivedKeys(client.archivedKeys);
				setLibrarySupported(client.librarySupported);
			}
		} catch (error) {
			if (token !== request.current || !alive.current) return;
			const next = failedEnvelope(client.mode, error, current.current);
			current.current = next;
			setEnvelope(next);
		}
	}, [client]);
	const setScenario = useCallback(
		(id: string) => {
			if (!(client instanceof MockWorkbenchClient) || !scenarios.some((item) => item.id === id)) return;
			++request.current;
			client.selectScenario(id as ScenarioId);
			updateScenario(id as ScenarioId);
			void read();
		},
		[client, read],
	);
	const queryPending = useCallback(async () => {
		const eventId = current.current?.pendingOperation?.eventId;
		if (!eventId) return;
		const result = await client.queryEvent(eventId);
		if (current.current?.pendingOperation?.eventId !== eventId || !alive.current) return;
		if (result.state === "committed") await read();
		else setPreferenceMessage("请回原 MCP 聊天，携带原项目、操作类型和事件键查询；本窗口不会重发");
	}, [client, read]);
	const savePreferences = useCallback(
		async (value: Preferences) => {
			if (!(client instanceof ServiceWorkbenchClient)) return;
			try {
				await client.savePreferences(value);
				if (alive.current) setPreferenceMessage("");
			} catch {
				if (alive.current) setPreferenceMessage("阅读位置保存未确认；请重连后重试，业务状态未改变");
			}
		},
		[client],
	);
	const archiveTask = useCallback(
		async (key: string) => {
			const revision = current.current?.snapshot?.revision;
			if (!Number.isSafeInteger(revision) || revision === null || revision === undefined)
				throw Error("OWNER_UNAVAILABLE");
			await changeTaskLibrary("archive", key, revision);
			await read();
		},
		[read],
	);
	useEffect(() => onEvent("task-library-changed", () => void read()), [read]);
	useEffect(() => {
		alive.current = true;
		void read();
		let timer: ReturnType<typeof setTimeout>;
		let cancelled = false;
		const poll = () => {
			if (cancelled) return;
			timer = setTimeout(
				async () => {
					await read();
					if (!cancelled) poll();
				},
				document.hidden ? 5000 : 1000,
			);
		};
		const visible = () => {
			if (!document.hidden) void read();
		};
		poll();
		document.addEventListener("visibilitychange", visible);
		return () => {
			cancelled = true;
			alive.current = false;
			++request.current;
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", visible);
		};
	}, [read]);
	return {
		envelope,
		selectedApp:
			envelope?.connection.state === "ready" &&
			envelope.agentApps?.some((app) => app.appId === selectedApp && app.connected)
				? selectedApp
				: "all",
		setSelectedApp,
		scenario,
		setScenario,
		scenarios,
		refresh: read,
		queryPending,
		preferences,
		savePreferences,
		preferenceMessage,
		archivedKeys,
		archiveTask: librarySupported ? archiveTask : undefined,
	};
}
export type WorkbenchState = ReturnType<typeof useWorkbench>;
