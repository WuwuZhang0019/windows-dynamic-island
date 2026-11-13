// Date: 2026-11-13. Horizontal task adaptation of react-git-log's rounded branch edges.
// Apache-2.0 source and local changes are recorded in third_party/react-git-log.
import type { RouteGraphEdge, RouteGraphLayout, RouteGraphNode } from "../task-groups";

type Point = { x: number; y: number };
export type RoadmapNode = RouteGraphNode & Point & { merge: boolean; colour: string };
export type RoadmapEdge = RouteGraphEdge & { path: string; colour: string; status: string };

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

export function roadmapGeometry(layout: RouteGraphLayout, compact: boolean) {
	const columnWidth = 108;
	const laneHeight = compact ? 18 : 94;
	const offset = compact ? 12 : 24;
	const width = layout.columns * columnWidth;
	const palette = routeColours(layout.nodes.flatMap((node) => node.routeKeys));
	const height = (compact ? 24 : 96) + (layout.lanes - 1) * laneHeight;
	const incoming = new Map<string, number>();
	for (const edge of layout.edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
	// Date: 2026-11-13. Compact terminal stations share the fixed right edge.
	const outgoing = new Set(layout.edges.map((edge) => edge.from));
	const nodes: RoadmapNode[] = layout.nodes.map((node) => ({
		...node,
		x: compact
			? !outgoing.has(node.step.key)
				? width
				: (node.column / Math.max(1, layout.columns - 1)) * width
			: (node.column + 0.5) * columnWidth,
		y: offset + node.lane * laneHeight,
		merge: (incoming.get(node.step.key) ?? 0) > 1,
		colour: palette.get(node.routeKeys[0]) ?? routeColour(""),
	}));
	const byKey = new Map(nodes.map((node) => [node.step.key, node]));
	const edges: RoadmapEdge[] = [];
	for (const edge of layout.edges) {
		const from = byKey.get(edge.from);
		const to = byKey.get(edge.to);
		if (!from || !to) continue;
		const routeKey =
			from.routeKeys.find((key) => to.routeKeys.includes(key)) ??
			(to.merge ? from.routeKeys[0] : to.routeKeys[0]) ??
			"";
		const direction = to.x > from.x ? 1 : -1;
		let points: Point[] = [from, to];
		if (from.y !== to.y) {
			const inset = Math.min(columnWidth * 0.4, Math.abs(to.x - from.x) / 2);
			const bend = to.merge ? to.x - direction * inset : from.x + direction * inset;
			points = [from, { x: bend, y: from.y }, { x: bend, y: to.y }, to];
		} else if (
			nodes.some(
				(node) =>
					node !== from &&
					node !== to &&
					node.y === from.y &&
					node.x > Math.min(from.x, to.x) &&
					node.x < Math.max(from.x, to.x),
			)
		) {
			// An explicit long dependency must not appear to connect through an unrelated station.
			const inset = columnWidth * 0.22;
			const transit = from.y - (compact ? 7 : 16);
			points = [
				from,
				{ x: from.x + direction * inset, y: from.y },
				{ x: from.x + direction * inset, y: transit },
				{ x: to.x - direction * inset, y: transit },
				{ x: to.x - direction * inset, y: to.y },
				to,
			];
		}
		edges.push({
			...edge,
			path: roundedPath(points, compact ? 4 : 12),
			colour: palette.get(routeKey) ?? routeColour(""),
			status: to.step.status,
		});
	}
	return { nodes, edges, width, height, palette };
}
