// Date: 2026-11-13. Adapted from Uiverse warm-turtle-37 (MIT); execution state stays distinct from user intent.
import { type ContinuousRun, continuousEnabled } from "./continuous";
import "./continuous-button.css";

export function ContinuousButton({
	title,
	run,
	disabled,
	busy = false,
	onToggle,
}: {
	title: string;
	run?: ContinuousRun;
	disabled: boolean;
	busy?: boolean;
	onToggle: () => void;
}) {
	const active = continuousEnabled(run);
	return (
		<button
			type="button"
			className="wb-continuous"
			data-no-drag
			onPointerDown={(event) => event.stopPropagation()}
			role="switch"
			aria-checked={active}
			aria-busy={busy}
			aria-label={`连续执行：${title}`}
			data-status={run?.status ?? "idle"}
			disabled={disabled || busy || run?.status === "completed"}
			title="连续执行"
			onClick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
		>
			<span className="wb-continuous-ball">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					{run?.status === "completed" ? (
						<path d="m6 12 4 4 8-8" />
					) : active ? (
						<path d="M9 6v12M15 6v12" />
					) : (
						<path d="M8 18V6l8 6-8 6Z" />
					)}
				</svg>
			</span>
		</button>
	);
}

export function ContinuousFeedback({
	run,
	error,
	disabled,
	onRetry,
}: {
	run?: ContinuousRun;
	error?: string;
	disabled: boolean;
	onRetry: () => void;
}) {
	const blocked = run?.status === "blocked";
	const message =
		error ||
		(blocked
			? `接续受阻：${run.reason}`
			: run?.status === "pausing"
				? "已关闭，当前阶段完成后暂停接续"
				: run?.status === "running"
					? run.phase === "waiting"
						? "已开启，等待当前阶段验收通过后接续"
						: run.phase === "notifying"
							? "已开启，正在通知当前会话"
							: run.phase === "dispatching"
								? "已开启，正在准备后续会话"
								: run.mode === "current_thread"
									? "已开启，当前会话持续执行"
									: "已开启，按阶段自动接续"
					: "");
	if (!message) return null;
	return (
		<div className="wb-continuous-feedback" data-blocked={blocked || !!error} role="status" data-no-drag>
			<span>{message}</span>
			{(blocked || error) && (
				<button
					type="button"
					disabled={disabled}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => {
						event.stopPropagation();
						onRetry();
					}}
				>
					重试
				</button>
			)}
		</div>
	);
}
