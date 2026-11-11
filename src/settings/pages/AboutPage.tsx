import { AppLogo, GitHubIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { command, isTauri } from "../../core/bridge";
import { useT } from "../../core/i18n";

const REPO_URL = "https://github.com/WuwuZhang0019/windows-dynamic-island";
const UPSTREAM_URL = "https://github.com/HeyyCzer/windows-dynamic-island";
export function AboutPage() {
	const t = useT();
	const openRepo = () => (isTauri ? command("open_repo") : window.open(REPO_URL, "_blank", "noopener"));
	const openUpstream = () =>
		isTauri ? command("open_external", { url: UPSTREAM_URL }) : window.open(UPSTREAM_URL, "_blank", "noopener");
	return (
		<>
			<div className="flex flex-col items-center gap-2.5 pt-4.5 pb-2.5 [&_svg]:drop-shadow-[0_8px_24px_rgba(143,148,255,0.18)]">
				<AppLogo size={72} />
				<div className="mt-1 text-[22px] font-bold tracking-[-0.015em]">Island Workbench</div>
				<span className="rounded-full bg-white/6 px-2.5 py-0.75 text-[12px] font-semibold text-text-dim tabular-nums">
					{t("settings.about.version", { version: __APP_VERSION__ })}
				</span>
			</div>
			<Card>
				<Row label={t("settings.about.source")} desc={REPO_URL.replace("https://", "")}>
					<Button onClick={openRepo}>
						<GitHubIcon size={14} />
						GitHub
					</Button>
				</Row>
				<Row label={t("settings.about.updates.label")} desc="更新暂不可用：自有发布源尚未配置" />
				<Row
					label={t("settings.about.license")}
					desc="GPL-3.0-or-later · © HeyyCzer / Vorssaint · 修改日期：2026-11-11"
				>
					<Button onClick={openUpstream}>上游来源</Button>
				</Row>
			</Card>
		</>
	);
}
