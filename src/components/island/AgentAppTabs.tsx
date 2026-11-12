// Date: 2026-11-12. Original application-pill styling reused for workbench application filters.
import { BotIcon, LayersIcon, TerminalIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "../../core/cn";
import { type AppFilter, agentApps } from "../../workbench/agent-apps";
import type { WorkbenchEnvelope } from "../../workbench/contract/protocol";
import { ClaudeIcon } from "./ClaudeIcon";
import { CodexIcon } from "./CodexIcon";
export function AgentAppTabs({
	selected,
	onSelect,
	envelope,
}: {
	selected: AppFilter;
	onSelect: (app: AppFilter) => void;
	envelope: WorkbenchEnvelope;
}) {
	const tabs = [
		{ id: "all", name: "全部", color: "#bcb9ff" },
		...agentApps,
		{ id: "unassigned", name: "未分配", color: "#b5b5bb" },
	] as const;
	return (
		<fieldset className="agent-app-tabs" aria-label="按应用筛选任务" data-agent-app-tabs data-no-drag>
			{tabs.map((app) => {
				const current = envelope.agentApps?.find((value) => value.appId === app.id);
				const healthy = envelope.connection.state === "ready";
				const state = !healthy
					? "状态暂不可用"
					: current?.connected
						? "已连接"
						: current?.enabled
							? "等待接入"
							: "未连接";
				const Icon =
					app.id === "codex"
						? CodexIcon
						: app.id === "claude-code"
							? ClaudeIcon
							: app.id === "dsh"
								? TerminalIcon
								: app.id === "workbuddy"
									? BotIcon
									: LayersIcon;
				return (
					<button
						key={app.id}
						type="button"
						aria-pressed={selected === app.id}
						data-agent-filter={app.id}
						title={
							app.id === "all"
								? "显示全部应用的任务"
								: app.id === "unassigned"
									? "尚无应用归属的任务"
									: `${app.name} · ${state}`
						}
						className={cn("agent-app-pill", selected === app.id && "agent-app-pill-selected")}
						style={{ "--agent": app.color } as CSSProperties}
						onClick={(event) => {
							event.stopPropagation();
							onSelect(app.id);
						}}
					>
						<Icon size={14} />
						{app.name}
						{app.id !== "all" && app.id !== "unassigned" && (
							<span
								className="agent-connection-dot"
								data-connected={healthy && current?.connected === true}
								aria-hidden="true"
							/>
						)}
					</button>
				);
			})}
		</fieldset>
	);
}
