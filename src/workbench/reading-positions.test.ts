// Date: 2026-11-13. New plans replace stale reading focus without resetting manual selection on ordinary polls.
import { expect, test } from "bun:test";
import { createScenario } from "./contract/fixtures";
import { followNewPlan, readingPositions } from "./reading-positions";
import { orderedTaskGroups, taskGroups } from "./task-groups";

test("new plan focuses its route while collapsed and moves ahead of saved tasks", () => {
	const before = createScenario("multi-project").snapshot;
	if (!before) throw Error("Fixture required");
	const next = structuredClone(before),
		template = next.plans[0],
		route = next.routes[0],
		step = next.steps[0];
	next.plans.unshift({ ...template, key: "new", stageKeys: ["new-step"] });
	next.steps.unshift({ ...step, key: "new-step", planKey: "new", status: "pending" });
	next.routes.unshift({
		...route,
		key: "new-route",
		planKey: "new",
		stepKeys: ["new-step"],
		sourceStepKey: null,
		returnStepKey: null,
	});
	const prefs = { collapsed: [], selected: step.key, focus: [route.key], scroll: {}, y: { "island/list": 500 } };
	readingPositions.set("service/multi-project", { selected: step.key, route: route.key, top: 500, lanes: {} });
	const result = followNewPlan(before, next, prefs);
	expect(result.selected).toBe("new-step");
	expect(result.focus).toEqual(["new-route"]);
	expect(readingPositions.get("service/multi-project")?.route).toBe("new-route");
	const groups = taskGroups(next);
	expect(
		orderedTaskGroups(
			groups,
			taskGroups(before).map((g) => g.key),
		)[0].key,
	).toBe("new");
	const manual = { ...result, selected: step.key, focus: [route.key] };
	expect(followNewPlan(next, next, manual)).toBe(manual);
	expect(followNewPlan(null, next, prefs)).toBe(prefs);
	readingPositions.clear();
});
