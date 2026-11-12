// Date: 2026-11-12. Presentation groups follow declared task relationships only.
import type { Plan, Project, Route, Step, WorkbenchSnapshot } from "./contract/protocol";

export type TaskGroup = {
	key: string;
	project: Project;
	plan?: Plan;
	routes: Route[];
	aliases: string[];
	archiveKeys: string[];
};

export function taskGroups(snapshot: WorkbenchSnapshot, archived: string[] = []): TaskGroup[] {
	const hidden = new Set(archived);
	const plans = new Map(snapshot.plans.map((plan) => [plan.key, plan]));
	const steps = new Map(snapshot.steps.map((step) => [step.key, step]));
	const parents = new Map(snapshot.plans.map((plan) => [plan.key, plan.key]));
	const children = new Set<string>();
	function root(key: string): string {
		const parent = parents.get(key);
		if (!parent || parent === key) return key;
		const result = root(parent);
		parents.set(key, result);
		return result;
	}
	function link(source: string | undefined, branch: string) {
		if (!source || source === branch || plans.get(source)?.projectKey !== plans.get(branch)?.projectKey) return;
		children.add(branch);
		const a = root(source),
			b = root(branch);
		if (a !== b) parents.set(b, a);
	}
	for (const route of snapshot.routes) {
		link(steps.get(route.sourceStepKey ?? "")?.planKey, route.planKey);
		link(steps.get(route.returnStepKey ?? "")?.planKey, route.planKey);
	}
	for (const supplement of snapshot.supplements) {
		if (supplement.linkedPlanKey) link(steps.get(supplement.sourceStepKey)?.planKey, supplement.linkedPlanKey);
	}
	const result: TaskGroup[] = [];
	for (const project of snapshot.projects) {
		const projectPlans = snapshot.plans.filter((plan) => plan.projectKey === project.key);
		if (!projectPlans.length && !hidden.has(project.key)) {
			result.push({ key: project.key, project, routes: [], aliases: [project.key], archiveKeys: [project.key] });
		}
		const sets = new Map<string, Plan[]>();
		for (const plan of projectPlans) {
			const key = root(plan.key);
			const group = sets.get(key) ?? [];
			group.push(plan);
			sets.set(key, group);
		}
		for (const members of sets.values()) {
			const plan = members.find((item) => !children.has(item.key)) ?? members[0];
			const memberKeys = new Set(members.map((item) => item.key));
			const allRoutes = members.flatMap((item) =>
				snapshot.routes.filter((route) => route.planKey === item.key).sort((a, b) => a.order - b.order),
			);
			const routes = allRoutes.filter((route) => !hidden.has(route.key));
			const emptyPlans = members.filter(
				(item) => !hidden.has(item.key) && !allRoutes.some((route) => route.planKey === item.key),
			);
			if (!routes.length && !emptyPlans.length) continue;
			result.push({
				key: plan.key,
				project,
				plan,
				routes,
				aliases: [...memberKeys, ...allRoutes.map((route) => route.key)],
				archiveKeys: [...routes.map((route) => route.key), ...emptyPlans.map((item) => item.key)],
			});
		}
	}
	return result;
}

export function orderedTaskGroups(groups: TaskGroup[], order: string[]): TaskGroup[] {
	const ranks = new Map(order.map((key, index) => [key, index]));
	const rank = (group: TaskGroup) => Math.min(...group.aliases.map((key) => ranks.get(key) ?? Infinity));
	return [...groups].sort((a, b) => rank(a) - rank(b));
}

export type RouteGraphNode = { step: Step; routeKeys: string[]; column: number; lane: number };
export type RouteGraphEdge = { key: string; from: string; to: string; kind: "route" | "dependency" };
export type RouteGraphLayout = { nodes: RouteGraphNode[]; edges: RouteGraphEdge[]; columns: number; lanes: number };

export function primaryRoute(routes: Route[]): Route | undefined {
	const keys = new Set(routes.flatMap((route) => route.stepKeys));
	return routes.find((route) => !route.sourceStepKey || !keys.has(route.sourceStepKey)) ?? routes[0];
}

export function layoutRoutes(routes: Route[], steps: Step[]): RouteGraphLayout {
	const byKey = new Map(steps.map((step) => [step.key, step]));
	const nodes = new Map<string, RouteGraphNode>();
	for (const route of routes)
		for (const key of route.stepKeys) {
			const step = byKey.get(key);
			if (!step) continue;
			const node = nodes.get(key) ?? { step, routeKeys: [], column: 0, lane: -1 };
			if (!node.routeKeys.includes(route.key)) node.routeKeys.push(route.key);
			nodes.set(key, node);
		}
	const edges = new Map<string, RouteGraphEdge>();
	function connect(
		from: string | null | undefined,
		to: string | null | undefined,
		kind: RouteGraphEdge["kind"] = "route",
	) {
		if (!from || !to || from === to || !nodes.has(from) || !nodes.has(to)) return;
		const key = JSON.stringify([from, to]);
		if (!edges.has(key)) edges.set(key, { key, from, to, kind });
	}
	for (const route of routes) {
		const keys = route.stepKeys.filter((key) => nodes.has(key));
		keys.forEach((key, i) => {
			if (i) connect(keys[i - 1], key);
		});
		connect(route.sourceStepKey, keys[0]);
		connect(keys.at(-1), route.returnStepKey);
	}
	for (const node of nodes.values())
		for (const source of node.step.dependsOn) connect(source, node.step.key, "dependency");
	const incoming = new Map([...nodes.keys()].map((key) => [key, [] as string[]]));
	const outgoing = new Map([...nodes.keys()].map((key) => [key, [] as string[]]));
	for (const edge of edges.values()) {
		incoming.get(edge.to)?.push(edge.from);
		outgoing.get(edge.from)?.push(edge.to);
	}
	const remaining = new Map([...incoming].map(([key, sources]) => [key, sources.length]));
	const queue = [...nodes.keys()].filter((key) => remaining.get(key) === 0);
	const visited = new Set<string>();
	for (let i = 0; i < queue.length; i++) {
		const key = queue[i],
			node = nodes.get(key);
		if (!node) continue;
		visited.add(key);
		for (const target of outgoing.get(key) ?? []) {
			const next = nodes.get(target);
			if (next) next.column = Math.max(next.column, node.column + 1);
			const count = (remaining.get(target) ?? 1) - 1;
			remaining.set(target, count);
			if (!count) queue.push(target);
		}
	}
	// Malformed cyclic references remain visible without blocking the reader.
	let fallback =
		Math.max(-1, ...[...nodes.values()].filter((node) => visited.has(node.step.key)).map((node) => node.column)) + 1;
	for (const node of nodes.values()) if (!visited.has(node.step.key)) node.column = fallback++;
	const occupied: { start: number; end: number }[][] = [];
	const main = primaryRoute(routes);
	const ordered = main ? [main, ...routes.filter((route) => route.key !== main.key)] : routes;
	for (const route of ordered) {
		let run: RouteGraphNode[] = [];
		function place() {
			if (!run.length) return;
			const neighbors = run.flatMap((node) => [
				...(incoming.get(node.step.key) ?? []),
				...(outgoing.get(node.step.key) ?? []),
			]);
			const columns = [
				...run.map((node) => node.column),
				...neighbors.flatMap((key) => {
					const node = nodes.get(key);
					return node && node.lane >= 0 ? [node.column] : [];
				}),
			];
			const start = Math.min(...columns),
				end = Math.max(...columns);
			let lane = 0;
			while (
				occupied[lane]?.some((slot) => slot.start < end && start < slot.end) ||
				[...nodes.values()].some((node) => node.lane === lane && run.some((item) => item.column === node.column))
			)
				lane++;
			occupied[lane] ??= [];
			occupied[lane].push({ start, end });
			for (const node of run) node.lane = lane;
			run = [];
		}
		for (const key of route.stepKeys) {
			const node = nodes.get(key);
			if (node && node.lane < 0) run.push(node);
			else place();
		}
		place();
	}
	return {
		nodes: [...nodes.values()],
		edges: [...edges.values()],
		columns: Math.max(1, ...[...nodes.values()].map((node) => node.column + 1)),
		lanes: Math.max(1, ...[...nodes.values()].map((node) => node.lane + 1)),
	};
}
