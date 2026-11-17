// Date: 2026-11-17. Acceptance coordinates supplied by the user, independent of path implementation.
import { describe, expect, test } from "bun:test";
import { createScenario } from "../contract/fixtures";
import { layoutRoutes } from "../task-groups";
import { roadmapGeometry } from "./geometry";
import { computeMetroRail, type MetroMotif, type MetroNode, metroRoundedPath, type Point } from "./metro";

const coordinates: Record<string, [number, number]> = {
	I: [0, 24],
	"I-01": [108, 24],
	"I-02": [216, 24],
	"I-03": [324, 24],
	"I-04": [432, 24],
	"I-04-01": [540, 24],
	"I-04-02": [648, 24],
	"I-04-03": [756, 24],
	"I-05": [864, 24],
	"I-06": [972, 24],
	"I-07": [1080, 212],
	S: [0, 118],
	"S-01": [108, 118],
	"S-02": [216, 118],
	"S-03": [324, 118],
	H: [0, 212],
	"H-01": [108, 212],
	"H-02": [216, 306],
	"H-03": [324, 306],
	"H-04": [432, 212],
	"H-05": [540, 212],
	C: [0, 306],
	"C-01": [108, 306],
	"C-02": [540, 306],
	"C-03": [648, 353],
	"C-04": [756, 306],
	U: [0, 400],
	"U-01": [216, 400],
	"U-02": [756, 400],
	"U-03": [864, 400],
};
const nodes: MetroNode[] = Object.entries(coordinates).map(([code, [x, y]]) => ({
	key: `project/example/steps/${code}`,
	x,
	y,
	routeKeys: [`route/${code.split("-")[0]}`],
}));
const node = (code: string) => {
	const found = nodes.find((node) => node.key.endsWith(`/${code}`));
	if (!found) throw Error("Missing fixture node");
	return found;
};
const cases: [string, string, MetroMotif, number[][]][] = [
	[
		"S-01",
		"H-04",
		"P0",
		[
			[108, 118],
			[120, 130],
			[350, 130],
			[432, 212],
		],
	],
	[
		"H-01",
		"H-02",
		"P2",
		[
			[108, 212],
			[122, 212],
			[216, 306],
		],
	],
	[
		"H-03",
		"H-04",
		"P3",
		[
			[324, 306],
			[418, 212],
			[432, 212],
		],
	],
	[
		"C-01",
		"C-02",
		"P4",
		[
			[108, 306],
			[136, 278],
			[512, 278],
			[540, 306],
		],
	],
	[
		"H-04",
		"C-02",
		"P2",
		[
			[432, 212],
			[446, 212],
			[540, 306],
		],
	],
	[
		"C-01",
		"U-01",
		"P2",
		[
			[108, 306],
			[122, 306],
			[216, 400],
		],
	],
	[
		"C-02",
		"C-03",
		"P2",
		[
			[540, 306],
			[601, 306],
			[648, 353],
		],
	],
	[
		"C-03",
		"C-04",
		"P3",
		[
			[648, 353],
			[695, 306],
			[756, 306],
		],
	],
	[
		"C-03",
		"U-02",
		"P2",
		[
			[648, 353],
			[709, 353],
			[756, 400],
		],
	],
	[
		"I-06",
		"I-07",
		"P5",
		[
			[972, 24],
			[1056, 24],
			[1080, 48],
			[1080, 212],
		],
	],
	[
		"S-03",
		"I-07",
		"P2",
		[
			[324, 118],
			[986, 118],
			[1080, 212],
		],
	],
	[
		"H-05",
		"I-07",
		"P1",
		[
			[540, 212],
			[1080, 212],
		],
	],
	[
		"C-04",
		"I-07",
		"P2",
		[
			[756, 306],
			[986, 306],
			[1080, 212],
		],
	],
	[
		"U-03",
		"I-07",
		"P5",
		[
			[864, 400],
			[1056, 400],
			[1080, 376],
			[1080, 212],
		],
	],
];

export function expectOctilinear(points: Point[]) {
	expect(points.length).toBeLessThanOrEqual(4);
	for (let i = 1; i < points.length; i++) {
		const dx = points[i].x - points[i - 1].x,
			dy = points[i].y - points[i - 1].y;
		expect(Math.abs(dx) < 0.001 || Math.abs(dy) < 0.001 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.001).toBe(true);
		if (i > 1) {
			const px = points[i - 1].x - points[i - 2].x,
				py = points[i - 1].y - points[i - 2].y;
			const cosine = (px * dx + py * dy) / (Math.hypot(px, py) * Math.hypot(dx, dy));
			expect(cosine > 0.999 || Math.abs(cosine - Math.SQRT1_2) < 0.001).toBe(true);
		}
	}
}

describe("approved deterministic metro routing", () => {
	for (const [from, to, motif, expected] of cases)
		test(`${from} → ${to} matches the supplied coordinate table`, () => {
			const rail = computeMetroRail(node(from), node(to), nodes);
			expect(rail.shape).toBe(motif);
			expect(rail.points.map(({ x, y }) => [x, y])).toEqual(expected);
			expectOctilinear(rail.points);
		});
	test("companion rails stay on the destination side without recrossing the service rail", () => {
		for (const mirror of [false, true]) {
			const fixture = nodes.map((node) => ({ ...node, y: mirror ? 400 - node.y : node.y }));
			const from = fixture.find((item) => item.key === node("S-01").key);
			const to = fixture.find((item) => item.key === node("H-04").key);
			if (!from || !to) throw Error("Missing companion rail fixture");
			const rail = computeMetroRail(from, to, fixture);
			expect(rail.shape).toBe("P0");
			const direction = Math.sign(to.y - from.y);
			for (const point of rail.points.slice(1)) expect((point.y - from.y) * direction).toBeGreaterThan(0);
			expectOctilinear(rail.points);
		}
	});
	test("coordinate tables and caption metadata are not mutated", () => {
		const before = JSON.stringify(nodes);
		for (const [from, to] of cases) computeMetroRail(node(from), node(to), nodes);
		expect(JSON.stringify(nodes)).toBe(before);
	});
	test("narrow companion tracks and vertical merges retain strict 45-degree slopes", () => {
		for (const width of [40, 80, 100, 180, 320]) {
			const scaled = nodes.map((item) => ({ ...item, x: (item.x * width) / 1080, y: 12 + ((item.y - 24) * 18) / 94 }));
			for (const [from, to] of cases) {
				const a = scaled.find((item) => item.key === node(from).key),
					b = scaled.find((item) => item.key === node(to).key);
				if (!a || !b) throw Error("Missing scaled node");
				expectOctilinear(computeMetroRail(a, b, scaled, true).points);
			}
		}
	});
	test("full business keys, backward edges and coincident columns remain valid", () => {
		for (const [from, to] of [
			[node("I-07"), node("I-06")],
			[node("C-02"), node("H-05")],
		])
			expectOctilinear(computeMetroRail(from, to, nodes).points);
	});
	test("rounding preserves endpoints, continuous paths and the 40-percent short-segment limit", () => {
		const rail = computeMetroRail(node("H-01"), node("H-02"), nodes);
		const path = metroRoundedPath(rail.points);
		expect(path).toStartWith("M 108 212 L 116.4 212 Q 122 212");
		expect(path).toEndWith("L 216 306");
		expect(path.match(/M /g)).toHaveLength(1);
		expect(path).not.toMatch(/NaN|Infinity| C /);
	});
	test("generic multi-project and fork/join routes use octilinear paths in both sizes", () => {
		for (const scenario of ["fork-join", "multi-project", "deep-branch", "long-route"] as const) {
			const snapshot = createScenario(scenario).snapshot;
			if (!snapshot) throw Error("Missing fixture");
			for (const compact of [false, true])
				for (const width of compact ? [80, 180, 320] : [undefined, 1400]) {
					const graph = roadmapGeometry(layoutRoutes(snapshot.routes, snapshot.steps), compact, width);
					for (const edge of graph.edges) {
						expectOctilinear(edge.points);
						expect(edge.path).not.toMatch(/NaN|Infinity/);
					}
				}
		}
	});
});
