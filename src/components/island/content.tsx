import type { ReactNode } from "react";
import type { Appearance } from "../../core/appearance";
import { cn } from "../../core/cn";
import type { IslandController } from "../../core/useIslandController";
import type { WorkbenchState } from "../../workbench/useWorkbench";
import { WorkbenchSummary, WorkbenchView } from "../../workbench/WorkbenchView";
import { IdleClock } from "../IdleClock";
import type { Variant } from "./geometry";
import { Tabs } from "./Tabs";

// Date: 2026-11-11. Fixed simulation content uses the original shell transition.
export function islandContent(
	ctl: IslandController,
	look: Appearance,
	v: Variant,
	workbench: WorkbenchState,
): { key: string; node: ReactNode } {
	if (!workbench.envelope) return { key: "loading", node: <span className="p-3 text-xs">模拟数据加载中</span> };
	if (ctl.mode === "expanded") {
		const controls = <Tabs bottom={v.tabsAtBottom} pinned={ctl.pinned} onPin={ctl.setPinned} />;
		return {
			key: "big:workbench",
			node: (
				<div
					onFocusCapture={(event) => {
						const target = event.target as HTMLElement;
						ctl.keepOpen(target.matches("input,select,textarea,:focus-visible"), "workbench-focus");
					}}
					onBlurCapture={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node | null))
							ctl.keepOpen(false, "workbench-focus");
					}}
					className={cn("flex h-full flex-col px-5 pt-3.5 pb-4.5", v.tabsAtBottom && "pb-2")}
				>
					{!v.tabsAtBottom && controls}
					<WorkbenchView {...workbench} envelope={workbench.envelope} />
					{v.tabsAtBottom && controls}
				</div>
			),
		};
	}
	return {
		key: "compact:workbench",
		node: (
			<div className="flex h-full items-center gap-3 px-4">
				{look.style === "windows" && look.idleClock && (
					<div className="shrink-0">
						<IdleClock />
					</div>
				)}
				<WorkbenchSummary envelope={workbench.envelope} />
			</div>
		),
	};
}
