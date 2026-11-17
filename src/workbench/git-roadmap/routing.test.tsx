// Date: 2026-11-17. Reproduce smooth bypass shoulders and vertical joins beside captions.
import { expect, test } from "bun:test";
import { createScenario } from "../contract/fixtures";
import type { RouteGraphLayout } from "../task-groups";
import { roadmapGeometry } from "./geometry";

function fixture(): RouteGraphLayout {
	const base = createScenario("long-route").snapshot?.steps[0];
	if (!base) throw Error("Missing fixture");
	return {
		columns: 5,
		lanes: 2,
		nodes: [
			{ step: { ...base, key: "C-01" }, routeKeys: ["core"], column: 0, lane: 0 },
			{ step: { ...base, key: "H-02" }, routeKeys: ["host"], column: 1, lane: 0 },
			{ step: { ...base, key: "H-03" }, routeKeys: ["host"], column: 2, lane: 0 },
			{ step: { ...base, key: "C-02" }, routeKeys: ["core"], column: 4, lane: 0 },
			{ step: { ...base, key: "U-01" }, routeKeys: ["ui"], column: 1, lane: 1 },
			{ step: { ...base, key: "U" }, routeKeys: ["ui"], column: 0, lane: 1 },
		],
		edges: [
			{ key: "bypass", from: "C-01", to: "C-02", kind: "route" },
			{ key: "host-ui", from: "H-02", to: "U-01", kind: "dependency" },
			{ key: "ui", from: "U", to: "U-01", kind: "route" },
		],
	};
}

test("long links bypass intermediate stations with tangent-continuous shoulders in both sizes", () => {
	for (const compact of [false, true]) {
		const graph = roadmapGeometry(fixture(), compact);
		const edge = graph.edges.find((edge) => edge.key === "bypass");
		const from = graph.nodes.find((node) => node.step.key === "C-01");
		const to = graph.nodes.find((node) => node.step.key === "C-02");
		if (!edge || !from || !to) throw Error("Missing bypass");
		expect(edge.path).toStartWith(`M ${from.x} ${from.y} C `);
		expect(edge.path.match(/ C /g)).toHaveLength(2);
		expect(edge.path).toEndWith(`L ${to.x} ${to.y}`);
		expect(edge.path).not.toMatch(/NaN|Infinity/);
	}
});

test("vertical edges into shared joins reserve the source caption corridor", () => {
	const graph = roadmapGeometry(fixture(), false);
	expect(graph.nodes.find((node) => node.step.key === "H-02")?.forkDown).toBe(true);
	expect(graph.nodes.find((node) => node.step.key === "U-01")?.merge).toBe(true);
});

test("cross-lane turns avoid unrelated stations at either end of their vertical segment", () => {
	for (const compact of [false, true]) {
		const layout = fixture();
		layout.edges = [
			{ key: "through-host", from: "C-01", to: "U-01", kind: "dependency" },
			{ key: "ui", from: "U", to: "U-01", kind: "route" },
			{ key: "host", from: "H-02", to: "H-03", kind: "route" },
		];
		const graph = roadmapGeometry(layout, compact);
		const from = graph.nodes.find((node) => node.step.key === "C-01");
		const to = graph.nodes.find((node) => node.step.key === "U-01");
		const obstruction = graph.nodes.find((node) => node.step.key === "H-02");
		const path = graph.edges.find((edge) => edge.key === "through-host")?.path;
		if (!from || !to || !obstruction || !path) throw Error("Missing obstructed turn fixture");
		expect(path.match(/ Q /g)).toHaveLength(2);
		expect(path).not.toContain(`Q ${obstruction.x} ${obstruction.y} `);
		expect(path).toEndWith(`L ${to.x} ${to.y}`);
	}
});
