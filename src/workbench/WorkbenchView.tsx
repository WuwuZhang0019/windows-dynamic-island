// Date: 2026-11-12. Read-only fixed workbench; no business transitions are performed here.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WorkbenchEnvelope as Envelope, Preferences, Step, WorkbenchSnapshot } from "./contract/protocol";
import "./workbench.css";

type Reading = { selected: string; top: number; lanes: Record<string, number> };
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
	const remembered = readingPositions.get(`${envelope.mode}/${scenario}`)?.selected;
	const focus = byKey.get(remembered ?? "") ?? byKey.get(preferences?.selected ?? "") ?? currentStep(snapshot.steps);
	const routes = snapshot.routes.filter((route) => route.planKey === focus?.planKey).sort((a, b) => a.order - b.order);
	// Date: 2026-11-12. Resolve one route, following ancestors for unlisted child stages.
	let anchor = focus;
	let route = routes.find((item) => item.stepKeys.includes(anchor?.key ?? ""));
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
	const { connection, pendingOperation } = envelope;
	const snapshot = envelope.snapshot ?? emptySnapshot;
	const memoryKey = `${envelope.mode}/${scenario}`;
	const memory = readingPositions.get(memoryKey);
	const [selectedKey, setSelectedKey] = useState(memory?.selected ?? currentStep(snapshot.steps)?.key ?? "");
	const listRef = useRef<HTMLDivElement>(null);
	const positions = useRef<Reading>({
		selected: selectedKey,
		top: memory?.top ?? 0,
		lanes: memory?.lanes ?? {},
	});
	const stepByKey = new Map(snapshot.steps.map((step) => [step.key, step]));

	useLayoutEffect(() => {
		if (!envelope.snapshot) return;
		const saved =
			readingPositions.get(memoryKey) ??
			(envelope.mode === "service" && preferences
				? {
						selected: preferences.selected,
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
		setSelectedKey(positions.current.selected);
		readingPositions.set(memoryKey, { ...positions.current });
		const list = listRef.current;
		if (list) {
			list.scrollTop = positions.current.top;
			for (const lane of list.querySelectorAll<HTMLElement>("[data-route-key]"))
				lane.scrollLeft = positions.current.lanes[lane.dataset.routeKey ?? ""] ?? 0;
		}
	}, [memoryKey, snapshot.steps, preferences, envelope.mode, envelope.snapshot]);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(saveTimer.current), []);

	function remember() {
		const list = listRef.current;
		if (list) positions.current.top = list.scrollTop;
		readingPositions.set(memoryKey, { ...positions.current });
		if (envelope.mode === "service" && preferences && savePreferences && connection.state === "ready") {
			clearTimeout(saveTimer.current);
			const reading = structuredClone(positions.current);
			saveTimer.current = setTimeout(
				() =>
					void savePreferences({
						...preferences,
						selected: reading.selected,
						scroll: {
							...preferences.scroll,
							...Object.fromEntries(
								Object.entries(reading.lanes).map(([key, value]) => [`island/route/${key}`, value]),
							),
						},
						y: { ...preferences.y, "island/list": reading.top },
					}),
				250,
			);
		}
	}
	function select(key: string) {
		setSelectedKey(key);
		positions.current.selected = key;
		remember();
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
				<div className="wb-projects" ref={listRef} onScroll={remember} data-workbench-routes>
					{!snapshot.projects.length && (
						<div className="wb-empty">
							<span className="wb-empty-orbit">○</span>
							<strong>{envelope.snapshot ? "暂无项目" : connectionLabels[connection.state]}</strong>
							<span>{envelope.snapshot ? "空快照不代表任务已全部完成" : "当前没有可展示的有效快照"}</span>
						</div>
					)}
					{snapshot.projects.map((project) => (
						<section key={project.key} className="wb-project" data-project-key={project.key}>
							<div className="wb-project-heading">
								<h2>{project.name}</h2>
								<span>{snapshot.plans.filter((plan) => plan.projectKey === project.key).length} 个方案</span>
							</div>
							{snapshot.plans
								.filter((plan) => plan.projectKey === project.key)
								.map((plan) => {
									const routes = snapshot.routes.filter((route) => route.planKey === plan.key);
									return (
										<div className="wb-plan" key={plan.key}>
											<h3>{plan.name}</h3>
											{routes.length ? (
												routes.map((route) => (
													<div className="wb-route" key={route.key}>
														<div className="wb-route-caption">
															<span>{route.label}</span>
															{route.sourceStepKey && (
																<small title={name(route.sourceStepKey)}>
																	↳ 来源 {stepByKey.get(route.sourceStepKey)?.code ?? route.sourceStepKey}
																</small>
															)}
														</div>
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
																		onClick={() => select(key)}
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
														{route.returnStepKey && (
															<small className="wb-return">汇入 {name(route.returnStepKey)}</small>
														)}
													</div>
												))
											) : (
												<p className="wb-muted">此方案暂无路线</p>
											)}
										</div>
									);
								})}
						</section>
					))}
				</div>
			</div>
		</section>
	);
}
