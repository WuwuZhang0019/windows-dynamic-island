// Date: 2026-11-12. Read-only fixed workbench; no business transitions are performed here.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WorkbenchEnvelope as Envelope, Preferences, Step, WorkbenchSnapshot } from "./contract/protocol";
import "./workbench.css";

type Status = Step["status"];
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

export function WorkbenchSummary({ envelope }: { envelope: Envelope }) {
	const { connection } = envelope;
	const snapshot = envelope.snapshot ?? emptySnapshot;
	const active = currentStep(snapshot.steps);
	const project = snapshot.projects.find((item) => item.key === active?.projectKey);
	const count = (status: Status) => snapshot.steps.filter((item) => item.status === status).length;
	return (
		<div
			className="wb-summary"
			role="status"
			data-workbench-summary
			title={`${project?.name ?? "工作台"} · ${active ? `${active.code} ${active.title} · ${labels[active.status]}` : "暂无阶段"}`}
			aria-label={`${envelope.mode === "simulation" ? "模拟" : "真实"}工作台：${active ? `${active.code} ${active.title}` : "暂无阶段"}`}
		>
			<span className="wb-simulation">{envelope.mode === "simulation" ? "模拟" : "真实"}</span>
			<span className="wb-summary-title" title={active ? `${active.code} ${active.title}` : project?.name}>
				{project?.name ?? "工作台"}
				{active ? ` · ${active.code}` : ""}
			</span>
			<span className="wb-summary-counts">
				{connection.state === "ready"
					? `执行 ${count("running")} · 阻塞 ${count("blocked")} · 待处理 ${count("pending")}`
					: connectionLabels[connection.state]}
			</span>
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
	refresh,
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
	const latestEvent = snapshot.events[snapshot.events.length - 1];

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
	function locate(key?: string) {
		const step = key ? stepByKey.get(key) : currentStep(snapshot.steps);
		if (!step) return;
		select(step.key);
		const target = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-step-key]") ?? []).find(
			(node) => node.dataset.stepKey === step.key,
		);
		target?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
		target?.focus({ preventScroll: true });
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
			<div className="wb-toolbar">
				<div>
					<span className="wb-simulation">{envelope.mode === "simulation" ? "模拟数据" : "真实服务"}</span>
					<span className="wb-version">只读工作台 · revision {snapshot.revision ?? "—"}</span>
				</div>
				<div className="wb-actions">
					<button type="button" onClick={() => locate()} disabled={!snapshot.steps.length}>
						定位当前
					</button>
					<button type="button" onClick={() => void refresh()}>
						刷新
					</button>
				</div>
			</div>
			<div className="wb-scenario-row">
				{envelope.mode === "simulation" && (
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
				)}
				<span className={`wb-connection wb-connection-${connection.state}`} data-connection={connection.state}>
					{connectionLabels[connection.state]}
				</span>
			</div>
			<div className={`wb-notice ${connection.state !== "ready" ? "wb-notice-warning" : ""}`} role="status">
				{connection.message ||
					(envelope.mode === "simulation" ? "本页使用独立模拟快照，不连接正式业务服务" : "真实服务连接")}
				{connection.state !== "ready" && <span> · 保留快照仅供参考</span>}
				<span className="wb-last-success">
					{envelope.mode === "simulation" ? "模拟读取：" : "最近成功同步："}
					{connection.lastSuccessAt
						? new Date(connection.lastSuccessAt).toLocaleTimeString("zh-CN", { hour12: false })
						: "尚无"}
				</span>
			</div>
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
			{latestEvent && (
				<button
					className="wb-event"
					type="button"
					data-event-id={latestEvent.eventId}
					onClick={() => locate(latestEvent.stepKey ?? undefined)}
					title="定位事件对应阶段"
				>
					最近事件 · {latestEvent.reason}
					<span>定位 →</span>
				</button>
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
															{route.stepKeys.map((key) => {
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
																		<span className="wb-step-track">
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
