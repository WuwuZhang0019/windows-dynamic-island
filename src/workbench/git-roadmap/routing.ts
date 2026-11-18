// Date: 2026-11-17. Route rails with straight, L, horizontal/45-degree and diagonal/L shapes.
export type Point = { x: number; y: number };
export type CaptionSide = "left" | "right";
export type Station = Point & { key: string; routeKeys: string[]; captionSide?: CaptionSide; codeWidth?: number };
export type Rail = { points: Point[]; routeKey: string };
type Box = { left: number; right: number; top: number; bottom: number };
type Viewport = { width: number; height: number };
type RailPath = { points: Point[] };
export type RoutedRail = Rail & { shape: "straight" | "elbow" | "diagonal" | "detour"; collisions: number };

function fractionInBox(a: Point, b: Point, box: Box): number {
	let low = 0;
	let high = 1;
	for (const [start, delta, min, max] of [
		[a.x, b.x - a.x, box.left, box.right],
		[a.y, b.y - a.y, box.top, box.bottom],
	]) {
		if (Math.abs(delta) < 0.001) {
			if (start <= min || start >= max) return 0;
		} else {
			const first = (min - start) / delta;
			const last = (max - start) / delta;
			low = Math.max(low, Math.min(first, last));
			high = Math.min(high, Math.max(first, last));
			if (high <= low) return 0;
		}
	}
	return high - low;
}

function caption(node: Station, side?: CaptionSide): Box {
	const halfWidth = (node.codeWidth ?? 100) / 2;
	return {
		left: node.x + (side === "right" && !node.codeWidth ? 9 : -halfWidth),
		right: node.x + (side === "left" && !node.codeWidth ? -9 : halfWidth),
		top: node.y + 13,
		bottom: node.y + (node.codeWidth ? 29 : 60),
	};
}

function hits(points: Point[], box: Box): boolean {
	return points.slice(1).some((point, index) => fractionInBox(points[index], point, box) > 0);
}

function overlap(a: Point, b: Point, c: Point, d: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = Math.hypot(dx, dy);
	if (!length || Math.abs(dx * (c.y - a.y) - dy * (c.x - a.x)) / length > 0.5) return 0;
	if (Math.abs(dx * (d.y - a.y) - dy * (d.x - a.x)) / length > 0.5) return 0;
	const project = (p: Point) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
	return Math.max(
		0,
		Math.min(length, Math.max(project(c), project(d))) - Math.max(0, Math.min(project(c), project(d))),
	);
}

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const ex = d.x - c.x;
	const ey = d.y - c.y;
	const determinant = dx * ey - dy * ex;
	if (Math.abs(determinant) < 0.000001) return false;
	const x = c.x - a.x;
	const y = c.y - a.y;
	const alongFirst = (x * ey - y * ex) / determinant;
	const alongSecond = (x * dy - y * dx) / determinant;
	return alongFirst > 0.000001 && alongFirst < 0.999999 && alongSecond > 0.000001 && alongSecond < 0.999999;
}

function compareCosts(a: number[], b: number[]): number {
	for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] - b[index];
	return 0;
}

function simplify(points: Point[]): Point[] {
	const result: Point[] = [];
	for (const point of points) {
		if (result.at(-1)?.x === point.x && result.at(-1)?.y === point.y) continue;
		result.push(point);
	}
	return result;
}

export function routeRail(
	from: Station,
	to: Station,
	nodes: Station[],
	rails: Rail[],
	routeKey: string,
	compact: boolean,
): RoutedRail {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const sx = Math.sign(dx) || 1;
	const sy = Math.sign(dy) || 1;
	const candidates: (Rail & { shape: RoutedRail["shape"] })[] = [];
	const add = (points: Point[], shape: RoutedRail["shape"]) =>
		candidates.push({ points: simplify(points), routeKey, shape });
	if (!dx || !dy) add([from, to], "straight");
	// A nearby row change first consumes surplus horizontal distance, then uses a true 45-degree line.
	if (dx && dy && Math.abs(dy) <= (compact ? 18 : 94) && Math.abs(dx) >= Math.abs(dy)) {
		add([from, { x: to.x - sx * Math.abs(dy), y: from.y }, to], "diagonal");
	}
	if (dx && dy) {
		add([from, { x: to.x, y: from.y }, to], "elbow");
		add([from, { x: from.x, y: to.y }, to], "elbow");
	}
	for (const distance of compact ? [5, 8, 12, 18, 27, 36] : [24, 36, 54, 72, 94, 108, 144]) {
		for (const vertical of dy ? [sy, -sy] : [-1, 1]) {
			for (const horizontal of [sx, -sx]) {
				const lead = { x: from.x + horizontal * distance, y: from.y + vertical * distance };
				add([from, lead, { x: to.x, y: lead.y }, to], "detour");
				add([from, lead, { x: lead.x, y: to.y }, to], "detour");
			}
		}
	}
	return (
		selectRail(candidates, from, to, nodes, rails, compact) ?? {
			points: [from, to],
			routeKey,
			shape: "straight",
			collisions: 0,
		}
	);
}

function selectRail<T extends RailPath>(
	candidates: T[],
	from: Station,
	to: Station,
	nodes: Station[],
	rails: RailPath[],
	compact: boolean,
	viewport?: Viewport,
): (T & { collisions: number }) | undefined {
	const columns = compact ? [...new Set(nodes.map((node) => node.x))].sort((a, b) => a - b) : [];
	const dotRadius = compact ? Math.min(3, ...columns.slice(1).map((x, index) => (x - columns[index]) / 3)) : 9;
	let best: (T & { collisions: number }) | undefined;
	let bestCost: number[] | undefined;
	let bestSides: (CaptionSide | undefined)[] = [];
	for (const candidate of candidates) {
		const { points } = candidate;
		let stations = 0;
		let captions = 0;
		const sides: (CaptionSide | undefined)[] = [];
		for (const node of nodes) {
			const endpoint = node.key === from.key || node.key === to.key;
			if (!endpoint) {
				if (
					hits(points, {
						left: node.x - dotRadius,
						right: node.x + dotRadius,
						top: node.y - dotRadius,
						bottom: node.y + dotRadius,
					})
				)
					stations++;
			}
			let side = node.captionSide;
			if (!compact && hits(points, caption(node, side))) {
				const available = (["left", "right"] as const).find(
					(value) =>
						!hits(points, caption(node, value)) && rails.every((rail) => !hits(rail.points, caption(node, value))),
				);
				if (available) side = available;
				else captions++;
			}
			sides.push(side);
		}
		let shared = 0;
		let intersections = 0;
		for (const rail of rails) {
			for (let i = 1; i < points.length; i++) {
				for (let j = 1; j < rail.points.length; j++) {
					const length = overlap(points[i - 1], points[i], rail.points[j - 1], rail.points[j]);
					if (length > (compact ? 2 : 8)) shared += length;
					else if (viewport && crosses(points[i - 1], points[i], rail.points[j - 1], rail.points[j])) intersections++;
				}
			}
		}
		const outside = points.some(
			(point) =>
				point.y < (compact ? 2 : 6) ||
				(viewport && (point.x < -0.001 || point.x > viewport.width + 0.001 || point.y > viewport.height - 2)),
		);
		// Crossings are a routing cost. They do not create gaps or stations.
		const cost = [Number(outside), stations, captions, shared, intersections];
		if (!bestCost || compareCosts(cost, bestCost) < 0) {
			best = { ...candidate, collisions: Number(outside) + stations + captions + shared };
			bestCost = cost;
			bestSides = sides;
		}
		if (cost.every((value) => value === 0)) break;
	}
	if (best) for (const [index, node] of nodes.entries()) node.captionSide = bestSides[index];
	return best;
}

export function planRailPaths<T extends RailPath>(
	requests: { from: Station; to: Station; candidates: T[] }[],
	nodes: Station[],
	compact: boolean,
	viewport: Viewport,
): T[] {
	const paths: T[] = [];
	for (const { from, to, candidates } of requests) {
		paths.push(
			candidates.length === 1
				? candidates[0]
				: (selectRail(candidates, from, to, nodes, paths, compact, viewport) ?? candidates[0]),
		);
	}
	// Reconsider flexible links against the entire drawing so early choices also yield space when needed.
	for (const [index, { from, to, candidates }] of requests.entries()) {
		if (candidates.length === 1) continue;
		const current = paths[index];
		const alternatives = [current, ...candidates.filter((candidate) => candidate.points !== current.points)];
		const others = paths.filter((_, other) => index !== other);
		paths[index] = selectRail(alternatives, from, to, nodes, others, compact, viewport) ?? current;
	}
	if (!compact) {
		for (const node of nodes) {
			let leastCovered = Infinity;
			for (const side of [undefined, "left", "right"] as const) {
				const box = caption(node, side);
				let covered = 0;
				for (const { points } of paths) {
					for (let index = 1; index < points.length; index++) {
						const from = points[index - 1];
						const to = points[index];
						const fraction = fractionInBox(from, to, box);
						if (fraction > 0) covered += fraction * Math.hypot(to.x - from.x, to.y - from.y);
					}
				}
				if (covered < leastCovered) {
					node.captionSide = side;
					leastCovered = covered;
				}
				if (covered === 0) break;
			}
		}
	}
	return paths;
}
