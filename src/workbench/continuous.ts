// Date: 2026-11-13. Native-only continuous execution control; no owner credentials in the WebView.
import { invoke } from "@tauri-apps/api/core";
export type ContinuousRun = {
	id: string;
	planKey: string;
	status: "running" | "pausing" | "paused" | "blocked" | "completed";
	stageCode: string | null;
	threadId: string | null;
	reason: string;
	completed: number;
	total: number;
};
export function checkedContinuous(value: unknown): ContinuousRun[] {
	if (value === undefined) return [];
	if (
		!Array.isArray(value) ||
		value.some(
			(r) =>
				!r ||
				typeof r.id !== "string" ||
				typeof r.planKey !== "string" ||
				!["running", "pausing", "paused", "blocked", "completed"].includes(r.status) ||
				typeof r.reason !== "string" ||
				!Number.isInteger(r.completed) ||
				!Number.isInteger(r.total),
		)
	)
		throw Error("INVALID_CONTINUOUS_RESPONSE");
	return structuredClone(value);
}
export async function changeContinuous(
	planKey: string,
	action: "start" | "pause" | "resume",
	expectedRevision: number,
) {
	const result = await invoke<{ saved: boolean }>("island_continuous_change", {
		value: { planKey, action, expectedRevision, acknowledged: true },
	});
	if (result?.saved !== true) throw Error("CONTINUOUS_RESULT_UNKNOWN");
}
