import { describe, expect, test } from "bun:test";
import {
	getSettings,
	LEGACY_BACKUP_KEY,
	LEGACY_LOCAL_KEY,
	LOCAL_KEY,
	loadBrowserPreferences,
	openTrigger,
	setSetting,
	shellPreferences,
	startSettings,
	tabsPosition,
} from "./settings";

describe("openTrigger", () => {
	test("defaults to hover", () => {
		expect(openTrigger({})).toBe("hover");
	});

	test("keeps the old 'Expand on hover' switch turned off as click", () => {
		expect(openTrigger({ "island.expandOnHover": false })).toBe("click");
		expect(openTrigger({ "island.expandOnHover": true })).toBe("hover");
	});

	test("the new setting wins over the old switch", () => {
		expect(openTrigger({ "island.expandOnHover": false, "island.openOn": "hover" })).toBe("hover");
		expect(openTrigger({ "island.openOn": "click" })).toBe("click");
	});
});

class MemoryStorage implements Storage {
	private data = new Map<string, string>();
	get length() {
		return this.data.size;
	}
	clear() {
		this.data.clear();
	}
	getItem(key: string) {
		return this.data.get(key) ?? null;
	}
	key(index: number) {
		return [...this.data.keys()][index] ?? null;
	}
	removeItem(key: string) {
		this.data.delete(key);
	}
	setItem(key: string, value: string) {
		this.data.set(key, value);
	}
}

describe("外壳偏好迁移", () => {
	test("先备份原配置，只导入保留设置，旧功能不能由配置重新启用", () => {
		const storage = new MemoryStorage();
		const legacy = JSON.stringify({
			"app.language": "zh-CN",
			"appearance.style": "windows",
			"island.expandOnHover": false,
			"module.music.enabled": true,
			"plugin.example.enabled": true,
			"shortcut.module.ask": "Ctrl+F",
			"appearance.tabsPosition": "top",
			"island.pinned": ["music"],
		});
		storage.setItem(LEGACY_LOCAL_KEY, legacy);
		const migrated = loadBrowserPreferences(storage);
		expect(migrated).toEqual({
			"app.language": "zh-CN",
			"appearance.style": "windows",
			"island.expandOnHover": false,
			"appearance.tabsPosition": "top",
			"shell.configVersion": 1,
		});
		expect(storage.getItem(LEGACY_LOCAL_KEY)).toBe(legacy);
		expect(storage.getItem(LEGACY_BACKUP_KEY)).toBe(legacy);
		expect(JSON.parse(storage.getItem(LOCAL_KEY) ?? "{}")).toEqual(migrated);
		expect(openTrigger(migrated)).toBe("click");
	});

	test("已有新配置不被后续原版修改覆盖", () => {
		const storage = new MemoryStorage();
		storage.setItem(LOCAL_KEY, JSON.stringify({ "shell.configVersion": 1, "appearance.style": "dynamic" }));
		storage.setItem(LEGACY_LOCAL_KEY, JSON.stringify({ "appearance.style": "windows" }));
		expect(loadBrowserPreferences(storage)["appearance.style"]).toBe("dynamic");
		expect(storage.getItem(LEGACY_BACKUP_KEY)).toBeNull();
	});

	test("备份失败不写入新配置", () => {
		const storage = new MemoryStorage();
		storage.setItem(LEGACY_LOCAL_KEY, "{}");
		storage.setItem = () => {
			throw new Error("quota");
		};
		expect(() => loadBrowserPreferences(storage)).toThrow("quota");
		expect(storage.getItem(LOCAL_KEY)).toBeNull();
		expect(storage.getItem(LEGACY_LOCAL_KEY)).toBe("{}");
	});

	test("既有备份与原版不一致时暂停迁移", () => {
		const storage = new MemoryStorage();
		storage.setItem(LEGACY_LOCAL_KEY, "{}");
		storage.setItem(LEGACY_BACKUP_KEY, '{"appearance.style":"windows"}');
		expect(() => loadBrowserPreferences(storage)).toThrow("LEGACY_BACKUP_MISMATCH");
		expect(storage.getItem(LOCAL_KEY)).toBeNull();
	});

	test("拒绝损坏、非对象和未来版本，原始值保持不变", () => {
		for (const raw of ["broken", "[]", "null", '{"shell.configVersion":2}']) {
			const storage = new MemoryStorage();
			storage.setItem(LOCAL_KEY, raw);
			expect(() => loadBrowserPreferences(storage)).toThrow();
			expect(storage.getItem(LOCAL_KEY)).toBe(raw);
		}
		expect(() => shellPreferences({ "shell.configVersion": 9 })).toThrow("UNSUPPORTED_SHELL_CONFIG");
	});

	test("启动读取失败后保持只读，后续控件操作不覆盖损坏配置", async () => {
		const storage = new MemoryStorage();
		storage.setItem(LOCAL_KEY, "broken");
		Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
		await startSettings();
		setSetting("appearance.style", "windows");
		expect(storage.getItem(LOCAL_KEY)).toBe("broken");
		expect(getSettings()["appearance.style"]).toBeUndefined();
	});
});

describe("expanded controls position", () => {
	test("keeps each style's original default and ignores invalid values", () => {
		expect(tabsPosition({}, "windows")).toBe("bottom");
		expect(tabsPosition({}, "dynamic")).toBe("top");
		expect(tabsPosition({ "appearance.tabsPosition": "left" }, "windows")).toBe("bottom");
		expect(tabsPosition({ "appearance.tabsPosition": null }, "dynamic")).toBe("top");
	});
	test("an explicit position works in both styles", () => {
		for (const style of ["windows", "dynamic"] as const) {
			for (const position of ["top", "bottom"] as const) {
				expect(tabsPosition({ "appearance.tabsPosition": position }, style)).toBe(position);
			}
		}
	});
	test("new browser preferences retain clock and controls position after reload", () => {
		const storage = new MemoryStorage();
		storage.setItem(LOCAL_KEY, JSON.stringify({ "appearance.tabsPosition": "top", "appearance.idleClock": false }));
		const loaded = loadBrowserPreferences(storage);
		expect(loaded["appearance.idleClock"]).toBe(false);
		expect(loaded["appearance.tabsPosition"]).toBe("top");
	});
});
