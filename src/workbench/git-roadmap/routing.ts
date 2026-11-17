// Date: 2026-11-17. Route rails with straight, L, horizontal/45-degree and diagonal/L shapes.
export type Point = { x: number; y: number };
export type CaptionSide = "left" | "right";
export type Station = Point & { key: string; routeKeys: string[]; captionSide?: CaptionSide };
export type Rail = { points: Point[]; routeKey: string };
type Box = { left: number; right: number; top: number; bottom: number };
export type RoutedRail = Rail & { shape: "straight" | "elbow" | "diagonal" | "detour"; collisions: number };

function intersects(a: Point, b: Point, box: Box): boolean {
	let low = 0;
	let high = 1;
	for (const [start, delta, min, max] of [
		[a.x, b.x - a.x, box.left, box.right],
		[a.y, b.y - a.y, box.top, box.bottom],
	]) {
		if (Math.abs(delta) < 0.001) {
			if (start <= min || start >= max) return false;
		} else {
			const first = (min - start) / delta;
			const last = (max - start) / delta;
			low = Math.max(low, Math.min(first, last));
			high = Math.min(high, Math.max(first, last));
			if (high <= low) return false;
		}
	}
	return true;
}

function caption(node: Station, side?: CaptionSide): Box {
	return {
		left: node.x + (side === "right" ? 9 : -50),
		right: node.x + (side === "left" ? -9 : 50),
		top: node.y + 13,
		bottom: node.y + 60,
	};
}

function hits(points: Point[], box: Box): boolean {
	return points.slice(1).some((point, index) => intersects(points[index], point, box));
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
	const horizontalGaps = nodes.flatMap((node) =>
		nodes
			.filter((other) => other !== node && Math.abs(other.x - node.x) > 0.01)
			.map((other) => Math.abs(other.x - node.x)),
	);
	const dotRadius = compact ? Math.min(3, Math.min(...horizontalGaps) / 3) : 9;
	const candidates: { points: Point[]; shape: RoutedRail["shape"] }[] = [];
	const add = (points: Point[], shape: RoutedRail["shape"]) => candidates.push({ points: simplify(points), shape });
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
	let best: RoutedRail | undefined;
	let bestSides: (CaptionSide | undefined)[] = [];
	for (const candidate of candidates) {
		const { points } = candidate;
		let collisions = 0;
		const sides: (CaptionSide | undefined)[] = [];
		for (const node of nodes) {
			const endpoint = node.key === from.key || node.key === to.key;
			if (!endpoint) {
				const radius = dotRadius;
				for (let index = 1; index < points.length; index++) {
					const a = points[index - 1];
					const b = points[index];
					// Shared rails may continue through their own stations; another route is an obstacle.
					if (a.y === b.y && a.y === node.y && node.routeKeys.includes(routeKey)) continue;
					if (
						intersects(a, b, {
							left: node.x - radius,
							right: node.x + radius,
							top: node.y - radius,
							bottom: node.y + radius,
						})
					)
						collisions++;
				}
			}
			let side = node.captionSide;
			if (!compact && hits(points, caption(node, side))) {
				{
					const available = (["left", "right"] as const).find(
						(value) =>
							!hits(points, caption(node, value)) && rails.every((rail) => !hits(rail.points, caption(node, value))),
					);
					if (available) side = available;
					else collisions++;
				}
			}
			sides.push(side);
		}
		for (const rail of rails) {
			if (rail.routeKey === routeKey) continue;
			for (let i = 1; i < points.length; i++)
				for (let j = 1; j < rail.points.length; j++) {
					if (overlap(points[i - 1], points[i], rail.points[j - 1], rail.points[j]) > (compact ? 2 : 8)) collisions++;
				}
		}
		// Keep the candidate inside the row band; crossings remain continuous and do not count as obstacles.
		if (points.some((point) => point.y < (compact ? 2 : 6))) collisions++;
		if (!best || collisions < best.collisions) {
			best = { points, routeKey, shape: candidate.shape, collisions };
			bestSides = sides;
		}
		if (!collisions) break;
	}
	for (const [index, node] of nodes.entries()) node.captionSide = bestSides[index];
	return best ?? { points: [from, to], routeKey, shape: "straight", collisions: 0 };
}
