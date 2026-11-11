import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 外壳命令；浏览器预览不启动采集或插件后台。 */
export function command<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	if (isTauri) return invoke<T>(cmd, args);
	if (cmd === "open_settings") window.open(`${location.pathname}#settings`, "island-workbench-settings");
	if (cmd === "open_external" && typeof args?.url === "string" && args.url.startsWith("https://"))
		window.open(args.url, "_blank", "noopener");
	const preview: Record<string, unknown> = {
		glass_supported: true,
		get_autostart: false,
		list_monitors: [],
		is_fullscreen_active: false,
	};
	return Promise.resolve(preview[cmd] as T);
}

export function onEvent<T>(event: string, handler: (payload: T) => void): () => void {
	if (!isTauri) return () => {};
	let unlisten: UnlistenFn | undefined;
	let disposed = false;
	listen<T>(event, (value) => handler(value.payload)).then((fn) => {
		if (disposed) fn();
		else unlisten = fn;
	});
	return () => {
		disposed = true;
		unlisten?.();
	};
}

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
	const ref = useRef(handler);
	ref.current = handler;
	useEffect(() => onEvent<T>(event, (payload) => ref.current(payload)), [event]);
}
