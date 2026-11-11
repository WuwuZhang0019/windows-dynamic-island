/**
 * Settings store shared by every window.
 *
 * Values live in the backend (`src-tauri/src/settings.rs`) as a flat key/value
 * map; the schema lives here in the frontend: each setting is a `SettingDef`
 * declared next to the code that uses it (core or a module), carrying its own
 * default. Outside Tauri, values fall back to localStorage.
 */

import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { command, isTauri } from "./bridge";
import type { MessageKey } from "./i18n";

/** Frosted glass behind the island, from none to the strongest blur. */
export type GlassLevel = "off" | "subtle" | "moderate" | "strong";
export const GLASS_LEVELS: GlassLevel[] = ["off", "subtle", "moderate", "strong"];

export interface SettingDef<T = boolean> {
	key: string;
	/** Translation keys (see `src/locales`). */
	label: MessageKey;
	description?: MessageKey;
	default: T;
}

export type Values = Record<string, unknown>;

let values: Values = {};
let settingsError = "";
let browserReadOnly = false;
const listeners = new Set<() => void>();
const notify = () => {
	for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => listeners.delete(l);
};

export const LOCAL_KEY = "island-workbench-settings-v1";
export const LEGACY_LOCAL_KEY = "island-settings";
export const LEGACY_BACKUP_KEY = "island-workbench-legacy-settings-backup-v1";

const SHELL_KEYS = new Set([
	"app.language",
	"appearance.style",
	"appearance.border",
	"appearance.customColors",
	"appearance.borderThickness",
	"appearance.animateBorder",
	"appearance.glow",
	"appearance.glass",
	"appearance.idleClock",
	"island.hidden",
	"island.openOn",
	"island.closeOn",
	"island.expandOnHover",
	"island.hideInFullscreen",
	"island.avoidMaximized",
	"island.returnToCenter",
	"island.returnDelay",
	"island.monitor",
	"island.offset",
]);

/** 白名单导入保留偏好；不携带模块、插件、热键或旧布局开关。 */
export function shellPreferences(value: unknown): Values {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_SHELL_CONFIG");
	if ("shell.configVersion" in value && value["shell.configVersion"] !== 1) throw new Error("UNSUPPORTED_SHELL_CONFIG");
	return {
		...Object.fromEntries(Object.entries(value).filter(([key]) => SHELL_KEYS.has(key))),
		"shell.configVersion": 1,
	};
}

/** 原始浏览器配置保持不变；先保存一次备份，再写入独立命名空间。 */
export function loadBrowserPreferences(storage: Storage): Values {
	const current = storage.getItem(LOCAL_KEY);
	if (current !== null) return shellPreferences(JSON.parse(current));
	const legacy = storage.getItem(LEGACY_LOCAL_KEY);
	const backup = storage.getItem(LEGACY_BACKUP_KEY);
	if (legacy !== null && backup !== null && backup !== legacy) throw new Error("LEGACY_BACKUP_MISMATCH");
	if (legacy !== null && backup === null) storage.setItem(LEGACY_BACKUP_KEY, legacy);
	const migrated = shellPreferences(JSON.parse(legacy ?? "{}"));
	storage.setItem(LOCAL_KEY, JSON.stringify(migrated));
	return migrated;
}

let started = false;
export async function startSettings() {
	if (started) return;
	started = true;
	if (!isTauri) {
		try {
			values = loadBrowserPreferences(localStorage);
		} catch {
			values = {};
			browserReadOnly = true;
			settingsError = "设置读取或迁移失败，原配置已保留。";
		}
		notify();
		return;
	}
	await listen<Values>("settings://changed", (e) => {
		values = e.payload;
		notify();
	});
	try {
		values = (await command<Values>("get_settings")) ?? {};
	} catch {
		settingsError = "设置读取失败，请重试或恢复配置。";
	}
	notify();
}

/** Current settings outside React. */
export const getSettings = (): Values => values;
/** Called on every settings change; returns the unsubscribe. */
export const subscribeSettings = subscribe;

export function readSetting<T>(all: Values, def: SettingDef<T>): T {
	return (def.key in all ? all[def.key] : def.default) as T;
}

/** Whole settings map (re-renders on any change). */
export function useSettings(): Values {
	return useSyncExternalStore(subscribe, () => values);
}

export function useSettingsError(): string {
	return useSyncExternalStore(subscribe, () => settingsError);
}

export function useSetting<T>(def: SettingDef<T>): T {
	return readSetting(useSettings(), def);
}

export function setSetting<T>(def: SettingDef<T> | string, value: T) {
	const key = typeof def === "string" ? def : def.key;
	if (!SHELL_KEYS.has(key)) return;
	if (!isTauri && browserReadOnly) {
		settingsError = "配置读取或迁移失败，当前为只读；请恢复配置后重新打开。";
		notify();
		return;
	}
	const previous = values;
	values = { ...values, [key]: value }; // optimistic
	settingsError = "";
	notify();
	if (isTauri) {
		command("set_setting", { key, value }).catch(async () => {
			settingsError = "设置保存失败，已恢复已保存的值。";
			try {
				values = (await command<Values>("get_settings")) ?? previous;
			} catch {
				values = previous;
			}
			notify();
		});
	} else {
		try {
			localStorage.setItem(LOCAL_KEY, JSON.stringify(values));
		} catch {
			values = previous;
			settingsError = "设置保存失败，原配置已保留。";
			notify();
		}
	}
}

/** What opens the island: the pointer entering it, or a click on it. */
export type OpenTrigger = "hover" | "click";
/** What closes the island: the pointer leaving it, or a click anywhere else. */
export type CloseTrigger = "leave" | "clickOutside";

/** How the island reacts to the pointer (the settings' Behavior page). */
export const behaviorSettings = {
	openOn: {
		key: "island.openOn",
		label: "behavior.openOn.label",
		description: "behavior.openOn.desc",
		default: "hover" as OpenTrigger,
	} satisfies SettingDef<OpenTrigger>,
	closeOn: {
		key: "island.closeOn",
		label: "behavior.closeOn.label",
		description: "behavior.closeOn.desc",
		default: "leave" as CloseTrigger,
	} satisfies SettingDef<CloseTrigger>,
	hideInFullscreen: {
		key: "island.hideInFullscreen",
		label: "settings.hideInFullscreen.label",
		description: "settings.hideInFullscreen.desc",
		default: true,
	} satisfies SettingDef,
};

/** Before `island.openOn`, a boolean said whether hovering expands the island. */
const LEGACY_EXPAND_ON_HOVER_KEY = "island.expandOnHover";

/** The open trigger, honoring the old "Expand on hover" switch when it was turned off. */
export function openTrigger(all: Values): OpenTrigger {
	if (behaviorSettings.openOn.key in all) return readSetting(all, behaviorSettings.openOn);
	return all[LEGACY_EXPAND_ON_HOVER_KEY] === false ? "click" : "hover";
}

/** Where the island goes after being dragged along the top edge. */
export const positionSettings = {
	returnToCenter: {
		key: "island.returnToCenter",
		label: "settings.returnToCenter.label",
		description: "settings.returnToCenter.desc",
		default: true,
	} satisfies SettingDef,
	returnDelay: {
		key: "island.returnDelay",
		label: "settings.returnDelay.label",
		description: "settings.returnDelay.desc",
		default: 5,
	} satisfies SettingDef<number>,
};

/**
 * Which monitor the island lives on (applied by the backend, `display.rs`).
 * `monitor` is "primary" (follows Windows' primary monitor) or a monitor id
 * from the `list_monitors` command.
 */
export const monitorSettings = {
	monitor: {
		key: "island.monitor",
		label: "settings.monitor.label",
		description: "settings.monitor.desc",
		default: "primary",
	} satisfies SettingDef<string>,
	avoidMaximized: {
		key: "island.avoidMaximized",
		label: "settings.avoidMaximized.label",
		description: "settings.avoidMaximized.desc",
		default: false,
	} satisfies SettingDef,
};

/** Last drag offset from the center in CSS px (kept only when not returning). */
export const ISLAND_OFFSET_KEY = "island.offset";

/** Swallowed by the tray's black hole; written by the backend (`tray.rs`). */
export const ISLAND_HIDDEN_KEY = "island.hidden";

/**
 * Look of the island:
 * - `dynamic`: hangs from the top edge with concave "ears", like the notch.
 * - `windows`: a floating pill with rounded corners, a tab bar at the bottom,
 *   a clock at rest and an optional gradient rim (Windows Island's look).
 */
export type IslandStyle = "dynamic" | "windows";

export const appearanceSettings = {
	style: {
		key: "appearance.style",
		label: "appearance.style.label",
		description: "appearance.style.desc",
		default: "dynamic",
	} as SettingDef<IslandStyle>,
	/** A preset id from `core/appearance.ts`, "none" (classic hairline) or "custom". */
	border: {
		key: "appearance.border",
		label: "appearance.border.label",
		description: "appearance.border.desc",
		default: "none",
	} satisfies SettingDef<string>,
	customColors: {
		key: "appearance.customColors",
		label: "appearance.custom.label",
		default: ["#BF5AF2", "#64D2FF"],
	} satisfies SettingDef<string[]>,
	thickness: {
		key: "appearance.borderThickness",
		label: "appearance.thickness.label",
		default: 2,
	} satisfies SettingDef<number>,
	animate: {
		key: "appearance.animateBorder",
		label: "appearance.animate.label",
		description: "appearance.animate.desc",
		default: false,
	} satisfies SettingDef,
	glow: {
		key: "appearance.glow",
		label: "appearance.glow.label",
		description: "appearance.glow.desc",
		default: true,
	} satisfies SettingDef,
	glass: {
		key: "appearance.glass",
		label: "appearance.glass.label",
		description: "appearance.glass.desc",
		default: "off" as GlassLevel,
	} satisfies SettingDef<GlassLevel>,
	idleClock: {
		key: "appearance.idleClock",
		label: "appearance.idleClock.label",
		description: "appearance.idleClock.desc",
		default: true,
	} satisfies SettingDef,
};
