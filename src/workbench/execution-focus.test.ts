// Date: 2026-11-13. Follow execution starts, including starts that finish between polls.
import { expect, test } from "bun:test";
import { createScenario } from "./contract/fixtures";
import { followNewPlan, readingPositions } from "./reading-positions";

test("existing plan start switches a collapsed island, while progress polls preserve manual choice", () => {
	const previous = createScenario("multi-project").snapshot;
	if (!previous) throw Error("Fixture required");
	const target = previous.steps.find((step) => step.planKey === previous.plans[1].key);
	if (!target) throw Error("Target required");
	const route = previous.routes.find((route) => route.stepKeys.includes(target.key));
	if (!route) throw Error("Route required");
	target.status = "pending";
	const prefs = { collapsed: [], selected: previous.steps[0].key, focus: [previous.routes[0].key], scroll: {}, y: {} };
	readingPositions.set("service/multi-project", {
		selected: prefs.selected,
		route: prefs.focus[0],
		top: 10,
		lanes: {},
	});
	const running = structuredClone(previous);
	const step = running.steps.find((step) => step.key === target.key);
	if (!step) throw Error("Step required");
	step.status = "running";
	const result = followNewPlan(previous, running, prefs);
	expect(result.selected).toBe(target.key);
	expect(result.focus).toEqual([route.key]);
	expect(readingPositions.get("service/multi-project")?.route).toBe(route.key);
	const manual = { ...prefs };
	expect(followNewPlan(running, running, manual)).toBe(manual);
	const completed = structuredClone(previous);
	const done = completed.steps.find((step) => step.key === target.key);
	if (!done) throw Error("Step required");
	done.status = "completed";
	completed.events.push({
		eventId: "new-start",
		stepKey: target.key,
		executionKey: null,
		reason: "started",
		occurredAt: "2026-11-13T00:00:00Z",
		receivedAt: "2026-11-13T00:00:00Z",
		toStatus: "running",
	});
	const fast = followNewPlan(previous, completed, prefs);
	expect(fast.selected).toBe(target.key);
	expect(fast.focus).toEqual([route.key]);
	expect(followNewPlan(completed, completed, manual)).toBe(manual);
	readingPositions.clear();
});
