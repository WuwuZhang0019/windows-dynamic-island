// Date: 2026-11-12. Task size and archived task management share this settings page.
import { Card, Row } from "../../components/ui/card";
import { Segmented } from "../../components/ui/form";
import { setSetting, type Values } from "../../core/settings";
import { TASK_SIZE_KEY, taskSize } from "../../workbench/list-preferences";
import { ArchivedTasks } from "../components/ArchivedTasks";
import { Title } from "../components/Heading";

export function ModulesPage({ values }: { values: Values }) {
	return (
		<>
			<Title>任务列表</Title>
			<Card>
				<Row label="任务显示大小" desc="大：完整路线图卡片；小：紧凑列表行。">
					<Segmented
						options={[
							{ value: "large", label: "大" },
							{ value: "small", label: "小" },
						]}
						value={taskSize(values)}
						onChange={(value) => setSetting(TASK_SIZE_KEY, value)}
					/>
				</Row>
			</Card>
			<ArchivedTasks />
		</>
	);
}
