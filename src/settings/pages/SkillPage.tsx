// Date: 2026-11-12. Companion skill guidance; installation status is not inferred.
import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { Lead, Title } from "../components/Heading";

const invocation = "请使用 workbench-handoff 技能，读取我指定的方案，核对路线与当前进度。";

export function SkillPage() {
	const [message, setMessage] = useState("");
	async function copyInvocation() {
		try {
			await navigator.clipboard.writeText(invocation);
			setMessage("已复制，可粘贴到执行聊天中使用。");
		} catch {
			setMessage("复制失败，请手动选中下方语句复制。");
		}
	}
	return (
		<>
			<Title>Skill</Title>
			<Lead>让 AI 按约定登记路线、同步进度与交接任务。</Lead>
			<Card>
				<Row label="路线执行与交接" desc="配套技能：workbench-handoff" />
				<div className="flex flex-col gap-3 pb-4 text-[13px]/relaxed text-text-dim">
					<p>用于将指定方案整理为路线，关联执行聊天与工作树，并在执行后同步阶段状态、核对进度和生成交接指令。</p>
					<p>在已提供此技能的 AI 聊天中调用，并说明方案文件及本次任务范围。</p>
				</div>
			</Card>
			<Card>
				<Row label="调用方式">
					<Button onClick={() => void copyInvocation()}>
						<CopyIcon size={14} />
						复制调用语句
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
				MCP 提供工具与服务连接，Skill 说明如何组织任务与使用这些工具。需要同步到任务岛时，先在
				<Link to="/mcp" className="mx-1 text-text underline underline-offset-3">
					MCP
				</Link>
				页面开启对应应用的连接，聊天和工作目录会自动关联。
			</p>
		</>
	);
}
