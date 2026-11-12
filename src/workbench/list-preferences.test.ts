// Date: 2026-11-12. Preserve local order through live route additions and config reloads.
import { describe, expect, test } from "bun:test";
import { shellPreferences } from "../core/settings";
import { orderedTasks, TASK_ORDER_KEY, TASK_SIZE_KEY, taskOrder, taskSize } from "./list-preferences";

describe("task list preferences", () => {
	test("route refreshes keep saved order, ignore removed routes and append new ones", () => {
		const entries = [{ key: "a" }, { key: "b" }, { key: "new" }];
		expect(orderedTasks(entries, ["deleted", "b", "a"]).map((entry) => entry.key)).toEqual(["b", "a", "new"]);
		expect(entries.map((entry) => entry.key)).toEqual(["a", "b", "new"]);
	});
	test("size and order survive the config allowlist without restoring old modules", () => {
		const loaded = shellPreferences({
			[TASK_SIZE_KEY]: "small",
			[TASK_ORDER_KEY]: ["b", "a"],
			"module.music.enabled": true,
		});
		expect(taskSize(loaded)).toBe("small");
		expect(taskOrder(loaded)).toEqual(["b", "a"]);
		expect(loaded["module.music.enabled"]).toBeUndefined();
	});
	test("invalid preferences fall back safely and cannot duplicate tasks", () => {
		expect(taskSize({ [TASK_SIZE_KEY]: "unexpected" })).toBe("large");
		expect(taskOrder({ [TASK_ORDER_KEY]: ["b", null, "", "b", "a"] })).toEqual(["b", "a"]);
	});
});
