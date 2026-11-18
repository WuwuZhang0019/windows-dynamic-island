// Date: 2026-11-17. Deterministic octilinear paths from the approved P0-P5 specification.
export type Point = { x: number; y: number };
export type MetroNode = Point & { key: string; routeKeys: string[] };
export type MetroMotif = "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "narrow" | "destination";
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
): MetroRail[] {
	const dx = Math.abs(to.x - from.x);
	const dy = Math.abs(to.y - from.y);
	if (dx < epsilon || dy < epsilon) return [base];
	const sx = Math.sign(to.x - from.x);
	const sy = Math.sign(to.y - from.y);
	const start = { x: from.x, y: from.y };
	const end = { x: to.x, y: to.y };

	if (long && dx > dy + epsilon) {
		// Take the row change first, with room beside the destination for its stations and captions.
		const offsets = compact ? [4, 7, 2, 0] : [12, 20, 28, 0];
		const destination = offsets
			.filter((offset) => offset < dy)
			.map((offset): MetroRail => {
				const y = to.y - sy * offset;
				return {
					...base,
					shape: "destination",
					points: distinct([start, { x: from.x + sx * (dy - offset), y }, { x: to.x - sx * offset, y }, end]),
				};
			});
		const chamfer = Math.min(dy / 2, compact ? 6 : 24);
		destination.push({
			...base,
			shape: "destination",
			points: [start, { x: from.x, y: to.y - sy * chamfer }, { x: from.x + sx * chamfer, y: to.y }, end],
		});
		return [...destination, base];
	}
	if (dx < dy - epsilon) {
		// A tighter span can change rows between columns and stay clear of stations on either endpoint column.
		const gaps = [0.5, 0.35, 0.65].map((fraction): MetroRail => {
			const lead = dx * fraction;
			const x = from.x + sx * lead;
			return {
				...base,
				shape: "narrow",
				points: [start, { x, y: from.y + sy * lead }, { x, y: to.y - sy * (dx - lead) }, end],
			};
		});
		return [base, ...gaps];
	}
	return [base];
}

export function metroRoundedPath(points: Point[], cornerRadius = 8): string {
	const vertices = distinct(points);
	if (!vertices.length) return "";
	const coordinate = (point: Point) => `${Number(point.x.toFixed(3))} ${Number(point.y.toFixed(3))}`;
	const commands = [`M ${coordinate(vertices[0])}`];
	for (let index = 1; index < vertices.length - 1; index++) {
		const previous = vertices[index - 1];
		const current = vertices[index];
		const next = vertices[index + 1];
		const before = Math.hypot(current.x - previous.x, current.y - previous.y);
		const after = Math.hypot(next.x - current.x, next.y - current.y);
		const radius = Math.min(cornerRadius, before * 0.4, after * 0.4);
		const start = {
			x: current.x + ((previous.x - current.x) * radius) / before,
			y: current.y + ((previous.y - current.y) * radius) / before,
		};
		const end = {
			x: current.x + ((next.x - current.x) * radius) / after,
			y: current.y + ((next.y - current.y) * radius) / after,
		};
		commands.push(`L ${coordinate(start)}`, `Q ${coordinate(current)} ${coordinate(end)}`);
	}
	if (vertices.length > 1) commands.push(`L ${coordinate(vertices[vertices.length - 1])}`);
	return commands.join(" ");
}
