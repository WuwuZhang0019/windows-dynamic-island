// Date: 2026-11-12. Filters follow confirmed ownership, retain unknown history, and never fabricate connections.
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentAppTabs } from "../components/island/AgentAppTabs";
import { groupApps, matchesApp } from "./agent-apps";
import { createScenario } from "./contract/fixtures";
import { taskGroups } from "./task-groups";
import { WorkbenchView } from "./WorkbenchView";

test("applications share a task group when they own different steps and unknown history stays unassigned", () => {
	const envelope = createScenario("multi-project");
	const snapshot = envelope.snapshot;
	if (!snapshot) throw Error("Missing fixture");
	const groups = taskGroups(snapshot);
	const group = groups.find((value) => value.routes.length > 0);
	if (!group) throw Error("Missing task");
	const route = group.routes[0];
	const first = {
		key: "binding-a",
		id: null,
		projectKey: group.project.key,
		planKey: route.planKey,
		stepKeys: [route.stepKeys[0]],
		state: "confirmed",
		bindingRevision: 1,
		context: route.context,
	};
	snapshot.bindings = [first, { ...first, key: "binding-b", stepKeys: [route.stepKeys[1]] }];
	envelope.bindingApps = { "binding-a": "codex", "binding-b": "claude-code" };
	expect([...groupApps(group, envelope)].sort()).toEqual(["claude-code", "codex"]);
	expect(matchesApp(group, envelope, "codex")).toBe(true);
	expect(matchesApp(group, envelope, "claude-code")).toBe(true);
	expect(matchesApp(group, envelope, "workbuddy")).toBe(false);
	expect(matchesApp(group, envelope, "unassigned")).toBe(false);
	const unknown = { ...envelope, bindingApps: {} };
	expect(matchesApp(group, unknown, "unassigned")).toBe(true);
	expect(matchesApp(group, unknown, "codex")).toBe(false);
	const html = renderToStaticMarkup(
		<WorkbenchView
			envelope={envelope}
			selectedApp="workbuddy"
			scenario="app-filter"
			setScenario={() => {}}
			refresh={() => {}}
		/>,
	);
	expect(html).toContain("此应用暂无关联任务");
	expect(html).not.toContain("data-route-select=");
});
test("top pills retain the original icons, support independent connections, and do not show stale green dots", () => {
	const envelope = createScenario("multi-project");
	envelope.agentApps = [
		{ appId: "codex", name: "Codex", enabled: true, connected: true, lastSeenAt: null },
		{ appId: "claude-code", name: "Claude Code", enabled: true, connected: true, lastSeenAt: null },
	];
	const render = () => renderToStaticMarkup(<AgentAppTabs selected="all" onSelect={() => {}} envelope={envelope} />);
	expect(render().match(/data-connected="true"/g)).toHaveLength(2);
	expect(render()).not.toContain("任务岛");
	expect(render()).toContain("/ai-icons/openai.svg");
	expect(render()).toContain("/ai-icons/claude-color.svg");
	envelope.agentApps.push({ appId: "dsh", name: "dsh", enabled: false, connected: false, lastSeenAt: null });
	expect(render()).not.toContain('data-agent-filter="dsh"');
	envelope.connection.state = "offline";
	expect(render()).not.toContain('data-connected="true"');
});
