import { PinIcon, SettingsIcon } from "lucide-react";
import { motion } from "motion/react";
import { tv } from "tailwind-variants";
import { command } from "../../core/bridge";
import { useT } from "../../core/i18n";
import { TaskSizeToggle } from "./TaskSizeToggle";

const controls = tv({
	slots: {
		base: "relative mb-2.5 flex gap-1 pr-9.5",
		gear: "grid size-7.5 place-items-center rounded-full text-text-faint transition-colors duration-200 hover:bg-white/8 hover:text-text",
		pin: "absolute top-1/2 right-0 grid size-7.5 -translate-y-1/2 place-items-center rounded-full text-text-faint transition-colors duration-200 hover:bg-white/8 hover:text-text",
	},
	variants: {
		pinned: { true: { pin: "bg-white/10 text-text" } },
		bottom: { true: { base: "m-0 mt-2 justify-center px-9.5", gear: "ml-1.5" } },
	},
});

/** Date: 2026-11-12. Display size, settings and pin controls for the fixed workbench. */
export function Tabs({ bottom, pinned, onPin }: { bottom: boolean; pinned: boolean; onPin: (value: boolean) => void }) {
	const t = useT();
	const s = controls({ bottom });
	return (
		<div className={s.base()} data-no-drag data-island-controls>
			<span className="mr-auto flex items-center text-sm text-text-dim">任务岛</span>
			<TaskSizeToggle />
			<motion.button
				type="button"
				className={s.gear()}
				title={t("island.settings")}
				aria-label={t("island.settings")}
				whileHover={{ rotate: 45 }}
				whileTap={{ scale: 0.85 }}
				transition={{ type: "spring", stiffness: 300, damping: 15 }}
				onClick={(event) => {
					event.stopPropagation();
					command("open_settings");
				}}
			>
				<SettingsIcon size={16} />
			</motion.button>
			<motion.button
				type="button"
				className={s.pin({ pinned })}
				title={t(pinned ? "island.unpin" : "island.pin")}
				aria-label={t(pinned ? "island.unpin" : "island.pin")}
				aria-pressed={pinned}
				whileTap={{ scale: 0.85 }}
				onClick={(event) => {
					event.stopPropagation();
					const target = event.currentTarget;
					command("focus_island").then(() => target.focus());
					onPin(!pinned);
				}}
			>
				<motion.span
					className="grid place-items-center"
					initial={false}
					animate={{ rotate: pinned ? 0 : 45 }}
					transition={{ type: "spring", stiffness: 300, damping: 18 }}
				>
					<PinIcon size={15} fill={pinned ? "currentColor" : "none"} />
				</motion.span>
			</motion.button>
		</div>
	);
}
