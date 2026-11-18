// Date: 2026-11-18. Octilinear rails with the workbench's declared route topology.
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import type { Route, Step } from "./contract/protocol";
import { CurvedEdge } from "./git-roadmap/CurvedEdge";
import { roadmapGeometry } from "./git-roadmap/geometry";
import { executingStepKeys, type RouteGraphLayout, stepStatusLabel } from "./task-groups";

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
	// Date: 2026-11-17. Use actual CSS pixels so responsive thumbnails preserve true 45-degree slopes.
	const element = useRef<HTMLDivElement>(null);
	const [renderedWidth, setRenderedWidth] = useState<number>();
	useLayoutEffect(() => {
		const graphElement = element.current;
		if (!graphElement) return;
		const width = Number.parseFloat(getComputedStyle(graphElement).width);
		if (width > 0) setRenderedWidth(width);
		const observer = new ResizeObserver(([entry]) => {
			if (entry.contentRect.width > 0) setRenderedWidth(entry.contentRect.width);
		});
		observer.observe(graphElement);
		return () => observer.disconnect();
	}, []);
	const graph = roadmapGeometry(layout, compact, renderedWidth);
	const executing = executingStepKeys(layout.nodes.map((node) => node.step));
	const codes = new Map(layout.nodes.map((node) => [node.step.key, node.step.code]));
	const legendRoutes =
		!compact && routes.length > 1 ? routes.filter((route) => route.stepKeys.some((key) => codes.has(key))) : [];
	const showDependencies = !compact && graph.edges.some((edge) => edge.kind === "dependency");
	const showMerges = !compact && graph.nodes.some((node) => node.merge);
	const label = (step: Step, merge: boolean) =>
		`${step.code} ${step.title} · ${stepStatusLabel(step, executing.has(step.key))}${merge ? " · 合流步骤" : ""}${step.dependsOn.length ? `\n前置：${step.dependsOn.map((key) => codes.get(key) ?? "路线外步骤").join("、")}` : ""}`;
	return (
		<>
			<div
				ref={element}
				className={`wb-group-graph${compact ? " wb-group-graph-compact" : ""}`}
				data-graph-lanes={layout.lanes}
				data-graph-renderer="react-git-log-adapted"
				style={
					{
						height: graph.height,
						minWidth: compact ? undefined : graph.minimumWidth,
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
					{(["dependency", "route"] as const).map((kind) => (
						<g key={kind} data-rail-layer={kind}>
							{graph.edges
								.filter((edge) => edge.kind === kind)
								.map((edge) => (
									<CurvedEdge
										key={edge.key}
										id={edge.key}
										points={edge.points}
										shape={edge.shape}
										colour={edge.colour}
										path={edge.path}
										status={edge.status}
										kind={edge.kind}
										from={edge.from}
										to={edge.to}
									/>
								))}
						</g>
					))}
				</svg>
				{/* Station actions remain paused; card selection and wheel scrolling are handled by WorkbenchView. */}
				{graph.nodes.map(({ step, x, y, merge, colour, forkDown, heading, captionSide }) => (
					<span
						key={step.key}
						role="img"
						className={`wb-step wb-graph-step wb-step-${step.status}`}
						data-step-key={step.key}
						data-status={step.status}
						data-executing={executing.has(step.key)}
						data-heading={heading || undefined}
						data-merge={merge}
						data-fork-down={forkDown && !compact}
						data-caption-side={!compact ? captionSide : undefined}
						aria-label={label(step, merge)}
						data-selected={step.key === selectedKey}
						title={label(step, merge)}
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
								<span className="wb-step-state">{stepStatusLabel(step, executing.has(step.key))}</span>
							</>
						)}
					</span>
				))}
			</div>
			{(legendRoutes.length > 0 || showDependencies || showMerges) && (
				<ul className="wb-graph-legend" aria-label="路线图图例">
					{legendRoutes.map((route) => (
						<li key={route.key} title={route.label} data-route-legend-key={route.key}>
							<i style={{ background: graph.palette.get(route.key) }} aria-hidden="true" />
							{route.label}
						</li>
					))}
					{showDependencies && (
						<li>
							<i className="wb-graph-dependency-key" aria-hidden="true" />
							前置依赖
						</li>
					)}
					{showMerges && (
						<li>
							<i className="wb-graph-merge-key" aria-hidden="true" />
							合流
						</li>
					)}
				</ul>
			)}
		</>
	);
}
