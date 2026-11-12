// Date: 2026-11-12. MCP settings retain the existing service authorization and binding flow.
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
