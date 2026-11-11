// Date: 2026-11-12. No authorization runs until the user explicitly confirms and submits.
import { useState } from "react";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/form";
import { command, isTauri } from "../../core/bridge";

const button = "rounded-lg bg-white/10 px-3 py-2 text-sm disabled:opacity-40";
function failure(error: unknown) {
	const code = String(error);
	if (/UNKNOWN|RESTORE_FAILED/.test(code))
		return "提交或恢复结果尚未确认。请保留当前信息，不要重复签发；先核对原授权及本机备份。";
	if (/GRANT_REVOKED/.test(code)) return "连接配置保存失败，本次新授权已撤销，原配置已恢复。";
	if (/BUSY/.test(code)) return "另一项连接操作正在处理，请稍后核对结果。";
	if (/REJECTED_403|UNAUTHORIZED/.test(code)) return "当前管理连接未获授权，请确认独立服务正常运行。";
	if (/REJECTED_409/.test(code)) return "方案或绑定版本已变化，请重新准备并审阅最新绑定内容。";
	if (/BINDING_CONFIRMATION_SAVE_FAILED/.test(code))
		return "绑定确认凭据已签发但未保存，尚不能继续；请核对本机连接目录。";
	return "操作未完成。请检查独立服务、填写内容及本机连接目录权限。";
}
type BindingSummary = {
	projectId: string;
	threadId: string;
	worktreePath: string;
	branch: string;
	stepCount: number;
	revision: number;
};
export function readBindingSummary(raw: string): BindingSummary | null {
	try {
		const value = JSON.parse(raw);
		const input = value?.input;
		const context = input?.context;
		if (
			input?.action !== "confirm" ||
			[input?.projectId, context?.threadId, context?.worktreePath, context?.branch].some(
				(x) => typeof x !== "string" || !x.trim(),
			) ||
			!Array.isArray(input.stepIds) ||
			!input.stepIds.length ||
			input.stepIds.some((x: unknown) => typeof x !== "string" || !x) ||
			!Number.isSafeInteger(input.expectedRevision) ||
			input.expectedRevision < 0
		)
			return null;
		return {
			projectId: input.projectId,
			threadId: context.threadId,
			worktreePath: context.worktreePath,
			branch: context.branch,
			stepCount: input.stepIds.length,
			revision: input.expectedRevision,
		};
	} catch {
		return null;
	}
}
export function WorkbenchConnection() {
	const [projectKey, setProjectKey] = useState("");
	const [threadId, setThreadId] = useState("");
	const [hostId, setHostId] = useState("local");
	const [worktreeRoot, setWorktreeRoot] = useState("");
	const [accepted, setAccepted] = useState(false);
	const [bindingAccepted, setBindingAccepted] = useState(false);
	const [binding, setBinding] = useState("");
	const [busy, setBusy] = useState(false);
	const [resultUncertain, setResultUncertain] = useState(false);
	const [message, setMessage] = useState("");
	const bindingSummary = readBindingSummary(binding);
	async function authorize() {
		if (!isTauri || !accepted || busy || resultUncertain) return;
		setBusy(true);
		try {
			const result = await command<{ principal: string; configPath: string }>("island_workbench_authorize_connection", {
				value: { projectKey, threadId, hostId, worktreeRoot, acknowledged: true },
			});
			setMessage(`连接授权已保存。主体：${result.principal}；配置：${result.configPath}`);
			setAccepted(false);
		} catch (error) {
			setMessage(failure(error));
			setAccepted(false);
			setBindingAccepted(false);
			if (/UNKNOWN|RESTORE_FAILED|BINDING_CONFIRMATION_SAVE_FAILED/.test(String(error))) setResultUncertain(true);
		} finally {
			setBusy(false);
		}
	}
	async function confirm() {
		if (!isTauri || !bindingAccepted || !bindingSummary || busy || resultUncertain) return;
		let value: unknown;
		try {
			value = JSON.parse(binding);
		} catch {
			setMessage("绑定内容不是有效 JSON，请重新核对全文。");
			return;
		}
		setBusy(true);
		try {
			const result = await command<{ saved: boolean; filePath: string; principal: string; eventId: string }>(
				"island_workbench_confirm_binding",
				{ value, acknowledged: true },
			);
			setMessage(
				`绑定确认已保存。事件：${result.eventId}；位置：${result.filePath}。执行聊天需按原事件及有效期继续完成绑定。`,
			);
			setBindingAccepted(false);
		} catch (error) {
			setMessage(failure(error));
			setAccepted(false);
			setBindingAccepted(false);
			if (/UNKNOWN|RESTORE_FAILED|BINDING_CONFIRMATION_SAVE_FAILED/.test(String(error))) setResultUncertain(true);
		} finally {
			setBusy(false);
		}
	}
	async function loadBinding() {
		if (!isTauri || busy) return;
		setBusy(true);
		try {
			const value = await command<Record<string, unknown>>("island_workbench_pending_binding");
			setBinding(JSON.stringify(value, null, 2));
			setBindingAccepted(false);
			setMessage("已载入本机待确认绑定，请阅读全文后决定是否签发。");
		} catch {
			setMessage("本机尚无有效待确认绑定，请由执行聊天准备，或在下方粘贴完整内容。");
		} finally {
			setBusy(false);
		}
	}
	return (
		<Card>
			<details className="p-4 text-sm" data-workbench-connection>
				<summary className="cursor-pointer font-medium">工作台连接与绑定确认</summary>
				{!isTauri ? (
					<p className="mt-3 text-text-dim">浏览器预览无法签发授权，请使用桌面设置。</p>
				) : (
					<div className="mt-4 flex flex-col gap-4">
						<p className="text-text-dim">
							连接独立工作台服务，无需旧工作台。只向下方项目、会话及工作树授权；确认前请核对各项范围。
						</p>
						<form
							className="flex flex-col gap-3"
							onSubmit={(event) => {
								event.preventDefault();
								void authorize();
							}}
						>
							<label htmlFor="workbench-project-key" className="flex flex-col gap-1">
								项目关联键
								<Input
									id="workbench-project-key"
									required
									value={projectKey}
									disabled={busy}
									onChange={(e) => {
										setProjectKey(e.target.value);
										setAccepted(false);
									}}
								/>
							</label>
							<label htmlFor="workbench-thread-id" className="flex flex-col gap-1">
								执行聊天 ID
								<Input
									id="workbench-thread-id"
									required
									value={threadId}
									disabled={busy}
									onChange={(e) => {
										setThreadId(e.target.value);
										setAccepted(false);
									}}
								/>
							</label>
							<label htmlFor="workbench-host-id" className="flex flex-col gap-1">
								宿主 ID
								<Input
									id="workbench-host-id"
									required
									value={hostId}
									disabled={busy}
									onChange={(e) => {
										setHostId(e.target.value);
										setAccepted(false);
									}}
								/>
							</label>
							<label htmlFor="workbench-worktree-root" className="flex flex-col gap-1">
								工作树绝对路径
								<Input
									id="workbench-worktree-root"
									required
									value={worktreeRoot}
									disabled={busy}
									onChange={(e) => {
										setWorktreeRoot(e.target.value);
										setAccepted(false);
									}}
								/>
							</label>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={accepted}
									disabled={busy}
									onChange={(e) => setAccepted(e.target.checked)}
								/>
								我已核对以上范围，确认签发此连接授权
							</label>
							<button type="submit" className={button} disabled={busy || resultUncertain || !accepted}>
								签发并保存连接授权
							</button>
						</form>
						<hr className="border-white/10" />
						<p className="text-text-dim">
							绑定确认仅适用于执行聊天准备的这一份完整内容。不会修改项目状态；确认凭据仅保存在本机，不展示或复制到聊天。
						</p>
						<button type="button" className={button} disabled={busy} onClick={() => void loadBinding()}>
							载入本机待确认绑定
						</button>
						{bindingSummary ? (
							<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-white/5 p-3" data-binding-summary>
								<dt>项目 ID</dt>
								<dd className="break-all">{bindingSummary.projectId}</dd>
								<dt>执行聊天</dt>
								<dd className="break-all">{bindingSummary.threadId}</dd>
								<dt>工作树</dt>
								<dd className="break-all">{bindingSummary.worktreePath}</dd>
								<dt>分支</dt>
								<dd className="break-all">{bindingSummary.branch}</dd>
								<dt>关联步骤</dt>
								<dd>{bindingSummary.stepCount} 个</dd>
								<dt>服务版本</dt>
								<dd>{bindingSummary.revision}</dd>
							</dl>
						) : (
							<p className="text-text-dim">请载入待确认绑定，核对项目、会话、工作树和步骤范围后再确认。</p>
						)}
						<details>
							<summary className="cursor-pointer text-text-dim">查看完整内容（高级）</summary>
							<label className="flex flex-col gap-1">
								完整绑定内容（principal 与 input）
								<textarea
									className="min-h-64 rounded-lg bg-white/8 p-3 font-mono text-xs select-text"
									value={binding}
									disabled={busy}
									onChange={(e) => {
										setBinding(e.target.value);
										setBindingAccepted(false);
									}}
									spellCheck={false}
								/>
							</label>
						</details>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={bindingAccepted}
								disabled={busy || !bindingSummary || resultUncertain}
								onChange={(e) => setBindingAccepted(e.target.checked)}
							/>
							我已核对上述范围，确认此会话、工作树及步骤绑定
						</label>
						<button
							type="button"
							className={button}
							disabled={busy || resultUncertain || !bindingAccepted || !bindingSummary}
							onClick={() => void confirm()}
						>
							签发并保存绑定确认
						</button>
						{resultUncertain && (
							<p className="text-text-dim">
								本次提交结果待核对，当前设置页已停止新的签发操作。请先核对原授权、原事件或本机备份后再接续。
							</p>
						)}
						{message && (
							<p role="status" className="break-all text-text-dim">
								{message}
							</p>
						)}
					</div>
				)}
			</details>
		</Card>
	);
}
