// Date: 2026-11-13. Adapted from Uiverse.io by nazar-gavrylyk / Na3ar-17, warm-turtle-37 (MIT).
import type { ContinuousRun } from "./continuous";
import "./continuous-button.css";
export function ContinuousButton({
	title,
	run,
	disabled,
	onToggle,
}: {
	title: string;
	run?: ContinuousRun;
	disabled: boolean;
	onToggle: () => void;
}) {
	// The switch reflects future dispatch, even while the current stage is draining.
	const active = run?.status === "running";
	const hint =
		run?.status === "pausing"
			? "连续执行已关闭，当前阶段完成后暂停"
			: run?.status === "completed"
				? "方案已完成，连续执行已关闭"
				: run?.reason || (active ? "当前阶段完成后暂停接续" : "按阶段新建会话并连续执行至方案结束");
	return (
		<button
			type="button"
			className="wb-continuous"
			data-no-drag
			onPointerDown={(event) => event.stopPropagation()}
			role="switch"
			aria-checked={active}
			aria-label={`连续执行：${title}`}
			data-status={run?.status ?? "idle"}
			disabled={disabled || run?.status === "completed"}
			title={hint + (run?.stageCode ? ` · 当前阶段 ${run.stageCode}` : "")}
			onClick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
		>
			<span className="wb-continuous-title">连续执行</span>
			<span className="wb-continuous-ball">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					{active ? <path d="M9 6v12M15 6v12" /> : <path d="M8 18V6l8 6-8 6Z" />}
				</svg>
			</span>
		</button>
	);
}
