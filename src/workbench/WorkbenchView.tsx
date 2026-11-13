// Date: 2026-11-12. Route reader with explicit owner archival; execution states remain service-owned.
import { AnimatePresence, motion, Reorder, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { setSetting, taskCardEffect, useSettings } from "../core/settings";
import { type AppFilter, matchesApp } from "./agent-apps";
import type { WorkbenchEnvelope as Envelope, Preferences, Route, Step, WorkbenchSnapshot } from "./contract/protocol";
import { GroupRouteGraph } from "./GroupRouteGraph";
import { TASK_ORDER_KEY, taskOrder, taskSize } from "./list-preferences";
import { RouteArchiveButton } from "./RouteArchiveButton";
import { SortableRouteCard } from "./SortableRouteCard";
import { layoutRoutes, orderedTaskGroups, primaryRoute, type TaskGroup, taskGroups } from "./task-groups";
import { libraryError } from "./task-library";
import "./workbench.css";

import { type Reading, readingPositions } from "./reading-positions";

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

// Date: 2026-11-12. Compact rows and the collapsed island share station states and markers.
function RouteThumbnail({ routeKey, steps, currentKey }: { routeKey?: string; steps: Step[]; currentKey?: string }) {
	if (!steps.length) return null;
	return (
		<span className="wb-mini-route" data-route-key={routeKey}>
			{steps.map((step, index) => (
				<Fragment key={step.key}>
					{index > 0 && <span className="wb-route-segment" data-status={step.status} aria-hidden="true" />}
					<span
						className={`wb-mini-stop wb-step-${step.status}`}
						data-step-key={step.key}
						data-status={step.status}
						data-current={step.key === currentKey}
						title={`${step.code} ${step.title} · ${labels[step.status]}`}
					>
						<span className="wb-dot" />
					</span>
				</Fragment>
			))}
		</span>
	);
}

export function WorkbenchSummary({
	envelope,
	scenario = "multi-project",
	preferences,
	archivedKeys = [],
}: {
	envelope: Envelope;
	scenario?: string;
	preferences?: Preferences | null;
	archivedKeys?: string[];
}) {
	const hidden = archivedKeys;
	const snapshot = envelope.snapshot ?? emptySnapshot;
	const availableRoutes = snapshot.routes.filter((route) => !hidden.includes(route.key));
	const byKey = new Map(snapshot.steps.map((step) => [step.key, step]));
	const remembered = readingPositions.get(`${envelope.mode}/${scenario}`);
	const explicitRoute = availableRoutes.find((route) => route.key === (remembered?.route ?? preferences?.focus.at(-1)));
	const focus =
		byKey.get(remembered?.selected ?? "") ?? byKey.get(preferences?.selected ?? "") ?? currentStep(snapshot.steps);
	const routes = availableRoutes.filter((route) => route.planKey === focus?.planKey).sort((a, b) => a.order - b.order);
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
	route ??= routes[0] ?? availableRoutes[0];
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
			<RouteThumbnail routeKey={route?.key} steps={routeSteps} currentKey={anchor?.key} />
		</div>
	);
}
export interface WorkbenchViewProps {
	selectedApp?: AppFilter;
	envelope: Envelope;
	refresh: () => void | Promise<void>;
	scenario: string;
	setScenario: (value: string) => void;
	scenarios?: readonly { id: string; label: string }[];
	queryPending?: () => Promise<void>;
	preferences?: Preferences | null;
	savePreferences?: (value: Preferences) => Promise<void>;
	preferenceMessage?: string;
	archivedKeys?: string[];
	archiveTask?: (key: string) => Promise<void>;
}

export function WorkbenchView({
	envelope,
	selectedApp = "all",
	scenario,
	setScenario,
	scenarios = defaultScenarios,
	queryPending,
	preferences,
	savePreferences,
	preferenceMessage,
	archivedKeys = [],
	archiveTask,
}: WorkbenchViewProps) {
	const reducedMotion = useReducedMotion();
	const settings = useSettings();
	const compact = taskSize(settings) === "small";
	const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
	const dragOrder = useRef<string[] | null>(null);
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
	const savedOrder = taskOrder(settings);
	const allEntries = orderedTaskGroups(taskGroups(snapshot, archivedKeys), draftOrder ?? savedOrder);
	const entries = allEntries.filter((group) => matchesApp(group, envelope, selectedApp));
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [archiveMessage, setArchiveMessage] = useState("");

	// Date: 2026-11-12. Display-only graphs select their card without blocking native lane scrolling.
	useEffect(() => {
		const list = listRef.current;
		if (!list) return;
		function scrollRoute(event: WheelEvent) {
			if (event.ctrlKey || !(event.target instanceof Element)) return;
			const lane = event.target.closest(".wb-route-card")?.querySelector<HTMLElement>(".wb-lane");
			if (!lane || lane.closest("[inert]") || !list?.contains(lane) || lane.scrollWidth <= lane.clientWidth) return;
			const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
			if (!delta) return;
			const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? lane.clientWidth : 1;
			event.preventDefault();
			event.stopPropagation();
			lane.scrollLeft += delta * unit;
		}
		function selectCard(event: MouseEvent) {
			if (
				event.defaultPrevented ||
				!(event.target instanceof Element) ||
				event.target.closest("button, a, input, select, textarea")
			)
				return;
			const card = event.target.closest("[data-route-card]");
			if (card && list?.contains(card)) card.querySelector<HTMLButtonElement>("[data-route-select]")?.click();
		}
		// React wheel listeners are passive, so cancellation must use a native listener.
		list.addEventListener("wheel", scrollRoute, { passive: false });
		// Reuse the card's accessible button for display surfaces above its selection overlay.
		list.addEventListener("click", selectCard);
		return () => {
			list.removeEventListener("wheel", scrollRoute);
			list.removeEventListener("click", selectCard);
		};
	}, []);

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
		const hidden = archivedKeys;
		const hiddenSelection =
			hidden.includes(positions.current.route ?? "") ||
			(snapshot.routes.some(
				(route) => hidden.includes(route.key) && route.stepKeys.includes(positions.current.selected),
			) &&
				!snapshot.routes.some(
					(route) => !hidden.includes(route.key) && route.stepKeys.includes(positions.current.selected),
				));
		if (hiddenSelection) {
			const next = snapshot.routes.find((route) => !hidden.includes(route.key));
			positions.current.route = next?.key;
			positions.current.selected =
				currentStep(snapshot.steps.filter((step) => next?.stepKeys.includes(step.key)))?.key ?? "";
		}
		setSelectedRouteKey(positions.current.route ?? "");
		setSelectedKey(positions.current.selected);
		readingPositions.set(memoryKey, { ...positions.current });
		const list = listRef.current;
		if (list) {
			list.scrollTop = positions.current.top;
			for (const lane of list.querySelectorAll<HTMLElement>(".wb-lane[data-route-key]"))
				lane.scrollLeft = positions.current.lanes[lane.dataset.routeKey ?? ""] ?? 0;
		}
	}, [memoryKey, snapshot.steps, snapshot.routes, preferences, envelope.mode, envelope.snapshot, archivedKeys]);
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
					collapsed: preferences.collapsed,
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
	// Archive existing owner entries sequentially, retaining any unconfirmed remainder.
	async function archiveEntry(group: TaskGroup, title: string) {
		if (!archiveTask || busyKey) return;
		setBusyKey(group.key);
		let completed = 0;
		try {
			for (const key of group.archiveKeys) {
				await archiveTask(key);
				completed++;
			}
			setArchiveMessage(`已归档：${title}，可在设置 → 任务列表中查看`);
		} catch (error) {
			setArchiveMessage(`${completed ? "部分路线已归档，其余仍保留在列表。" : ""}${libraryError(error)}`);
		} finally {
			setBusyKey(null);
		}
	}
	function reorder(keys: string[]) {
		dragOrder.current = keys;
		setDraftOrder(keys);
	}
	function commitOrder(keys: string[]) {
		const moving = new Set(keys);
		let cursor = 0;
		const merged = allEntries.map((entry) => (moving.has(entry.key) ? keys[cursor++] : entry.key));
		setSetting(TASK_ORDER_KEY, [...merged, ...savedOrder.filter((key) => !merged.includes(key))]);
		dragOrder.current = null;
		setDraftOrder(null);
	}
	function finishReorder() {
		if (dragOrder.current) commitOrder(dragOrder.current);
	}
	function moveRoute(key: string, direction: number) {
		const keys = entries.map((entry) => entry.key);
		const from = keys.indexOf(key),
			to = from + direction;
		if (from < 0 || to < 0 || to >= keys.length) return;
		[keys[from], keys[to]] = [keys[to], keys[from]];
		commitOrder(keys);
	}

	return (
		<section
			className="wb"
			data-workbench
			data-task-size={compact ? "small" : "large"}
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
					{snapshot.projects.length > 0 && entries.length === 0 && (
						<div className="wb-empty">
							<strong>{selectedApp === "all" ? "列表中暂无任务" : "此应用暂无关联任务"}</strong>
							<span>
								{selectedApp === "all"
									? "已归档任务可在设置 → 任务列表中查看。"
									: "切换“全部”查看其他任务，历史任务保留在“未分配”。"}
							</span>
						</div>
					)}
					<Reorder.Group
						as="ul"
						axis="y"
						className="wb-route-list"
						aria-label="路线列表"
						key={memoryKey}
						values={entries.map((entry) => entry.key)}
						onReorder={reorder}
					>
						<AnimatePresence mode="popLayout">
							{entries.map((group, index) => {
								const { key, project, plan, routes } = group;
								const layout = layoutRoutes(routes, snapshot.steps);
								const steps = layout.nodes.map((node) => node.step);
								const main = primaryRoute(routes);
								const state = steps.some((step) => step.status === "blocked")
									? "blocked"
									: steps.some((step) => step.status === "running")
										? "running"
										: steps.length && steps.every((step) => step.status === "completed")
											? "completed"
											: steps.length && steps.every((step) => step.status === "cancelled")
												? "cancelled"
												: "pending";
								const title = plan?.name || project.name;
								const context = project.name !== title ? project.name : "";
								const routeSelected = selectedRouteKey
									? routes.some((route) => route.key === selectedRouteKey)
									: steps.some((step) => step.key === selectedKey);
								const anchor = currentStep(steps);
								const route =
									routes.find((item) => item.key === selectedRouteKey) ??
									routes.find((item) => item.stepKeys.includes(anchor?.key ?? "")) ??
									main;
								const delay = reducedMotion ? 0 : Math.min(index, 5) * 0.07;
								return (
									<SortableRouteCard
										key={key}
										itemKey={key}
										routeKey={key}
										projectKey={project.key}
										title={title}
										state={state}
										selected={routeSelected}
										delay={delay}
										orderIndex={index}
										reducedMotion={!!reducedMotion}
										cardEffect={taskCardEffect(settings)}
										onSortEnd={finishReorder}
										onMove={moveRoute}
									>
										{route && (
											<button
												type="button"
												className="wb-route-select"
												data-route-select={key}
												aria-label={`显示${project.name} · ${title}的路线缩略图`}
												title={context ? `${title} — ${context}` : title}
												aria-pressed={routeSelected}
												onClick={() => selectRoute(route)}
											/>
										)}
										<header
											className="wb-route-heading"
											style={{ minHeight: compact ? Math.max(32, 22 + (layout.lanes - 1) * 18) : 32 }}
										>
											<div className="wb-route-title">
												<h2 title={title}>{title}</h2>
												{context && <p title={context}>{context}</p>}
											</div>
											{steps.length > 0 && (
												<div
													className="wb-row-thumbnail"
													data-route-preview={key}
													inert={!compact}
													aria-hidden={!compact}
												>
													<GroupRouteGraph
														layout={layout}
														compact
														selectedKey={selectedKey}
														selectedRouteKey={selectedRouteKey}
														onSelect={select}
													/>
												</div>
											)}
											<div className="wb-route-actions">
												<RouteArchiveButton
													title={title}
													disabled={!archiveTask || !!busyKey || connection.state !== "ready"}
													onArchive={() => void archiveEntry(group, title)}
												/>
											</div>
										</header>
										<div className="wb-route-body" inert={compact} aria-hidden={compact}>
											<div className="wb-route-body-inner">
												{routes.length ? (
													<div
														className="wb-lane wb-group-lane"
														data-route-key={key}
														onScroll={(event) => {
															positions.current.lanes[key] = event.currentTarget.scrollLeft;
															remember();
														}}
													>
														<GroupRouteGraph
															layout={layout}
															compact={false}
															selectedKey={selectedKey}
															selectedRouteKey={selectedRouteKey}
															onSelect={select}
														/>
													</div>
												) : (
													<p className="wb-muted">{plan ? "此方案暂无路线" : "此项目暂无方案"}</p>
												)}
											</div>
										</div>
									</SortableRouteCard>
								);
							})}
						</AnimatePresence>
					</Reorder.Group>
				</motion.div>
			</div>
			{archiveMessage && (
				<div className="wb-archive-notice" role="status">
					{archiveMessage}
				</div>
			)}
		</section>
	);
}
