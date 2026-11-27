import assert from "node:assert/strict";
import test from "node:test";

import {
	checkCommands,
	checkEvents,
	extractGoBindings,
	extractGoEvents,
	extractScriptCommands,
	extractTsCommands,
	extractTsEvents,
} from "./check-desktop-commands.mjs";

const goSource = `
package main

func main() {
	mygo.Bind(Window{})
	mygo.Bind(ServerConfig{})
}
`;

const windowGo = `
package main

func (Window) Minimize(ctx context.Context) {}
func (Window) IsMaximized(ctx context.Context) bool { return false }
`;

const serverGo = `
package main

func (ServerConfig) GetBaseURL() string { return "" }
func (ServerConfig) SetBaseURL(newURL string) {}
`;

const tsSource = `
const native = {
  minimize: () => bridge.invoke(command("Window", "Minimize")),
  getBaseUrl: () => bridge.invoke(command("ServerConfig", "GetBaseURL")),
};
`;

test("extracts bound Go services and their exported methods", () => {
	const bindings = extractGoBindings([
		{ path: "main.go", source: goSource },
		{ path: "window.go", source: windowGo },
		{ path: "server_config.go", source: serverGo },
	]);

	assert.deepEqual([...bindings].sort(), [
		"ServerConfig.GetBaseURL",
		"ServerConfig.SetBaseURL",
		"Window.IsMaximized",
		"Window.Minimize",
	]);
});

test("extracts command names from the TypeScript SDK", () => {
	const commands = extractTsCommands([
		{ path: "capabilities/window.ts", source: tsSource },
	]);

	assert.deepEqual([...commands].sort(), [
		"ServerConfig.GetBaseURL",
		"Window.Minimize",
	]);
});

test("extracts command names from preload scripts", () => {
	const commands = extractScriptCommands([
		{
			path: "app/desktop/preload_clipboard.js",
			source:
				'runtime.call("Clipboard.ReadText"); runtime.call("Clipboard.WriteText", text);',
		},
	]);

	assert.deepEqual([...commands].sort(), [
		"Clipboard.ReadText",
		"Clipboard.WriteText",
	]);
});

test("reports commands the host does not bind", () => {
	const result = checkCommands({
		bindings: new Set(["Window.Minimize"]),
		commands: new Set(["Window.Minimize", "ServerConfig.GetBaseURL"]),
	});

	assert.deepEqual(result.missing, ["ServerConfig.GetBaseURL"]);
	assert.deepEqual(result.unused, []);
	assert.equal(result.ok, false);
});

test("reports bound methods the SDK never calls, as a warning", () => {
	const result = checkCommands({
		bindings: new Set(["Window.Minimize", "DeepLink.Open"]),
		commands: new Set(["Window.Minimize"]),
	});

	assert.deepEqual(result.missing, []);
	assert.deepEqual(result.unused, ["DeepLink.Open"]);
	assert.equal(result.ok, true);
});

test("a missing command fails the check even when nothing else is wrong", () => {
	const result = checkCommands({
		bindings: new Set(["Window.Minimize"]),
		commands: new Set(["window.minimize"]),
	});

	assert.deepEqual(result.missing, ["window.minimize"]);
	assert.equal(result.ok, false);
});

test("ignores Go methods that are not exported or not on bound types", () => {
	const bindings = extractGoBindings([
		{ path: "main.go", source: goSource },
		{
			path: "window.go",
			source: `
package main

func (Window) Minimize(ctx context.Context) {}
func (window) hidden(ctx context.Context) {}
func (proxyServer) serveDist() {}
`,
		},
	]);

	assert.deepEqual([...bindings], ["Window.Minimize"]);
});

// ---- 跨进程事件名门禁 ----

const goEventsSource = `
package main

const (
	eventOverlayVisibility = "overlay.visibility"
	eventDeeplinkOpen      = "deeplink.open"
)

var extra = mygo.NewEvent[string]("tray.menuClick")
`;

const tsEventsSource = `
export const desktopEvents = {
	overlayVisibility: "overlay.visibility",
	deeplinkOpen: "deeplink.open",
} as const;
`;

const tsListenSource = `
return bridge.listen("tray.menuClick", handler);
`;

test("extracts Go events from constants and NewEvent call sites with locations", () => {
	const events = extractGoEvents([
		{ path: "app/desktop/events.go", source: goEventsSource },
	]);

	assert.deepEqual([...events.keys()].sort(), [
		"deeplink.open",
		"overlay.visibility",
		"tray.menuClick",
	]);
	assert.equal(events.get("overlay.visibility").path, "app/desktop/events.go");
	assert.equal(events.get("tray.menuClick").path, "app/desktop/events.go");
});

test("extracts TS events from the constants module and listen call sites", () => {
	const events = extractTsEvents([
		{ path: "packages/desktop/src/events.ts", source: tsEventsSource },
		{
			path: "packages/desktop/src/capabilities/tray.ts",
			source: tsListenSource,
		},
	]);

	assert.deepEqual([...events.keys()].sort(), [
		"deeplink.open",
		"overlay.visibility",
		"tray.menuClick",
	]);
	assert.equal(
		events.get("tray.menuClick").path,
		"packages/desktop/src/capabilities/tray.ts",
	);
});

test("matching event names pass the check", () => {
	const names = ["overlay.visibility", "deeplink.open"];
	const at = (path) => new Map(names.map((n) => [n, { path, line: 3 }]));
	const result = checkEvents({
		goEvents: at("app/desktop/events.go"),
		tsEvents: at("packages/desktop/src/events.ts"),
	});

	assert.deepEqual(result.goOnly, []);
	assert.deepEqual(result.tsOnly, []);
	assert.equal(result.ok, true);
});

test("an extra Go event fails the check", () => {
	const result = checkEvents({
		goEvents: new Map([
			["overlay.visibility", { path: "app/desktop/events.go", line: 2 }],
			["overlay.extra", { path: "app/desktop/events.go", line: 3 }],
		]),
		tsEvents: new Map([
			[
				"overlay.visibility",
				{ path: "packages/desktop/src/events.ts", line: 2 },
			],
		]),
	});

	assert.deepEqual(result.goOnly, ["overlay.extra"]);
	assert.deepEqual(result.tsOnly, []);
	assert.equal(result.ok, false);
});

test("an extra TS event fails the check", () => {
	const result = checkEvents({
		goEvents: new Map([
			["overlay.visibility", { path: "app/desktop/events.go", line: 2 }],
		]),
		tsEvents: new Map([
			[
				"overlay.visibility",
				{ path: "packages/desktop/src/events.ts", line: 2 },
			],
			[
				"overlay.extra",
				{ path: "packages/desktop/src/capabilities/overlay.ts", line: 9 },
			],
		]),
	});

	assert.deepEqual(result.goOnly, []);
	assert.deepEqual(result.tsOnly, ["overlay.extra"]);
	assert.equal(result.ok, false);
});
