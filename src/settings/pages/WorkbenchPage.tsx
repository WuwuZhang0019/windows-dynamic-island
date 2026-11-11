// Date: 2026-11-12. Dedicated settings destination for workbench connection and binding confirmation.
import { Title } from "../components/Heading";
import { WorkbenchConnection } from "../components/WorkbenchConnection";

export function WorkbenchPage() {
	return (
		<>
			<Title>工作台</Title>
			<WorkbenchConnection />
		</>
	);
}
