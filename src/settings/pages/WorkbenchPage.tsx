// Date: 2026-11-12. Simple Codex connection with automatic local association and live presence.
import { Title } from "../components/Heading";
import { WorkbenchConnection } from "../components/WorkbenchConnection";

export function WorkbenchPage() {
	return (
		<>
			<Title>MCP</Title>
			<WorkbenchConnection />
		</>
	);
}
