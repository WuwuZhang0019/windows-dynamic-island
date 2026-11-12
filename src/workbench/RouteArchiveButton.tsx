// Date: 2026-11-12. Archive moves a route to settings without discarding its data.
import { ArchiveIcon } from "lucide-react";
import "./route-actions.css";
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
			<ArchiveIcon size={14} aria-hidden="true" />
		</button>
	);
}
