import type { ReactNode } from "react";
import type { Appearance } from "../../core/appearance";
import { cn } from "../../core/cn";
import type { IslandController } from "../../core/useIslandController";
import { IdleClock } from "../IdleClock";
import type { Variant } from "./geometry";
import { Tabs } from "./Tabs";

/** 固定工作台占位继续使用原内容切换动画。 */
export function islandContent(ctl: IslandController, look: Appearance, v: Variant): { key: string; node: ReactNode } {
	if (ctl.mode === "expanded") {
		const controls = <Tabs bottom={v.tabsAtBottom} pinned={ctl.pinned} onPin={ctl.setPinned} />;
		return {
			key: "big:workbench",
			node: (
				<div className={cn("flex h-full flex-col px-5 pt-3.5 pb-4.5", v.tabsAtBottom && "pb-2")}>
					{!v.tabsAtBottom && controls}
					<div className="flex min-h-0 flex-1 flex-col justify-center gap-3" data-workbench-placeholder>
						<h1 className="text-lg font-semibold">工作台</h1>
						<p className="text-sm text-text-dim">项目路线将在后续接入。</p>
						<p className="text-xs text-text-faint">尚未连接工作台服务</p>
					</div>
					{v.tabsAtBottom && controls}
				</div>
			),
		};
	}
	if (look.style === "windows" && look.idleClock && (ctl.mode === "idle" || ctl.mode === "swallowed"))
		return { key: "clock", node: <IdleClock /> };
	return { key: "idle", node: null };
}
