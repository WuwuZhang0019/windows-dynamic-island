// Date: 2026-11-12. Modules exposes only the task-list display size.
import { Card, Row } from "../../components/ui/card";
import { Segmented } from "../../components/ui/form";
import { setSetting, type Values } from "../../core/settings";
import { TASK_SIZE_KEY, taskSize } from "../../workbench/list-preferences";
import { Title } from "../components/Heading";

export function ModulesPage({ values }: { values: Values }) {
	return (
		<>
			<Title>模块</Title>
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
		</>
	);
}
