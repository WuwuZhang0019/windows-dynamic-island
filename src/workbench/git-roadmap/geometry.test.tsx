// Date: 2026-11-13. Verify the task semantics that Git source adaptation must preserve.
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
	test("an explicit long dependency bypasses intermediate stations rather than fabricating a connection", () => {
		const snapshot = fixture();
		const main = snapshot.routes[0];
		const steps = snapshot.steps.filter((step) => main.stepKeys.includes(step.key));
		steps[2].dependsOn.push(steps[0].key);
		const layout = layoutRoutes([main], steps);
		const edge = roadmapGeometry(layout, false).edges.find(
			(item) => item.from === steps[0].key && item.to === steps[2].key,
		);
		expect(edge?.path).toContain(" Q ");
		expect(edge?.kind).toBe("dependency");
		expect(layout.edges).toHaveLength(8);
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
