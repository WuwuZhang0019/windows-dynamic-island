// Date: 2026-11-17. Temporal fragments reuse rows across repeated joins and forks.
import { describe, expect, test } from "bun:test";
import { createScenario } from "../contract/fixtures";
import { layoutRoutes } from "../task-groups";
import { roadmapGeometry } from "./geometry";

function fixture(count: number) {
	const snapshot = createScenario("fork-join").snapshot;
	if (!snapshot) throw Error("Missing fixture");
	const prefix = Array.from({ length: count }, (_, i) => [`input-${i}-0`, `input-${i}-1`, `input-${i}-2`]);
	const shared = ["shared-0", "shared-1", "shared-2", "shared-3"];
	const branches = Array.from({ length: count }, (_, i) => [`output-${i}-0`, `output-${i}-1`, `output-${i}-2`]);
	const suffix = ["suffix-0", "suffix-1", "suffix-2", "suffix-3"];
	const fragments = [...prefix, shared, ...branches, suffix];
	const steps = fragments.flat().map((key) => ({
		...snapshot.steps[0],
		key,
		code: key,
		parentKey: null,
		dependsOn:
			key === shared[0]
				? prefix.map((keys) => keys[2])
				: branches.some((keys) => keys[0] === key)
					? [shared[3]]
					: key === suffix[0]
						? branches.map((keys) => keys[2])
						: [],
	}));
	const routes = fragments.map((stepKeys, index) => ({
		...snapshot.routes[0],
		key: `fragment-${index}`,
		stepKeys,
		sourceStepKey: null,
		returnStepKey: null,
	}));
	return { steps, routes, prefix, shared, branches, suffix };
}

describe("temporal route row reuse", () => {
	for (const count of [2, 3, 4])
		for (const compact of [false, true]) {
			test(`${count}-way join/fork/join stays centered in ${compact ? "compact" : "full"} size`, () => {
				const { steps, routes, prefix, shared, branches, suffix } = fixture(count);
				const layout = layoutRoutes(routes, steps),
					before = JSON.stringify(layout);
				const graph = roadmapGeometry(layout, compact),
					byKey = new Map(graph.nodes.map((node) => [node.key, node]));
				const y = (key: string) => {
					const node = byKey.get(key);
					if (!node) throw Error("Missing node");
					return node.y;
				};
				const midpoint =
					(Math.min(...prefix.map((keys) => y(keys[0]))) + Math.max(...prefix.map((keys) => y(keys[0])))) / 2;
				for (const key of [...shared, ...suffix]) expect(y(key)).toBe(midpoint);
				for (let i = 0; i < count; i++)
					for (const key of [...prefix[i], ...branches[i]]) expect(y(key)).toBe(y(prefix[i][0]));
				expect(graph.height).toBe((compact ? 24 : 96) + (count - 1) * (compact ? 18 : 94));
				expect(new Set(graph.nodes.map((node) => `${node.x}:${node.y}`)).size).toBe(steps.length);
				for (const edge of graph.edges) {
					const from = byKey.get(edge.from),
						to = byKey.get(edge.to);
					if (!from || !to) throw Error("Missing edge endpoint");
					expect(edge.points[0]).toEqual({ x: from.x, y: from.y });
					expect(edge.points.at(-1)).toEqual({ x: to.x, y: to.y });
				}
				expect(JSON.stringify(layout)).toBe(before);
			});
		}
	test("sequential fragments continue straight without inventing independent starts", () => {
		const { steps, routes } = fixture(2);
		const kept = [routes[0], routes[2], routes[3], routes[5]];
		const graph = roadmapGeometry(layoutRoutes(kept, steps), false);
		expect(new Set(graph.nodes.map((node) => node.y)).size).toBe(1);
	});

	test("a single heading does not reserve a separate row for every later fragment", () => {
		const { steps, routes } = fixture(2),
			layout = layoutRoutes(routes, steps);
		layout.nodes[0].heading = true;
		const graph = roadmapGeometry(layout, false);
		expect(graph.height).toBe(190);
		const shared = graph.nodes.find((node) => node.key === "shared-0");
		expect(shared?.y).toBe(71);
	});
	test("explicit independent headings retain their stable tracks", () => {
		const { steps, routes } = fixture(2),
			layout = layoutRoutes(routes, steps);
		layout.nodes[0].heading = true;
		const second = layout.nodes.find((node) => node.lane !== layout.nodes[0].lane);
		if (!second) throw Error("Missing second independent track");
		second.heading = true;
		const graph = roadmapGeometry(layout, false);
		for (const node of graph.nodes) expect(node.y).toBe(24 + node.lane * 94);
	});
});
