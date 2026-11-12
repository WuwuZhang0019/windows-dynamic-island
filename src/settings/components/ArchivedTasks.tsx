// Date: 2026-11-12. Archived data stays server-owned; only an explicit archived-row confirmation deletes it.
import { ArchiveIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "../../components/ui/card";
import { isTauri, onEvent } from "../../core/bridge";
import { RouteDeleteButton } from "../../workbench/RouteDeleteButton";
import { changeTaskLibrary, libraryError, readTaskLibrary } from "../../workbench/task-library";

type Library = Awaited<ReturnType<typeof readTaskLibrary>>;
export function ArchivedTasks() {
	const [library, setLibrary] = useState<Library | null>(null);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);
	const sequence = useRef(0);
	const reload = useCallback(async () => {
		const request = ++sequence.current;
		if (!isTauri) {
			setMessage("请在任务岛桌面端管理已归档任务");
			return;
		}
		try {
			const next = await readTaskLibrary();
			if (request !== sequence.current) return;
			setLibrary(next);
			setMessage("");
		} catch (error) {
			if (request === sequence.current) setMessage(libraryError(error));
		}
	}, []);
	useEffect(() => {
		void reload();
		const unlisten = onEvent("task-library-changed", () => void reload());
		const timer = setInterval(() => {
			if (!document.hidden) void reload();
		}, 10000);
		return () => {
			++sequence.current;
			unlisten();
			clearInterval(timer);
		};
	}, [reload]);
	async function change(action: "restore" | "delete", key: string) {
		if (!library || busy || library.snapshot.revision === null) return;
		setBusy(true);
		try {
			await changeTaskLibrary(action, key, library.snapshot.revision);
			setConfirmKey(null);
			await reload();
		} catch (error) {
			await reload();
			setMessage(libraryError(error));
		} finally {
			setBusy(false);
		}
	}
	return (
		<Card className="mt-1" aria-label="已归档任务">
			<div className="flex items-center gap-2 py-3">
				<ArchiveIcon size={16} className="text-text-dim" aria-hidden="true" />
				<h2 className="flex-1 text-[14px] font-semibold">已归档任务{library ? ` · ${library.archived.length}` : ""}</h2>
				<button
					type="button"
					className="rounded-md px-2 py-1 text-[12px] text-text-dim hover:bg-white/6"
					disabled={busy}
					onClick={() => void reload()}
				>
					刷新
				</button>
			</div>
			{message && (
				<p role="status" className="pb-3 text-[12px] text-text-dim">
					{message}
				</p>
			)}
			{library?.archived.length === 0 && (
				<p className="pb-4 text-[12px] text-text-faint">
					暂无已归档任务。点击任务列表末尾的归档按钮，可将任务移到这里。
				</p>
			)}
			{!library && !message && (
				<p role="status" className="pb-4 text-[12px] text-text-faint">
					正在读取归档任务…
				</p>
			)}
			<ul className="divide-y divide-hairline">
				{library?.archived.map((entry) => {
					const snapshot = library.snapshot;
					const route = snapshot.routes.find((item) => item.key === entry.key);
					const plan = snapshot.plans.find((item) => item.key === (route?.planKey ?? entry.key));
					const project = snapshot.projects.find((item) => item.key === (plan?.projectKey ?? entry.key));
					const title = route?.label ?? plan?.name ?? project?.name ?? entry.key;
					const count = snapshot.steps.filter((item) =>
						route
							? route.stepKeys.includes(item.key) || route.stepKeys.includes(item.parentKey ?? "")
							: item.planKey === plan?.key,
					).length;
					return (
						<li key={entry.key} className="py-3" data-archived-task={entry.key}>
							<div className="flex min-w-0 items-center gap-3">
								<div className="min-w-0 flex-1">
									<h3 className="truncate text-[13px] font-semibold" title={title}>
										{title}
									</h3>
									<p className="mt-1 truncate text-[11px] text-text-faint" title={project?.name}>
										{project?.name} · {count} 个步骤 · {new Date(entry.archivedAt).toLocaleDateString()}
									</p>
								</div>
								<button
									type="button"
									disabled={busy}
									className="grid size-7 shrink-0 place-items-center rounded-md text-text-dim hover:bg-white/8"
									aria-label={`恢复：${title}`}
									title="恢复到任务列表"
									onClick={() => void change("restore", entry.key)}
								>
									<RotateCcwIcon size={14} aria-hidden="true" />
								</button>
								<RouteDeleteButton title={title} disabled={busy} onDelete={() => setConfirmKey(entry.key)} />
							</div>
							{confirmKey === entry.key && (
								<div
									role="alertdialog"
									aria-label={`永久删除${title}`}
									className="mt-3 rounded-lg border border-[#ff4545]/25 bg-[#ff4545]/5 p-3 text-[12px]"
								>
									<p>
										永久删除“{title}”及其 {count} 个步骤、执行和绑定记录？此操作无法撤销。
									</p>
									<div className="mt-3 flex justify-end gap-2">
										<button
											type="button"
											disabled={busy}
											className="rounded-md px-3 py-1.5 hover:bg-white/6"
											onClick={() => setConfirmKey(null)}
										>
											取消
										</button>
										<button
											type="button"
											disabled={busy}
											className="rounded-md bg-[#bd3636] px-3 py-1.5 text-white hover:bg-[#d84343]"
											onClick={() => void change("delete", entry.key)}
										>
											{busy ? "正在处理…" : "确认删除"}
										</button>
									</div>
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</Card>
	);
}
