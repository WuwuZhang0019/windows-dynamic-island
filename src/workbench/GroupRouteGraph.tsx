// Date: 2026-11-13. Source-adapted Git curves with the workbench's declared route topology.
import type { CSSProperties } from "react";
import type { Route } from "./contract/protocol";
import { CurvedEdge } from "./git-roadmap/CurvedEdge";
import { roadmapGeometry } from "./git-roadmap/geometry";
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
	routes = [],
}: {
	layout: RouteGraphLayout;
	compact: boolean;
	selectedKey: string;
	selectedRouteKey: string;
	onSelect: (key: string, route: string) => void;
	routes?: Route[];
}) {
	const graph = roadmapGeometry(layout, compact);
	return (
		<>
			<div
				className={`wb-group-graph${compact ? " wb-group-graph-compact" : ""}`}
				data-graph-lanes={layout.lanes}
				data-graph-renderer="react-git-log-adapted"
				style={
					{
						height: graph.height,
						minWidth: compact ? undefined : graph.width,
						"--wb-graph-columns": layout.columns,
					} as CSSProperties
				}
			>
				<svg
					className="wb-graph-lines"
					viewBox={`0 0 ${graph.width} ${graph.height}`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					{graph.edges.map((edge) => (
						<CurvedEdge
							key={edge.key}
							id={edge.key}
							colour={edge.colour}
							path={edge.path}
							dashed={edge.status === "running"}
							status={edge.status}
							kind={edge.kind}
							from={edge.from}
							to={edge.to}
						/>
					))}
				</svg>
				{/* Station actions remain paused; card selection and wheel scrolling are handled by WorkbenchView. */}
				{graph.nodes.map(({ step, x, y, merge, colour, forkDown }) => (
					<span
						key={step.key}
						role="img"
						className={`wb-step wb-graph-step wb-step-${step.status}`}
						data-step-key={step.key}
						data-status={step.status}
						data-merge={merge}
						data-fork-down={forkDown && !compact}
						aria-label={`${step.code} ${step.title} · ${labels[step.status]}${merge ? " · 合流步骤" : ""}`}
						data-selected={step.key === selectedKey}
						title={`${step.code} ${step.title} · ${labels[step.status]}${merge ? " · 合流步骤" : ""}`}
						style={
							{
								left: `${(x / graph.width) * 100}%`,
								top: y - (compact ? 6 : 14),
								"--wb-branch-colour": colour,
							} as CSSProperties
						}
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
					</span>
				))}
			</div>
			{!compact && layout.lanes > 1 && routes.length > 1 && (
				<ul className="wb-graph-legend" aria-label="路线分支">
					{routes
						.filter((route) => route.stepKeys.some((key) => graph.nodes.some((node) => node.step.key === key)))
						.map((route) => (
							<li key={route.key} title={route.label}>
								<i style={{ background: graph.palette.get(route.key) }} aria-hidden="true" />
								{route.label}
							</li>
						))}
				</ul>
			)}
		</>
	);
}
