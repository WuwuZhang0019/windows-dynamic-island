// Date: 2026-11-18. Archive moves a route to settings; pause saves a blocked checkpoint for active tasks.
import { ArchiveIcon, PauseIcon } from "lucide-react";
import "./route-actions.css";

export function RoutePauseButton({
	title,
	active = false,
	busy = false,
	disabled,
	onPause,
}: {
	title: string;
	active?: boolean;
	busy?: boolean;
	disabled: boolean;
	onPause: () => void;
}) {
	return (
		<button
			type="button"
			className="wb-route-pause"
			data-no-drag
			data-active={active}
			aria-busy={busy}
			aria-label={`暂停：${title}`}
			title={active ? `暂停：${title}` : `已暂停或未在执行：${title}`}
			disabled={disabled || busy || !active}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => {
				event.stopPropagation();
				onPause();
			}}
		>
			<PauseIcon size={14} aria-hidden="true" className="wb-pause-icon" />
		</button>
	);
}

export function RouteArchiveButton({
	title,
	disabled,
	onArchive,
}: {
	title: string;
	disabled: boolean;
	onArchive: () => void;
}) {
	return (
		<button
			type="button"
			className="wb-route-archive"
			aria-label={`归档：${title}`}
			title={`归档：${title}`}
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation();
				onArchive();
			}}
		>
			<ArchiveIcon size={14} aria-hidden="true" className="wb-archive-icon" />
		</button>
	);
}
