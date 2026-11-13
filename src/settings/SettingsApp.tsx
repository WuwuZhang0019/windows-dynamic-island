import {
	BookOpenIcon,
	Grid2X2Icon,
	InfoIcon,
	MousePointerClickIcon,
	PaletteIcon,
	PlayIcon,
	PlugIcon,
	SettingsIcon,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { useSyncLocale, useT } from "../core/i18n";
import { useSettings, useSettingsError } from "../core/settings";
import { NavItem, NavSection } from "./components/NavItem";
import { TitleBar } from "./components/TitleBar";
import { AboutPage } from "./pages/AboutPage";
import { AppearancePage } from "./pages/AppearancePage";
import { BehaviorPage } from "./pages/BehaviorPage";
import { ContinuousPage } from "./pages/ContinuousPage";
import { GeneralPage } from "./pages/GeneralPage";
import { ModulesPage } from "./pages/ModulesPage";
import { SkillPage } from "./pages/SkillPage";
import { WorkbenchPage } from "./pages/WorkbenchPage";

/**
 * Date: 2026-11-12. MCP connection and Skill guidance have separate settings pages.
 */
export function SettingsApp() {
	const values = useSettings();
	const settingsError = useSettingsError();
	const t = useT();
	useSyncLocale();

	return (
		<MemoryRouter>
			<div className="flex h-full flex-col" data-settings>
				<TitleBar />
				{settingsError && (
					<div role="alert" className="bg-amber-950 px-4 py-2 text-sm text-amber-100">
						{settingsError}
					</div>
				)}
				<div className="flex min-h-0 flex-1">
					<nav className="flex w-53 flex-none flex-col gap-0.5 px-2.5 pt-2 pb-4">
						<NavSection label={t("settings.section.app")} />
						<NavItem to="/" icon={<SettingsIcon size={15} />} label={t("settings.general")} />
						<NavItem to="/appearance" icon={<PaletteIcon size={15} />} label={t("appearance.title")} />
						<NavItem to="/behavior" icon={<MousePointerClickIcon size={15} />} label={t("behavior.title")} />
						<NavSection label={t("settings.section.island")} />
						<NavItem to="/modules" icon={<Grid2X2Icon size={15} />} label="已归档任务" />
						<NavItem to="/continuous" icon={<PlayIcon size={15} />} label="连续执行" />
						<NavItem to="/mcp" icon={<PlugIcon size={15} />} label="MCP" />
						<NavItem to="/skill" icon={<BookOpenIcon size={15} />} label="Skill" />
						<div className="flex-1" />
						<NavItem to="/about" icon={<InfoIcon size={15} />} label={t("settings.about.title")} />
					</nav>
					<main className="min-w-0 flex-1 overflow-y-auto rounded-tl-xl bg-[#121217] shadow-[inset_1px_1px_0_var(--hairline)] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-3 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/12 [&::-webkit-scrollbar-thumb]:bg-clip-padding">
						<Page>
							<Routes>
								<Route index element={<GeneralPage values={values} />} />
								<Route path="appearance" element={<AppearancePage values={values} />} />
								<Route path="behavior" element={<BehaviorPage values={values} />} />
								<Route path="modules" element={<ModulesPage />} />
								<Route path="continuous" element={<ContinuousPage values={values} />} />
								<Route path="mcp" element={<WorkbenchPage />} />
								<Route path="workbench" element={<Navigate to="/mcp" replace />} />
								<Route path="skill" element={<SkillPage />} />
								<Route path="about" element={<AboutPage />} />
								<Route path="*" element={<GeneralPage values={values} />} />
							</Routes>
						</Page>
					</main>
				</div>
			</div>
		</MemoryRouter>
	);
}

/** Fades each page in when the route changes. */
function Page({ children }: { children: ReactNode }) {
	const { pathname } = useLocation();
	return (
		<motion.div
			key={pathname}
			className="mx-auto flex max-w-170 flex-col gap-3.5 px-9 pt-7 pb-10 select-text"
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
		>
			{children}
		</motion.div>
	);
}
