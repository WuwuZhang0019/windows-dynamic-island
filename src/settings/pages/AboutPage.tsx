// Date: 2026-11-16. Friendly project support and upstream acknowledgements.
import { AppLogo, GitHubIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { command, isTauri } from "../../core/bridge";
import { useT } from "../../core/i18n";

const REPO_URL = "https://github.com/WuwuZhang0019/Codex-task-monitoring.git";
const UPSTREAM_URL = "https://github.com/HeyyCzer";
const ROADMAP_URL = "https://github.com/TomPlum/react-git-log";
export function AboutPage() {
	const t = useT();
	const openRepo = () => (isTauri ? command("open_repo") : window.open(REPO_URL, "_blank", "noopener"));
	const openUpstream = () =>
		isTauri ? command("open_external", { url: UPSTREAM_URL }) : window.open(UPSTREAM_URL, "_blank", "noopener");
	const openRoadmap = () =>
		isTauri ? command("open_external", { url: ROADMAP_URL }) : window.open(ROADMAP_URL, "_blank", "noopener");
	return (
		<>
			<div className="flex flex-col items-center gap-2.5 pt-4.5 pb-2.5 [&_svg]:drop-shadow-[0_8px_24px_rgba(143,148,255,0.18)]">
				<AppLogo size={72} />
				<div className="mt-1 text-[22px] font-bold tracking-[-0.015em]">任务岛</div>
				<span className="rounded-full bg-white/6 px-2.5 py-0.75 text-[12px] font-semibold text-text-dim tabular-nums">
					{t("settings.about.version", { version: __APP_VERSION__ })}
				</span>
			</div>
			<Card>
				<Row label="支持任务岛" desc="如果任务岛帮到了你，请在 GitHub 点个 Star，这对我们意义重大。">
					<Button onClick={openRepo}>
						<GitHubIcon size={14} />
						去点Star
					</Button>
				</Row>
				<Row label={t("settings.about.updates.label")} desc="更新暂不可用：自有发布源尚未配置" />
				<Row label="致谢" desc="HeyyCzer · Windows Dynamic Island">
					<Button
						onClick={openUpstream}
						aria-label="访问 HeyyCzer 的 GitHub"
						title="访问 HeyyCzer 的 GitHub"
						className="px-3"
					>
						<GitHubIcon size={18} />
					</Button>
				</Row>
				<Row label="路线图致谢" desc="TomPlum · React Git Log · 路线图绘制参考与源码改造来源">
					<Button
						onClick={openRoadmap}
						aria-label="访问 React Git Log 的 GitHub"
						title="访问 React Git Log 的 GitHub"
						className="px-3"
					>
						<GitHubIcon size={18} />
					</Button>
				</Row>
			</Card>
		</>
	);
}
