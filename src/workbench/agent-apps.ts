// Date: 2026-11-12. Only authenticated service associations determine application ownership.
import type { AppId, WorkbenchEnvelope } from "./contract/protocol";
import type { TaskGroup } from "./task-groups";
export const agentApps = [
	{ id: "codex", name: "Codex", color: "#a29bfe" },
	{ id: "claude-code", name: "Claude Code", color: "#d97757" },
	{ id: "dsh", name: "dsh", color: "#68c7c1" },
	{ id: "workbuddy", name: "WorkBuddy", color: "#72a8ff" },
] as const;
export type { AgentConnection, AppId } from "./contract/protocol";
export type AppFilter = AppId | "all" | "unassigned";
export function groupApps(group: TaskGroup, envelope: WorkbenchEnvelope): Set<string> {
	const steps = new Set(group.routes.flatMap((route) => route.stepKeys));
	const bindings =
		envelope.snapshot?.bindings.filter(
			(binding) =>
				binding.state === "confirmed" &&
				binding.projectKey === group.project.key &&
				binding.stepKeys.some((key) => steps.has(key)),
		) ?? [];
	return new Set(
		bindings.flatMap((binding) => (envelope.bindingApps?.[binding.key] ? [envelope.bindingApps[binding.key]] : [])),
	);
}
export function matchesApp(group: TaskGroup, envelope: WorkbenchEnvelope, filter: AppFilter): boolean {
	if (filter === "all") return true;
	const apps = groupApps(group, envelope);
	return filter === "unassigned" ? apps.size === 0 : apps.has(filter);
}
