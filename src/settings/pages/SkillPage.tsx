// Date: 2026-11-16. Companion skill guidance; installation status is not inferred.
import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { Lead, Title } from "../components/Heading";
import "../components/mcp-connections.css";

const invocation =
	"请使用 $workbench-handoff 技能，读取我提供的方案并自动登记到任务岛。步骤尚未明确时先显示各线标题起点，实际步骤明确后逐项向右追加；已做事项按证据补录，调试和重试复用原节点。保留原方案的明确步骤、依赖和验收；已有登记复用原进度。先登记并回读路线，不自动开始执行。";

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
			<Lead>发送方案文档，调用技能，让任务岛先显示待执行路线。</Lead>
			<Card>
				<Row label="发送方案文档，并把以下指令发给 AI">
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
					<p>
						在 AI
						对话中附上方案文档，再发送上面的指令。技能会优先把方案登记为待执行路线，不需要你手工建项目或额外要求接入。它会按以下方式运行：
					</p>
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
							<strong className="text-text">先显示待执行路线。</strong>
							先登记并回读。步骤尚未明确时显示左侧标题起点，实际步骤明确后逐项向右追加；保留已明确步骤，未知未来事项不预造。
						</li>
						<li>
							<strong className="text-text">执行与接续。</strong>需要 AI
							实际执行时，按你明确授权的范围开展工作，开始时显示执行中，完成后更新原节点；调试和重试不重复加点。已做事项按证据补录，不能确认的显示待核验。换一个
							AI 时，可提供当前进度、剩余事项和下一步指令。
						</li>
					</ol>
					<p>
						提供方案并调用技能只会先登记路线，不会自动开始执行。方案解析和登记需要一定时间；步骤或依赖不明确时，会说明具体缺项，不会擅自编造。
					</p>
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
