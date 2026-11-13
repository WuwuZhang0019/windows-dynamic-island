// Date: 2026-11-13. User intent, execution failures and completion must render as different states.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContinuousButton, ContinuousFeedback } from "./ContinuousButton";
import { type ContinuousRun, checkedContinuous, continuousEnabled } from "./continuous";

const base: ContinuousRun = {
	id: "run",
	planKey: "plan",
	status: "running",
	stageCode: "A",
	threadId: "chat",
	reason: "",
	completed: 0,
	total: 3,
};

describe("continuous execution feedback", () => {
	test("a blocked run retains the enabled intent and exposes its reason and retry action", () => {
		const run: ContinuousRun = { ...base, status: "blocked", enabled: true, reason: "工作目录不存在" };
		const button = renderToStaticMarkup(
			<ContinuousButton title="测试" run={run} disabled={false} onToggle={() => {}} />,
		);
		const message = renderToStaticMarkup(<ContinuousFeedback run={run} disabled={false} onRetry={() => {}} />);
		expect(button).toContain('aria-checked="true"');
		expect(button).toContain("接续受阻");
		expect(message).toContain("工作目录不存在");
		expect(message).toContain("重试");
	});
	test("completed plans cannot look enabled or accept another dispatch, even with stale enabled metadata", () => {
		const run: ContinuousRun = { ...base, status: "completed", enabled: true };
		const button = renderToStaticMarkup(
			<ContinuousButton title="测试" run={run} disabled={false} onToggle={() => {}} />,
		);
		expect(continuousEnabled(run)).toBe(false);
		expect(button).toContain('aria-checked="false"');
		expect(button).toContain("disabled");
		expect(button).toContain("已完成");
	});
	test("waiting and request failures are visible without relying on hover", () => {
		const waiting = renderToStaticMarkup(
			<ContinuousFeedback run={{ ...base, phase: "waiting" }} disabled={false} onRetry={() => {}} />,
		);
		const rejected = renderToStaticMarkup(
			<ContinuousFeedback error="方案原文已变化，请核对版本" disabled={false} onRetry={() => {}} />,
		);
		expect(waiting).toContain("等待当前阶段验收通过后接续");
		expect(rejected).toContain("方案原文已变化，请核对版本");
		expect(rejected).toContain("重试");
	});
	test("old service replies stay compatible while unknown execution modes or phases are rejected", () => {
		expect(checkedContinuous([base])).toEqual([base]);
		expect(continuousEnabled(base)).toBe(true);
		expect(continuousEnabled({ ...base, status: "pausing" })).toBe(false);
		for (const invalid of [{ mode: "unknown" }, { phase: "unknown" }, { enabled: "true" }]) {
			expect(() => checkedContinuous([{ ...base, ...invalid }])).toThrow("INVALID_CONTINUOUS_RESPONSE");
		}
	});
});
