// Date: 2026-11-12. Native-only transport; credentials and paths never enter the WebView.

import { invoke } from "@tauri-apps/api/core";
import { type ContinuousRun, checkedContinuous } from "./continuous";
import {
	acceptEnvelope,
	type EventResult,
	type Preferences,
	type WorkbenchClient,
	type WorkbenchEnvelope,
} from "./contract/protocol";
import { followNewPlan } from "./reading-positions";
import { checkedArchives, type TaskLibraryPanel } from "./task-library";

export type NativeCall = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export const blankPreferences = (): Preferences => ({ collapsed: [], selected: "", focus: [], scroll: {}, y: {} });
const capabilities = {
	threadJump: false,
	worktreeOpen: false,
	businessWrite: false,
	reason: "任务状态由执行会话更新；支持任务归档与管理",
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
		agentApps: previous?.agentApps?.map((app) => ({ ...app, connected: false })),
		bindingApps: previous?.bindingApps,
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
						: "后台连接中断，任务岛正在自动恢复；已保留最后有效进度",
		},
		pendingOperation: previous?.pendingOperation ?? null,
	};
}
export class ServiceWorkbenchClient implements WorkbenchClient {
	readonly mode = "service" as const;
	private current: WorkbenchEnvelope | null = null;
	private archives: string[] = [];
	private supportsLibrary = false;
	private continuous: ContinuousRun[] = [];
	private supportsContinuous = false;
	get continuousRuns() {
		return structuredClone(this.continuous);
	}
	get continuousSupported() {
		return this.supportsContinuous;
	}
	get archivedKeys() {
		return [...this.archives];
	}
	get librarySupported() {
		return this.supportsLibrary;
	}
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
			const panel = await this.call<TaskLibraryPanel>("island_workbench_read");
			if (sequence !== this.readSequence)
				return structuredClone(this.current ?? failedEnvelope(this.mode, "READ_SUPERSEDED"));
			const incoming = {
				protocolVersion: "island-workbench/1",
				mode: "service",
				snapshot: panel.snapshot,
				agentApps: panel.agentApps ?? [],
				bindingApps: panel.bindingApps ?? {},
				capabilities,
				connection: {
					state: "ready",
					healthy: true,
					lastSuccessAt: new Date().toISOString(),
					message: "真实服务任务，可归档后在设置中管理",
				},
				pendingOperation: this.current?.pendingOperation ?? null,
			};
			const next = acceptEnvelope(this.current, incoming);
			if (!this.initializedPreferences) {
				this.savedPreferences = checkedPreferences(panel.preferences ?? blankPreferences());
				this.initializedPreferences = true;
			}
			if (this.savedPreferences)
				this.savedPreferences = followNewPlan(this.current?.snapshot ?? null, next.snapshot, this.savedPreferences);
			this.archives = checkedArchives(panel.library).map((entry) => entry.key);
			this.supportsLibrary = panel.librarySupported === true;
			this.continuous = checkedContinuous(panel.continuousRuns);
			this.supportsContinuous = panel.continuousSupported === true;
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
