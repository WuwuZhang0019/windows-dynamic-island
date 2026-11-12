// Date: 2026-11-12. A saved setting is not a live connection; buttons expose four truthful states.
import { expect, test } from "bun:test";
import { connectionPresentation } from "./WorkbenchConnection";

test("only a live lease produces a green connection button", () => {
	for (const state of [
		"disabled",
		"waiting",
		"checking",
		"disconnected",
		"legacy",
		"unavailable",
		"preview",
	] as const) {
		expect(connectionPresentation({ state }).tone).not.toBe("connected");
	}
	expect(connectionPresentation({ state: "connected" })).toMatchObject({ tone: "connected", enabled: false });
});
test("gray connects, yellow cancels, red retries, and pending commands remain yellow", () => {
	for (const state of ["disabled", "legacy", "preview"] as const) {
		expect(connectionPresentation({ state })).toMatchObject({ tone: "idle", enabled: true });
	}
	for (const state of ["checking", "waiting"] as const) {
		expect(connectionPresentation({ state })).toMatchObject({ tone: "connecting", enabled: false });
	}
	for (const state of ["disconnected", "unavailable"] as const) {
		expect(connectionPresentation({ state })).toMatchObject({ tone: "failed", enabled: true });
	}
	expect(connectionPresentation({ state: "connected", enabled: true }, true).tone).toBe("connecting");
});
