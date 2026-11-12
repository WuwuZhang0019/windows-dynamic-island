import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 16, ...rest }: P) => ({
	width: size,
	height: size,
	viewBox: "0 0 24 24",
	fill: "currentColor",
	...rest,
});

/** Date: 2026-11-12. Original task-node icon, matching src-tauri/app-icon.svg. */
export function AppLogo({ size = 16, ...rest }: P) {
	return (
		<svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden {...rest}>
			<rect x="64" y="64" width="896" height="896" rx="220" fill="#15171d" />
			<rect x="160" y="288" width="704" height="448" rx="224" fill="none" stroke="#e6ebf2" strokeWidth="48" />
			<circle cx="320" cy="512" r="64" fill="#e6ebf2" />
			<circle cx="512" cy="512" r="64" fill="#38d9d0" />
			<circle cx="704" cy="512" r="64" fill="#e6ebf2" />
		</svg>
	);
}

export const GitHubIcon = (p: P) => (
	<svg aria-hidden {...base(p)}>
		<path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-1.84c-2.92.63-3.54-1.4-3.54-1.4-.48-1.22-1.17-1.54-1.17-1.54-.95-.65.08-.64.08-.64 1.05.08 1.6 1.08 1.6 1.08.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.18 0-1.14.4-2.08 1.08-2.81-.11-.27-.47-1.34.1-2.78 0 0 .88-.28 2.89 1.07a10 10 0 0 1 5.26 0c2-1.35 2.88-1.07 2.88-1.07.58 1.44.22 2.51.11 2.78.67.73 1.08 1.67 1.08 2.8 0 4.03-2.46 4.91-4.8 5.17.38.33.71.97.71 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z" />
	</svg>
);

/** A font-independent water drop used by the hydration module. */
/** Launcher: every module in a grid. */
/** Drag handle for reorderable rows. */
