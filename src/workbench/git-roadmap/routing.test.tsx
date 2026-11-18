// Date: 2026-11-17. Verify the agreed rail shapes, exact slopes, collision avoidance and crossings.
import { describe, expect, test } from "bun:test";
import { createScenario } from "../contract/fixtures";
import { layoutRoutes } from "../task-groups";
import { roadmapGeometry } from "./geometry";
import { type Point, planRailPaths, routeRail, type Station } from "./routing";

const station = (key: string, x: number, y: number): Station => ({ key, x, y, routeKeys: [key] });
function slopes(points: Point[]) {
	for (let i = 1; i < points.length; i++) {
		const dx = Math.abs(points[i].x - points[i - 1].x);
		const dy = Math.abs(points[i].y - points[i - 1].y);
		expect(dx < 0.001 || dy < 0.001 || Math.abs(dx - dy) < 0.001).toBe(true);
	}
}

describe("agreed rail shapes", () => {
	test("clear horizontal and vertical connections remain straight", () => {
		for (const to of [station("b", 108, 24), station("b", 0, 212)]) {
			const from = station("a", 0, 24);
			const rail = routeRail(from, to, [from, to], [], "a", false);
			expect(rail.shape).toBe("straight");
			expect(rail.points).toHaveLength(2);
			expect(rail.collisions).toBe(0);
		}
	});

	test("nearby row changes consume surplus horizontal distance before a strict 45-degree segment", () => {
		for (const [x, y] of [
			[108, 118],
			[-108, 118],
			[108, 24],
			[-108, 24],
		]) {
			const from = station("a", 0, y === 24 ? 118 : 24);
			const to = station("b", x, y);
			const rail = routeRail(from, to, [from, to], [], "a", false);
			expect(rail.shape).toBe("diagonal");
			expect(rail.points).toHaveLength(3);
			expect(rail.points[1].y).toBe(from.y);
			expect(Math.abs(rail.points[1].x)).toBe(14);
			expect(rail.collisions).toBe(0);
			slopes(rail.points);
		}
	});

	test("longer row changes prefer a single L corner", () => {
		const from = station("a", 0, 24);
		const to = station("b", 108, 306);
		const rail = routeRail(from, to, [from, to], [], "a", false);
		expect(rail.shape).toBe("elbow");
		expect(rail.points).toHaveLength(3);
		expect(rail.collisions).toBe(0);
		slopes(rail.points);
	});

	test("blocked L corners use a 45-degree departure followed by an L", () => {
		const from = station("a", 0, 24);
		const to = station("b", 108, 306);
		const nodes = [from, to, station("corner-1", 108, 24), station("corner-2", 0, 306)];
		const rail = routeRail(from, to, nodes, [], "a", false);
		expect(rail.shape).toBe("detour");
		expect(rail.collisions).toBe(0);
		expect(rail.points).toHaveLength(4);
		slopes(rail.points);
	});

	test("another route's overlapping rail triggers a diagonal departure", () => {
		const from = station("a", 0, 24);
		const to = station("b", 108, 306);
		const obstacle = station("corner", 0, 306);
		const rail = routeRail(
			from,
			to,
			[from, to, obstacle],
			[{ routeKey: "other", points: [from, { x: 108, y: 24 }] }],
			"a",
			false,
		);
		expect(rail.shape).toBe("detour");
		expect(rail.collisions).toBe(0);
		slopes(rail.points);
	});

	test("crossing rails remain continuous without a gap or extra junction", () => {
		const from = station("a", 0, 24);
		const to = station("b", 108, 24);
		const rail = routeRail(
			from,
			to,
			[from, to],
			[
				{
					routeKey: "other",
					points: [
						{ x: 54, y: 0 },
						{ x: 54, y: 94 },
					],
				},
			],
			"a",
			false,
		);
		expect(rail.points).toEqual([from, to]);
		expect(rail.collisions).toBe(0);
	});

	test("earlier rails can give up a shared segment after all routes are placed", () => {
		const a = station("a", 0, 70);
		const b = station("b", 180, 70);
		const c = station("c", 36, 54);
		const d = station("d", 144, 54);
		const direct = { points: [a, b] };
		const detour = { points: [a, { x: 30, y: 40 }, { x: 150, y: 40 }, b] };
		const fixed = { points: [c, { x: 52, y: 70 }, { x: 128, y: 70 }, d] };
		const paths = planRailPaths(
			[
				{ from: a, to: b, candidates: [direct, detour] },
				{ from: c, to: d, candidates: [fixed] },
			],
			[a, b, c, d],
			true,
			{ width: 180, height: 100 },
		);
		expect(paths.map((path) => path.points)).toEqual([detour.points, fixed.points]);
	});

	test("a crowded caption moves to the side with the least coverage", () => {
		const labelled = station("labelled", 100, 24);
		const leftStart = station("left-start", 30, 82);
		const leftEnd = station("left-end", 54, 82);
		const rightStart = station("right-start", 124, 30);
		const rightEnd = station("right-end", 124, 100);
		planRailPaths(
			[
				{ from: leftStart, to: leftEnd, candidates: [{ points: [leftStart, leftEnd] }] },
				{ from: rightStart, to: rightEnd, candidates: [{ points: [rightStart, rightEnd] }] },
			],
			[labelled, leftStart, leftEnd, rightStart, rightEnd],
			false,
			{ width: 180, height: 140 },
		);
		expect(labelled.captionSide).toBe("left");
	});

	test("both sizes preserve routing rules, identities and distinct terminals across supported topologies", () => {
		for (const scenario of ["fork-join", "long-route", "multi-project", "deep-branch"] as const) {
			const snapshot = createScenario(scenario).snapshot;
			if (!snapshot) throw Error("Missing fixture");
			for (const compact of [false, true]) {
				for (const width of compact ? [180, 320] : [undefined, 1400]) {
					const layout = layoutRoutes(snapshot.routes, snapshot.steps);
					const graph = roadmapGeometry(layout, compact, width);
					expect(new Set(graph.nodes.map((node) => `${node.x}:${node.y}`)).size).toBe(graph.nodes.length);
					for (const edge of graph.edges) {
						expect(edge.kind === "route" || edge.kind === "dependency").toBe(true);
						expect(edge.points.length).toBeLessThanOrEqual(5);
						expect(edge.path).not.toMatch(/ [CQ] /);
						slopes(edge.points);
					}
				}
			}
		}
	});
});
