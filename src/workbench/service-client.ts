// Date: 2026-11-12. Native-only transport; credentials and paths never enter the WebView.
import { invoke } from "@tauri-apps/api/core";
import {
	acceptEnvelope,
	type EventResult,
	type Preferences,
	type WorkbenchClient,
	type WorkbenchEnvelope,
} from "./contract/protocol";

export type NativeCall = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export const blankPreferences = (): Preferences => ({ collapsed: [], selected: "", focus: [], scroll: {}, y: {} });
const capabilities = {
	threadJump: false,
	worktreeOpen: false,
	businessWrite: false,
	reason: "当前宿主仅开放读取与阅读偏好；可复制会话标识或工作树路径",
};
export function failedEnvelope(
	mode: "service" | "simulation",
	error: unknown,
	previous: WorkbenchEnvelope | null = null,
): WorkbenchEnvelope {
	const code = String(error);
	const state = /UNAUTHORIZED|FORBIDDEN|SESSION/.test(code)
		? "unauthorized"
		: /INVALID_|INCOMPATIBLE|CONTRACT/.test(code)
			? "incompatible"
			: "offline";
	return {
		protocolVersion: "island-workbench/1",
		mode,
		snapshot: previous?.snapshot ?? null,
		capabilities,
		connection: {
			state,
			healthy: false,
			lastSuccessAt: previous?.connection.lastSuccessAt ?? null,
			message:
				state === "unauthorized"
					? "连接授权不可用，请在工作台管理入口检查授权"
					: state === "incompatible"
						? "服务响应不兼容，已保留最后有效快照"
						: "服务未连接，请启动独立工作台服务后重连",
		},
		pendingOperation: previous?.pendingOperation ?? null,
	};
}
export class ServiceWorkbenchClient implements WorkbenchClient {
	readonly mode = "service" as const;
	private current: WorkbenchEnvelope | null = null;
	private readSequence = 0;
	private savedPreferences: Preferences | null = null;
	private initializedPreferences = false;
	private saveQueue: Promise<void> = Promise.resolve();
	constructor(private readonly call: NativeCall = invoke) {}
	get preferences() {
		return this.savedPreferences ? structuredClone(this.savedPreferences) : null;
	}
	async read(): Promise<WorkbenchEnvelope> {
		const sequence = ++this.readSequence;
		try {
			const panel = await this.call<{ snapshot: unknown; preferences: Preferences | null }>("island_workbench_read");
			if (sequence !== this.readSequence)
				return structuredClone(this.current ?? failedEnvelope(this.mode, "READ_SUPERSEDED"));
			const incoming = {
				protocolVersion: "island-workbench/1",
				mode: "service",
				snapshot: panel.snapshot,
				capabilities,
				connection: {
					state: "ready",
					healthy: true,
					lastSuccessAt: new Date().toISOString(),
					message: "真实服务快照；当前仅开放读取与阅读偏好",
				},
				pendingOperation: this.current?.pendingOperation ?? null,
			};
			const next = acceptEnvelope(this.current, incoming);
			if (!this.initializedPreferences) {
				this.savedPreferences = checkedPreferences(panel.preferences ?? blankPreferences());
				this.initializedPreferences = true;
			}
			this.current = next;
		} catch (error) {
			if (sequence === this.readSequence) this.current = failedEnvelope(this.mode, error, this.current);
		}
		return structuredClone(this.current ?? failedEnvelope(this.mode, "READ_SUPERSEDED"));
	}
	async savePreferences(value: Preferences): Promise<void> {
		if (!this.initializedPreferences || this.current?.connection.state !== "ready")
			throw Error("PREFERENCES_NOT_READY");
		const checked = checkedPreferences(value);
		const save = this.saveQueue
			.catch(() => {})
			.then(async () => {
				const result = await this.call<{ saved: boolean }>("island_workbench_save_preferences", { value: checked });
				if (result.saved !== true) throw Error("INVALID_PREFERENCES_RESPONSE");
				this.savedPreferences = checked;
			});
		this.saveQueue = save;
		await save;
	}
	async queryEvent(eventId: string): Promise<EventResult> {
		// An event id alone lacks the original principal, project and operation scope.
		// Never infer a committed receipt from the display snapshot or create a replacement event.
		return { eventId, state: "unknown", committedRevision: null };
	}
}
export function checkedPreferences(value: unknown): Preferences {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("INVALID_PREFERENCES");
	const p = value as Preferences;
	if (
		Object.keys(p).sort().join(",") !== "collapsed,focus,scroll,selected,y" ||
		typeof p.selected !== "string" ||
		p.selected.length > 2000 ||
		[p.collapsed, p.focus].some(
			(a) => !Array.isArray(a) || a.length > 2000 || a.some((s) => typeof s !== "string" || s.length > 2000),
		) ||
		[p.scroll, p.y].some(
			(a) =>
				!a ||
				typeof a !== "object" ||
				Array.isArray(a) ||
				Object.entries(a).length > 4000 ||
				Object.entries(a).some(([k, v]) => k.length > 4000 || !Number.isFinite(v) || v < 0 || v > 1e8),
		)
	)
		throw Error("INVALID_PREFERENCES");
	return structuredClone(p);
}
