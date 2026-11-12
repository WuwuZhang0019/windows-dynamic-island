// Date: 2026-11-12. Task size is controlled from the island toolbar.
import { ArchivedTasks } from "../components/ArchivedTasks";
import { Title } from "../components/Heading";

export function ModulesPage() {
	return (
		<>
			<Title>已归档任务</Title>
			<ArchivedTasks />
		</>
	);
}
