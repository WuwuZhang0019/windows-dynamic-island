// Date: 2026-11-12. Reuse the upstream modules' handle-only pointer reorder interaction.
import { GripVerticalIcon } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { forwardRef, type ReactNode, useEffect } from "react";
import { useIsland } from "../core/island";
import type { StepStatus } from "./contract/protocol";

type Props = {
	itemKey: string;
	routeKey?: string;
	projectKey: string;
	title: string;
	state: StepStatus;
	selected: boolean;
	delay: number;
	reducedMotion: boolean;
	children: ReactNode;
	onSortEnd: () => void;
	onMove: (key: string, direction: number) => void;
};

export const SortableRouteCard = forwardRef<HTMLLIElement, Props>(function SortableRouteCard(
	{ itemKey, routeKey, projectKey, title, state, selected, delay, reducedMotion, children, onSortEnd, onMove },
	ref,
) {
	const drag = useDragControls();
	const { keepOpen } = useIsland();
	const hold = `task-reorder/${itemKey}`;
	useEffect(() => () => keepOpen(false, hold), [keepOpen, hold]);
	return (
		<Reorder.Item
			ref={ref}
			as="li"
			value={itemKey}
			className="wb-route-card"
			data-route-card={routeKey}
			data-project-key={projectKey}
			data-state={state}
			data-selected={selected}
			dragListener={false}
			dragControls={drag}
			onDragStart={() => keepOpen(true, hold)}
			onDragEnd={() => {
				onSortEnd();
				keepOpen(false, hold);
			}}
			layout="position"
			initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
			animate={{ opacity: 1, scale: 1 }}
			whileHover={reducedMotion ? undefined : { y: -2 }}
			whileTap={reducedMotion ? undefined : { y: 0, scale: 0.995 }}
			exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.15 } }}
			transition={{
				type: "spring",
				stiffness: 360,
				damping: 30,
				delay,
				opacity: { duration: reducedMotion ? 0 : 0.22, delay },
				layout: { duration: reducedMotion ? 0 : 0.25, delay: 0 },
			}}
			whileDrag={{ scale: reducedMotion ? 1 : 1.01, boxShadow: "0 12px 28px #00000080", zIndex: 3 }}
		>
			<button
				type="button"
				className="wb-route-drag"
				data-route-drag={itemKey}
				aria-label={`调整顺序：${title}`}
				title="拖动排序；也可用方向键上、下移动"
				onPointerDown={(event) => {
					event.stopPropagation();
					drag.start(event);
				}}
				onKeyDown={(event) => {
					if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
					event.preventDefault();
					onMove(itemKey, event.key === "ArrowUp" ? -1 : 1);
				}}
			>
				<GripVerticalIcon size={14} />
			</button>
			{children}
		</Reorder.Item>
	);
});
