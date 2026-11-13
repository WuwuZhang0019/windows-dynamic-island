// Date: 2026-11-13. Adapted from TomPlum/react-git-log's CurvedEdge (Apache-2.0).
// See third_party/react-git-log/PROVENANCE.md for the pinned source and modifications.
import type { CSSProperties } from "react";

export function CurvedEdge({
	id,
	colour,
	path,
	dashed,
	status,
	kind,
	from,
	to,
}: {
	id: string;
	colour: string;
	path: string;
	dashed: boolean;
	status: string;
	kind: string;
	from: string;
	to: string;
}) {
	return (
		<path
			data-edge-key={id}
			d={path}
			stroke={colour}
			strokeWidth="2"
			fill="none"
			vectorEffect="non-scaling-stroke"
			strokeDasharray={dashed ? "4 3" : undefined}
			style={{ "--wb-edge-colour": colour } as CSSProperties}
			data-status={status}
			data-kind={kind}
			data-from={from}
			data-to={to}
		/>
	);
}
