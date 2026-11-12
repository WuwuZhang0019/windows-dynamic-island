import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { Appearance } from "../../core/appearance";
import { cn } from "../../core/cn";
import type { IslandController } from "../../core/useIslandController";
import type { WorkbenchState } from "../../workbench/useWorkbench";
import { WorkbenchSummary, WorkbenchView } from "../../workbench/WorkbenchView";
import { IdleClock } from "../IdleClock";
import { AgentAppTabs } from "./AgentAppTabs";
import type { Variant } from "./geometry";
import { Tabs } from "./Tabs";

// Date: 2026-11-12. Fixed workbench content uses the original shell transition.
export function islandContent(
	ctl: IslandController,
	look: Appearance,
	v: Variant,
	workbench: WorkbenchState,
): { key: string; node: ReactNode } {
	if (!workbench.envelope) return { key: "loading", node: <span className="p-3 text-xs">工作台连接中</span> };
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
					<div className="agent-panel-header" data-agent-panel-header>
						<AgentAppTabs
							selected={workbench.selectedApp}
							onSelect={workbench.setSelectedApp}
							envelope={workbench.envelope}
						/>
						{!v.tabsAtBottom && controls}
					</div>
					<WorkbenchView {...workbench} envelope={workbench.envelope} />
					{v.tabsAtBottom && controls}
				</div>
			),
		};
	}
	return {
		key: "compact:workbench",
		node: (
			<div className="flex h-full items-center px-4">
				<AnimatePresence initial={false}>
					{look.idleClock && (
						<motion.div
							key="idle-clock"
							data-idle-clock
							className="h-full shrink-0 overflow-hidden"
							initial={{ width: 0, opacity: 0, scale: 0.9, filter: "blur(10px)" }}
							animate={{
								width: "auto",
								opacity: 1,
								scale: 1,
								filter: "blur(0px)",
								transition: { duration: 0.32, delay: 0.06, ease: [0.2, 0.9, 0.3, 1] },
							}}
							exit={{
								width: 0,
								opacity: 0,
								scale: 0.94,
								filter: "blur(8px)",
								transition: { duration: 0.16, ease: "easeIn" },
							}}
						>
							<div className="h-full pr-3 whitespace-nowrap">
								<IdleClock />
							</div>
						</motion.div>
					)}
				</AnimatePresence>
				<WorkbenchSummary
					envelope={workbench.envelope}
					scenario={workbench.scenario}
					preferences={workbench.preferences}
					archivedKeys={workbench.archivedKeys}
				/>
			</div>
		),
	};
}
