// Date: 2026-11-12. Automatic local association with status backed by expiring MCP heartbeats.
import { CopyIcon, PlugIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { command, isTauri } from "../../core/bridge";
import { type AppId, agentApps } from "../../workbench/agent-apps";

export type ConnectionStatus = {
	state: "checking" | "disabled" | "waiting" | "connected" | "disconnected" | "legacy" | "unavailable" | "preview";
	enabled?: boolean;
	automatic?: boolean;
	lastSeenAt?: string | null;
};
function originalPresentation(status: ConnectionStatus) {
	switch (status.state) {
		case "connected":
			return {
				title: "已连接 Codex",
				description: "连接正常。执行任务时会自动关联聊天和工作目录，并同步进度。",
				action: "断开连接",
				enabled: false,
				color: "bg-emerald-400",
			};
		case "waiting":
			return {
				title: "等待 Codex 接入",
				description: "自动连接已开启。请在 Codex 中使用任务工作台；聊天和工作目录会自动关联。",
				action: "关闭自动连接",
				enabled: false,
				color: "bg-amber-400",
			};
		case "disconnected":
			return {
				title: "连接已中断",
				description: "暂未收到 Codex 的连接信号，正在等待自动恢复。",
				action: "关闭自动连接",
				enabled: false,
				color: "bg-amber-400",
			};
		case "legacy":
			return {
				title: "可升级为自动连接",
				description: "已有旧版连接配置。开启后会自动关联聊天和工作目录，无须手工确认。",
				action: "开启自动连接",
				enabled: true,
				color: "bg-amber-400",
			};
		case "unavailable":
			return {
				title: "连接服务暂不可用",
				description: "无法确认当前连接，请启动任务岛配套服务后重试。",
				action: "重试连接",
				enabled: true,
				color: "bg-rose-400",
			};
		case "preview":
			return {
				title: "桌面版可连接 Codex",
				description: "请在任务岛桌面设置中开启连接。",
				action: "连接 Codex",
				enabled: true,
				color: "bg-white/30",
			};
		case "checking":
			return {
				title: "正在检查连接",
				description: "正在确认 Codex 的连接状态。",
				action: "连接 Codex",
				enabled: true,
				color: "bg-white/30",
			};
		default:
			return {
				title: "尚未连接 Codex",
				description: "允许本机 Codex 同步任务岛中的项目进度，并自动关联聊天和工作目录。",
				action: "连接 Codex",
				enabled: true,
				color: "bg-white/30",
			};
	}
}
export function connectionPresentation(status: ConnectionStatus, name = "Codex") {
	const result = originalPresentation(status);
	return {
		...result,
		title: result.title.replaceAll("Codex", name),
		description: result.description.replaceAll("Codex", name),
		action: result.action.replaceAll("Codex", name),
	};
}
function failure(error: unknown) {
	if (/UNKNOWN|RESTORE_FAILED/.test(String(error))) return "连接操作的结果尚未确认，正在核对；请稍后查看状态。";
	if (/REJECTED_404|INVALID_CONNECTION_STATUS/.test(String(error))) return "请先更新任务岛配套服务，再重新连接。";
	if (/BUSY/.test(String(error))) return "正在处理连接，请稍后查看状态。";
	return "连接操作未完成，请检查配套服务后重试。";
}
type AppStatus = ConnectionStatus & { appId: AppId };
export function WorkbenchConnection() {
	const [statuses, setStatuses] = useState<AppStatus[]>([]);
	const [busy, setBusy] = useState<AppId | null>(null);
	const [uncertain, setUncertain] = useState<AppId[]>([]);
	const [message, setMessage] = useState("");
	const generation = useRef(0);
	const operating = useRef(false);
	useEffect(() => {
		if (!isTauri) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			const revision = generation.current;
			if (!operating.current) {
				try {
					const result = await command<AppStatus[]>("island_agent_connections");
					if (!stopped && revision === generation.current) setStatuses(result);
				} catch {
					if (!stopped && revision === generation.current)
						setStatuses(agentApps.map((app) => ({ appId: app.id, state: "unavailable" })));
				}
			}
			if (!stopped) timer = setTimeout(() => void poll(), 3000);
		}
		void poll();
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}, []);
	async function connect(appId: AppId, enabled: boolean) {
		if (!isTauri || operating.current || uncertain.includes(appId)) return;
		operating.current = true;
		generation.current += 1;
		setBusy(appId);
		setMessage("");
		try {
			const result = await command<AppStatus>("island_agent_set_connection", { appId, enabled });
			setStatuses((values) => [...values.filter((value) => value.appId !== appId), result]);
		} catch (error) {
			setMessage(failure(error));
			if (/UNKNOWN|RESTORE_FAILED/.test(String(error))) setUncertain((values) => [...values, appId]);
		} finally {
			operating.current = false;
			setBusy(null);
		}
	}
	async function copySetup(appId: AppId) {
		try {
			const setup = await command<Record<string, unknown>>("island_agent_connection_setup", { appId });
			await navigator.clipboard.writeText(JSON.stringify(setup, null, 2));
			setMessage("已复制连接配置。在对应应用的 MCP 设置中添加后即可接入；配置中不包含连接令牌。");
		} catch {
			setMessage("未能复制连接配置，请先确认任务工作台运行组件已安装。");
		}
	}
	return (
		<>
			<p className="text-[13px]/relaxed text-text-dim">各应用可以同时连接，分别管理。开启后自动关联聊天和工作目录。</p>
			{agentApps.map((app) => {
				const status = statuses.find((value) => value.appId === app.id) ?? { state: isTauri ? "checking" : "preview" };
				const view = connectionPresentation(status, app.name);
				return (
					<Card key={app.id}>
						<div className="flex flex-col gap-3 p-4" data-workbench-connection={app.id}>
							<div className="flex items-center gap-3">
								<strong className="mr-auto">{app.name}</strong>
								<span className={`h-2 w-2 rounded-full ${view.color}`} />
								<span className="text-xs text-text-dim" role="status" aria-live="polite">
									{view.title}
								</span>
							</div>
							<p className="text-[13px]/relaxed text-text-dim">{view.description}</p>
							<div className="flex flex-wrap gap-2">
								<Button
									disabled={busy !== null || uncertain.includes(app.id) || status.state === "checking" || !isTauri}
									onClick={() => void connect(app.id, view.enabled)}
								>
									<PlugIcon size={15} />
									{busy === app.id ? "正在处理…" : view.action}
								</Button>
								{app.id !== "codex" && (
									<Button disabled={!isTauri} onClick={() => void copySetup(app.id)}>
										<CopyIcon size={14} />
										复制连接配置
									</Button>
								)}
							</div>
							{app.id === "codex" ? (
								<p className="text-xs text-text-faint">通过已安装的“任务工作台”插件接入。</p>
							) : (
								<p className="text-xs text-text-faint">
									在此应用中添加本地 MCP 配置。{app.id === "dsh" ? "需先确认当前 dsh 版本支持本地 MCP。" : ""}
								</p>
							)}
						</div>
					</Card>
				);
			})}
			{message && (
				<p role="alert" className="text-[13px]/relaxed text-text-dim">
					{message}
				</p>
			)}
		</>
	);
}
