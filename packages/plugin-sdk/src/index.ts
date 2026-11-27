import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

export interface PluginPage {
	routePath: string;
	mode: string;
	entryUrl: string;
}

export interface CreatePluginOptions {
	pluginId: string;
	name: string;
	version: string;
	hookTypes?: string[];
	pages?: PluginPage[];
	onEvent: (event: string, payload: unknown) => void;
}

export interface PluginUser {
	userUuid: string;
	username: string;
	displayName: string;
}

export interface PluginRoom {
	roomUuid: string;
	name: string;
}

export interface MuteUserInput {
	userUuid: string;
	roomUuid: string;
	reason: string;
	requestId?: string;
}

export interface CreateRoomInput {
	domainUuid: string;
	name: string;
	reason: string;
	requestId?: string;
}

export type EventHandler = (payload: unknown) => void;

export interface PluginApi {
	getUser(userUuid: string): Promise<PluginUser>;
	listRooms(domainUuid: string): Promise<PluginRoom[]>;
	muteUser(input: MuteUserInput): Promise<boolean>;
	createRoom(input: CreateRoomInput): Promise<string>;
}

export interface Plugin {
	pluginId: string;
	hookEndpoint: string;
	api: PluginApi;
	on(event: string, handler: EventHandler): void;
	config: { get(): Promise<Record<string, unknown>> };
	kv: {
		save(key: string, value: unknown, reason?: string): Promise<void>;
		load<T = unknown>(key: string): Promise<T | undefined>;
	};
	reportError(message: string, details?: unknown): Promise<void>;
	close(): Promise<void>;
}

type GrpcClient = Record<
	string,
	(
		request: Record<string, unknown>,
		callback: (err: Error | null, response: any) => void,
	) => void
> & { close(): void };
type GrpcService = any;

const here = dirname(fileURLToPath(import.meta.url));
const protoPath = resolve(here, "../proto/plugin.proto");

function loadProto(): any {
	const definition = protoLoader.loadSync(protoPath, {
		keepCase: true,
		longs: String,
		enums: String,
		defaults: true,
		oneofs: true,
	});
	return grpc.loadPackageDefinition(definition) as any;
}

function readEndpoint(): string {
	const credentialPath = process.env.GOSPEAK_PLUGIN_CREDENTIAL;
	if (!credentialPath) {
		throw new Error(
			"GOSPEAK_PLUGIN_CREDENTIAL is not set; plugin SDK requires the host credential file",
		);
	}
	const content = readFileSync(credentialPath, "utf8").trim();
	const match = /^127\.0\.0\.1:(\d+)$/.exec(content);
	if (!match) {
		throw new Error(
			"invalid GOSPEAK_PLUGIN_CREDENTIAL content; expected 127.0.0.1:<port>",
		);
	}
	return content;
}

function unary<T>(
	client: GrpcClient,
	method: string,
	request: Record<string, unknown>,
): Promise<T> {
	return new Promise<T>((resolveUnary, reject) => {
		client[method](request, (err, response) => {
			if (err) reject(err);
			else resolveUnary(response as T);
		});
	});
}

export async function createPlugin(
	options: CreatePluginOptions,
): Promise<Plugin> {
	const endpoint = readEndpoint();
	const proto = loadProto();
	const registration = new proto.gospeak.plugin.v1.RegistrationService(
		endpoint,
		grpc.credentials.createInsecure(),
	) as GrpcClient;
	const apiClient = new proto.gospeak.plugin.v1.PluginAPIService(
		endpoint,
		grpc.credentials.createInsecure(),
	) as GrpcClient;

	const handlers = new Map<string, EventHandler[]>();
	const eventService: GrpcService =
		proto.gospeak.plugin.v1.PluginHookService.service;
	const hookServer = new grpc.Server();
	hookServer.addService(eventService, {
		HandleEvent: (call: any, callback: any) => {
			const event = call.request.event_type as string;
			let payload: unknown = null;
			try {
				payload = JSON.parse(call.request.payload_json || "null");
			} catch {
				payload = call.request.payload_json;
			}
			options.onEvent(event, payload);
			for (const handler of handlers.get(event) ?? []) handler(payload);
			callback(null, {});
		},
	});
	const hookPort = await new Promise<number>((resolveBind, rejectBind) => {
		hookServer.bindAsync(
			"127.0.0.1:0",
			grpc.ServerCredentials.createInsecure(),
			(err, port) => {
				if (err) rejectBind(err);
				else resolveBind(port);
			},
		);
	});

	try {
		await unary(registration, "Register", {
			plugin_id: options.pluginId,
			name: options.name,
			version: options.version,
			hook_types: options.hookTypes ?? [],
			hook_endpoint: `127.0.0.1:${hookPort}`,
			pages: (options.pages ?? []).map((page) => ({
				route_path: page.routePath,
				mode: page.mode,
				entry_url: page.entryUrl,
			})),
		});
	} catch (err) {
		await new Promise<void>((resolveClose) =>
			hookServer.tryShutdown(() => resolveClose()),
		);
		throw err;
	}

	return {
		pluginId: options.pluginId,
		hookEndpoint: `127.0.0.1:${hookPort}`,
		api: {
			async getUser(userUuid) {
				const response = await unary<Record<string, string>>(
					apiClient,
					"GetUser",
					{ user_uuid: userUuid },
				);
				return {
					userUuid: response.user_uuid,
					username: response.username,
					displayName: response.display_name,
				};
			},
			async listRooms(domainUuid) {
				const response = await unary<{ rooms: Array<Record<string, string>> }>(
					apiClient,
					"ListRooms",
					{
						domain_uuid: domainUuid,
					},
				);
				return (response.rooms ?? []).map((room) => ({
					roomUuid: room.room_uuid,
					name: room.name,
				}));
			},
			async muteUser(input) {
				const response = await unary<{ ok: boolean }>(apiClient, "MuteUser", {
					user_uuid: input.userUuid,
					room_uuid: input.roomUuid,
					reason: input.reason,
					request_id: input.requestId ?? randomUUID(),
				});
				return response.ok;
			},
			async createRoom(input) {
				const response = await unary<{ room_uuid: string }>(
					apiClient,
					"CreateRoom",
					{
						domain_uuid: input.domainUuid,
						name: input.name,
						reason: input.reason,
						request_id: input.requestId ?? randomUUID(),
					},
				);
				return response.room_uuid;
			},
		},
		on(event, handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		config: {
			async get() {
				const response = await unary<{ config_json: string }>(
					apiClient,
					"GetConfig",
					{
						plugin_id: options.pluginId,
					},
				);
				return JSON.parse(response.config_json || "{}");
			},
		},
		kv: {
			async save(key, value, reason) {
				await unary(apiClient, "KVSave", {
					plugin_id: options.pluginId,
					key,
					value_json: JSON.stringify(value ?? null),
					reason: reason ?? "plugin sdk kv save",
					request_id: randomUUID(),
				});
			},
			async load<T>(key: string) {
				const response = await unary<{ value_json: string; found: boolean }>(
					apiClient,
					"KVLoad",
					{
						plugin_id: options.pluginId,
						key,
					},
				);
				return response.found
					? (JSON.parse(response.value_json) as T)
					: undefined;
			},
		},
		async reportError(message, details) {
			await unary(apiClient, "ReportError", {
				plugin_id: options.pluginId,
				message,
				details_json: JSON.stringify(details ?? null),
				request_id: randomUUID(),
			});
		},
		async close() {
			registration.close();
			apiClient.close();
			await new Promise<void>((resolveClose, rejectClose) =>
				hookServer.tryShutdown((err) =>
					err ? rejectClose(err) : resolveClose(),
				),
			);
		},
	};
}
