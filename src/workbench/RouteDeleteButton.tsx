// Date: 2026-11-12. Adapted from Uiverse.io by vinodjangid07, smart-emu-83 (MIT).
// The original license is retained in THIRD-PARTY-NOTICES.txt.
import "./route-actions.css";
export function RouteDeleteButton({
	title,
	disabled,
	onDelete,
}: {
	title: string;
	disabled?: boolean;
	onDelete: () => void;
}) {
	return (
		<button
			type="button"
			className="wb-route-delete"
			disabled={disabled}
			aria-label={`删除：${title}`}
			title={`删除：${title}`}
			onClick={(event) => {
				event.stopPropagation();
				onDelete();
			}}
		>
			<svg viewBox="0 0 448 512" aria-hidden="true" className="wb-delete-icon">
				<path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z" />
			</svg>
		</button>
	);
}
