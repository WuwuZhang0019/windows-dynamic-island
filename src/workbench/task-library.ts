// Date: 2026-11-12. Shared library metadata; destructive requests use only fixed native commands.
import { invoke } from "@tauri-apps/api/core";
import { type Preferences, validateEnvelope, type WorkbenchSnapshot } from "./contract/protocol";

export type ArchivedTask = { key: string; archivedAt: string };
export type TaskLibraryPanel = {
	agentApps?: import("./agent-apps").AgentConnection[];
	bindingApps?: Record<string, import("./agent-apps").AppId>;
	snapshot: WorkbenchSnapshot;
	preferences: Preferences | null;
	library?: unknown;
	librarySupported?: boolean;
	continuousRuns?: unknown;
	continuousSupported?: boolean;
};
export function checkedArchives(value: unknown): ArchivedTask[] {
	if (value === undefined) return [];
	if (
		!value ||
		typeof value !== "object" ||
		!("version" in value) ||
		value.version !== 1 ||
		!("archived" in value) ||
		!Array.isArray(value.archived) ||
		value.archived.some(
			(item: unknown) =>
				!item ||
				typeof item !== "object" ||
				!("key" in item) ||
				typeof item.key !== "string" ||
				!("archivedAt" in item) ||
				typeof item.archivedAt !== "string",
		)
	)
		throw Error("INVALID_LIBRARY");
	return structuredClone(value.archived);
}
export async function readTaskLibrary() {
	const panel = await invoke<TaskLibraryPanel>("island_task_library_read");
	const envelope = validateEnvelope({
		protocolVersion: "island-workbench/1",
		mode: "service",
		snapshot: panel.snapshot,
		capabilities: { threadJump: false, worktreeOpen: false, businessWrite: false, reason: "任务归档管理" },
		connection: { state: "ready", healthy: true, lastSuccessAt: new Date().toISOString(), message: "任务归档管理" },
		pendingOperation: null,
	});
	if (!envelope.snapshot || !panel.librarySupported) throw Error("LIBRARY_UNAVAILABLE");
	return { snapshot: envelope.snapshot, archived: checkedArchives(panel.library) };
}
export async function changeTaskLibrary(
	action: "archive" | "restore" | "delete" | "pause",
	key: string,
	expectedRevision: number,
) {
	return invoke<{ saved: boolean; revision: number }>("island_task_library_change", {
		action,
		value: { key, expectedRevision, acknowledged: true },
	});
}
export function libraryError(error: unknown): string {
	const message = String(error);
	if (/REFERENCED_TASK|ACTIVE_TASK/.test(message)) return message.replace(/^.*?(REFERENCED_TASK|ACTIVE_TASK):\s*/, "");
	if (/REVISION_CONFLICT/.test(message)) return "任务已更新，请刷新后重试";
	if (/ARCHIVE_REQUIRED/.test(message)) return "请先归档，再从归档区删除";
	if (/LIBRARY_RESULT_UNKNOWN/.test(message)) return "操作结果未确认，请刷新核对后再操作";
	return "任务服务未连接，请启动服务后刷新重试";
}
