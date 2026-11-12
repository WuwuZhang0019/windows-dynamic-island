// Date: 2026-11-12. Only a live Codex MCP lease may produce the connected presentation.
import { expect, test } from "bun:test";
import { type ConnectionStatus, connectionPresentation } from "./WorkbenchConnection";

test("enabled service and saved configuration do not imply a Codex connection", () => {
	for (const state of ["disabled", "waiting", "disconnected", "legacy", "unavailable", "preview"] as const) {
		expect(connectionPresentation({ state }).title).not.toBe("已连接 Codex");
	}
	expect(connectionPresentation({ state: "connected" }).title).toBe("已连接 Codex");
});
test("one action opens automatic connection and can revoke it", () => {
	for (const state of ["disabled", "legacy", "unavailable"] as const) {
		expect(connectionPresentation({ state }).enabled).toBe(true);
	}
	for (const state of ["connected", "waiting", "disconnected"] as const) {
		expect(connectionPresentation({ state } as ConnectionStatus).enabled).toBe(false);
	}
});
