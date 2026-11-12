// Date: 2026-11-12. Original application-pill styling reused for workbench application filters.
import type { CSSProperties } from "react";
import { cn } from "../../core/cn";
import { type AppFilter, agentApps } from "../../workbench/agent-apps";
import type { WorkbenchEnvelope } from "../../workbench/contract/protocol";
import { AIProviderIcon } from "../AIProviderIcon";
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
		...(envelope.connection.state === "ready" ? (envelope.agentApps ?? []).filter((app) => app.connected) : []).map(
			(app) => ({
				id: app.appId,
				name: app.name,
				color: agentApps.find((known) => known.id === app.appId)?.color ?? "#a8b7cc",
			}),
		),
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
				return (
					<button
						key={app.id}
						type="button"
						aria-pressed={selected === app.id}
						data-agent-filter={app.id}
						title={`${app.name} · ${state}（再次点击取消筛选）`}
						className={cn("agent-app-pill", selected === app.id && "agent-app-pill-selected")}
						style={{ "--agent": app.color } as CSSProperties}
						onClick={(event) => {
							event.stopPropagation();
							onSelect(selected === app.id ? "all" : app.id);
						}}
					>
						<AIProviderIcon
							appId={app.id === "codex" ? "openai" : app.id === "claude-code" ? "claude" : app.id}
							name={app.name}
							size={14}
						/>
						{app.name}
						{
							<span
								className="agent-connection-dot"
								data-connected={healthy && current?.connected === true}
								aria-hidden="true"
							/>
						}
					</button>
				);
			})}
		</fieldset>
	);
}
