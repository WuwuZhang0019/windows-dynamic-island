// Date: 2026-11-13. Build-time service assets; installed apps use only bundled files.
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "runtime/workbench");
const source =
	process.env.WORKBENCH_RUNTIME_SOURCE ?? path.resolve(root, "../Codex-task-monitoring/app/desktop/resources");
try {
	await access(path.join(source, "node.exe"));
	await access(path.join(source, "app/desktop/service.mjs"));
	await mkdir(destination, { recursive: true });
	await cp(source, destination, { recursive: true });
} catch (error) {
	try {
		await access(path.join(destination, "node.exe"));
		await access(path.join(destination, "app/desktop/service.mjs"));
	} catch {
		throw Error("Generate the service distribution first, or set WORKBENCH_RUNTIME_SOURCE to its resource directory.", {
			cause: error,
		});
	}
}
