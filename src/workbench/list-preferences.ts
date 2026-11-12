// Date: 2026-11-12. Local presentation preferences never change service route order.
import type { Values } from "../core/settings";

export const TASK_SIZE_KEY = "tasks.displaySize";
export const TASK_ORDER_KEY = "tasks.routeOrder";
export type TaskSize = "large" | "small";

export function taskSize(values: Values): TaskSize {
	return values[TASK_SIZE_KEY] === "small" ? "small" : "large";
}
export function taskOrder(values: Values): string[] {
	const value = values[TASK_ORDER_KEY];
	return Array.isArray(value)
		? [...new Set(value.filter((key): key is string => typeof key === "string" && !!key))]
		: [];
}
export function orderedTasks<T extends { key: string }>(entries: T[], order: string[]): T[] {
	const ranks = new Map(order.map((key, index) => [key, index]));
	return [...entries].sort((a, b) => (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity));
}
