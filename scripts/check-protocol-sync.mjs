#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_REPO = "GOSpeak-org/GOSpeak-Server";
const FILES = ["events.ts", "payloads.ts", "envelope.ts"];
const COMPAT_PATH = join(ROOT, "server-compat.json");

function serverRef() {
	try {
		const data = JSON.parse(readFileSync(COMPAT_PATH, "utf8"));
		return data.serverRef || "release";
	} catch {
		return "release";
	}
}

function rawUrl(file, ref) {
	return `https://raw.githubusercontent.com/${SERVER_REPO}/${ref}/server/internal/genprotocol/testdata/golden/${file}`;
}

async function main() {
	const fix = process.argv.includes("--fix");
	const ref = serverRef();
	let drift = 0;

	for (const file of FILES) {
		const response = await fetch(rawUrl(file, ref));
		if (!response.ok) {
			console.error(
				`::error::failed to fetch ${file} from ${SERVER_REPO}@${ref}: ${response.status}`,
			);
			process.exitCode = 1;
			continue;
		}
		const remote = await response.text();
		const localPath = join(ROOT, "web", "src", "protocol", "generated", file);
		let local = "";
		try {
			local = readFileSync(localPath, "utf8");
		} catch {
			local = "";
		}
		if (local === remote) {
			console.log(`${file}: in sync`);
		} else {
			drift++;
			console.log(`${file}: drift from ${SERVER_REPO}@${ref}`);
			if (fix) {
				writeFileSync(localPath, remote);
				console.log(`${file}: fixed`);
			}
		}
	}

	if (drift > 0 && !fix) {
		console.error(
			`::error::protocol generated files are out of sync with ${SERVER_REPO}@${ref}; run node scripts/check-protocol-sync.mjs --fix`,
		);
		process.exitCode = 1;
	}
}

main();
