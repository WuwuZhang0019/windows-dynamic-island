// Date: 2026-11-12. Presentation groups follow declared task relationships only.
import type { Plan, Project, Route, Step, WorkbenchSnapshot } from "./contract/protocol";
import { placeRouteColumns } from "./git-roadmap/display-columns";

export type TaskGroup = {
	key: string;
	project: Project;
	plan?: Plan;
	routes: Route[];
	aliases: string[];
	archiveKeys: string[];
};

// Date: 2026-11-16. Expand only registered children, preserving explicit cross-route ownership.
export function expandedRoutes(routes: Route[], steps: Step[]): Route[] {
	const explicit = new Set(routes.flatMap((route) => route.stepKeys));
	const children = new Map<string, Step[]>();
	for (const step of steps) {
		if (!step.parentKey || explicit.has(step.key)) continue;
		const list = children.get(step.parentKey) ?? [];
		list.push(step);
		children.set(step.parentKey, list);
	}
	for (const list of children.values()) list.sort((a, b) => a.order - b.order);
	return routes.map((route) => {
		const visited = new Set<string>();
		const expand = (key: string): string[] => {
			if (visited.has(key)) return [];
			visited.add(key);
			return [
				key,
				...(children.get(key) ?? [])
					.filter((step) => step.planKey === route.planKey)
					.flatMap((step) => expand(step.key)),
			];
		};
		return { ...route, stepKeys: route.stepKeys.flatMap(expand) };
	});
}

// Date: 2026-11-17. Running ancestors describe progress; only running leaves describe execution.
export function executingStepKeys(steps: Step[]): Set<string> {
	const byKey = new Map(steps.map((step) => [step.key, step]));
	const parents = new Set(steps.map((step) => step.parentKey));
	const executing = new Set(
		steps
			.filter((step) => step.status === "running" && !(step.parentKey === null && parents.has(step.key)))
			.map((step) => step.key),
	);
	for (const step of steps) {
		if (step.status !== "running") continue;
		const visited = new Set([step.key]);
		let parent = byKey.get(step.parentKey ?? "");
		while (parent && parent.planKey === step.planKey && !visited.has(parent.key)) {
			visited.add(parent.key);
			executing.delete(parent.key);
			parent = byKey.get(parent.parentKey ?? "");
		}
	}
	return executing;
}

export function stepStatusLabel(step: Step, executing = true): string {
	if (step.status === "running" && !executing) return "进行中";
	if (step.status === "pending" && step.acceptance === "recheck") return "待核验";
	return { pending: "待执行", running: "执行中", blocked: "已阻塞", completed: "已完成", cancelled: "已取消" }[
		step.status
	];
}

export function taskGroups(snapshot: WorkbenchSnapshot, archived: string[] = []): TaskGroup[] {
	const hidden = new Set(archived);
	const displayRoutes = expandedRoutes(snapshot.routes, snapshot.steps);
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
				displayRoutes.filter((route) => route.planKey === item.key).sort((a, b) => a.order - b.order),
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
	return [...groups].sort((a, b) => (rank(a) === Infinity ? -1 : rank(a)) - (rank(b) === Infinity ? -1 : rank(b)));
}

export type RouteGraphNode = {
	step: Step;
	routeKeys: string[];
	column: number;
	lane: number;
	heading?: boolean;
	nested?: boolean;
};
export type RouteGraphEdge = { key: string; from: string; to: string; kind: "route" | "dependency" };
export type RouteGraphLayout = { nodes: RouteGraphNode[]; edges: RouteGraphEdge[]; columns: number; lanes: number };

export function primaryRoute(routes: Route[]): Route | undefined {
	const keys = new Set(routes.flatMap((route) => route.stepKeys));
	return routes.find((route) => !route.sourceStepKey || !keys.has(route.sourceStepKey)) ?? routes[0];
}

export function layoutRoutes(routes: Route[], steps: Step[]): RouteGraphLayout {
	routes = expandedRoutes(routes, steps);
	const headings = new Set(
		routes
			.filter((route) => {
				const first = steps.find((step) => step.key === route.stepKeys[0]);
				return (
					first?.parentKey === null &&
					(route.stepKeys.length === 1 || steps.some((step) => step.parentKey === first.key))
				);
			})
			.map((route) => route.stepKeys[0]),
	);
	const byKey = new Map(steps.map((step) => [step.key, step]));
	const nodes = new Map<string, RouteGraphNode>();
	for (const route of routes)
		for (const key of route.stepKeys) {
			const step = byKey.get(key);
			if (!step) continue;
			const node = nodes.get(key) ?? { step, routeKeys: [], column: 0, lane: -1, heading: headings.has(key) };
			if (!node.routeKeys.includes(route.key)) node.routeKeys.push(route.key);
			nodes.set(key, node);
		}
	// Direct children of a route heading stay on its main line. Deeper groups branch from their own parent.
	const tracks = routes.map((route) => {
		const keys = route.stepKeys.filter((key) => nodes.has(key));
		const included = new Set(keys);
		const main: string[] = [];
		const children = new Map<string, string[]>();
		for (const key of keys) {
			const parent = byKey.get(byKey.get(key)?.parentKey ?? "");
			if (parent?.parentKey && included.has(parent.key) && included.has(parent.parentKey)) {
				const group = children.get(parent.key) ?? [];
				group.push(key);
				children.set(parent.key, group);
			} else main.push(key);
		}
		const sequences: { keys: string[]; parentKey: string | null }[] = [];
		function append(group: string[], parentKey: string | null) {
			sequences.push({ keys: group, parentKey });
			for (const key of group) {
				const nested = children.get(key);
				if (nested) {
					children.delete(key);
					append(nested, key);
				}
			}
		}
		append(main, null);
		for (const [key, group] of children) {
			children.delete(key);
			append(group, key);
		}
		return { route, keys, sequences };
	});
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
	function connectRoutes(useDisplayOrder: boolean) {
		for (const { route, keys: stepKeys, sequences } of tracks) {
			for (const { keys, parentKey } of sequences) {
				const sequence = useDisplayOrder
					? [...keys].sort((a, b) => (nodes.get(a)?.column ?? 0) - (nodes.get(b)?.column ?? 0))
					: keys;
				for (let i = 1; i < sequence.length; i++) connect(sequence[i - 1], sequence[i]);
				connect(parentKey, sequence[0]);
			}
			connect(route.sourceStepKey, stepKeys[0]);
			// Date: 2026-11-13. Returning to the source identifies the parent context.
			if (route.returnStepKey !== route.sourceStepKey) connect(stepKeys.at(-1), route.returnStepKey);
		}
		for (const { step } of nodes.values()) for (const source of step.dependsOn) connect(source, step.key, "dependency");
	}
	const main = primaryRoute(routes);
	const firstTrack = tracks.find((track) => track.route === main);
	const ordered = firstTrack ? [firstTrack, ...tracks.filter((track) => track !== firstTrack)] : tracks;
	const branches: { parentKey: string; stations: RouteGraphNode[] }[] = [];
	let lane = 0;
	for (const { sequences } of ordered) {
		for (const { keys, parentKey } of sequences) {
			const owned = keys.flatMap((key) => {
				const node = nodes.get(key);
				return node && node.lane < 0 ? [node] : [];
			});
			if (!owned.length) continue;
			// Shared stations retain their owner's row. Nested rows follow the row containing their parent.
			for (const node of owned) {
				node.lane = lane;
				if (parentKey) node.nested = true;
			}
			if (parentKey) branches.push({ parentKey, stations: owned });
			lane++;
		}
	}
	connectRoutes(false);
	const placement = placeRouteColumns(nodes, edges.values(), branches);
	// Follow the placed stations even where an inferred sequence conflicted with a real dependency.
	edges.clear();
	connectRoutes(true);

	// Date: 2026-11-17. Use available column slack to shorten companion rails, keeping headings anchored.
	const lastColumn = Math.max(0, ...[...nodes.values()].map((node) => node.column));
	const outgoing = new Map([...nodes.keys()].map((key) => [key, [] as string[]]));
	for (const edge of edges.values()) outgoing.get(edge.from)?.push(edge.to);
	function hasAlternatePath(from: string, to: string): boolean {
		const pending = (outgoing.get(from) ?? []).filter((key) => key !== to);
		const seen = new Set<string>();
		while (pending.length) {
			const key = pending.pop();
			if (!key || seen.has(key)) continue;
			if (key === to) return true;
			seen.add(key);
			pending.push(...(outgoing.get(key) ?? []));
		}
		return false;
	}
	for (const { route, keys: stepKeys } of ordered) {
		const heading = nodes.get(route.stepKeys[0]);
		if (route.key === main?.key || !heading?.heading) continue;
		const work = stepKeys.flatMap((key) => {
			const node = nodes.get(key);
			return node && node !== heading ? [node] : [];
		});
		if (!work.length || work.some((node) => node.heading || node.routeKeys.length !== 1)) continue;
		const keys = new Set(work.map((node) => node.step.key));
		const exits = [...edges.values()].filter((edge) => keys.has(edge.from) && !keys.has(edge.to));
		const joins = exits.filter((edge) => {
			const from = nodes.get(edge.from),
				to = nodes.get(edge.to);
			return (
				edge.kind === "dependency" &&
				from &&
				to &&
				!to.routeKeys.includes(route.key) &&
				!hasAlternatePath(edge.from, edge.to) &&
				work.some((node) => node.column > from.column && node.column < to.column)
			);
		});
		if (!joins.length) continue;
		// Every outgoing relationship stays forward, and the block cannot enlarge the graph.
		const slack = Math.min(
			lastColumn - Math.max(...work.map((node) => node.column)),
			...exits.map((edge) => (nodes.get(edge.to)?.column ?? 0) - (nodes.get(edge.from)?.column ?? 0) - 1),
			...work.flatMap((node) =>
				[...(placement.get(node.step.key) ?? [])]
					.filter(([key]) => !keys.has(key))
					.map(([key, spacing]) => (nodes.get(key)?.column ?? 0) - node.column - spacing),
			),
		);
		if (slack > 0) for (const node of work) node.column += slack;
	}

	return {
		nodes: [...nodes.values()],
		edges: [...edges.values()],
		columns: Math.max(1, ...[...nodes.values()].map((node) => node.column + 1)),
		lanes: Math.max(1, ...[...nodes.values()].map((node) => node.lane + 1)),
	};
}
