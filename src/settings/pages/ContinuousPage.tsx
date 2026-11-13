// Date: 2026-11-13. Selecting a default mode does not start or steer an existing run.
import { Card, Desc } from "../../components/ui/card";
import { CONTINUOUS_MODE_KEY, continuousMode, setSetting, type Values } from "../../core/settings";
import { Title } from "../components/Heading";

const choices = [
	{
		value: "stages",
		label: "阶段完成后接续新会话",
		description: "等待正在执行的阶段验收通过，再按方案的阶段和会话分工创建后续会话。推荐作为默认方式。",
	},
	{
		value: "current_thread",
		label: "立即通知当前会话持续执行",
		description:
			"立即向当前会话发送持续执行指令，在该会话中按依赖和验收要求接续后续阶段；涉及不同工作树时，会停下并说明原因。",
	},
] as const;

export function ContinuousPage({ values }: { values: Values }) {
	const mode = continuousMode(values);
	return (
		<>
			<Title>连续执行</Title>
			<Desc>选择任务卡片上“连续执行”按钮的默认行为。更改后，在下次开启、恢复或重试时使用；不会立即启动任务。</Desc>
			<Card>
				<fieldset className="flex flex-col gap-1 py-3">
					<legend className="pt-2 text-[14px] font-semibold">连续执行方式</legend>
					{choices.map((choice) => (
						<label
							key={choice.value}
							className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-3 hover:bg-white/4"
						>
							<input
								type="radio"
								name="continuous-mode"
								value={choice.value}
								checked={mode === choice.value}
								onChange={() => setSetting(CONTINUOUS_MODE_KEY, choice.value)}
								className="mt-1 accent-[#b996f2]"
							/>
							<span className="flex flex-col gap-1">
								<span className="text-[14px] font-medium">{choice.label}</span>
								<Desc>{choice.description}</Desc>
							</span>
						</label>
					))}
				</fieldset>
			</Card>
			<Desc>
				两种方式都会核对方案版本、工作目录、前置依赖与验收结果。关闭按钮会停止后续接续，当前阶段继续完成；遇到阻塞时保留已开启状态并显示原因，可处理后重试或手动关闭。
			</Desc>
		</>
	);
}
