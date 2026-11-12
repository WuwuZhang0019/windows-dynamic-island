// Date: 2026-11-12. Locally bundled provider artwork with a safe fallback for arbitrary agents.
import { BotIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";
import { aiIconPath, findAIIcon } from "../core/ai-icons";
import "./ai-provider-icon.css";

export function AIProviderIcon({ appId, name, size = 24 }: { appId: string; name?: string; size?: number }) {
	const icon = findAIIcon(appId, name);
	const src = icon ? aiIconPath(icon) : "";
	const [failed, setFailed] = useState("");
	if (!icon || failed === src) {
		const Fallback = appId === "dsh" ? TerminalIcon : BotIcon;
		return <Fallback size={size} aria-hidden="true" className="ai-provider-fallback" />;
	}
	return (
		<img
			src={src}
			alt=""
			width={size}
			height={size}
			className={icon.color ? "ai-provider-icon" : "ai-provider-icon ai-provider-icon-mono"}
			onError={() => setFailed(src)}
		/>
	);
}
