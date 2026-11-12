// Date: 2026-11-12. Grid/list motion inspired by https://codepen.io/aaroniker/pen/dyoKeMP.
import { motion, useReducedMotion } from "motion/react";
import { setSetting, useSettings } from "../../core/settings";
import { TASK_SIZE_KEY, taskSize } from "../../workbench/list-preferences";
import "./task-size-toggle.css";

const dots = [
	{ x: 4, y: 4, viaX: 0, viaY: 12 },
	{ x: 13, y: 4, viaX: 3, viaY: 1 },
	{ x: 4, y: 13, viaX: 12, viaY: 7 },
	{ x: 13, y: 13, viaX: 17, viaY: 3 },
];

export function TaskSizeToggle() {
	const compact = taskSize(useSettings()) === "small";
	const reducedMotion = useReducedMotion();
	const label = compact ? "切换为完整卡片" : "切换为紧凑列表";
	return (
		<button
			type="button"
			className="task-size-toggle"
			data-task-size-toggle={compact ? "small" : "large"}
			aria-label={label}
			aria-pressed={compact}
			title={label}
			onClick={(event) => {
				event.stopPropagation();
				setSetting(TASK_SIZE_KEY, compact ? "large" : "small");
			}}
		>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				{dots.map((dot, index) => {
					const x = compact ? 2 : dot.x;
					const y = compact ? 3 + index * 5 : dot.y;
					return (
						<motion.rect
							key={`${dot.x}-${dot.y}`}
							initial={false}
							animate={{
								x: reducedMotion ? x : [null, dot.viaX, x],
								y: reducedMotion ? y : [null, dot.viaY, y],
								width: compact ? 2.8 : 7,
								height: compact ? 2.8 : 7,
								rx: compact ? 0.8 : 1.5,
							}}
							transition={{ duration: reducedMotion ? 0 : 0.45, ease: "easeInOut" }}
						/>
					);
				})}
				{[3, 8, 13, 18].map((y, index) => (
					<motion.rect
						key={y}
						x={8}
						y={y + 0.3}
						width={12}
						height={2.2}
						rx={0.8}
						style={{ transformBox: "fill-box", transformOrigin: index < 2 ? "right" : "left" }}
						initial={false}
						animate={{ scaleX: compact ? 1 : 0, opacity: compact ? 1 : 0 }}
						transition={{ duration: reducedMotion ? 0 : 0.15, delay: reducedMotion || !compact ? 0 : 0.3 }}
					/>
				))}
			</svg>
		</button>
	);
}
