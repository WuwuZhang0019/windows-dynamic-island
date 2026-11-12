// Date: 2026-11-12. Automatic local association with status backed by expiring MCP heartbeats.
import { CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AIProviderIcon } from "../../components/AIProviderIcon";
import { Button } from "../../components/ui/button";
import { command, isTauri } from "../../core/bridge";
import type { AppId } from "../../workbench/agent-apps";

import "./mcp-connections.css";

export type ConnectionStatus = {
	state: "checking" | "disabled" | "waiting" | "connected" | "disconnected" | "legacy" | "unavailable" | "preview";
	enabled?: boolean;
	automatic?: boolean;
	lastSeenAt?: string | null;
};
export function connectionPresentation(status: ConnectionStatus, pending = false) {
	if (pending) return { tone: "connecting", label: "处理中", hint: "请稍候", enabled: !status.enabled };
	switch (status.state) {
		case "connected":
			return { tone: "connected", label: "已连接", hint: "点击断开连接", enabled: false };
		case "waiting":
		case "checking":
			return { tone: "connecting", label: "连接中", hint: "点击取消连接", enabled: false };
		case "disconnected":
		case "unavailable":
			return { tone: "failed", label: "连接失败", hint: "点击重试连接", enabled: true };
		default:
			return { tone: "idle", label: "连接", hint: "点击连接", enabled: true };
	}
}
function failure(error: unknown) {
	if (/UNKNOWN|RESTORE_FAILED/.test(String(error))) return "连接操作的结果尚未确认，正在核对；请稍后查看状态。";
	if (/REJECTED_404|INVALID_CONNECTION_STATUS/.test(String(error))) return "请先更新任务岛配套服务，再重新连接。";
	if (/BUSY/.test(String(error))) return "正在处理连接，请稍后查看状态。";
	return "连接操作未完成，请检查配套服务后重试。";
}
type AppStatus = ConnectionStatus & { appId: AppId; name?: string };
// Date: 2026-11-12. Suggestions are visual shortcuts, not fabricated connection records.
const suggestedApps = [
	["claude-code", "Claude Code", "claude"],
	["claude-desktop", "Claude Desktop", "claude"],
	["codex", "Codex", "openai"],
	["gemini-cli", "Gemini CLI", "geminicli"],
	["grok-build", "Grok Build", "grok"],
	["opencode", "OpenCode", "opencode"],
	["openclaw", "OpenClaw", "openclaw"],
	["hermes", "Hermes", "hermesagent"],
	["pi", "Pi", "pi"],
	["minimax-code", "MiniMax Code", "minimax"],
	["kimi-code", "Kimi Code", "kimi"],
	["deepseek-harness", "DeepSeek Harness", "deepseek"],
	["antigravity", "Antigravity", "antigravity"],
	["oh-my-pi", "Oh My Pi", "pi"],
	["copilot-cli", "Copilot CLI", "githubcopilot"],
	["hy4", "Hy4", "hunyuan"],
	["hy3", "Hy3", "hunyuan"],
	["deepseek-v4-1-flash", "DeepSeek-V4.1-Flash", "deepseek"],
	["glm-5-3", "GLM-5.3", "zai"],
	["glm-5-3-flash", "GLM-5.3 Flash", "zai"],
	["glm-5-2", "GLM-5.2", "zai"],
	["minimax-m3-1-flash", "MiniMax-M3.1-Flash", "minimax"],
	["kimi-k3-1-pro", "Kimi-K3.1-Pro", "kimi"],
	["kimi-k3", "Kimi-K3", "kimi"],
	["kimi-k2-8-preview", "Kimi-K2.8-Preview", "kimi"],
	["deepseek-v4-pro", "DeepSeek-V4-Pro", "deepseek"],
	["step-5-preview", "Step-5-Preview", "stepfun"],
	["xiaomi-mimo-v2-6-pro", "Xiaomi MiMo-V2.6-Pro", "xiaomimimo"],
];
const appKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
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
					if (!stopped && revision === generation.current) {
						setStatuses(result);
						setMessage((previous) => (previous === "连接服务暂不可用，请确认服务已启动。" ? "" : previous));
					}
				} catch {
					if (!stopped && revision === generation.current) {
						setStatuses((values) => values.map((value) => ({ ...value, state: "unavailable" })));
						setMessage("连接服务暂不可用，请确认服务已启动。");
					}
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
			setStatuses((values) =>
				values.map((value) => (value.appId === appId ? { ...value, state: "unavailable" } : value)),
			);
			if (/UNKNOWN|RESTORE_FAILED/.test(String(error))) setUncertain((values) => [...values, appId]);
		} finally {
			operating.current = false;
			setBusy(null);
		}
	}
	async function copySetup() {
		if (operating.current) return;
		operating.current = true;
		setBusy("onboarding");
		try {
			const setup = await command<string>("island_agent_onboarding_instructions");
			await navigator.clipboard.writeText(setup);
			setMessage("已复制接入指令。请在 30 分钟内发送到对应应用的对话窗口，Agent 配置完成后会自动开启连接。");
		} catch {
			setMessage("未能复制接入指令，请确认配套服务及接入组件已更新。");
		} finally {
			operating.current = false;
			setBusy(null);
		}
	}
	const matched = new Set<string>();
	const rows = suggestedApps.map(([appId, name, iconId]) => {
		const actual = statuses.find(
			(value) => appKey(value.appId) === appKey(appId) || appKey(value.name ?? "") === appKey(name),
		);
		if (actual) matched.add(actual.appId);
		return { ...(actual ?? { appId, name, state: "disabled" as const }), iconId, registered: !!actual };
	});
	rows.push(
		...statuses
			.filter((value) => !matched.has(value.appId))
			.map((value) => ({ ...value, iconId: value.appId, registered: true })),
	);
	return (
		<>
			<p className="text-[13px]/relaxed text-text-dim">复制指令发给任意支持 MCP 的 Agent，配置完成后自动连接。</p>
			<Button disabled={!isTauri || busy !== null} onClick={() => void copySetup()}>
				<CopyIcon size={14} />
				复制接入指令
			</Button>
			<div className="mcp-connection-list">
				{rows.map((status) => {
					const app = { id: status.appId, name: status.name ?? status.appId };
					const view = connectionPresentation(status, busy === app.id);
					return (
						<div className="mcp-connection-row" key={app.id} data-workbench-connection={app.id}>
							<AIProviderIcon appId={status.iconId} name={app.name} size={28} />
							<strong title={app.name}>{app.name}</strong>
							<button
								type="button"
								className="mcp-status-button"
								data-connection-tone={view.tone}
								aria-label={`${app.name}：${view.label}，${view.hint}`}
								title={view.hint}
								disabled={!isTauri || busy !== null || uncertain.includes(app.id)}
								onClick={() => void (status.registered ? connect(app.id, view.enabled) : copySetup())}
							>
								<span aria-live="polite">{view.label}</span>
							</button>
						</div>
					);
				})}
			</div>
			{message && (
				<p role="alert" className="text-[13px]/relaxed text-text-dim">
					{message}
				</p>
			)}
		</>
	);
}
