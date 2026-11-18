// Date: 2026-11-12. Exercise relationship grouping, shared joins and fixed route rows.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createScenario } from "./contract/fixtures";
import type { Route, Step } from "./contract/protocol";
import { GroupRouteGraph } from "./GroupRouteGraph";
import { roadmapGeometry } from "./git-roadmap/geometry";
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
	test("separate declared route fragments retain separate rows", () => {
		const { routes, steps } = graphFixture();
		const first = { ...routes[0], stepKeys: ["m0", "m1", "m2"] };
		const second = { ...routes[0], key: "next", stepKeys: ["m3", "m4"] };
		const third = { ...routes[0], key: "last", stepKeys: ["m5", "m6", "m7"] };
		steps[3].dependsOn = ["m2"];
		steps[5].dependsOn = ["m4"];
		const graph = layoutRoutes([first, second, third], steps);
		expect(graph.lanes).toBe(3);
		for (const [lane, route] of [first, second, third].entries())
			expect(
				graph.nodes.filter((node) => route.stepKeys.includes(node.step.key)).every((node) => node.lane === lane),
			).toBe(true);
	});
	test("later forks keep their own rows while both branch ends meet the single shared node", () => {
		const { routes, steps } = graphFixture();
		const graph = layoutRoutes(routes, steps);
		expect(graph.lanes).toBe(5);
		const nodes = new Map(graph.nodes.map((node) => [node.step.key, node]));
		expect(nodes.get("a0")?.lane).not.toBe(nodes.get("c0")?.lane);
		expect(nodes.get("b0")?.lane).not.toBe(nodes.get("d0")?.lane);
		expect(nodes.get("m2")?.column).toBeGreaterThan(nodes.get("a1")?.column ?? Infinity);
		expect(graph.edges.filter((edge) => edge.to === "m2").map((edge) => edge.from)).toEqual(["m1", "a1", "b1"]);
		expect(new Set(graph.nodes.map((node) => node.step.key)).size).toBe(steps.length);
		expect(new Set(graph.nodes.map((node) => `${node.column}:${node.lane}`)).size).toBe(steps.length);
	});

	test("main-route stations stay on the main row between forks", () => {
		const { routes, steps } = graphFixture();
		const graph = layoutRoutes([routes[0], routes[1], routes[3]], steps);
		const nodes = new Map(graph.nodes.map((node) => [node.step.key, node]));
		const upper = nodes.get("m1")?.lane ?? -1;
		const lower = nodes.get("a1")?.lane ?? -1;
		expect(lower).toBeGreaterThan(upper);
		for (const key of ["m2", "m3", "m4"]) expect(nodes.get(key)?.lane).toBe(upper);
		expect(nodes.get("c0")?.lane).toBeGreaterThan(lower);
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

// Date: 2026-11-18. Nested phases fork inside the owning route and keep their declared identities.
test("sibling package phases share a row when the later heading can move right", () => {
	const { routes, steps } = graphFixture();
	const main = ["m0", "m1", "m2", "m3", "a0", "a1", "b0", "b1"];
	const parents = new Map([
		["m1", "m0"],
		["m2", "m0"],
		["m3", "m0"],
		["a0", "m1"],
		["a1", "m1"],
		["b0", "m2"],
		["b1", "m2"],
	]);
	const phases = main.map((key, order) => {
		const step = steps.find((candidate) => candidate.key === key);
		if (!step) throw Error("Missing phase fixture");
		return { ...step, parentKey: parents.get(key) ?? null, order };
	});
	const route = { ...routes[0], stepKeys: ["m0"] };
	const layout = layoutRoutes([route], phases);
	const nodes = new Map(layout.nodes.map((node) => [node.step.key, node]));
	const [tail, parent, head] = ["a1", "m2", "b0"].map((key) => nodes.get(key));
	if (!tail || !parent || !head) throw Error("Missing packed phases");
	expect(tail.lane).toBe(head.lane);
	expect(parent.column).toBeGreaterThanOrEqual(tail.column);
	expect(head.column).toBeGreaterThan(parent.column);
	expect(layout.edges.some((edge) => edge.from === "m2" && edge.to === "b0")).toBe(true);
	expect(layout.edges.some((edge) => edge.from === "a1" && edge.to === "b0")).toBe(false);

	const constrained = phases.map((step) => (step.key === "a1" ? { ...step, dependsOn: ["m2"] } : step));
	const constrainedNodes = layoutRoutes([route], constrained).nodes;
	expect(constrainedNodes.find((node) => node.step.key === "a1")?.lane).not.toBe(
		constrainedNodes.find((node) => node.step.key === "b0")?.lane,
	);
});

test("nested package phases branch between main routes and preserve explicit route ownership", () => {
	const { routes, steps } = graphFixture();
	const heading = { ...steps[0], key: "heading", parentKey: null, code: "I" };
	const pack = { ...steps[1], key: "package", parentKey: heading.key, code: "I-04", order: 4 };
	const phases = [1, 2, 3].map((order) => ({
		...steps[2],
		key: `phase-${order}`,
		parentKey: pack.key,
		code: `I-04-0${order}`,
		order,
	}));
	const next = { ...pack, key: "next-package", code: "I-05", order: 5 };
	const following = { ...heading, key: "following-route", code: "S", dependsOn: [pack.key] };
	const route = { ...routes[0], stepKeys: [heading.key] };
	const followingRoute = { ...route, key: "following", stepKeys: [following.key] };
	const layout = layoutRoutes([route, followingRoute], [heading, pack, ...phases, next, following]);
	expect(layout.nodes).toHaveLength(7);
	expect(layout.edges.map(({ from, to }) => [from, to])).toEqual([
		[heading.key, pack.key],
		[pack.key, next.key],
		[phases[0].key, phases[1].key],
		[phases[1].key, phases[2].key],
		[pack.key, phases[0].key],
		[pack.key, following.key],
	]);
	for (const compact of [false, true]) {
		const graph = roadmapGeometry(layout, compact, 300);
		const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
		const main = byKey.get(pack.key);
		const nextOnMain = byKey.get(next.key);
		const branch = byKey.get(phases[0].key);
		const lower = byKey.get(following.key);
		const fork = graph.edges.find((edge) => edge.from === pack.key && edge.to === phases[0].key);
		if (!main || !nextOnMain || !branch || !lower || !fork) throw Error("Missing package fork");
		expect(main.y).toBe(nextOnMain.y);
		expect(branch.y).toBeGreaterThan(main.y);
		expect(branch.y).toBeLessThan(lower.y);
		expect(phases.every((step) => byKey.get(step.key)?.y === branch.y)).toBe(true);
		expect(fork.points[0]).toEqual({ x: main.x, y: main.y });
		expect(fork.points.at(-1)).toEqual({ x: branch.x, y: branch.y });
		expect(branch.colour).toBe(main.colour);
	}
	expect(route.stepKeys).toEqual([heading.key]);
	const separate = { ...routes[1], stepKeys: [pack.key], planKey: route.planKey };
	const split = taskGroups({
		...graphFixture().snapshot,
		projects: [graphFixture().snapshot.projects[0]],
		plans: [graphFixture().snapshot.plans[0]],
		routes: [route, separate],
		steps: [heading, pack, ...phases],
	});
	expect(
		split.flatMap((group) => group.routes.flatMap((item) => item.stepKeys)).filter((key) => key === phases[0].key),
	).toHaveLength(1);
});

// Date: 2026-11-17. Reproduce H-02/H-03 being displaced toward a dependent UI route.
test("cross-line dependencies preserve each route row and all business topology", () => {
	const { routes, steps } = graphFixture();
	const host = { ...routes[0], key: "host", stepKeys: ["m0", "m1", "m2", "m3", "m4"] };
	const core = { ...routes[1], key: "core", stepKeys: ["a0", "a1"], sourceStepKey: null, returnStepKey: null };
	const ui = { ...routes[2], key: "ui", stepKeys: ["b0", "b1"], sourceStepKey: null, returnStepKey: null };
	const input = [host, core, ui];
	const before = JSON.stringify({ routes: input, steps });
	const plain = layoutRoutes(input, steps);
	const dependent = steps.map((step) => (step.key === "b1" ? { ...step, dependsOn: ["m2", "m3"] } : step));
	const graph = layoutRoutes(input, dependent);
	for (const route of input) {
		const stations = graph.nodes.filter((node) => route.stepKeys.includes(node.step.key));
		expect(new Set(stations.map((node) => node.lane)).size).toBe(1);
		for (const node of stations)
			expect(node.lane).toBe(plain.nodes.find((before) => before.step.key === node.step.key)?.lane ?? -1);
	}
	expect(graph.lanes).toBe(3);
	expect(graph.edges.filter((edge) => edge.kind === "dependency").map((edge) => [edge.from, edge.to])).toEqual([
		["m2", "b1"],
		["m3", "b1"],
	]);
	expect(JSON.stringify({ routes: input, steps })).toBe(before);
});

// Date: 2026-11-17. A service block may use spare columns without moving its origin or its consumer.
test("route work blocks align toward visible joins while all dependencies stay forward", () => {
	const { routes, steps } = graphFixture();
	const template = steps[0];
	const service = ["S", "S-01", "S-02", "S-03"].map((key, index) => ({
		...template,
		key,
		code: key,
		parentKey: index ? "S" : null,
		order: index,
		dependsOn: [] as string[],
	}));
	const host = ["H", "H-01", "H-02", "H-03", "H-04"].map((key, index) => ({
		...template,
		key,
		code: key,
		parentKey: index ? "H" : null,
		order: index,
		dependsOn: key === "H-04" ? ["S-01"] : [],
	}));
	const main = { ...routes[0], stepKeys: steps.slice(0, 8).map((step) => step.key) };
	const input = [
		main,
		{ ...routes[0], key: "service", stepKeys: ["S"] },
		{ ...routes[0], key: "host", stepKeys: ["H"] },
	];
	const all = [...steps.slice(0, 8), ...service, ...host].map((step) =>
		step.key === "m7" ? { ...step, dependsOn: ["S-03"] } : step,
	);
	const original = JSON.stringify({ input, all });
	const graph = layoutRoutes(input, all);
	const byKey = new Map(graph.nodes.map((node) => [node.step.key, node]));
	expect(["S", "S-01", "S-02", "S-03"].map((key) => byKey.get(key)?.column)).toEqual([0, 3, 4, 5]);
	expect(byKey.get("H-04")?.column).toBe(4);
	expect(graph.columns).toBe(8);
	for (const edge of graph.edges) {
		expect(byKey.get(edge.to)?.column ?? -1).toBeGreaterThan(byKey.get(edge.from)?.column ?? Infinity);
	}
	expect(JSON.stringify({ input, all })).toBe(original);
	// An earlier consumer prevents the same block from being delayed past that consumer.
	const constrained = all.map((step) => (step.key === "H-03" ? { ...step, dependsOn: ["S-02"] } : step));
	const limited = layoutRoutes(input, constrained);
	expect(limited.nodes.filter((node) => node.step.key.startsWith("S-")).map((node) => node.column)).toEqual([1, 2, 3]);
});
