// Date: 2026-11-17. A many-to-one suffix must sit between its preceding route rows.
import { describe, expect, test } from "bun:test";
import { createScenario } from "../contract/fixtures";
import { layoutRoutes, type RouteGraphLayout } from "../task-groups";
import { roadmapGeometry } from "./geometry";

function fixture(count: number): RouteGraphLayout {
	const snapshot = createScenario("fork-join").snapshot;
	if (!snapshot) throw Error("Missing fixture");
	const base = snapshot.steps[0];
	const branches = Array.from({ length: count }, (_, index) => [`branch-${index}-a`, `branch-${index}-b`]);
	const codes = ["E", "F", "I", "J", ...branches.flat()];
	const steps = codes.map((code) => ({
		...base,
		key: code,
		code,
		parentKey: "fixture-parent",
		dependsOn:
			code === "E" ? branches.slice(0, -1).map((keys) => keys[1]) : code === "I" ? [branches[count - 1][1]] : [],
	}));
	const routes = [["E", "F", "I", "J"], ...branches].map((stepKeys, index) => ({
		...snapshot.routes[0],
		key: `route-${index}`,
		stepKeys,
		sourceStepKey: null,
		returnStepKey: null,
	}));
	return layoutRoutes(routes, steps);
}

describe("centered many-to-one continuation", () => {
	for (const count of [2, 3, 4, 5]) {
		for (const compact of [false, true]) {
			test(`${count} preceding rows center the whole continuation in ${compact ? "compact" : "full"} view`, () => {
				const layout = fixture(count);
				const original = JSON.stringify(layout);
				const graph = roadmapGeometry(layout, compact);
				const preceding = graph.nodes.filter((node) => node.step.key.startsWith("branch-"));
				const midpoint =
					(Math.min(...preceding.map((node) => node.y)) + Math.max(...preceding.map((node) => node.y))) / 2;
				for (const node of graph.nodes.filter((node) => !node.step.key.startsWith("branch-")))
					expect(node.y).toBe(midpoint);
				expect(graph.height).toBe((compact ? 24 : 96) + (count - 1) * (compact ? 18 : 94));
				expect(new Set(graph.nodes.map((node) => `${node.x}:${node.y}`)).size).toBe(graph.nodes.length);
				const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
				for (const edge of graph.edges) {
					const from = byKey.get(edge.from),
						to = byKey.get(edge.to);
					if (!from || !to) throw Error("Missing edge endpoint");
					expect(edge.points[0]).toEqual({ x: from.x, y: from.y });
					expect(edge.points.at(-1)).toEqual({ x: to.x, y: to.y });
				}
				expect(JSON.stringify(layout)).toBe(original);
			});
		}
	}
	test("unrelated sequential rows keep their declared positions", () => {
		const layout = fixture(3);
		const nodes = new Map(layout.nodes.map((node) => [node.step.key, node]));
		layout.edges = layout.edges.filter((edge) => nodes.get(edge.from)?.lane === nodes.get(edge.to)?.lane);
		const graph = roadmapGeometry(layout, false);
		for (const node of graph.nodes) expect(node.y).toBe(24 + node.lane * 94);
	});

	test("overlapping route rows keep their declared positions", () => {
		const layout = fixture(3);
		layout.nodes[layout.nodes.length - 1].column = 3;
		const graph = roadmapGeometry(layout, false);
		for (const node of graph.nodes) expect(node.y).toBe(24 + node.lane * 94);
	});
});
