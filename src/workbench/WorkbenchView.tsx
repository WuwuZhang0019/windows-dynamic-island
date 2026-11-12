// Date: 2026-11-12. Read-only fixed workbench; no business transitions are performed here.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
	WorkbenchEnvelope as Envelope,
	Plan,
	Preferences,
	Project,
	Route,
	Step,
	WorkbenchSnapshot,
} from "./contract/protocol";
import "./workbench.css";

type Reading = { selected: string; route?: string; top: number; lanes: Record<string, number> };
const emptySnapshot: WorkbenchSnapshot = {
	schemaVersion: "light-1.0",
	date: "2026-11-11",
	mode: "simulation",
	revision: null,
	generatedAt: "",
	projects: [],
	plans: [],
	steps: [],
	routes: [],
	bindings: [],
	executions: [],
	supplements: [],
	events: [],
};
const readingPositions = new Map<string, Reading>();
const labels: Record<string, string> = {
	pending: "待执行",
	running: "执行中",
	blocked: "已阻塞",
	completed: "已完成",
	cancelled: "已取消",
};
const connectionLabels: Record<string, string> = {
	ready: "快照可用",
	offline: "服务离线",
	unauthorized: "未获授权",
	stale: "数据已过期",
	incompatible: "版本不兼容",
	unknown: "结果未知",
};
const defaultScenarios = [
	{ id: "multi-project", label: "多项目" },
	{ id: "long-route", label: "长路线" },
	{ id: "deep-branch", label: "深分支" },
	{ id: "empty", label: "空数据" },
	{ id: "offline", label: "离线" },
	{ id: "unknown", label: "未知结果" },
	{ id: "unauthorized", label: "拒绝授权" },
	{ id: "incompatible", label: "版本不兼容" },
	{ id: "stale", label: "过期快照" },
];

function currentStep(steps: Step[]) {
	return (
		steps.find((step) => step.status === "running") ??
		steps.find((step) => step.status === "blocked") ??
		steps.find((step) => step.status === "pending") ??
		steps[0]
	);
}

export function WorkbenchSummary({
	envelope,
	scenario = "multi-project",
	preferences,
}: {
	envelope: Envelope;
	scenario?: string;
	preferences?: Preferences | null;
}) {
	const snapshot = envelope.snapshot ?? emptySnapshot;
	const byKey = new Map(snapshot.steps.map((step) => [step.key, step]));
	const remembered = readingPositions.get(`${envelope.mode}/${scenario}`);
	const explicitRoute = snapshot.routes.find((route) => route.key === (remembered?.route ?? preferences?.focus.at(-1)));
	const focus =
		byKey.get(remembered?.selected ?? "") ?? byKey.get(preferences?.selected ?? "") ?? currentStep(snapshot.steps);
	const routes = snapshot.routes.filter((route) => route.planKey === focus?.planKey).sort((a, b) => a.order - b.order);
	// Date: 2026-11-12. Resolve one route, following ancestors for unlisted child stages.
	let anchor = focus;
	let route = explicitRoute ?? routes.find((item) => item.stepKeys.includes(anchor?.key ?? ""));
	const visited = new Set<string>();
	while (!route && anchor?.parentKey && !visited.has(anchor.key)) {
		visited.add(anchor.key);
		const parent = byKey.get(anchor.parentKey);
		if (parent?.planKey !== focus?.planKey) break;
		anchor = parent;
		route = routes.find((item) => item.stepKeys.includes(anchor?.key ?? ""));
	}
	route ??= routes[0];
	const routeSteps = (route?.stepKeys ?? []).flatMap((key) => {
		const step = byKey.get(key);
		return step ? [step] : [];
	});
	return (
		<div
			className="wb-summary"
			role="img"
			data-workbench-summary
			data-connection={envelope.connection.state}
			aria-label={`${envelope.mode === "simulation" ? "模拟" : "真实"}路线，${connectionLabels[envelope.connection.state]}：${routeSteps.map((step) => `${step.code} ${labels[step.status]}`).join("，")}`}
		>
			{routeSteps.length > 0 && (
				<span className="wb-mini-route" data-route-key={route?.key}>
					{routeSteps.map((step, index) => (
						<Fragment key={step.key}>
							{index > 0 && <span className="wb-route-segment" data-status={step.status} aria-hidden="true" />}
							<span
								className={`wb-mini-stop wb-step-${step.status}`}
								data-step-key={step.key}
								data-status={step.status}
								data-current={step.key === anchor?.key}
								title={`${step.code} ${step.title} · ${labels[step.status]}`}
							>
								<span className="wb-dot" />
							</span>
						</Fragment>
					))}
				</span>
			)}
		</div>
	);
}
// Date: 2026-11-12. Stable route identities keep live updates and reading positions intact.
type RouteEntry = { key: string; project: Project; plan?: Plan; route?: Route };
function routeEntries(snapshot: WorkbenchSnapshot): RouteEntry[] {
	const entries: RouteEntry[] = [];
	for (const project of snapshot.projects) {
		const plans = snapshot.plans.filter((plan) => plan.projectKey === project.key);
		if (!plans.length) entries.push({ key: project.key, project });
		for (const plan of plans) {
			const routes = snapshot.routes.filter((route) => route.planKey === plan.key).sort((a, b) => a.order - b.order);
			if (!routes.length) entries.push({ key: plan.key, project, plan });
			for (const route of routes) entries.push({ key: route.key, project, plan, route });
		}
	}
	return entries;
}

export interface WorkbenchViewProps {
	envelope: Envelope;
	refresh: () => void | Promise<void>;
	scenario: string;
	setScenario: (value: string) => void;
	scenarios?: readonly { id: string; label: string }[];
	queryPending?: () => Promise<void>;
	preferences?: Preferences | null;
	savePreferences?: (value: Preferences) => Promise<void>;
	preferenceMessage?: string;
}

export function WorkbenchView({
	envelope,
	scenario,
	setScenario,
	scenarios = defaultScenarios,
	queryPending,
	preferences,
	savePreferences,
	preferenceMessage,
}: WorkbenchViewProps) {
	const reducedMotion = useReducedMotion();
	const { connection, pendingOperation } = envelope;
	const snapshot = envelope.snapshot ?? emptySnapshot;
	const memoryKey = `${envelope.mode}/${scenario}`;
	const memory = readingPositions.get(memoryKey);
	const [selectedKey, setSelectedKey] = useState(memory?.selected ?? currentStep(snapshot.steps)?.key ?? "");
	const [selectedRouteKey, setSelectedRouteKey] = useState(memory?.route ?? "");
	const listRef = useRef<HTMLDivElement>(null);
	const positions = useRef<Reading>({
		selected: selectedKey,
		route: memory?.route,
		top: memory?.top ?? 0,
		lanes: memory?.lanes ?? {},
	});
	const stepByKey = new Map(snapshot.steps.map((step) => [step.key, step]));
	const entries = routeEntries(snapshot);

	useLayoutEffect(() => {
		if (!envelope.snapshot) return;
		const saved =
			readingPositions.get(memoryKey) ??
			(envelope.mode === "service" && preferences
				? {
						selected: preferences.selected,
						route: preferences.focus.at(-1),
						top: preferences.y["island/list"] ?? 0,
						lanes: Object.fromEntries(
							Object.entries(preferences.scroll)
								.filter(([key]) => key.startsWith("island/route/"))
								.map(([key, value]) => [key.slice(13), value]),
						),
					}
				: undefined);
		positions.current = saved ?? { selected: currentStep(snapshot.steps)?.key ?? "", top: 0, lanes: {} };
		if (!snapshot.steps.some((step) => step.key === positions.current.selected))
			positions.current.selected = currentStep(snapshot.steps)?.key ?? "";
		if (!snapshot.routes.some((route) => route.key === positions.current.route)) positions.current.route = undefined;
		setSelectedRouteKey(positions.current.route ?? "");
		setSelectedKey(positions.current.selected);
		readingPositions.set(memoryKey, { ...positions.current });
		const list = listRef.current;
		if (list) {
			list.scrollTop = positions.current.top;
			for (const lane of list.querySelectorAll<HTMLElement>("[data-route-key]"))
				lane.scrollLeft = positions.current.lanes[lane.dataset.routeKey ?? ""] ?? 0;
		}
	}, [memoryKey, snapshot.steps, snapshot.routes, preferences, envelope.mode, envelope.snapshot]);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(saveTimer.current), []);

	function remember(immediate = false) {
		const list = listRef.current;
		if (list) positions.current.top = list.scrollTop;
		readingPositions.set(memoryKey, { ...positions.current });
		if (envelope.mode === "service" && preferences && savePreferences && connection.state === "ready") {
			clearTimeout(saveTimer.current);
			const reading = structuredClone(positions.current);
			const save = () =>
				void savePreferences({
					...preferences,
					selected: reading.selected,
					focus: reading.route ? [reading.route] : [],
					scroll: {
						...preferences.scroll,
						...Object.fromEntries(Object.entries(reading.lanes).map(([key, value]) => [`island/route/${key}`, value])),
					},
					y: { ...preferences.y, "island/list": reading.top },
				});
			if (immediate) save();
			else saveTimer.current = setTimeout(save, 250);
		}
	}
	function select(key: string, routeKey: string) {
		setSelectedKey(key);
		setSelectedRouteKey(routeKey);
		positions.current.selected = key;
		positions.current.route = routeKey;
		remember(true);
	}
	// Date: 2026-11-12. Card selection persists the route independently of shared stations.
	function selectRoute(route: Route) {
		const steps = route.stepKeys.flatMap((key) => {
			const step = stepByKey.get(key);
			return step ? [step] : [];
		});
		const anchor = steps.find((step) => step.key === selectedKey) ?? currentStep(steps);
		if (anchor) select(anchor.key, route.key);
		else {
			setSelectedRouteKey(route.key);
			positions.current.route = route.key;
			remember(true);
		}
	}
	function name(key: string) {
		const step = stepByKey.get(key);
		return step ? `${step.code} ${step.title}` : key;
	}

	return (
		<section
			className="wb"
			data-workbench
			data-no-drag
			aria-label={envelope.mode === "simulation" ? "模拟工作台" : "真实工作台"}
		>
			{envelope.mode === "simulation" && (
				<div className="wb-scenario-row">
					<label>
						演示场景{" "}
						<select aria-label="演示场景" value={scenario} onChange={(event) => setScenario(event.currentTarget.value)}>
							{scenarios.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
						</select>
					</label>
				</div>
			)}
			{connection.state !== "ready" && (
				<div className="wb-notice wb-notice-warning" role="status" data-connection={connection.state}>
					{connectionLabels[connection.state]} · {connection.message}
					{envelope.snapshot && <span> · 保留快照仅供参考</span>}
				</div>
			)}
			{preferenceMessage && (
				<p className="wb-notice wb-notice-warning" role="status">
					{preferenceMessage}
				</p>
			)}
			{pendingOperation && (
				<div className="wb-unknown" role="status" data-unknown-result>
					<strong>操作结果未知</strong>
					<span>{pendingOperation.reason}</span>
					<code>{pendingOperation.eventId}</code>
					<span>需使用原事件键查询；此预览不会重发或创建新操作。</span>
					{queryPending && (
						<button type="button" onClick={() => void queryPending()}>
							查询原事件
						</button>
					)}
				</div>
			)}
			<div className="wb-main">
				<motion.div
					className="wb-projects"
					ref={listRef}
					onScroll={() => remember()}
					data-workbench-routes
					layoutScroll
				>
					{!snapshot.projects.length && (
						<div className="wb-empty">
							<span className="wb-empty-orbit">○</span>
							<strong>{envelope.snapshot ? "暂无项目" : connectionLabels[connection.state]}</strong>
							<span>{envelope.snapshot ? "空快照不代表任务已全部完成" : "当前没有可展示的有效快照"}</span>
						</div>
					)}
					<ul className="wb-route-list" aria-label="路线列表" key={memoryKey}>
						<AnimatePresence mode="popLayout">
							{entries.map(({ key, project, plan, route }, index) => {
								const steps = (route?.stepKeys ?? []).flatMap((key) => {
									const step = stepByKey.get(key);
									return step ? [step] : [];
								});
								const completed = steps.filter((step) => step.status === "completed").length;
								const state = steps.some((step) => step.status === "blocked")
									? "blocked"
									: steps.some((step) => step.status === "running")
										? "running"
										: steps.length && completed === steps.length
											? "completed"
											: steps.length && steps.every((step) => step.status === "cancelled")
												? "cancelled"
												: "pending";
								const title = route?.label || plan?.name || project.name;
								const context = [...new Set([project.name, plan?.name].filter((name) => name && name !== title))].join(
									" · ",
								);
								const routeSelected = selectedRouteKey
									? route?.key === selectedRouteKey
									: steps.some((step) => step.key === selectedKey);
								const delay = reducedMotion ? 0 : Math.min(index, 5) * 0.07;
								return (
									<motion.li
										key={key}
										className="wb-route-card"
										data-route-card={route?.key}
										data-project-key={project.key}
										data-state={state}
										data-selected={routeSelected}
										layout={reducedMotion ? false : "position"}
										initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
										animate={{ opacity: 1, y: 0, scale: 1 }}
										exit={{
											opacity: 0,
											scale: reducedMotion ? 1 : 0.97,
											transition: { duration: reducedMotion ? 0 : 0.15 },
										}}
										transition={{
											type: "spring",
											stiffness: 360,
											damping: 30,
											delay,
											opacity: { duration: reducedMotion ? 0 : 0.22, delay },
											layout: { duration: reducedMotion ? 0 : 0.25, delay: 0 },
										}}
									>
										{route && (
											<button
												type="button"
												className="wb-route-select"
												data-route-select={route.key}
												aria-label={`显示${project.name} · ${title}的路线缩略图`}
												aria-pressed={routeSelected}
												onClick={() => selectRoute(route)}
											/>
										)}
										<header className="wb-route-heading">
											<span className="wb-route-index" aria-hidden="true">
												{String(index + 1).padStart(2, "0")}
											</span>
											<div className="wb-route-title">
												<h2>{title}</h2>
												{context && <p>{context}</p>}
											</div>
											{route && (
												<div className="wb-route-progress">
													<span className="wb-route-state">{labels[state]}</span>
													<small>
														完成 {completed}/{steps.length}
													</small>
												</div>
											)}
										</header>
										{route ? (
											<div className="wb-route">
												{route.sourceStepKey && (
													<small className="wb-route-source" title={name(route.sourceStepKey)}>
														↳ 来源 {name(route.sourceStepKey)}
													</small>
												)}
												<div
													className="wb-lane"
													data-route-key={route.key}
													onScroll={(event) => {
														positions.current.lanes[route.key] = event.currentTarget.scrollLeft;
														remember();
													}}
												>
													{route.stepKeys.map((key, index) => {
														const step = stepByKey.get(key);
														if (!step) return null;
														return (
															<button
																type="button"
																className={`wb-step wb-step-${step.status}`}
																data-step-key={key}
																data-status={step.status}
																key={key}
																aria-pressed={selectedKey === key}
																title={`${step.code} ${step.title} · ${labels[step.status]}`}
																onClick={() => select(key, route.key)}
															>
																<span
																	className="wb-step-track"
																	data-before={index > 0 ? step.status : undefined}
																	data-after={stepByKey.get(route.stepKeys[index + 1])?.status}
																>
																	<span className="wb-dot" />
																</span>
																<span className="wb-step-code">{step.code}</span>
																<span className="wb-step-title">{step.title}</span>
																<span className="wb-step-state">{labels[step.status]}</span>
															</button>
														);
													})}
												</div>
												{route.returnStepKey && <small className="wb-return">汇入 {name(route.returnStepKey)}</small>}
											</div>
										) : (
											<p className="wb-muted">{plan ? "此方案暂无路线" : "此项目暂无方案"}</p>
										)}
									</motion.li>
								);
							})}
						</AnimatePresence>
					</ul>
				</motion.div>
			</div>
		</section>
	);
}
