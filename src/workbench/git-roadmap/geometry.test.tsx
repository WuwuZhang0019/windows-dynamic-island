// Date: 2026-11-16. Verify roadmap semantics and compatibility with compact endpoint alignment.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createScenario } from "../contract/fixtures";
import { GroupRouteGraph } from "../GroupRouteGraph";
import { layoutRoutes } from "../task-groups";
import { roadmapGeometry, roundedPath, routeColour, routeColours } from "./geometry";

function fixture() {
	const snapshot = createScenario("fork-join").snapshot;
	if (!snapshot) throw Error("Missing fork/join fixture");
	return snapshot;
}

describe("source-adapted Git roadmap", () => {
	test("solitary headings stay left and remain anchored when steps are appended", () => {
		const snapshot = fixture();
		const originals = snapshot.steps.slice(0, 5);
		const headings = originals.map((step, index) => ({
			...step,
			key: `heading-${index}`,
			parentKey: null,
			dependsOn: [],
		}));
		const routes = headings.map((step, index) => ({
			...snapshot.routes[0],
			key: `line-${index}`,
			stepKeys: [step.key],
			sourceStepKey: null,
			returnStepKey: null,
		}));
		const initial = roadmapGeometry(layoutRoutes(routes, headings), true);
		expect(initial.nodes).toHaveLength(5);
		expect(initial.nodes.every((node) => node.x === 0)).toBe(true);
		expect(initial.edges).toHaveLength(0);
		const child = { ...originals[0], key: "actual-step", parentKey: headings[0].key, dependsOn: [headings[0].key] };
		const grown = roadmapGeometry(
			layoutRoutes(
				[{ ...routes[0], stepKeys: [headings[0].key, child.key] }, ...routes.slice(1)],
				[...headings, child],
			),
			true,
		);
		expect(grown.nodes.filter((node) => node.step.key.startsWith("heading-")).every((node) => node.x === 0)).toBe(true);
		expect(grown.nodes.find((node) => node.step.key === child.key)?.x).toBe(grown.width);
		expect(grown.edges).toHaveLength(1);
	});

	test("merge stations occupy their junction and incoming curves end on that station", () => {
		const snapshot = fixture();
		for (const compact of [false, true]) {
			const graph = roadmapGeometry(layoutRoutes(snapshot.routes, snapshot.steps), compact);
			const join = graph.nodes.find((node) => node.step.code === "A5");
			if (!join) throw Error("Missing merge fixture");
			expect(join.x).toBeCloseTo(
				compact
					? (join.column * graph.width) / (layoutRoutes(snapshot.routes, snapshot.steps).columns - 1)
					: (join.column + 0.5) * 108,
				3,
			);
			const incoming = graph.edges.filter((edge) => edge.to === join.step.key);
			expect(incoming).toHaveLength(3);
			for (const edge of incoming) expect(edge.path).toEndWith(`L ${join.x} ${join.y}`);
			for (const node of graph.nodes.filter((node) => !node.merge)) {
				const terminal = !graph.edges.some((edge) => edge.from === node.step.key);
				expect(node.x).toBeCloseTo(
					compact
						? terminal
							? graph.width
							: (node.column * graph.width) / (layoutRoutes(snapshot.routes, snapshot.steps).columns - 1)
						: (node.column + 0.5) * 108,
					3,
				);
			}
			if (compact)
				for (const node of graph.nodes.filter((node) => !graph.edges.some((edge) => edge.from === node.step.key)))
					expect(node.x).toBe(graph.width);
		}
	});
	test("consecutive stations stay equally spaced through multiple merges", () => {
		const snapshot = fixture();
		const layout = layoutRoutes(snapshot.routes, snapshot.steps);
		for (const compact of [false, true]) {
			const graph = roadmapGeometry(layout, compact);
			const stride = compact ? graph.width / (layout.columns - 1) : 108;
			const byKey = new Map(graph.nodes.map((node) => [node.step.key, node]));
			const adjacent = graph.edges.filter((edge) => {
				const from = byKey.get(edge.from);
				const to = byKey.get(edge.to);
				if (!from || !to) throw Error("Missing edge station");
				return to.column === from.column + 1 && (from.merge || to.merge);
			});
			expect(adjacent.length).toBeGreaterThan(0);
			for (const edge of adjacent) {
				const from = byKey.get(edge.from);
				const to = byKey.get(edge.to);
				if (!from || !to) throw Error("Missing edge station");
				expect(to.x - from.x).toBeCloseTo(stride, 2);
			}
		}
	});
	test("forks leave the exact source x vertically in both sizes, keeping a source label corridor", () => {
		const snapshot = fixture();
		for (const compact of [false, true]) {
			const graph = roadmapGeometry(layoutRoutes(snapshot.routes, snapshot.steps), compact);
			const branch = snapshot.routes[2];
			const edge = graph.edges.find((item) => item.to === branch.stepKeys[0]);
			const source = graph.nodes.find((node) => node.step.key === edge?.from);
			if (!source || !edge) throw Error("Missing branch fixture");
			const coordinates = edge.path.match(/^M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)/);
			expect(Number(coordinates?.[1])).toBe(source.x);
			expect(Number(coordinates?.[3])).toBe(source.x);
			expect(Number(coordinates?.[4])).toBeGreaterThan(source.y);
			expect(source.forkDown).toBe(true);
		}
	});
	test("rounds branch corners without changing the exact station endpoints", () => {
		expect(
			roundedPath(
				[
					{ x: 0, y: 0 },
					{ x: 20, y: 0 },
					{ x: 20, y: 20 },
					{ x: 40, y: 20 },
				],
				6,
			),
		).toBe("M 0 0 L 14 0 Q 20 0 20 6 L 20 14 Q 20 20 26 20 L 40 20");
		expect(
			roundedPath(
				[
					{ x: 0, y: 0 },
					{ x: 0, y: 0 },
					{ x: 2, y: 0 },
				],
				12,
			),
		).toBe("M 0 0 L 2 0");
	});
	test("both sizes preserve every declared edge, one shared join and state from its destination", () => {
		const snapshot = fixture();
		const layout = layoutRoutes(snapshot.routes, snapshot.steps);
		for (const compact of [false, true]) {
			const graph = roadmapGeometry(layout, compact);
			expect(graph.nodes).toHaveLength(14);
			expect(graph.edges.map((edge) => [edge.from, edge.to])).toEqual(layout.edges.map((edge) => [edge.from, edge.to]));
			const join = graph.nodes.find((node) => node.step.code === "A5");
			expect(join?.merge).toBe(true);
			expect(graph.edges.filter((edge) => edge.to === join?.step.key)).toHaveLength(3);
			for (const edge of graph.edges) {
				const from = graph.nodes.find((node) => node.step.key === edge.from);
				const to = graph.nodes.find((node) => node.step.key === edge.to);
				if (!from || !to) throw Error("Every edge must retain its stations");
				expect(edge.path).toStartWith(`M ${from.x} ${from.y}`);
				expect(edge.path).toEndWith(`L ${to?.x} ${to?.y}`);
				expect(edge.path).not.toMatch(/NaN|Infinity/);
				expect(edge.status).toBe(to?.step.status);
				if (from?.lane !== to?.lane) expect(edge.path).toContain(" Q ");
			}
		}
	});
	test("route identity survives its fork and join and does not depend on execution status", () => {
		const snapshot = fixture();
		const graph = roadmapGeometry(layoutRoutes(snapshot.routes, snapshot.steps), false);
		const branch = snapshot.routes[1];
		const fork = graph.edges.find((edge) => edge.to === branch.stepKeys[0]);
		const join = graph.edges.find((edge) => edge.from === branch.stepKeys[1]);
		expect(fork?.colour).toBe(graph.palette.get(branch.key) ?? "");
		expect(join?.colour).toBe(fork?.colour ?? "");
		expect(routeColour(branch.key)).not.toBe(routeColour(snapshot.routes[0].key));
		const colours = graph.edges.map((edge) => edge.colour);
		for (const step of snapshot.steps) step.status = "completed";
		expect(
			roadmapGeometry(layoutRoutes(snapshot.routes, snapshot.steps), false).edges.map((edge) => edge.colour),
		).toEqual(colours);
	});
	test("parallel branches have distinct colours independent of route input order", () => {
		const snapshot = fixture();
		const keys = snapshot.routes.map((route) => route.key);
		const palette = routeColours(keys);
		expect(new Set(palette.values()).size).toBe(keys.length);
		expect([...routeColours([...keys].reverse())]).toEqual([...palette]);
	});
	test("transitive dependencies stay in the layout without adding redundant visual arcs", () => {
		const snapshot = fixture();
		const main = snapshot.routes[0];
		const steps = snapshot.steps.filter((step) => main.stepKeys.includes(step.key));
		steps[2].dependsOn.push(steps[0].key);
		const layout = layoutRoutes([main], steps);
		const edge = roadmapGeometry(layout, false).edges.find(
			(item) => item.from === steps[0].key && item.to === steps[2].key,
		);
		expect(edge).toBeUndefined();
		expect(layout.edges).toHaveLength(8);
	});
	test("the seven-stage route stays straight while independent cross-route dependencies remain visible", () => {
		const snapshot = createScenario("long-route").snapshot;
		if (!snapshot) throw Error("Missing fixture");
		const steps = snapshot.steps.slice(0, 7);
		const parents = [[], [0], [0], [1], [3], [2, 4], [5]];
		steps.forEach((step, index) => {
			step.dependsOn = parents[index].map((parent) => steps[parent].key);
		});
		const route = { ...snapshot.routes[0], stepKeys: steps.map((step) => step.key) };
		for (const compact of [false, true]) {
			const graph = roadmapGeometry(layoutRoutes([route], steps), compact);
			expect(graph.edges).toHaveLength(6);
			expect(graph.edges.every((edge) => !edge.path.includes(" Q "))).toBe(true);
			expect(graph.nodes.every((node) => !node.merge)).toBe(true);
		}
		const other = { ...route, key: "other", stepKeys: [steps[5].key, steps[6].key] };
		steps[5].dependsOn = [steps[0].key];
		const graph = roadmapGeometry(
			layoutRoutes([{ ...route, stepKeys: steps.slice(0, 3).map((step) => step.key) }, other], steps),
			false,
		);
		expect(
			graph.edges.some((edge) => edge.kind === "dependency" && edge.from === steps[0].key && edge.to === steps[5].key),
		).toBe(true);
	});
	test("compact output stays text-free; expanded output names its branches and only the card is selectable", () => {
		const snapshot = fixture();
		for (const compact of [false, true]) {
			const html = renderToStaticMarkup(
				<GroupRouteGraph
					layout={layoutRoutes(snapshot.routes, snapshot.steps)}
					compact={compact}
					selectedKey=""
					selectedRouteKey=""
					onSelect={() => {
						throw Error("Station actions must stay paused");
					}}
					routes={snapshot.routes}
				/>,
			);
			expect(html).toContain('data-graph-renderer="react-git-log-adapted"');
			expect(html).not.toMatch(/<button|<line/);
			expect(html).toContain('data-merge="true"');
			if (compact) expect(html.replace(/<[^>]*>/g, "")).toBe("");
			else expect(html).toContain("界面开发");
		}
	});
});
