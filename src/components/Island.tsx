import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useAppearance } from "../core/appearance";
import { command } from "../core/bridge";
import { cn } from "../core/cn";
import { useSyncLocale } from "../core/i18n";
import { type IslandApi, IslandContext } from "../core/island";
import { useGlass } from "../core/useGlass";
import { useHitRects } from "../core/useHitRects";
import { useIslandController } from "../core/useIslandController";
import { useIslandDrag } from "../core/useIslandDrag";
import { useWorkbench } from "../workbench/useWorkbench";
import { islandContent } from "./island/content";
import { GlassProbes } from "./island/GlassProbes";
import { expandedHeightLimit, geometry, variantOf } from "./island/geometry";
import { Rim } from "./island/Rim";
import { Surface } from "./island/Surface";
import { useContentHeight } from "./island/useContentHeight";

export function Island() {
	const ctl = useIslandController();
	const { mode, primary } = ctl;
	const workbench = useWorkbench();
	const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight });
	useEffect(() => {
		const resize = () => setViewport({ width: innerWidth, height: innerHeight });
		window.addEventListener("resize", resize);
		return () => window.removeEventListener("resize", resize);
	}, []);
	const look = useAppearance();
	const windows = look.style === "windows";
	const v = variantOf(look);
	useHitRects();
	useGlass(look.glass);
	useSyncLocale();

	const heightLimit = expandedHeightLimit(viewport.height, v.top);
	const contentSize = useContentHeight(mode === "expanded" && !!workbench.envelope, heightLimit);
	const bigSize = {
		width: Math.min(860, viewport.width - 40),
		height: Math.max(0, (contentSize.height ?? 480) - v.tabBar),
	};
	const baseGeometry = geometry(v, look, mode, bigSize, primary, heightLimit);
	const g = mode === "compact" ? { ...baseGeometry, width: Math.min(410, viewport.width - 40) } : baseGeometry;
	const big = mode === "expanded";
	const hidden = mode === "hidden";
	const swallowed = mode === "swallowed";
	const resting = mode === "compact";
	const transition = big ? v.expandSpring : v.shellSpring;

	const drag = useIslandDrag({
		width: g.width,
		leftExtra: g.ear,
		rightExtra: g.ear,
		canReturn: !big,
		onDragChange: ctl.lockHover,
	});

	const api: IslandApi = useMemo(
		() => ({ mode, tab: ctl.tab, expand: ctl.expand, collapse: ctl.collapse, keepOpen: ctl.keepOpen }),
		[mode, ctl.tab, ctl.expand, ctl.collapse, ctl.keepOpen],
	);

	const content = islandContent(ctl, look, v, workbench, contentSize.ref);
	const rim = windows ? <Rim look={look} /> : null;

	return (
		<IslandContext.Provider value={api}>
			<div className="pointer-events-none fixed inset-0 flex items-start justify-center">
				{/* The tray's black hole: the island spins into its own center and comes back out. */}
				<motion.div
					className="pointer-events-none relative flex origin-center justify-center"
					// Spinning away can't be followed by a rectangular cutout.
					{...(swallowed ? { "data-glass-off": true } : {})}
					initial={false}
					animate={swallowed ? { scale: 0, rotate: -200, opacity: 0 } : { scale: 1, rotate: 0, opacity: 1 }}
					transition={
						swallowed
							? { duration: 0.46, ease: [0.55, 0, 1, 0.45] }
							: { duration: 0.56, ease: [0.34, 1.4, 0.64, 1], opacity: { duration: 0.26 } }
					}
				>
					<motion.div
						className={cn(
							"pointer-events-auto relative touch-none will-change-[width,height,transform]",
							drag.dragging && "cursor-grabbing **:cursor-grabbing",
						)}
						{...(hidden || swallowed ? {} : { "data-hit": true })}
						{...ctl.domHover}
						style={{ ...drag.style, marginTop: v.top }}
						onPointerDown={drag.onPointerDown}
						onClickCapture={drag.onClickCapture}
						onUpdate={drag.onShellUpdate}
						initial={false}
						animate={{
							width: g.width,
							height: g.height,
							opacity: hidden ? 0 : 1,
							y: hidden ? -g.height - 12 - v.top : 0,
						}}
						transition={{ ...transition, height: { type: "tween", duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
						tabIndex={-1}
						onClick={(event) => {
							if (!resting) return;
							const target = event.currentTarget;
							ctl.expand();
							command("focus_island").then(() => target.focus());
						}}
					>
						{/* Concave "ears" that blend the notch into the top edge of the screen. */}
						{!windows && (
							<>
								<motion.span
									data-glass="earLeft"
									className="pointer-events-none absolute top-0 right-full bg-[radial-gradient(circle_at_0_100%,transparent_70%,var(--island)_71%)]"
									initial={false}
									animate={{ width: g.ear, height: g.ear }}
									transition={v.shellSpring}
								>
									<GlassProbes />
								</motion.span>
								<motion.span
									data-glass="earRight"
									className="pointer-events-none absolute top-0 left-full bg-[radial-gradient(circle_at_100%_100%,transparent_70%,var(--island)_71%)]"
									initial={false}
									animate={{ width: g.ear, height: g.ear }}
									transition={v.shellSpring}
								>
									<GlassProbes />
								</motion.span>
							</>
						)}

						<Surface g={g} big={big} look={look} transition={transition} contentKey={content.key} rim={rim}>
							{content.node}
						</Surface>
					</motion.div>
				</motion.div>
			</div>
		</IslandContext.Provider>
	);
}
