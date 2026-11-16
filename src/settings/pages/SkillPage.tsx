// Date: 2026-11-16. Companion skill guidance; installation status is not inferred.
import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { Lead, Title } from "../components/Heading";
import "../components/mcp-connections.css";

const invocation =
	"请使用 workbench-handoff 技能，读取我提供的方案，仅规范阶段、步骤编号及相关引用，不改动执行内容、依赖顺序和验收要求，并核对当前进度。";

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
				<Row label="怎么使用">
					<Button
						className="mcp-copy-button h-13 min-w-60 self-center justify-center px-9 text-base"
						onClick={() => void copyInvocation()}
					>
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
			</Card>{" "}
			<Card>
				<Row label="任务助手" />
				<div className="flex flex-col gap-3 pb-4 text-[13px]/relaxed text-text-dim">
					<p>把你的方案整理成任务岛里的执行路线，方便查看进度和继续任务。它会按以下方式运行：</p>
					<ol className="list-decimal space-y-3 pl-5">
						<li>
							<strong className="text-text">读取方案。</strong>
							识别原有阶段、步骤、先后依赖和验收要求，不把普通说明或清单误当成执行任务。
						</li>
						<li>
							<strong className="text-text">整理编号。</strong>将阶段统一为 A、B、C，步骤统一为 A-01、A-02
							等，并更新文中对应的编号引用。已登记的编号保持稳定，新增步骤单独补号。
						</li>
						<li>
							<strong className="text-text">保留执行内容。</strong>
							只整理阶段和步骤的编号、层级及相关引用，不改方案目标、具体做法、执行先后、依赖关系或验收要求，也不自行增删、拆分或合并任务。
						</li>
						<li>
							<strong className="text-text">登记与核对。</strong>连接 MCP
							后，将路线登记到任务岛，核对哪些已完成、哪些待执行。同步失败会明确提示待同步，不会把未执行的步骤记为完成。
						</li>
						<li>
							<strong className="text-text">执行与接续。</strong>需要 AI
							实际执行时，按你明确授权的范围开展工作，再根据结果更新进度；换一个 AI
							时，可提供当前进度、剩余事项和下一步指令。
						</li>
					</ol>
					<p>改动前会保留原文或可恢复版本。步骤边界或顺序不明确时，会先与你核对，再处理相关部分。</p>
				</div>
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
