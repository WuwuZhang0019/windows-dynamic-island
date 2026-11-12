// Date: 2026-11-12. One shared graph renders task forks, joins and reused lanes.
import type { CSSProperties } from "react";
import type { RouteGraphLayout } from "./task-groups";

const labels: Record<string, string> = {
	pending: "待执行",
	running: "执行中",
	blocked: "已阻塞",
	completed: "已完成",
	cancelled: "已取消",
};

export function GroupRouteGraph({
	layout,
	compact,
	selectedKey,
	selectedRouteKey,
	onSelect,
}: {
	layout: RouteGraphLayout;
	compact: boolean;
	selectedKey: string;
	selectedRouteKey: string;
	onSelect: (key: string, route: string) => void;
}) {
	const gap = compact ? 18 : 84;
	const offset = compact ? 11 : 18;
	const height = compact ? 22 + (layout.lanes - 1) * gap : 88 + (layout.lanes - 1) * gap;
	const width = layout.columns * 92;
	const nodes = new Map(layout.nodes.map((node) => [node.step.key, node]));
	return (
		<div
			className={`wb-group-graph${compact ? " wb-group-graph-compact" : ""}`}
			data-graph-lanes={layout.lanes}
			style={{ height, minWidth: compact ? undefined : width, "--wb-graph-columns": layout.columns } as CSSProperties}
		>
			<svg className="wb-graph-lines" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
				{layout.edges.map((edge) => {
					const from = nodes.get(edge.from),
						to = nodes.get(edge.to);
					if (!from || !to) return null;
					return (
						<line
							key={edge.key}
							x1={(from.column + 0.5) * 92}
							y1={offset + from.lane * gap}
							x2={(to.column + 0.5) * 92}
							y2={offset + to.lane * gap}
							data-status={to.step.status}
							data-kind={edge.kind}
							data-from={edge.from}
							data-to={edge.to}
							vectorEffect="non-scaling-stroke"
						/>
					);
				})}
			</svg>
			{layout.nodes.map(({ step, routeKeys, column, lane }) => (
				<button
					key={step.key}
					type="button"
					className={`wb-step wb-graph-step wb-step-${step.status}`}
					data-step-key={step.key}
					data-status={step.status}
					aria-label={`${step.code} ${step.title} · ${labels[step.status]}`}
					aria-pressed={step.key === selectedKey}
					title={`${step.code} ${step.title} · ${labels[step.status]}`}
					style={{ left: `${((column + 0.5) / layout.columns) * 100}%`, top: lane * gap + (compact ? 5 : 4) }}
					onClick={() => onSelect(step.key, routeKeys.includes(selectedRouteKey) ? selectedRouteKey : routeKeys[0])}
				>
					<span className="wb-step-track">
						<span className="wb-dot" />
					</span>
					{!compact && (
						<>
							<span className="wb-step-code">{step.code}</span>
							<span className="wb-step-title">{step.title}</span>
							<span className="wb-step-state">{labels[step.status]}</span>
						</>
					)}
				</button>
			))}
		</div>
	);
}
