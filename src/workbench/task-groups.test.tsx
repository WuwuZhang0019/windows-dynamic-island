// Date: 2026-11-12. Exercise relationship grouping, shared joins and lane reuse.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createScenario } from "./contract/fixtures";
import type { Route, Step } from "./contract/protocol";
import { GroupRouteGraph } from "./GroupRouteGraph";
import { layoutRoutes, orderedTaskGroups, taskGroups } from "./task-groups";
import { WorkbenchView } from "./WorkbenchView";

function graphFixture() {
	const snapshot = createScenario("long-route").snapshot;
	if (!snapshot) throw Error("Missing fixture");
	const template = snapshot.steps[0],
		route = snapshot.routes[0];
	const keys = ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "a0", "a1", "b0", "b1", "c0", "c1", "d0", "d1"];
	const steps: Step[] = keys.map((key) => ({ ...template, key, code: key, title: key, dependsOn: [] }));
	const routes: Route[] = [
		{ ...route, key: "main", stepKeys: keys.slice(0, 8), sourceStepKey: null, returnStepKey: null },
		{ ...route, key: "a", stepKeys: ["a0", "a1"], sourceStepKey: "m0", returnStepKey: "m2" },
		{ ...route, key: "b", stepKeys: ["b0", "b1"], sourceStepKey: "m0", returnStepKey: "m2" },
		{ ...route, key: "c", stepKeys: ["c0", "c1"], sourceStepKey: "m4", returnStepKey: "m6" },
		{ ...route, key: "d", stepKeys: ["d0", "d1"], sourceStepKey: "m4", returnStepKey: "m6" },
	];
	return { snapshot, steps, routes };
}

describe("grouped task routes", () => {
	test("a child route returning to its own source does not draw a second descent or create a cycle", () => {
		const { routes, steps } = graphFixture();
		const main = { ...routes[0], stepKeys: ["m0", "m1", "m2"] };
		const child = { ...routes[1], stepKeys: ["a0", "a1", "b0"], sourceStepKey: "m1", returnStepKey: "m1" };
		const graph = layoutRoutes([main, child], steps);
		expect(graph.nodes).toHaveLength(6);
		expect(graph.edges.map((edge) => [edge.from, edge.to])).toEqual([
			["m0", "m1"],
			["m1", "m2"],
			["a0", "a1"],
			["a1", "b0"],
			["m1", "a0"],
		]);
		expect(graph.nodes.find((node) => node.step.key === "m1")?.column).toBe(1);
		expect(graph.nodes.find((node) => node.step.key === "a0")?.column).toBe(2);
		expect(
			new Set(graph.nodes.filter((node) => main.stepKeys.includes(node.step.key)).map((node) => node.lane)).size,
		).toBe(1);
	});
	test("related branch plans share a task while unrelated plans in the same project stay separate", () => {
		const snapshot = createScenario("multi-project").snapshot;
		if (!snapshot) throw Error("Missing fixture");
		const main = snapshot.plans[0];
		snapshot.plans.push({ ...main, key: "unrelated", name: "Independent plan", stageKeys: [] });
		const groups = taskGroups(snapshot);
		expect(groups).toHaveLength(4);
		const group = groups.find((item) => item.key === main.key);
		expect(group?.routes).toHaveLength(10);
		expect(groups.find((item) => item.key === "unrelated")?.routes).toHaveLength(0);
	});
	test("archived routes stay excluded and legacy member ordering moves the whole stable group", () => {
		const snapshot = createScenario("multi-project").snapshot;
		if (!snapshot) throw Error("Missing fixture");
		const hidden = snapshot.routes[0].key;
		const groups = taskGroups(snapshot, [hidden]);
		expect(groups[0].key).toBe(snapshot.plans[0].key);
		expect(groups[0].routes.some((route) => route.key === hidden)).toBe(false);
		expect(groups[0].archiveKeys).not.toContain(hidden);
		const last = groups.at(-1);
		if (!last) throw Error("Missing group");
		expect(
			orderedTaskGroups(groups, [
				last.routes[0].key,
				...groups.filter((item) => item.key !== last.key).map((item) => item.key),
			])[0].key,
		).toBe(last.key);
	});
	test("consecutive route fragments keep one lane when they contain no parallel work", () => {
		const { routes, steps } = graphFixture();
		const first = { ...routes[0], stepKeys: ["m0", "m1", "m2"] };
		const second = { ...routes[0], key: "next", stepKeys: ["m3", "m4"] };
		const third = { ...routes[0], key: "last", stepKeys: ["m5", "m6", "m7"] };
		steps[3].dependsOn = ["m2"];
		steps[5].dependsOn = ["m4"];
		expect(layoutRoutes([first, second, third], steps).lanes).toBe(1);
	});
	test("later forks reuse finished lanes and both branch ends meet the single shared node", () => {
		const { routes, steps } = graphFixture();
		const graph = layoutRoutes(routes, steps);
		expect(graph.lanes).toBe(3);
		const nodes = new Map(graph.nodes.map((node) => [node.step.key, node]));
		expect(nodes.get("a0")?.lane).toBe(nodes.get("c0")?.lane);
		expect(nodes.get("b0")?.lane).toBe(nodes.get("d0")?.lane);
		expect(nodes.get("m2")?.column).toBeGreaterThan(nodes.get("a1")?.column ?? Infinity);
		expect(graph.edges.filter((edge) => edge.to === "m2").map((edge) => edge.from)).toEqual(["m1", "a1", "b1"]);
		expect(new Set(graph.nodes.map((node) => node.step.key)).size).toBe(steps.length);
		expect(new Set(graph.nodes.map((node) => `${node.column}:${node.lane}`)).size).toBe(steps.length);
	});

	test("shared steps between two forks sit halfway between upper and lower branches", () => {
		const { routes, steps } = graphFixture();
		const graph = layoutRoutes([routes[0], routes[1], routes[3]], steps);
		const nodes = new Map(graph.nodes.map((node) => [node.step.key, node]));
		const upper = nodes.get("m1")?.lane ?? -1;
		const lower = nodes.get("a1")?.lane ?? -1;
		expect(lower).toBeGreaterThan(upper);
		for (const key of ["m2", "m3", "m4"]) expect(nodes.get(key)?.lane).toBe((upper + lower) / 2);
		expect(nodes.get("c0")?.lane).toBe(lower);
		expect(graph.edges.filter((edge) => edge.to === "m2").map((edge) => edge.from)).toEqual(["m1", "a1"]);
		expect(graph.edges.filter((edge) => edge.from === "m4").map((edge) => edge.to)).toEqual(["m5", "c0"]);
		expect(new Set(graph.nodes.map((node) => `${node.column}:${node.lane}`)).size).toBe(graph.nodes.length);
	});
	test("overlapping branch routes do not duplicate shared stations or fabricate unspecified joins", () => {
		const { routes, steps } = graphFixture();
		routes[1].stepKeys = ["m0", "a0", "a1", "m2"];
		routes[2].returnStepKey = null;
		const graph = layoutRoutes(routes, steps);
		expect(graph.nodes.filter((node) => node.step.key === "m2")).toHaveLength(1);
		expect(graph.edges.some((edge) => edge.from === "b1" && edge.to === "m2")).toBe(false);
		expect(graph.nodes.find((node) => node.step.key === "m2")?.routeKeys).toEqual(["main", "a"]);
	});
	test("cyclic data cannot hang layout or leave colliding stations", () => {
		const { routes, steps } = graphFixture();
		steps[0].dependsOn = ["m7"];
		const graph = layoutRoutes(routes, steps);
		expect(graph.nodes).toHaveLength(steps.length);
		expect(graph.nodes.every((node) => node.lane >= 0)).toBe(true);
		expect(new Set(graph.nodes.map((node) => `${node.column}:${node.lane}`)).size).toBe(steps.length);
	});
	test("compact diagrams contain only points and lines, and use destination station status", () => {
		const { routes, steps } = graphFixture();
		steps[1].status = "running";
		const html = renderToStaticMarkup(
			<GroupRouteGraph
				layout={layoutRoutes(routes, steps)}
				compact
				selectedKey="m1"
				selectedRouteKey="main"
				onSelect={() => {}}
			/>,
		);
		expect(html.replace(/<[^>]*>/g, "")).toBe("");
		expect(html).toContain('data-status="running" data-kind="route" data-from="m0" data-to="m1"');
	});
	test("the list keeps complete task groups without branch controls or station buttons", () => {
		const envelope = createScenario("multi-project");
		const snapshot = envelope.snapshot;
		if (!snapshot) throw Error("Missing fixture");
		const groups = taskGroups(snapshot);
		const html = renderToStaticMarkup(
			<WorkbenchView
				envelope={envelope}
				scenario="group-regression"
				setScenario={() => {}}
				refresh={() => {}}
				preferences={{
					collapsed: groups.map((group) => `island/group/${group.key}`),
					selected: "",
					focus: [],
					scroll: {},
					y: {},
				}}
			/>,
		);
		const count = groups.reduce((total, group) => total + layoutRoutes(group.routes, snapshot.steps).nodes.length, 0);
		expect([...html.matchAll(/data-step-key="/g)]).toHaveLength(count * 2);
		expect([...html.matchAll(/data-route-card="/g)]).toHaveLength(3);
		expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/\d+\s*条分支/);
		expect(html).not.toContain("wb-group-toggle");
		expect(html).not.toContain('aria-label="收起分支"');
		expect(html).not.toMatch(/<button[^>]*data-step-key=/);
		expect(html).toContain('role="img" class="wb-step wb-graph-step');
	});
});
