// Date: 2026-11-12. Automatic local association with status backed by expiring MCP heartbeats.
import { PlugIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { command, isTauri } from "../../core/bridge";

export type ConnectionStatus = {
	state: "checking" | "disabled" | "waiting" | "connected" | "disconnected" | "legacy" | "unavailable" | "preview";
	enabled?: boolean;
	automatic?: boolean;
	lastSeenAt?: string | null;
};
export function connectionPresentation(status: ConnectionStatus) {
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
function failure(error: unknown) {
	if (/UNKNOWN|RESTORE_FAILED/.test(String(error))) return "连接操作的结果尚未确认，正在核对；请稍后查看状态。";
	if (/REJECTED_404|INVALID_CONNECTION_STATUS/.test(String(error))) return "请先更新任务岛配套服务，再重新连接。";
	if (/BUSY/.test(String(error))) return "正在处理连接，请稍后查看状态。";
	return "连接操作未完成，请检查配套服务后重试。";
}
export function WorkbenchConnection() {
	const [status, setStatus] = useState<ConnectionStatus>({ state: isTauri ? "checking" : "preview" });
	const [busy, setBusy] = useState(false);
	const [uncertain, setUncertain] = useState(false);
	const [message, setMessage] = useState("");
	const generation = useRef(0);
	const operating = useRef(false);
	const mounted = useRef(true);
	const view = connectionPresentation(status);
	useEffect(() => {
		mounted.current = true;
		if (!isTauri) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			const revision = generation.current;
			if (!operating.current) {
				try {
					const result = await command<ConnectionStatus>("island_workbench_connection_status");
					if (!stopped && revision === generation.current) setStatus(result);
				} catch {
					if (!stopped && revision === generation.current) setStatus({ state: "unavailable" });
				}
			}
			if (!stopped) timer = setTimeout(() => void poll(), 3000);
		}
		void poll();
		return () => {
			stopped = true;
			mounted.current = false;
			clearTimeout(timer);
		};
	}, []);
	async function connect() {
		if (!isTauri || operating.current || uncertain) return;
		operating.current = true;
		generation.current += 1;
		setBusy(true);
		setMessage("");
		try {
			const result = await command<ConnectionStatus>("island_workbench_set_connection", { enabled: view.enabled });
			if (mounted.current) setStatus(result);
		} catch (error) {
			if (mounted.current) {
				setMessage(failure(error));
				if (/UNKNOWN|RESTORE_FAILED/.test(String(error))) setUncertain(true);
			}
		} finally {
			operating.current = false;
			if (mounted.current) setBusy(false);
		}
	}
	return (
		<Card>
			<div className="flex flex-col gap-5 p-4" data-workbench-connection>
				<div className="flex items-center gap-3" role="status" aria-live="polite">
					<span className={`h-2.5 w-2.5 shrink-0 rounded-full ${view.color}`} />
					<span className="font-medium">{view.title}</span>
				</div>
				<p className="text-[13px]/relaxed text-text-dim">{view.description}</p>
				<div>
					<Button
						disabled={busy || uncertain || status.state === "checking" || !isTauri}
						onClick={() => void connect()}
					>
						<PlugIcon size={15} />
						{busy ? "正在处理…" : view.action}
					</Button>
				</div>
				{message && (
					<p role="alert" className="text-[13px]/relaxed text-text-dim">
						{message}
					</p>
				)}
			</div>
		</Card>
	);
}
