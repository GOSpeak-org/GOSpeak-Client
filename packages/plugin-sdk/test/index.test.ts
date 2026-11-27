import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as loader from "@grpc/proto-loader";

const { loadPackageDefinition } = grpc;
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const protoPath = resolve(here, "../proto/plugin.proto");

type Call = {
	service: string;
	method: string;
	request: Record<string, unknown>;
};

async function startFakeHost() {
	const packageDefinition = loader.loadSync(protoPath, {
		keepCase: true,
		longs: String,
		enums: String,
		defaults: true,
		oneofs: true,
	});
	const proto = loadPackageDefinition(packageDefinition) as any;
	const calls: Call[] = [];
	const server = new grpc.Server();
	const record =
		(service: string, method: string) => (call: any, callback: any) => {
			calls.push({ service, method, request: call.request });
			callback(null, {});
		};

	server.addService(proto.gospeak.plugin.v1.RegistrationService.service, {
		Register: (call: any, callback: any) => {
			calls.push({
				service: "registration",
				method: "Register",
				request: call.request,
			});
			callback(null, { api_endpoint: "127.0.0.1:1", confirmed_pages: [] });
		},
		Heartbeat: record("registration", "Heartbeat"),
	});
	server.addService(proto.gospeak.plugin.v1.PluginAPIService.service, {
		GetUser: (call: any, callback: any) => {
			calls.push({ service: "api", method: "GetUser", request: call.request });
			callback(null, {
				user_uuid: call.request.user_uuid,
				username: "alice",
				display_name: "Alice",
			});
		},
		ListRooms: (call: any, callback: any) => {
			calls.push({
				service: "api",
				method: "ListRooms",
				request: call.request,
			});
			callback(null, { rooms: [{ room_uuid: "room-1", name: "Lounge" }] });
		},
		MuteUser: (call: any, callback: any) => {
			calls.push({ service: "api", method: "MuteUser", request: call.request });
			callback(null, { ok: true });
		},
		CreateRoom: (call: any, callback: any) => {
			calls.push({
				service: "api",
				method: "CreateRoom",
				request: call.request,
			});
			callback(null, { room_uuid: "room-created" });
		},
		GetConfig: (call: any, callback: any) => {
			calls.push({
				service: "api",
				method: "GetConfig",
				request: call.request,
			});
			callback(null, { config_json: JSON.stringify({ threshold: 3 }) });
		},
		KVSave: record("api", "KVSave"),
		KVLoad: (call: any, callback: any) => {
			calls.push({ service: "api", method: "KVLoad", request: call.request });
			callback(null, { value_json: JSON.stringify({ hits: 7 }), found: true });
		},
		ReportError: record("api", "ReportError"),
	});
	server.addService(proto.gospeak.plugin.v1.PluginHookService.service, {
		HandleEvent: record("hook", "HandleEvent"),
	});

	const port = await new Promise<number>((resolvePort, reject) => {
		server.bindAsync(
			"127.0.0.1:0",
			grpc.ServerCredentials.createInsecure(),
			(err, boundPort) => {
				if (err) reject(err);
				else resolvePort(boundPort);
			},
		);
	});
	return { server, port, calls };
}

describe("plugin SDK", () => {
	let tempDir: string;
	let credentialPath: string;
	let host: Awaited<ReturnType<typeof startFakeHost>>;
	const previousEnv = process.env.GOSPEAK_PLUGIN_CREDENTIAL;

	beforeEach(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "gospeak-plugin-sdk-"));
		credentialPath = join(tempDir, "credential");
		host = await startFakeHost();
		writeFileSync(credentialPath, `127.0.0.1:${host.port}`, { mode: 0o600 });
		process.env.GOSPEAK_PLUGIN_CREDENTIAL = credentialPath;
	});

	afterEach(async () => {
		if (previousEnv === undefined) delete process.env.GOSPEAK_PLUGIN_CREDENTIAL;
		else process.env.GOSPEAK_PLUGIN_CREDENTIAL = previousEnv;
		await new Promise<void>((resolveClose, rejectClose) =>
			host.server.tryShutdown((err) =>
				err ? rejectClose(err) : resolveClose(),
			),
		);
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("reads credential file and completes Register during createPlugin", async () => {
		const { createPlugin } = await import("../src/index.ts");
		const plugin = await createPlugin({
			pluginId: "com.example.audit",
			name: "内容审核插件",
			version: "1.2.0",
			hookTypes: ["message.created", "room.joined"],
			onEvent: () => {},
		});

		expect(plugin.pluginId).toBe("com.example.audit");
		const register = host.calls.find((c) => c.method === "Register");
		expect(register?.request).toMatchObject({
			plugin_id: "com.example.audit",
			name: "内容审核插件",
			version: "1.2.0",
			hook_types: ["message.created", "room.joined"],
		});
		expect(register?.request.hook_endpoint).toMatch(/^127\.0\.0\.1:\d+$/);
		await plugin.close();
	});

	it("exposes api methods that call the host over gRPC", async () => {
		const { createPlugin } = await import("../src/index.ts");
		const plugin = await createPlugin({
			pluginId: "com.example.audit",
			name: "audit",
			version: "1.0.0",
			hookTypes: [],
			onEvent: () => {},
		});

		expect(await plugin.api.getUser("user-uuid-1")).toEqual({
			userUuid: "user-uuid-1",
			username: "alice",
			displayName: "Alice",
		});
		expect(await plugin.api.listRooms("domain-uuid-1")).toEqual([
			{ roomUuid: "room-1", name: "Lounge" },
		]);
		expect(
			await plugin.api.muteUser({
				userUuid: "user-uuid-1",
				roomUuid: "room-1",
				reason: "spam",
			}),
		).toBe(true);
		expect(
			await plugin.api.createRoom({
				domainUuid: "domain-uuid-1",
				name: "Review",
				reason: "moderation",
			}),
		).toBe("room-created");
		const muteCall = host.calls.find((c) => c.method === "MuteUser");
		expect(muteCall?.request).toMatchObject({
			user_uuid: "user-uuid-1",
			room_uuid: "room-1",
			reason: "spam",
		});
		expect(
			(muteCall?.request as Record<string, unknown> | undefined)?.request_id,
		).toEqual(expect.any(String));
		const createCall = host.calls.find((c) => c.method === "CreateRoom");
		expect(createCall?.request).toMatchObject({
			domain_uuid: "domain-uuid-1",
			name: "Review",
			reason: "moderation",
		});
		expect(
			(createCall?.request as Record<string, unknown> | undefined)?.request_id,
		).toEqual(expect.any(String));
		await plugin.close();
	});

	it("exposes config, kv and reportError", async () => {
		const { createPlugin } = await import("../src/index.ts");
		const plugin = await createPlugin({
			pluginId: "com.example.audit",
			name: "audit",
			version: "1.0.0",
			hookTypes: ["message.created"],
			onEvent: () => {},
		});

		expect(await plugin.config.get()).toEqual({ threshold: 3 });
		await plugin.kv.save("state", { hits: 7 }, "checkpoint");
		expect(await plugin.kv.load("state")).toEqual({ hits: 7 });
		await plugin.reportError("boom", { code: 42 });

		const save = host.calls.find((c) => c.method === "KVSave")
			?.request as Record<string, unknown>;
		expect(save).toMatchObject({
			plugin_id: "com.example.audit",
			key: "state",
			reason: "checkpoint",
		});
		expect(JSON.parse(save.value_json as string)).toEqual({ hits: 7 });
		const report = host.calls.find((c) => c.method === "ReportError")
			?.request as Record<string, unknown>;
		expect(report).toMatchObject({
			plugin_id: "com.example.audit",
			message: "boom",
		});
		expect(JSON.parse(report.details_json as string)).toEqual({ code: 42 });
		await plugin.close();
	});

	it("dispatches HandleEvent to onEvent and registered on() handlers", async () => {
		const { createPlugin } = await import("../src/index.ts");
		const received: string[] = [];
		const plugin = await createPlugin({
			pluginId: "com.example.audit",
			name: "audit",
			version: "1.0.0",
			hookTypes: ["message.created"],
			onEvent: (event) => received.push(`onEvent:${event}`),
		});
		plugin.on("message.created", (payload) =>
			received.push(`on:${(payload as { id: string }).id}`),
		);

		const packageDefinition = loader.loadSync(protoPath, {
			keepCase: true,
			defaults: true,
		});
		const proto = loadPackageDefinition(packageDefinition) as any;
		const client = new proto.gospeak.plugin.v1.PluginHookService(
			plugin.hookEndpoint,
			grpc.credentials.createInsecure(),
		);
		await new Promise<void>((resolveSend, rejectSend) =>
			client.HandleEvent(
				{
					plugin_id: "com.example.audit",
					event_type: "message.created",
					payload_json: JSON.stringify({ id: "m-1" }),
					request_id: randomUUID(),
				},
				(err: Error | null) => (err ? rejectSend(err) : resolveSend()),
			),
		);
		await new Promise((resolveTick) => setTimeout(resolveTick, 20));
		expect(received).toEqual(["onEvent:message.created", "on:m-1"]);
		client.close();
		await plugin.close();
	});

	it("fails with a clear error when credential env is missing", async () => {
		delete process.env.GOSPEAK_PLUGIN_CREDENTIAL;
		const { createPlugin } = await import("../src/index.ts");
		await expect(
			createPlugin({
				pluginId: "com.example.audit",
				name: "audit",
				version: "1.0.0",
				hookTypes: [],
				onEvent: () => {},
			}),
		).rejects.toThrow(/GOSPEAK_PLUGIN_CREDENTIAL/);
	});
});
