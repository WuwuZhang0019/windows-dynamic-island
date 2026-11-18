// Date: 2026-11-16. Verify roadmap semantics and compatibility with compact endpoint alignment.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createScenario } from "../contract/fixtures";
import { GroupRouteGraph } from "../GroupRouteGraph";
import { expandedRoutes, layoutRoutes, stepStatusLabel, taskGroups } from "../task-groups";
import { roadmapGeometry, routeColour, routeColours } from "./geometry";
import { metroPath } from "./metro";

function fixture() {
	const snapshot = createScenario("fork-join").snapshot;
	if (!snapshot) throw Error("Missing fork/join fixture");
	return snapshot;
}

describe("source-adapted Git roadmap", () => {
	test("opposite branches diverge immediately from their shared station", () => {
		const step = fixture().steps[0];
		const graph = roadmapGeometry(
			{
				nodes: [
					{ step: { ...step, key: "fork" }, routeKeys: ["main"], column: 0, lane: 1 },
					{ step: { ...step, key: "upper" }, routeKeys: ["upper"], column: 1, lane: 0 },
					{ step: { ...step, key: "lower" }, routeKeys: ["lower"], column: 1, lane: 2 },
				],
				edges: [
					{ key: "upper", from: "fork", to: "upper", kind: "route" },
					{ key: "lower", from: "fork", to: "lower", kind: "route" },
				],
				columns: 2,
				lanes: 3,
			},
			false,
		);
		const [upper, lower] = graph.edges;
		expect(upper.points[1].y).toBeLessThan(upper.points[0].y);
		expect(lower.points[1].y).toBeGreaterThan(lower.points[0].y);
	});

	test("registered child history expands after fixed headings, without duplicate explicit ownership", () => {
		const snapshot = fixture();
		const base = snapshot.steps[0];
		const headings = ["S", "I"].map((code, index) => ({
			...base,
			key: code,
			code,
			parentKey: null,
			order: index + 1,
			dependsOn: [],
		}));
		const children = [
			{ ...base, key: "S-01", code: "S-01", parentKey: "S", order: 1, dependsOn: [], status: "completed" as const },
			{ ...base, key: "S-02", code: "S-02", parentKey: "S", order: 2, dependsOn: ["S-01"], status: "running" as const },
			{
				...base,
				key: "I-01",
				code: "I-01",
				parentKey: "I",
				order: 1,
				dependsOn: ["S-01"],
				status: "pending" as const,
				acceptance: "recheck",
			},
		];
		const routes = headings.map((step, index) => ({
			...snapshot.routes[0],
			key: `${step.key}/route`,
			stepKeys: [step.key],
			sourceStepKey: null,
			returnStepKey: null,
			order: index + 1,
		}));
		const steps = [...headings, ...children];
		expect(expandedRoutes(routes, steps).map((route) => route.stepKeys)).toEqual([
			["S", "S-01", "S-02"],
			["I", "I-01"],
		]);
		expect(routes.map((route) => route.stepKeys)).toEqual([["S"], ["I"]]);
		for (const compact of [false, true]) {
			const graph = roadmapGeometry(layoutRoutes(routes, steps), compact);
			expect(graph.nodes).toHaveLength(5);
			expect(graph.nodes.filter((node) => node.heading).every((node) => node.x === 0)).toBe(true);
			expect(graph.nodes.find((node) => node.step.key === "S-02")?.x).toBeGreaterThan(0);
			expect(graph.edges.some((edge) => edge.kind === "dependency" && edge.from === "S-01" && edge.to === "I-01")).toBe(
				true,
			);
		}
		expect(stepStatusLabel(children[2])).toBe("待核验");
		const split = [...routes, { ...routes[0], key: "explicit-child", stepKeys: ["S-02"], sourceStepKey: "S-01" }];
		const displayed = expandedRoutes(split, steps);
		expect(displayed.flatMap((route) => route.stepKeys).filter((key) => key === "S-02")).toHaveLength(1);
		const grouped = taskGroups({ ...snapshot, routes, steps });
		expect(grouped.flatMap((group) => group.routes).find((route) => route.key === routes[0].key)?.stepKeys).toEqual([
			"S",
			"S-01",
			"S-02",
		]);
	});

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
					: join.column * 108,
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
						: node.column * 108,
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
	test("branch departures use the agreed rail shapes without losing their source", () => {
		const snapshot = fixture();
		for (const compact of [false, true]) {
			const graph = roadmapGeometry(layoutRoutes(snapshot.routes, snapshot.steps), compact);
			for (const edge of graph.edges) {
				expect(edge.points.length).toBeLessThanOrEqual(5);

				const source = graph.nodes.find((node) => node.step.key === edge.from);
				if (!source) throw Error("Missing edge source");
				expect(edge.points[0]).toEqual({ x: source.x, y: source.y });
			}
		}
	});
	test("draws straight segments and skips duplicate vertices without changing endpoints", () => {
		expect(
			metroPath([
				{ x: 0, y: 0 },
				{ x: 20, y: 0 },
				{ x: 20, y: 20 },
				{ x: 40, y: 20 },
			]),
		).toBe("M 0 0 L 20 0 L 20 20 L 40 20");
		expect(
			metroPath([
				{ x: 0, y: 0 },
				{ x: 0, y: 0 },
				{ x: 2, y: 0 },
			]),
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
				if (from?.lane !== to?.lane) expect(edge.points.length).toBeGreaterThanOrEqual(2);
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
	test("staggered routes use dependency endpoints without reserving columns for a whole prerequisite route", () => {
		const snapshot = fixture();
		const seed = snapshot.steps[0];
		const specs = [
			{ key: "A", parentKey: null, dependsOn: [] },
			{ key: "sample", parentKey: "A", dependsOn: [] },
			{ key: "export", parentKey: "sample", dependsOn: ["schema"] },
			{ key: "schema", parentKey: "A", dependsOn: [] },
			{ key: "B", parentKey: null, dependsOn: ["schema"] },
			{ key: "contract", parentKey: "B", dependsOn: [] },
			{ key: "commands", parentKey: "B", dependsOn: [] },
			{ key: "C", parentKey: null, dependsOn: ["B"] },
			{ key: "read", parentKey: "C", dependsOn: [] },
			{ key: "D", parentKey: null, dependsOn: ["B", "C"] },
			{ key: "prepareWrite", parentKey: "D", dependsOn: [] },
			{ key: "write", parentKey: "D", dependsOn: [] },
			{ key: "check", parentKey: "D", dependsOn: [] },
			{ key: "E", parentKey: null, dependsOn: ["contract"] },
			{ key: "agent", parentKey: "E", dependsOn: [] },
			{ key: "verify", parentKey: "E", dependsOn: ["D"] },
			{ key: "F", parentKey: null, dependsOn: [] },
			{ key: "channel", parentKey: "F", dependsOn: [] },
			{ key: "probe", parentKey: "channel", dependsOn: ["B"] },
			{ key: "smoke", parentKey: "channel", dependsOn: ["D", "probe"] },
		];
		const steps = specs.map((spec, order) => ({ ...seed, required: true, ...spec, code: spec.key, order }));
		const routes = ["A", "B", "C", "D", "E", "F"].map((key, index) => ({
			...snapshot.routes[0],
			key: `route-${key}`,
			stepKeys: [key],
			order: index + 1,
		}));
		const original = JSON.stringify({ steps, routes });
		const layout = layoutRoutes(routes, steps);
		const columns = new Map(layout.nodes.map(({ step, column }) => [step.key, column]));
		expect(columns.get("schema")).toBeLessThan(columns.get("export") ?? -1);
		expect(columns.get("C")).toBe((columns.get("B") ?? -1) + 1);
		expect(columns.get("C")).toBe(columns.get("contract"));
		expect(columns.get("D")).toBe(columns.get("read"));
		expect(columns.get("E")).toBe(columns.get("commands"));
		expect(columns.get("verify")).toBe(columns.get("write"));
		expect(columns.get("smoke")).toBe(columns.get("prepareWrite"));
		expect(layout.columns).toBeLessThan(steps.length);
		expect(layout.edges.some((edge) => edge.from === "B" && edge.to === "C")).toBe(true);
		expect(layout.edges.some((edge) => edge.from === "commands" && edge.to === "C")).toBe(false);
		expect(JSON.stringify({ steps, routes })).toBe(original);

		for (const compact of [false, true]) {
			const graph = roadmapGeometry(layout, compact, 420);
			const from = graph.nodes.find((node) => node.key === "B");
			const to = graph.nodes.find((node) => node.key === "C");
			const edge = graph.edges.find((edge) => edge.from === "B" && edge.to === "C");
			if (!from || !to || !edge) throw Error("Missing dependency stations");
			expect(edge.points[0]).toEqual({ x: from.x, y: from.y });
			expect(edge.points.at(-1)).toEqual({ x: to.x, y: to.y });
			expect(graph.nodes.find((node) => node.key === "export")?.x).toBeLessThan(graph.width);
		}
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
			expect(graph.edges.every((edge) => edge.points.length === 2)).toBe(true);
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
