// Date: 2026-11-13. Companion skill guidance; installation status is not inferred.
import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { Lead, Title } from "../components/Heading";

const invocation = "请使用 workbench-handoff 技能，帮我整理这份计划，并查看当前进度。";

export function SkillPage() {
	const [message, setMessage] = useState("");
	async function copyInvocation() {
		try {
			await navigator.clipboard.writeText(invocation);
			setMessage("已复制，粘贴到 AI 对话中即可。");
		} catch {
			setMessage("复制失败，请手动选中下方语句复制。");
		}
	}
	return (
		<>
			<Title>Skill</Title>
			<Lead>让 AI 帮你整理计划、跟进任务。</Lead>
			<Card>
				<Row label="任务助手" />
				<div className="flex flex-col gap-3 pb-4 text-[13px]/relaxed text-text-dim">
					<p>整理要做的事、更新进度，也方便换一个 AI 接着做。</p>
					<p>复制下方指令，发给支持此技能的 AI，再附上你的计划。</p>
				</div>
			</Card>
			<Card>
				<Row label="怎么使用">
					<Button onClick={() => void copyInvocation()}>
						<CopyIcon size={14} />
						复制指令
					</Button>
				</Row>
				<p className="mb-4 rounded-lg bg-white/5 p-3 text-[13px]/relaxed select-text">{invocation}</p>
				{message && (
					<p role="status" className="mb-4 text-[12.5px] text-text-dim">
						{message}
					</p>
				)}
			</Card>
			<p className="text-[12.5px]/relaxed text-text-dim">
				要在任务岛里看到进度，请先到
				<Link to="/mcp" className="mx-1 text-text underline underline-offset-3">
					MCP
				</Link>
				连接你的 AI 应用。
			</p>
		</>
	);
}
