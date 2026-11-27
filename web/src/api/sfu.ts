import { DEFAULT_SFU_PROVIDER } from "@gospeak/sfu-client";
import type { SFUProvider } from "@gospeak/sfu-client/types";
import apiClient from "./apiClient";

import type { SFUMediaCapabilities } from "./sfuProfiles";
export type { SFUProvider } from "@gospeak/sfu-client/types";

export * from "./sfuProfiles";

export interface GetJoinTokenParams {
	room: string;
	identity: string;
	password?: string;
	domain_uuid?: string;
}

export interface JoinTokenResponse {
	token: string;
	serverUrl: string;
	workerUrl?: string;
	room: string;
	sfuRoom?: string;
	domain_uuid?: string;
	identity: string;
	provider?: SFUProvider;
	appId?: string;
	whipUrl?: string;
	stream?: string;
	streamToken?: string;
	capabilities?: SFUMediaCapabilities;
}

/** Frontend adapter flags + defaults for media capabilities. */

export interface SFUConfig {
	provider: SFUProvider;
	livekit_host: string;
	livekit_key: string;
	/** 管理端读取时始终为空；提交时留空表示保留旧值 */
	livekit_secret: string;
	livekit_secret_set?: boolean;
	created_at?: string;
	updated_at?: string;
}

/** 更新请求只要求 provider；其余字段按当前 SFU 提供商局部提交。 */

/** 更新请求只要求 provider；其余字段按当前 SFU 提供商局部提交。 */
export type UpdateSFUConfigParams = {
	provider: SFUProvider;
} & Partial<
	Omit<
		SFUConfig,
		"provider" | "created_at" | "updated_at" | "livekit_secret_set"
	>
>;

export interface SFUProvidersListResponse {
	providers: SFUConfig[];
	active: SFUProvider;
	capabilities?: Partial<Record<SFUProvider, SFUMediaCapabilities>>;
}

export type SFUConfigSource = "env" | "db";

/** 实际生效的配置视图：值来自 ResolveConfig，sources 标注每个字段来自 env 还是 DB。 */
export interface EffectiveSFUConfig {
	provider: SFUProvider;
	/** 后端访问 LiveKit 的地址（admin API），不是浏览器连接地址。 */
	livekit_host: string;
	livekit_key: string;
	livekit_secret_set: boolean;
	livekit_public_url: string;
	/** 浏览器实际连接的 LiveKit 地址（由请求推导或 LIVEKIT_PUBLIC_URL）。 */
	browser_server_url: string;
	sources: Record<
		"livekit_host" | "livekit_key" | "livekit_secret",
		SFUConfigSource
	>;
}

/** 获取当前激活 provider 的配置 */

/** 获取当前激活 provider 的配置 */
export async function getSFUConfig(): Promise<SFUConfig> {
	const data = await apiClient.post<SFUConfig>({
		url: "/api/v1/sfu/config",
	});

	if (!data) throw new Error("sfu config is missing");
	return data;
}

/** 获取指定 provider 的配置（新） */

/** 获取指定 provider 的配置（新） */
export async function getSFUConfigByProvider(
	provider: SFUProvider,
): Promise<SFUConfig> {
	const data = await apiClient.post<SFUConfig>({
		url: `/api/v1/sfu/config/${provider}`,
	});

	if (!data) throw new Error("sfu config is missing");
	return data;
}

/** 获取实际生效的配置视图（含 env/DB 来源标注） */
export async function getEffectiveSFUConfig(): Promise<EffectiveSFUConfig> {
	const data = await apiClient.post<EffectiveSFUConfig>({
		url: "/api/v1/sfu/effective-config",
	});

	if (!data) throw new Error("effective sfu config is missing");
	return data;
}

/** 更新指定 provider 的配置并激活为当前（语义不变，但后端已改为 per-provider 行） */
export async function updateSFUConfig(
	params: UpdateSFUConfigParams,
): Promise<SFUConfig> {
	const data = await apiClient.post<SFUConfig>({
		url: "/api/v1/sfu/update-config",
		data: params,
	});

	if (!data) throw new Error("sfu config is missing");
	return data;
}

/** 获取所有已配置 provider 列表 + 当前激活的 provider（新） */

/** 获取所有已配置 provider 列表 + 当前激活的 provider（新） */
export async function listSFUProviders(): Promise<SFUProvidersListResponse> {
	const data = await apiClient.post<SFUProvidersListResponse>({
		url: "/api/v1/sfu/providers",
	});

	if (!data) throw new Error("sfu providers list is missing");
	return data;
}

export async function getJoinToken(
	params: GetJoinTokenParams,
	signal?: AbortSignal,
): Promise<JoinTokenResponse> {
	const data = await apiClient.post<JoinTokenResponse>({
		url: "/api/v1/signal/token",
		data: params,
		signal,
	});

	if (!data) throw new Error("join token response is missing");
	return data;
}

export function resolveSFUProvider(
	_response: Pick<JoinTokenResponse, "provider">,
): SFUProvider {
	return DEFAULT_SFU_PROVIDER;
}
