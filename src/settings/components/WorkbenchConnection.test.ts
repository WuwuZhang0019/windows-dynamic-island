// Date: 2026-11-12. Authorization summary must expose the exact loaded scope and fail closed.
import { expect, test } from "bun:test";
import { readBindingSummary } from "./WorkbenchConnection";

test("binding summary shows the loaded project, session, worktree and exact step count", () => {
	const raw = {
		principal: "principal",
		input: {
			action: "confirm",
			projectId: "project-id",
			context: { threadId: "thread-id", worktreePath: "G:/rust/repository", branch: "main" },
			stepIds: ["step-one", "step-two"],
			expectedRevision: 23,
		},
	};
	expect(readBindingSummary(JSON.stringify(raw))).toEqual({
		projectId: "project-id",
		threadId: "thread-id",
		worktreePath: "G:/rust/repository",
		branch: "main",
		stepCount: 2,
		revision: 23,
	});
});
test("incomplete or malformed scope has no confirmable summary", () => {
	for (const raw of [
		"invalid JSON",
		"null",
		"{}",
		JSON.stringify({
			input: {
				action: "confirm",
				projectId: "p",
				context: { threadId: "t", worktreePath: "G:/repo", branch: "main" },
				stepIds: ["s"],
				expectedRevision: -1,
			},
		}),
	])
		expect(readBindingSummary(raw)).toBeNull();
});
