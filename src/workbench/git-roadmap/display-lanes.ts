// Date: 2026-11-17. Reuse vertical space between connected temporal route fragments.
import type { RouteGraphEdge, RouteGraphLayout } from "../task-groups";

export function routeDisplayLanes(layout: RouteGraphLayout, edges: RouteGraphEdge[]): Map<number, number> {
	const original = new Map(layout.nodes.map((node) => [node.lane, node.lane]));
	// Explicit heading stations identify persistent independent tracks.
	if (new Set(layout.nodes.filter((node) => node.heading).map((node) => node.lane)).size > 1) return original;
	const rows = [...original.keys()].map((lane) => {
		const nodes = layout.nodes.filter((node) => node.lane === lane);
		return {
			lane,
			start: Math.min(...nodes.map((node) => node.column)),
			end: Math.max(...nodes.map((node) => node.column)),
			parents: new Set<number>(),
			children: new Set<number>(),
		};
	});
	const byLane = new Map(rows.map((row) => [row.lane, row]));
	const byKey = new Map(layout.nodes.map((node) => [node.step.key, node]));
	let connections = 0;
	for (const edge of edges) {
		const from = byKey.get(edge.from),
			to = byKey.get(edge.to);
		if (!from || !to || from.lane === to.lane) continue;
		const source = byLane.get(from.lane),
			target = byLane.get(to.lane);
		if (!source || !target) continue;
		// A spanning route is a persistent track, not a temporal fragment.
		if (source.end >= target.start) return original;
		source.children.add(target.lane);
		target.parents.add(source.lane);
		connections++;
	}
	if (!connections) return original;
	const ordered = rows.sort((a, b) => a.start - b.start || a.lane - b.lane);
	const result = new Map<number, number>();
	const placed: { start: number; end: number; y: number }[] = [];
	for (const row of ordered) {
		const parents = [...row.parents].flatMap((lane) => {
			const y = result.get(lane);
			return y === undefined ? [] : [y];
		});
		let desired = ordered
			.filter((candidate) => candidate.start === row.start && !candidate.parents.size)
			.findIndex((candidate) => candidate.lane === row.lane);
		if (parents.length > 1) desired = (Math.min(...parents) + Math.max(...parents)) / 2;
		else if (parents.length === 1) {
			const parent = byLane.get([...row.parents][0]);
			const siblings = ordered.filter((candidate) => parent?.children.has(candidate.lane));
			desired = parents[0] + siblings.findIndex((candidate) => candidate.lane === row.lane) - (siblings.length - 1) / 2;
		}
		const occupied = placed.filter((other) => other.start <= row.end && other.end >= row.start);
		const candidates = [desired, ...occupied.flatMap((other) => [other.y - 1, other.y + 1])];
		const available = candidates.filter((y) => occupied.every((other) => Math.abs(other.y - y) >= 1 - 0.000001));
		available.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || b - a);
		const y = available[0] ?? Math.max(0, ...occupied.map((other) => other.y + 1));
		result.set(row.lane, y);
		placed.push({ start: row.start, end: row.end, y });
	}
	const top = Math.min(0, ...result.values());
	for (const [lane, y] of result) result.set(lane, y - top);
	return result;
}
