import { type MouseEvent, useEffect, useRef, useState } from "react";
import { command, isTauri, useTauriEvent } from "./bridge";
import { behaviorSettings, ISLAND_HIDDEN_KEY, openTrigger, readSetting, useSettings } from "./settings";
import type { IslandMode, ModuleEntry } from "./types";
import { useIslandHover } from "./useIslandHover";

export type IslandController = ReturnType<typeof useIslandController>;

/** 固定工作台视图复用原悬停、固定和全屏控制，不注册业务模块。 */
export function useIslandController() {
	const settings = useSettings();
	const [fullscreen, setFullscreen] = useState(false);
	const hover = useIslandHover({
		expandOnHover: openTrigger(settings) === "hover",
		collapseOnLeave: readSetting(settings, behaviorSettings.closeOn) === "leave",
		onOpen: () => {},
		onClose: () => {},
	});
	useTauriEvent<boolean>("island://fullscreen", setFullscreen);
	useTauriEvent<boolean>("island://hover", hover.onPointer);
	useTauriEvent("island://press-outside", hover.onPressOutside);
	useEffect(() => {
		command<boolean>("is_fullscreen_active").then((value) => setFullscreen(!!value));
	}, []);
	const latest = useRef(hover);
	latest.current = hover;
	useEffect(() => {
		const outside = (event: PointerEvent) => {
			if (!isTauri && !(event.target as Element).closest("[data-hit]")) latest.current.onPressOutside();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				latest.current.collapse();
				command("restore_focus");
			}
		};
		window.addEventListener("pointerdown", outside);
		window.addEventListener("keydown", key);
		return () => {
			window.removeEventListener("pointerdown", outside);
			window.removeEventListener("keydown", key);
		};
	}, []);
	const mode: IslandMode =
		settings[ISLAND_HIDDEN_KEY] === true
			? "swallowed"
			: fullscreen && readSetting(settings, behaviorSettings.hideInFullscreen)
				? "hidden"
				: hover.open
					? "expanded"
					: "compact";
	return {
		mode,
		entries: [] as ModuleEntry[],
		primary: undefined as ModuleEntry | undefined,
		secondary: undefined as ModuleEntry | undefined,
		focused: undefined as ModuleEntry | undefined,
		tab: "workbench",
		expand: hover.expand,
		collapse: hover.collapse,
		keepOpen: hover.keepOpen,
		pinned: hover.pinned,
		setPinned: hover.setPin,
		lockHover: hover.lockHover,
		domHover: isTauri
			? {}
			: {
					onMouseEnter: () => hover.onPointer(true),
					onMouseLeave: (event: MouseEvent<HTMLElement>) => {
						const rect = event.currentTarget.getBoundingClientRect();
						const inside =
							event.clientX > rect.left &&
							event.clientX < rect.right &&
							event.clientY > rect.top &&
							event.clientY < rect.bottom;
						if (!inside) hover.onPointer(false);
					},
				},
	};
}
