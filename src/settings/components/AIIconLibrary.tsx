// Date: 2026-11-12. Searchable reserve artwork, separate from real connection records.
import { useState } from "react";
import { AIProviderIcon } from "../../components/AIProviderIcon";
import { Collapsible } from "../../components/ui/card";
import { aiIcons } from "../../core/ai-icons";

export function AIIconLibrary() {
	const [search, setSearch] = useState("");
	const query = search.trim().toLocaleLowerCase();
	const icons = aiIcons.filter((icon) =>
		[icon.id, icon.name, ...icon.aliases].join(" ").toLocaleLowerCase().includes(query),
	);
	return (
		<Collapsible title={`备用图标 · ${aiIcons.length}`}>
			<div className="mcp-icon-library">
				<input
					type="search"
					aria-label="搜索备用图标"
					placeholder="搜索名称，如 DeepSeek、通义、Claude"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
				/>
				<div className="mcp-icon-grid" data-ai-icon-library>
					{icons.map((icon) => (
						<div key={icon.id} className="mcp-icon-tile" title={icon.name}>
							<AIProviderIcon appId={icon.id} size={26} />
							<span>{icon.name}</span>
						</div>
					))}
				</div>
				{!icons.length && <p className="text-xs text-text-faint">未找到图标，新应用仍可正常接入。</p>}
				<p className="text-xs text-text-faint">图标已保存在本机；应用接入后自动匹配，其他应用使用通用图标。</p>
			</div>
		</Collapsible>
	);
}
