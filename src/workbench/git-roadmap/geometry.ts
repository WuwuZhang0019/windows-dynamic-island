// Date: 2026-11-13. Horizontal task adaptation of react-git-log's rounded branch edges.
// Apache-2.0 source and local changes are recorded in third_party/react-git-log.
import type { RouteGraphEdge, RouteGraphLayout, RouteGraphNode } from "../task-groups";

import { computeMetroRail, type MetroRail, metroRoundedPath } from "./metro";
import { type CaptionSide, type Point, type Rail, routeRail } from "./routing";
export type RoadmapNode = RouteGraphNode &
	Point & { merge: boolean; colour: string; forkDown: boolean; key: string; captionSide?: CaptionSide };
export type RoadmapEdge = RouteGraphEdge & MetroRail & { path: string; colour: string; status: string };

// Branch colours identify routes; station fills and text still communicate execution status.
const colours = ["#00c26a", "#a5a0ff", "#76bbff", "#efbd75", "#ed94b2", "#74d4d9", "#c39cec", "#bdd785"];

export function routeColour(key: string): string {
	let hash = 0;
	for (const character of key) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
	return colours[(hash >>> 0) % colours.length];
}

// Sort stable IDs before resolving palette collisions, so status updates and list sorting cannot recolour a route.
export function routeColours(keys: Iterable<string>): Map<string, string> {
	const result = new Map<string, string>();
	const used = new Set<string>();
	for (const key of [...new Set(keys)].sort()) {
		const start = colours.indexOf(routeColour(key));
		const colour =
			colours
				.slice(start)
				.concat(colours.slice(0, start))
				.find((value) => !used.has(value)) ?? `hsl(${(result.size * 137.508) % 360} 65% 70%)`;
		used.add(colour);
		result.set(key, colour);
	}
	return result;
}

// Two rounded corners keep the branch horizontal between forks and joins.
// This extends the upstream CanvasRenderer's lineTo/quadraticCurveTo strategy to SVG.
export function roundedPath(points: Point[], radius: number): string {
	const vertices = points.filter(
		(point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
	);
	if (!vertices.length) return "";
	const number = (value: number) => Number(value.toFixed(3));
	const coordinate = (point: Point) => `${number(point.x)} ${number(point.y)}`;
	const commands = [`M ${coordinate(vertices[0])}`];
	for (let index = 1; index < vertices.length - 1; index++) {
		const previous = vertices[index - 1];
		const current = vertices[index];
		const next = vertices[index + 1];
		const before = Math.hypot(current.x - previous.x, current.y - previous.y);
		const after = Math.hypot(next.x - current.x, next.y - current.y);
		const size = Math.min(radius, before / 2, after / 2);
		const start = {
			x: current.x + ((previous.x - current.x) / before) * size,
			y: current.y + ((previous.y - current.y) / before) * size,
		};
		const end = {
			x: current.x + ((next.x - current.x) / after) * size,
			y: current.y + ((next.y - current.y) / after) * size,
		};
		commands.push(`L ${coordinate(start)}`, `Q ${coordinate(current)} ${coordinate(end)}`);
	}
	commands.push(`L ${coordinate(vertices[vertices.length - 1])}`);
	return commands.join(" ");
}

export function roadmapGeometry(layout: RouteGraphLayout, compact: boolean, renderedWidth?: number) {
	// Date: 2026-11-13. Keep transitive dependencies in the model, without duplicating existing visual paths.
	const outgoing = new Map<string, RouteGraphEdge[]>();
	for (const edge of layout.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
	function reachable(start: string, target: string, excluded?: string) {
		const pending = [start];
		const visited = new Set<string>();
		while (pending.length) {
			const key = pending.pop();
			if (!key || visited.has(key)) continue;
			visited.add(key);
			for (const edge of outgoing.get(key) ?? []) {
				if (edge.key === excluded) continue;
				if (edge.to === target) return true;
				pending.push(edge.to);
			}
		}
		return false;
	}
	const visibleEdges = layout.edges.filter(
		(edge) => edge.kind !== "dependency" || !reachable(edge.from, edge.to, edge.key) || reachable(edge.to, edge.from),
	);
	const columnWidth = 108;
	const laneHeight = compact ? 18 : 94;
	const offset = compact ? 12 : 24;
	const minimumWidth = (compact ? layout.columns : Math.max(1, layout.columns - 1)) * columnWidth;
	const width = compact ? (renderedWidth ?? minimumWidth) : Math.max(minimumWidth, renderedWidth ?? 0);
	const palette = routeColours(layout.nodes.flatMap((node) => node.routeKeys));
	// Date: 2026-11-17. Center a solitary continuation over the preceding converging rows.
	const displayLanes = new Map(layout.nodes.map((node) => [node.lane, node.lane]));
	const nodeByKey = new Map(layout.nodes.map((node) => [node.step.key, node]));
	for (const lane of displayLanes.keys()) {
		const continuation = layout.nodes.filter((node) => node.lane === lane);
		const preceding = layout.nodes.filter((node) => node.lane !== lane);
		const precedingLanes = [...new Set(preceding.map((node) => node.lane))].sort((a, b) => a - b);
		if (precedingLanes.length < 2) continue;
		const start = Math.min(...continuation.map((node) => node.column));
		if (preceding.some((node) => node.column >= start)) continue;
		if (
			!precedingLanes.every((sourceLane) =>
				visibleEdges.some(
					(edge) => nodeByKey.get(edge.from)?.lane === sourceLane && nodeByKey.get(edge.to)?.lane === lane,
				),
			)
		)
			continue;
		for (const [index, sourceLane] of precedingLanes.entries()) displayLanes.set(sourceLane, index);
		displayLanes.set(lane, (precedingLanes.length - 1) / 2);
		break;
	}
	const laneCount = Math.max(1, ...[...displayLanes.values()].map((lane) => lane + 1));
	const height = (compact ? 24 : 96) + (laneCount - 1) * laneHeight;
	const incoming = new Map<string, number>();
	for (const edge of visibleEdges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
	// Date: 2026-11-16. Keep merge stations on the same column grid as other stations.
	const hasSuccessor = new Set(visibleEdges.map((edge) => edge.from));
	const stride = width / Math.max(1, layout.columns - 1);
	function stationX(node: RouteGraphNode) {
		// Date: 2026-11-16. A solitary heading is a starting station, not an endpoint.
		if (
			compact &&
			node.column > 0 &&
			!hasSuccessor.has(node.step.key) &&
			!layout.nodes.some(
				(other) => other !== node && other.lane === node.lane && other.column > 0 && !hasSuccessor.has(other.step.key),
			)
		)
			return width;
		const base = node.column * stride;
		return Number(base.toFixed(3));
	}
	const nodes: RoadmapNode[] = layout.nodes.map((node) => ({
		...node,
		key: node.step.key,
		x: stationX(node),
		y: offset + (displayLanes.get(node.lane) ?? node.lane) * laneHeight,
		merge: (incoming.get(node.step.key) ?? 0) > 1,
		forkDown: false,
		colour: palette.get(node.routeKeys[0]) ?? routeColour(""),
	}));
	const byKey = new Map(nodes.map((node) => [node.step.key, node]));
	const edges: RoadmapEdge[] = [];
	// Date: 2026-11-17. Keep the established caption layout independent of the new SVG paths.
	const captionRails: Rail[] = [];
	// Date: 2026-11-17. Lay existing rails first, then route branches around occupied segments.
	const priority = (edge: RouteGraphEdge) =>
		byKey.get(edge.from)?.y === byKey.get(edge.to)?.y ? 0 : edge.kind === "route" ? 1 : 2;
	for (const edge of [...visibleEdges].sort((a, b) => priority(a) - priority(b))) {
		const from = byKey.get(edge.from);
		const to = byKey.get(edge.to);
		if (!from || !to) continue;
		const routeKey =
			from.routeKeys.find((key) => to.routeKeys.includes(key)) ??
			(to.merge ? from.routeKeys[0] : to.routeKeys[0]) ??
			"";
		const captionRail = routeRail(from, to, nodes, captionRails, routeKey, compact);
		captionRails.push(captionRail);
		const rail = computeMetroRail(from, to, nodes, compact);
		edges.push({
			...edge,
			...rail,
			path: metroRoundedPath(rail.points),
			colour: palette.get(routeKey) ?? routeColour(""),
			status: to.step.status,
		});
	}
	for (const node of nodes) node.forkDown = node.captionSide === "left";
	const byEdge = new Map(edges.map((edge) => [edge.key, edge]));
	return {
		nodes,
		edges: visibleEdges.flatMap((edge) => byEdge.get(edge.key) ?? []),
		width,
		minimumWidth,
		height,
		palette,
	};
}
