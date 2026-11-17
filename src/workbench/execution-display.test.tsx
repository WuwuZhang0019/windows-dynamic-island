// Date: 2026-11-17. Distinguish aggregate progress from executing work in every roadmap view.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createScenario } from "./contract/fixtures";
import { GroupRouteGraph } from "./GroupRouteGraph";
import { executingStepKeys, layoutRoutes } from "./task-groups";
import { WorkbenchSummary } from "./WorkbenchView";

function fixture() {
	const envelope = createScenario("long-route");
	const snapshot = envelope.snapshot;
	if (!snapshot) throw Error("Missing fixture");
	const base = snapshot.steps[0];
	snapshot.steps = [
		{ ...base, key: "I", code: "I", parentKey: null, status: "running", dependsOn: [] },
		{ ...base, key: "I-04", code: "I-04", parentKey: "I", status: "running", dependsOn: [] },
		{ ...base, key: "I-04-01", code: "I-04-01", parentKey: "I-04", status: "completed", dependsOn: [] },
		{ ...base, key: "I-04-02", code: "I-04-02", parentKey: "I-04", status: "pending", dependsOn: [] },
	];
	snapshot.routes = [{ ...snapshot.routes[0], stepKeys: ["I"], sourceStepKey: null, returnStepKey: null }];
	return { envelope, snapshot };
}

describe("execution display", () => {
	test("running parents keep their real state while only the executing package animates", () => {
		const { envelope, snapshot } = fixture();
		const original = JSON.stringify(snapshot);
		expect([...executingStepKeys(snapshot.steps)]).toEqual(["I-04"]);
		for (const compact of [false, true]) {
			const html = renderToStaticMarkup(
				<GroupRouteGraph
					layout={layoutRoutes(snapshot.routes, snapshot.steps)}
					compact={compact}
					selectedKey=""
					selectedRouteKey=""
					onSelect={() => {}}
				/>,
			);
			expect(html).toContain('data-step-key="I" data-status="running" data-executing="false"');
			expect(html).toContain('data-step-key="I-04" data-status="running" data-executing="true"');
			expect(html).toContain("I ");
			expect(html).toContain("进行中");
			expect(html).toContain("执行中");
		}
		const summary = renderToStaticMarkup(<WorkbenchSummary envelope={envelope} />);
		expect(summary).toContain('data-step-key="I" data-status="running" data-current="false" data-executing="false"');
		expect(summary).toContain('data-step-key="I-04" data-status="running" data-current="true" data-executing="true"');
		expect(JSON.stringify(snapshot)).toBe(original);
	});

	test("execution moves to nested phases and returns to the package without inventing a running pending phase", () => {
		const { snapshot } = fixture();
		snapshot.steps[3].status = "running";
		expect([...executingStepKeys(snapshot.steps)]).toEqual(["I-04-02"]);
		snapshot.steps[3].status = "completed";
		expect([...executingStepKeys(snapshot.steps)]).toEqual(["I-04"]);
		snapshot.steps[1].status = "completed";
		expect([...executingStepKeys(snapshot.steps)]).toEqual([]);
		snapshot.steps[1].status = "blocked";
		expect([...executingStepKeys(snapshot.steps)]).toEqual([]);
	});

	test("independent executing siblings remain visible and broken parent cycles terminate", () => {
		const { snapshot } = fixture();
		snapshot.steps.push({ ...snapshot.steps[1], key: "I-05" });
		expect([...executingStepKeys(snapshot.steps)]).toEqual(["I-04", "I-05"]);
		snapshot.steps[0].parentKey = "I-04";
		expect(() => executingStepKeys(snapshot.steps)).not.toThrow();
	});
});
