// Date: 2026-11-18. Pack route stations around their actual prerequisites.
import type { RouteGraphEdge, RouteGraphNode } from "../task-groups";

function reaches(outgoing: Map<string, Set<string>>, from: string, to: string): boolean {
	const pending = [from];
	const visited = new Set<string>();
	for (const key of pending) {
		if (key === to) return true;
		if (visited.has(key)) continue;
		visited.add(key);
		pending.push(...(outgoing.get(key) ?? []));
	}
	return false;
}

export function placeRouteColumns(nodes: Map<string, RouteGraphNode>, edges: Iterable<RouteGraphEdge>) {
	const outgoing = new Map([...nodes.keys()].map((key) => [key, new Set<string>()]));
	const incoming = new Map([...nodes.keys()].map((key) => [key, 0]));
	function before(from: string, to: string) {
		const successors = outgoing.get(from);
		const count = incoming.get(to);
		if (!successors || count === undefined || successors.has(to) || reaches(outgoing, to, from)) return;
		successors.add(to);
		incoming.set(to, count + 1);
	}

	const requiredChildren = new Map<string, string[]>();
	for (const { step } of nodes.values()) {
		for (const dependency of step.dependsOn) before(dependency, step.key);
		if (step.parentKey && step.required) {
			const children = requiredChildren.get(step.parentKey) ?? [];
			children.push(step.key);
			requiredChildren.set(step.parentKey, children);
		}
	}
	// A dependency on a parent is satisfied after its required descendants. It still draws from the parent.
	for (const { step } of nodes.values()) {
		const pending = [...step.dependsOn];
		const visited = new Set(pending);
		for (const key of pending) {
			for (const child of requiredChildren.get(key) ?? []) {
				if (visited.has(child)) continue;
				visited.add(child);
				before(child, step.key);
				pending.push(child);
			}
		}
	}
	// Start each subtree at its own heading and use declared display order where prerequisites allow it.
	for (const { step } of nodes.values()) if (step.parentKey) before(step.parentKey, step.key);
	for (const edge of edges) if (edge.kind === "route") before(edge.from, edge.to);

	const pending = [...nodes.values()];
	const nextColumn = new Map<number, number>();
	while (pending.length) {
		const index = pending.findIndex((node) => incoming.get(node.step.key) === 0);
		if (index < 0) break;
		const [node] = pending.splice(index, 1);
		node.column = Math.max(node.column, nextColumn.get(node.lane) ?? 0);
		nextColumn.set(node.lane, node.column + 1);
		for (const key of outgoing.get(node.step.key) ?? []) {
			const successor = nodes.get(key);
			if (!successor) continue;
			successor.column = Math.max(successor.column, node.column + 1);
			incoming.set(key, (incoming.get(key) ?? 1) - 1);
		}
	}
	return outgoing;
}
