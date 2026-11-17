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
			if (!align) chooseVisible();
			schedule();
		};
		const click = (event: MouseEvent) => {
			const card = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-route-card]") : null;
			if (card && card !== active) {
				active = card;
				align = true;
				schedule();
			}
		};
		const mutations = new MutationObserver(schedule);
		mutations.observe(root, { childList: true, subtree: true });
		list.addEventListener("scroll", scroll, { passive: true });
		list.addEventListener("click", click);
		measure();
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			mutations.disconnect();
			list.removeEventListener("scroll", scroll);
			list.removeEventListener("click", click);
		};
	}, [expanded, limit]);
	return { ref, height };
}
