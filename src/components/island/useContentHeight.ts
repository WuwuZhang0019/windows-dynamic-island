// Date: 2026-11-17. Measure the visible task independently of the animated shell's current height.
import { useLayoutEffect, useRef, useState } from "react";

export function useContentHeight(expanded: boolean, limit: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number>();
	useLayoutEffect(() => {
		const root = ref.current;
		if (!expanded || !root) return;
		const list = root.querySelector<HTMLElement>("[data-workbench-routes]");
		if (!list) return;
		const panel = root;
		const scroller = list;
		let active: HTMLElement | undefined;
		let align = false;
		let frame = 0;
		let motionFrame = 0;
		let navigating = false;
		let observed: Element[] = [];
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};
		const observer = new ResizeObserver(schedule);
		function cards() {
			return [...scroller.querySelectorAll<HTMLElement>("[data-route-card]")];
		}
		function chooseVisible() {
			const area = scroller.getBoundingClientRect();
			let best = active;
			let greatest = 0;
			const routes = cards();
			if (scroller.scrollTop <= 1) best = routes[0];
			else if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) best = routes.at(-1);
			else
				for (const card of cards()) {
					const rect = card.getBoundingClientRect();
					const visible = Math.max(0, Math.min(rect.bottom, area.bottom) - Math.max(rect.top, area.top));
					if (visible > greatest + 1) {
						best = card;
						greatest = visible;
					}
				}
			if (best && best !== active) {
				active = best;
				align = true;
			}
		}
		function measure() {
			const nextObserved = [panel, ...panel.querySelectorAll("[data-route-card], .wb-route-list, .wb-empty")];
			if (nextObserved.length !== observed.length || nextObserved.some((node, i) => node !== observed[i])) {
				observer.disconnect();
				for (const node of nextObserved) observer.observe(node);
				observed = nextObserved;
			}
			if (!active || !scroller.contains(active)) {
				active = cards()[0];
				if (scroller.scrollTop > 1) chooseVisible();
				align = false;
			}
			const compact = panel.querySelector("[data-workbench]")?.getAttribute("data-task-size") === "small";
			const items = [...scroller.children] as HTMLElement[];
			let natural = items.reduce((total, item) => total + item.offsetHeight, 0);
			const routeList = scroller.querySelector<HTMLElement>(".wb-route-list");
			if (!compact && active && routeList) {
				const style = getComputedStyle(routeList);
				natural = active.offsetHeight + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
			}
			const chrome = panel.clientHeight - scroller.clientHeight;
			const desired = Math.min(limit, Math.max(180, Math.ceil(chrome + natural)));
			setHeight((previous) => (previous === desired ? previous : desired));
			panel.dataset.contentHeight = String(desired);
			if (align && active && !compact && Math.abs(panel.clientHeight - desired) <= 1) {
				const padding = routeList ? Number.parseFloat(getComputedStyle(routeList).paddingTop) : 0;
				scroller.scrollTop = Math.max(0, active.offsetTop - padding);
				align = false;
			}
		}
		const scroll = () => {
			if (!align && !navigating) chooseVisible();
			schedule();
		};
		// Date: 2026-11-17. Side-wheel paging shares one animation with the task's height change.
		function navigate(card: HTMLElement) {
			cancelAnimationFrame(motionFrame);
			active = card;
			align = false;
			navigating = true;
			const from = scroller.scrollTop;
			const started = performance.now();
			const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 380;
			function step(now: number) {
				if (!scroller.contains(card)) {
					navigating = false;
					schedule();
					return;
				}
				const routeList = scroller.querySelector<HTMLElement>(".wb-route-list");
				const padding = routeList ? Number.parseFloat(getComputedStyle(routeList).paddingTop) : 0;
				const progress = duration ? Math.min(1, (now - started) / duration) : 1;
				const target = Math.max(0, card.offsetTop - padding);
				scroller.scrollTop = from + (target - from) * (1 - (1 - progress) ** 3);
				const heightSettled = Math.abs(panel.clientHeight - Number(panel.dataset.contentHeight)) <= 1;
				if (progress < 1 || !heightSettled) motionFrame = requestAnimationFrame(step);
				else {
					// Keep the final scroll event from selecting a partially visible neighbour.
					motionFrame = requestAnimationFrame(() => {
						navigating = false;
					});
				}
			}
			schedule();
			motionFrame = requestAnimationFrame(step);
		}
		const wheel = (event: WheelEvent) => {
			if (
				event.ctrlKey ||
				!event.deltaY ||
				Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
				!(event.target instanceof Element) ||
				event.target.closest("[data-route-card]") ||
				panel.querySelector("[data-workbench]")?.getAttribute("data-task-size") === "small"
			)
				return;
			const area = scroller.getBoundingClientRect();
			if (event.clientY < area.top || event.clientY > area.bottom) return;
			const routes = cards();
			if (routes.length < 2) return;
			event.preventDefault();
			event.stopPropagation();
			const index = active ? routes.indexOf(active) : 0;
			const next = routes[Math.max(0, Math.min(routes.length - 1, index + Math.sign(event.deltaY)))];
			if (next && next !== active) navigate(next);
		};
		const click = (event: MouseEvent) => {
			const card = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-route-card]") : null;
			if (card && card !== active) {
				cancelAnimationFrame(motionFrame);
				navigating = false;
				active = card;
				align = true;
				schedule();
			}
		};
		const mutations = new MutationObserver(schedule);
		mutations.observe(root, { childList: true, subtree: true });
		list.addEventListener("scroll", scroll, { passive: true });
		list.addEventListener("click", click);
		panel.addEventListener("wheel", wheel, { passive: false });
		measure();
		return () => {
			cancelAnimationFrame(frame);
			cancelAnimationFrame(motionFrame);
			observer.disconnect();
			mutations.disconnect();
			list.removeEventListener("scroll", scroll);
			list.removeEventListener("click", click);
			panel.removeEventListener("wheel", wheel);
		};
	}, [expanded, limit]);
	return { ref, height };
}
