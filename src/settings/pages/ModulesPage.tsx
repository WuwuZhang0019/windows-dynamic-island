// Date: 2026-11-12. Task size is controlled from the island toolbar.
import { ArchivedTasks } from "../components/ArchivedTasks";
import { Title } from "../components/Heading";

export function ModulesPage() {
	return (
		<>
			<Title>任务列表</Title>
			<ArchivedTasks />
		</>
	);
}
