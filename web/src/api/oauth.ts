import apiClient from "./apiClient";

export interface OAuthProvider {
	id: number;
	name: string;
	display_name: string;
	icon_url: string;
	client_id: string;
	/** 管理端读取时始终为空；提交时留空表示保留旧值 */
	client_secret: string;
	client_secret_set?: boolean;
	auth_url: string;
	token_url: string;
	userinfo_url: string;
	redirect_url: string;
	scopes: string;
	uid_field: string;
	username_field: string;
	avatar_field: string;
	email_field: string;
	enabled: boolean;
	created_at: string;
	updated_at: string;
}

export interface EnabledProvider {
	name: string;
	display_name: string;
	icon_url: string;
}

/** 当前用户已绑定的第三方账号（服务端返回，无 token）。 */
export interface LinkedAccount {
	provider: string;
	display_name: string;
	icon_url: string;
}

export interface CreateProviderInput {
	name: string;
	display_name?: string;
	icon_url?: string;
	client_id?: string;
	client_secret?: string;
	auth_url?: string;
	token_url?: string;
	user_info_url?: string;
	redirect_url?: string;
	scopes?: string;
	uid_field?: string;
	username_field?: string;
	avatar_field?: string;
	email_field?: string;
	enabled?: boolean;
}

export interface UpdateProviderInput {
	id: number;
	name?: string;
	display_name?: string;
	icon_url?: string;
	client_id?: string;
	client_secret?: string;
	auth_url?: string;
	token_url?: string;
	user_info_url?: string;
	redirect_url?: string;
	scopes?: string;
	uid_field?: string;
	username_field?: string;
	avatar_field?: string;
	email_field?: string;
	enabled?: boolean;
}

export function listProviders(): Promise<OAuthProvider[]> {
	return apiClient.get<OAuthProvider[]>({
		url: "/api/v1/oauth/admin/providers",
	});
}

export function listEnabledProviders(opts?: {
	skipErrorToast?: boolean;
}): Promise<EnabledProvider[]> {
	return apiClient.get<EnabledProvider[]>({
		url: "/api/v1/oauth/providers",
		skipErrorToast: opts?.skipErrorToast,
	});
}

export function createProvider(
	input: CreateProviderInput,
): Promise<OAuthProvider> {
	return apiClient.post<OAuthProvider>({
		url: "/api/v1/oauth/admin/providers",
		data: input,
	});
}

export function updateProvider(
	input: UpdateProviderInput,
): Promise<OAuthProvider> {
	return apiClient.put<OAuthProvider>({
		url: "/api/v1/oauth/admin/providers",
		data: input,
	});
}

export function deleteProvider(id: number): Promise<null> {
	return apiClient.delete<null>({
		url: `/api/v1/oauth/admin/providers/${id}`,
	});
}

/** 公开：获取已启用 OAuth 提供商（登录页使用，无需登录）。 */
export async function getEnabledProviders(): Promise<EnabledProvider[]> {
	// 登录页只把它作为可选入口；后端离线时由 useQuery 静默失败，
	// 不能让每个失败请求都弹一条“服务器错误”。
	return listEnabledProviders({ skipErrorToast: true });
}

/** 浏览器跳转 OAuth 授权页；state 由服务端 cookie 生成/校验。 */
export function getOAuthLoginURL(provider: string): string {
	const name = encodeURIComponent(provider);
	return `/api/v1/oauth/login/${name}`;
}

/** 浏览器跳转 OAuth「关联已有账号」授权页（需已登录）。 */
export function getOAuthBindURL(provider: string): string {
	const name = encodeURIComponent(provider);
	return `/api/v1/oauth/bind/${name}`;
}

/** 当前用户已绑定的第三方账号。 */
export function listLinkedAccounts(): Promise<LinkedAccount[]> {
	return apiClient.get<LinkedAccount[]>({ url: "/api/v1/oauth/accounts" });
}

/** 解绑当前用户的第三方账号。 */
export function unlinkAccount(provider: string): Promise<null> {
	return apiClient.delete<null>({
		url: `/api/v1/oauth/accounts/${encodeURIComponent(provider)}`,
	});
}
