// Date: 2026-11-13. Shared reading memory updates even when the expanded panel is unmounted.
import type { Preferences, WorkbenchSnapshot } from "./contract/protocol";
export type Reading = { selected: string; route?: string; top: number; lanes: Record<string, number> };
export const readingPositions = new Map<string, Reading>();
export function followNewPlan(
	previous: WorkbenchSnapshot | null,
	next: WorkbenchSnapshot | null,
	preferences: Preferences,
): Preferences {
	if (!previous || !next) return preferences;
	const known = new Set(previous.plans.map((plan) => plan.key));
	const plan = next.plans.find((plan) => !known.has(plan.key));
	if (!plan) return preferences;
	const route = next.routes.find((route) => route.planKey === plan.key);
	const steps = next.steps.filter((step) => step.planKey === plan.key);
	const selected = steps.find((step) => step.status === "running")?.key ?? route?.stepKeys[0] ?? steps[0]?.key ?? "";
	for (const key of readingPositions.keys())
		if (key.startsWith("service/")) readingPositions.set(key, { selected, route: route?.key, top: 0, lanes: {} });
	return { ...preferences, selected, focus: route ? [route.key] : [], y: { ...preferences.y, "island/list": 0 } };
}
