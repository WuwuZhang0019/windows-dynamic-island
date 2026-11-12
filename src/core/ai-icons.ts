// Date: 2026-11-12. Offline artwork lookup; brand aliases never determine MCP identity.
import catalog from "./ai-icon-catalog.json";

export const aiIcons = catalog;
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function findAIIcon(appId: string, name = appId) {
	const keys = new Set([normalize(appId), normalize(name)]);
	return aiIcons.find((icon) => [icon.id, icon.name, ...icon.aliases].some((alias) => keys.has(normalize(alias))));
}
export function aiIconPath(icon: (typeof aiIcons)[number]) {
	return `/ai-icons/${icon.id}${icon.color ? "-color" : ""}.svg`;
}
