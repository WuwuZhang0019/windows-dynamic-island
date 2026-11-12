// Date: 2026-11-12. Icon matching is cosmetic and must allow unknown applications.
import { expect, test } from "bun:test";
import { aiIconPath, aiIcons, findAIIcon } from "./ai-icons";

test("local catalog covers common providers and application aliases without inventing unknown brands", () => {
	expect(aiIcons.length).toBeGreaterThan(80);
	expect(findAIIcon("claude-code")?.id).toBe("claudecode");
	expect(findAIIcon("custom-agent", "通义千问")?.id).toBe("qwen");
	expect(findAIIcon("totally-new-agent")).toBeUndefined();
	expect(findAIIcon("dsh")).toBeUndefined();
	const icon = findAIIcon("deepseek");
	if (!icon) throw Error("Missing icon");
	expect(aiIconPath(icon)).toMatch(/^\/ai-icons\/deepseek(-color)?\.svg$/);
	expect(new Set(aiIcons.map((entry) => entry.id)).size).toBe(aiIcons.length);
});
