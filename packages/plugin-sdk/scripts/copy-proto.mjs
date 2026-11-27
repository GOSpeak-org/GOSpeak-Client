import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "../..");
const destination = resolve(packageRoot, "proto/plugin.proto");

// 三仓拆分后 proto 单一事实源在 GOSpeak-Server 仓（旧路径 app/server → server/server）。
// 优先用 GOSPEAK_SERVER_PROTO 显式指定的服务端检出，其次同级的 server 仓；
// 两者都不在时退回本仓已版本化的快照，保证 CI 与无服务端检出时 test/build 可用。
const candidates = [
	process.env.GOSPEAK_SERVER_PROTO,
	resolve(repoRoot, "../server/server/plugin/proto/plugin.proto"),
	resolve(repoRoot, "../app/server/plugin/proto/plugin.proto"),
].filter((candidate) => typeof candidate === "string" && candidate.length > 0);

const source = candidates.find((candidate) => existsSync(candidate));

mkdirSync(dirname(destination), { recursive: true });
if (source) {
	copyFileSync(source, destination);
	console.log(`copied plugin.proto from ${source} (single source of truth)`);
} else if (existsSync(destination)) {
	console.log(
		"server proto checkout not found; using checked-in proto/plugin.proto snapshot",
	);
} else {
	console.error(
		"plugin.proto missing: no server checkout found and no checked-in snapshot",
	);
	process.exit(1);
}
