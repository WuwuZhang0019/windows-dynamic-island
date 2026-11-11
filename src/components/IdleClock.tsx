import { useEffect, useState } from "react";
import { useLocale } from "../core/i18n";

/** 外壳时钟独立于已删除的业务模块。 */
function useNow(interval: number) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), interval);
		return () => window.clearInterval(timer);
	}, [interval]);
	return now;
}

/** Time in the resting pill (Windows Island style). */
export function IdleClock() {
	const locale = useLocale();
	const now = useNow(5_000);
	const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(now);
	return (
		<div className="grid h-full place-items-center text-[14px] font-[650] tracking-[0.01em] tabular-nums">{time}</div>
	);
}
