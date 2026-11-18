// Date: 2026-11-17. Deterministic octilinear paths from the approved P0-P5 specification.
export type Point = { x: number; y: number };
export type MetroNode = Point & { key: string; routeKeys: string[] };
export type MetroMotif = "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "narrow" | "destination" | "detour";
export type MetroRail = { points: Point[]; shape: MetroMotif; isCrossLine: boolean };
const epsilon = 0.000001;

function distinct(points: Point[]): Point[] {
	return points.filter(
		(point, index) => !index || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > epsilon,
	);
}

export function computeMetroRail(from: MetroNode, to: MetroNode, nodes: MetroNode[], compact = false): MetroRail {
	// Mirror backward edges into a forward local frame; business IDs and endpoints stay untouched.
	const direction = Math.sign(to.x - from.x) || 1;
	const dx = Math.abs(to.x - from.x);
	const dy = to.y - from.y;
	const absDy = Math.abs(dy);
	const signY = Math.sign(dy);
	const isCrossLine = !from.routeKeys.some((key) => to.routeKeys.includes(key));
	const rail = (shape: MetroMotif, points: Point[]): MetroRail => ({
		shape,
		isCrossLine,
		points: distinct(points.map((point) => ({ x: from.x + direction * point.x, y: from.y + point.y }))),
	});
	const end = { x: dx, y: dy };
	const start = { x: 0, y: 0 };
	if (dx < epsilon) return rail("P1", [start, end]);
	const between = nodes.filter((node) => {
		const x = direction * (node.x - from.x);
		return (
			node.key !== from.key &&
			node.key !== to.key &&
			Math.abs(node.y - from.y) < epsilon &&
			x > epsilon &&
			x < dx - epsilon
		);
	});
	// Date: 2026-11-17. P0 follows the destination side so it never recrosses the source rail.
	if (
		isCrossLine &&
		absDy > epsilon &&
		between.some((node) => node.routeKeys.some((key) => from.routeKeys.includes(key)))
	) {
		let offset = 12;
		if (compact) offset = Math.min(12, (dx + absDy - 8) / 2);
		const trackY = signY * offset;
		const turn = dx - Math.abs(dy - trackY);
		// Unlike the supplied Math.max clamp, this never stretches a diagonal away from 45 degrees.
		if (offset > epsilon && turn >= offset + 8 - epsilon) {
			return rail("P0", [start, { x: offset, y: trackY }, { x: turn, y: trackY }, end]);
		}
	}
	if (absDy < epsilon) {
		if (!between.length) return rail("P1", [start, end]);
		// P4: ascend over intervening stations, with a fractional height for very small thumbnails.
		const height = Math.min(28, dx * 0.2, Math.max(epsilon, from.y - 2));
		return rail("P4", [start, { x: height, y: -height }, { x: dx - height, y: -height }, end]);
	}
	// Narrow thumbnails use the approved diagonal/vertical/diagonal fallback without moving stations.
	if (compact && dx < absDy) {
		const half = dx / 2;
		return rail("narrow", [start, { x: half, y: signY * half }, { x: half, y: dy - signY * half }, end]);
	}
	// P5 is geometric rather than tied to a display code such as I-07.
	if (absDy > dx || absDy >= 150) {
		const chamfer = Math.min(24, dx * 0.25);
		return rail("P5", [start, { x: dx - chamfer, y: 0 }, { x: dx, y: signY * chamfer }, end]);
	}
	if (dy < 0 && !isCrossLine) return rail("P3", [start, { x: absDy, y: dy }, end]);
	return rail("P2", [start, { x: dx - absDy, y: 0 }, end]);
}

export function destinationMetroRails(
	from: MetroNode,
	to: MetroNode,
	base: MetroRail,
	long: boolean,
	compact: boolean,
	fork = false,
): MetroRail[] {
	const dx = Math.abs(to.x - from.x);
	const dy = Math.abs(to.y - from.y);
	const sx = Math.sign(to.x - from.x);
	const sy = Math.sign(to.y - from.y);
	const start = { x: from.x, y: from.y };
	const end = { x: to.x, y: to.y };
	const candidates: MetroRail[] = [];
	function add(shape: MetroMotif, ...between: Point[]) {
		candidates.push({ ...base, shape, points: distinct([start, ...between, end]) });
	}

	if (dx < epsilon || dy < epsilon) {
		// Parallel tracks clear blocked station rows or columns while keeping the real endpoints.
		candidates.push(base);
		for (const offset of compact ? [4, 7, 11] : [12, 24, 36, 54]) {
			if (2 * offset >= Math.max(dx, dy)) break;
			for (const direction of [-1, 1]) {
				const x = offset * (sx || direction);
				const y = offset * (sy || direction);
				add("detour", { x: from.x + x, y: from.y + y }, { x: to.x + (sx ? -x : x), y: to.y + (sy ? -y : y) });
			}
		}
		return candidates;
	}

	const offsets = compact ? [4, 7, 9] : [12, 20, 28];
	if (dx >= dy && (long || fork)) {
		for (const offset of long ? [...offsets, 0] : [0]) {
			if (offset >= dy) continue;
			const y = to.y - sy * offset;
			add("destination", { x: from.x + sx * (dy - offset), y }, { x: to.x - sx * offset, y });
		}
	}

	if (long) {
		// Reach the destination row through an early corridor when a full diagonal is blocked or too steep.
		for (const offset of offsets) {
			const reach = Math.min(dx, dy) - offset;
			if (reach <= epsilon) continue;
			const y = to.y - sy * offset;
			const arrival = { x: to.x - sx * offset, y };
			for (const lead of [reach * 0.35, reach * 0.65, 0]) {
				const x = from.x + sx * lead;
				add("destination", { x, y: from.y + sy * lead }, { x, y }, arrival);
			}
		}
	}
	candidates.push(base);
	if (dx < dy - epsilon) {
		for (const fraction of [0.5, 0.35, 0.65]) {
			const lead = dx * fraction;
			const x = from.x + sx * lead;
			add("narrow", { x, y: from.y + sy * lead }, { x, y: to.y - sy * (dx - lead) });
		}
	}
	return candidates;
}

export function metroPath(points: Point[]): string {
	return distinct(points)
		.map(({ x, y }, index) => `${index ? "L" : "M"} ${Number(x.toFixed(6))} ${Number(y.toFixed(6))}`)
		.join(" ");
}
