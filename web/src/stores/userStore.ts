import { createServerConfig, inDesktop } from "@gospeak/desktop";
import { create } from "zustand";
import { getProfile, logout as logoutApi } from "@/api/auth";
import {
	isAuthFailure,
	readSessionExpiry,
	recordSessionExpiry as persistSessionExpiry,
	refreshSession,
} from "@/api/authTransport";
import { USER_STORAGE_KEY } from "@/api/sessionCache";
import { reportError } from "@/utils/errorReport";

export interface UserInfo {
	id: number;
	uuid: string;
	name: string;
	display_name: string;
	avatar: string;
	role: string;
	permissions?: string[];
}

const STORAGE_USER = USER_STORAGE_KEY;
const EXPIRE_MARGIN_MS = 60_000;
const UNVERIFIED_GRACE_MS = 10 * 60_000;

interface UserState {
	user: UserInfo | null;
	userStale: boolean;
	login: (u: UserInfo, expiresIn?: number) => void;
	/** 拉一次 profile 覆盖缓存用户；失败只置 userStale，不踢下线。 */
	fetchProfile: () => Promise<boolean>;
	/** 进应用外壳时刷新用户资料：刚校验过就跳过，避免与路由守卫重复请求。 */
	refreshUserInBackground: () => void;
	clearAuth: () => void;
	logout: () => Promise<void>;
	ensureSession: () => Promise<boolean>;
	recordSessionExpiry: (expiresIn: number | null | undefined) => void;
}

/**
 * 桌面端没填服务器地址时没有可请求的后端，直接判定无会话、不发请求。
 * 浏览器端页面 origin 就是后端，永远为 true。
 */
async function hasServerTarget(): Promise<boolean> {
	if (!inDesktop()) return true;
	try {
		return (await createServerConfig().getBaseUrl()).trim() !== "";
	} catch {
		return createServerConfig().getBaseUrlSync().trim() !== "";
	}
}

let sessionExpiresAt: number | null = readSessionExpiry();
let lastVerifiedAt = 0;

function isRateLimitedError(e: unknown): boolean {
	const code = (e as { response?: { data?: { code?: number } } })?.response
		?.data?.code;
	return code === 1017;
}

function isRecentlyVerified(): boolean {
	return (
		lastVerifiedAt > 0 && Date.now() - lastVerifiedAt < UNVERIFIED_GRACE_MS
	);
}

function readCachedUser(): UserInfo | null {
	try {
		const cached = localStorage.getItem(STORAGE_USER);
		return cached ? (JSON.parse(cached) as UserInfo) : null;
	} catch {
		localStorage.removeItem(STORAGE_USER);
		return null;
	}
}

/**
 * 会话判定（过期时间驱动的懒续期）：
 * - 有过期时间且距过期 >60s：同步放行，零网络请求
 * - 临近过期/已过期：先 refresh（记录新 expires_in）再重验 profile
 * - 无过期时间（存量/被清）：宽限窗口内验证过则放行，否则探测 profile 补齐
 * - refresh 被限流(1017)不视为鉴权失败：有缓存会话则沿用，不清不踢
 * - 网络中断 / 超时 / 5xx 不算会话失效：保留缓存用户继续用
 */
async function probeSession(): Promise<boolean> {
	const store = useUserStore.getState();
	if (!(await hasServerTarget())) return false;
	try {
		sessionExpiresAt = readSessionExpiry();
		const { user } = store;
		if (user) {
			if (sessionExpiresAt) {
				if (Date.now() < sessionExpiresAt - EXPIRE_MARGIN_MS) return true;
				store.recordSessionExpiry(await refreshSession());
				const ok = await store.fetchProfile();
				if (ok) lastVerifiedAt = Date.now();
				return ok;
			}
			if (isRecentlyVerified()) return true;
		}
		if (await store.fetchProfile()) {
			lastVerifiedAt = Date.now();
			if (!sessionExpiresAt) {
				// 后台学习真实过期时间（如 401 已被拦截器消化，这里感知不到
				// expires_in），不阻塞导航；失败静默，宽限窗口兜底。
				void refreshSession()
					.then(() => {
						sessionExpiresAt = readSessionExpiry();
					})
					.catch((error) => {
						reportError({
							error,
							scope: "global",
							source: "session.expiry-probe",
						});
					});
			}
			return true;
		}
		store.recordSessionExpiry(await refreshSession());
		const ok = await store.fetchProfile();
		if (ok) lastVerifiedAt = Date.now();
		return ok;
	} catch (e) {
		if (isRateLimitedError(e) && store.user) return true;
		if (!isAuthFailure(e) && store.user) return true;
		store.clearAuth();
		return false;
	}
}

// 同一时刻只跑一次会话判定：路由守卫、OAuth 回调、拦截器都可能触发。
let inFlightProbe: Promise<boolean> | null = null;

export const useUserStore = create<UserState>((set, get) => ({
	user: readCachedUser(),
	userStale: false,

	login: (u, expiresIn) => {
		localStorage.setItem(STORAGE_USER, JSON.stringify(u));
		persistSessionExpiry(expiresIn);
		sessionExpiresAt = readSessionExpiry();
		inFlightProbe = null;
		set({ user: u, userStale: false });
	},

	fetchProfile: async () => {
		try {
			const profile = await getProfile({ skipErrorToast: true });
			const updated = { ...get().user, ...profile } as UserInfo;
			localStorage.setItem(STORAGE_USER, JSON.stringify(updated));
			set({ user: updated, userStale: false });
			return true;
		} catch {
			set({ userStale: true });
			return false;
		}
	},

	refreshUserInBackground: () => {
		// 路由守卫刚刚验过就不用再拉：这是同一份数据的重复请求。
		if (isRecentlyVerified()) return;
		void get().fetchProfile();
	},

	clearAuth: () => {
		localStorage.removeItem(STORAGE_USER);
		persistSessionExpiry(null);
		sessionExpiresAt = null;
		lastVerifiedAt = 0;
		inFlightProbe = null;
		set({ user: null, userStale: false });
	},

	logout: async () => {
		try {
			await logoutApi();
		} catch {
			// 即使服务端登出失败，也继续清除本地状态
		}
		get().clearAuth();
	},

	recordSessionExpiry: (expiresIn) => {
		persistSessionExpiry(expiresIn);
		sessionExpiresAt = readSessionExpiry();
	},

	// 会话判定本身不发"预算"：路由守卫已经同步放行，这里只负责后台确认，
	// 没人等它，超时降级那层就没必要存在了（见 (app)/route.tsx）。
	ensureSession: () => {
		if (inFlightProbe) return inFlightProbe;
		const settled = probeSession().finally(() => {
			if (inFlightProbe === settled) inFlightProbe = null;
		});
		inFlightProbe = settled;
		return settled;
	},
}));

export const userStore = {
	/** 非 React 侧读取（路由守卫、拦截器等）；组件内请用 useUserStore */
	user: () => useUserStore.getState().user,
	userStale: () => useUserStore.getState().userStale,
	isLoggedIn: () => !!useUserStore.getState().user,
	hasSession: () => !!useUserStore.getState().user,
	ensureSession: useUserStore.getState().ensureSession,
	login: useUserStore.getState().login,
	logout: useUserStore.getState().logout,
	clearAuth: useUserStore.getState().clearAuth,
	fetchProfile: useUserStore.getState().fetchProfile,
	refreshUserInBackground: useUserStore.getState().refreshUserInBackground,
	recordSessionExpiry: useUserStore.getState().recordSessionExpiry,
};

export default userStore;
