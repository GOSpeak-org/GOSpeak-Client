import axios, {
	type AxiosError,
	type AxiosInstance,
	type AxiosRequestConfig,
	type AxiosResponse,
} from "axios";
import { refreshSession } from "@/api/authTransport";
import { clearSessionCache } from "@/api/sessionCache";
import { backendMessage, unreachableMessage } from "@/utils/apiError";
import { localizedApiMessage } from "@/utils/errorMessages";
import { toastErrorOnce } from "@/utils/toast";

export interface Result<T = any> {
	code: number;
	msg: string;
	data?: T;
}

declare module "axios" {
	interface AxiosRequestConfig<D = any> {
		/**
		 * 为 true 时拦截器不弹统一错误提示，由调用方自己展示文案。
		 * 用于后端 msg 是英文/不友好、需要前端定制中文提示的接口。
		 */
		skipErrorToast?: boolean;
		/**
		 * 后台 / 非关键请求（轮询、探测、上报等）：失败时完全静默，
		 * 并把错误标记为「已提示」，避免下游 toast helper 再补一条。
		 */
		silentError?: boolean;
	}
}

/** 拦截器已提示过的错误都会打上这个标记，避免调用方再弹一次（重复 toast）。 */
type ToastMarked = { __toastShown?: boolean };

const markToasted = (error: unknown) => {
	if (error && typeof error === "object") {
		(error as ToastMarked).__toastShown = true;
	}
};

/** 拦截器主动闭嘴的请求：显式标记为「未提示」，调用方仍需自己弹。 */
const markSilent = (error: unknown) => {
	if (error && typeof error === "object") {
		(error as ToastMarked).__toastShown = false;
	}
};

/** 有后端 msg 就翻中文/保留原文，否则用按状态码定制的兜底，避免全是「请求失败」。 */
const toastMessage = (error: unknown, fallback: string): string => {
	const raw = backendMessage(error);
	return raw ? localizedApiMessage(error, raw) : fallback;
};

const statusFallback = (status: number | undefined): string => {
	if (status === 404) return "请求的接口不存在（404）";
	if (status === 403) return "没有操作权限";
	if (status === 400) return "请求参数不正确";
	if (status && status >= 500) return "服务器错误，请稍后重试";
	return "请求失败";
};

// Token 相关错误码
const TOKEN_ERROR_CODES = new Set([1001, 1002, 1003, 1014]);
const RATE_LIMITED_CODE = 1017;
// 直接登出的错误码（不尝试刷新）
const FORCE_LOGOUT_CODES = new Set([1015]);
// 禁言提示但不登出的错误码
const MUTE_ERROR_CODES = new Set([1016]);

/**
 * 这些路径上的 401 属于「尚未登录」的正常状态，不能由拦截器整页硬跳登录：
 * - login / register：避免与 ensureSession 的路由跳转互相触发整页刷新循环
 * - invite：对外公开入口，路由 beforeLoad 会带着邀请码决定去向；
 *   拦截器硬跳 /login 会吞掉邀请码，让所有分享链接失效
 */
export function shouldSkipLoginRedirect(path: string): boolean {
	return (
		path === "/login" || path === "/register" || path.startsWith("/invite/")
	);
}

const redirectToLogin = (banned = false) => {
	// 会话确实失效才走到这里：先清掉本地缓存的 user，
	// 否则 /login 的 beforeLoad 看到缓存又 redirect 回 '/'，形成整页重载死循环。
	clearSessionCache();
	const path = window.location.pathname;
	// 封禁是强制登出信号，公开入口也要走；但已在登录页时不要重复刷新
	if (banned) {
		if (path !== "/login") window.location.href = "/login?banned=1";
		return;
	}
	if (shouldSkipLoginRedirect(path)) return;
	// 记录来源：登录后 resolveLoginRedirect 会把用户带回原来的页面，
	// 而不是一律落到 / 再被送去 /discover。
	try {
		sessionStorage.setItem("gospeak_redirect", path + window.location.search);
	} catch {
		// 隐私模式等场景下 sessionStorage 可能不可写，不影响跳登录
	}
	window.location.href = "/login";
};

const createInstance = (baseURL?: string) => {
	const axiosInstance = axios.create({
		baseURL: baseURL,
		timeout: 50000,
		withCredentials: true,
		headers: { "Content-Type": "application/json;charset=utf-8" },
	});

	// 响应拦截 — 统一处理接口错误 toast，组件不再重复处理
	axiosInstance.interceptors.response.use(
		(res: AxiosResponse<Result>) => {
			// 业务失败码也统一 toast（当前后端走 HTTP 4xx/5xx，此分支保底）。
			// 只有带数值 code 的 JSON 才算业务响应：反代/网关返回纯文本或 HTML 时
			// （如 502、SPA 回退页），res.data 是字符串，code 为 undefined，
			// 旧写法会命中这个分支并弹出没有文案的空 toast。
			const body = res.data as unknown as { code?: unknown; msg?: unknown };
			const businessCode = body?.code;
			if (typeof businessCode === "number" && businessCode !== 0) {
				const silent = res.config?.silentError === true;
				const skipToast = silent || res.config?.skipErrorToast === true;
				if (!skipToast) {
					const raw =
						typeof body.msg === "string" && body.msg.trim() !== ""
							? body.msg
							: "";
					const msg = raw
						? localizedApiMessage({ response: { data: { msg: raw } } }, raw)
						: `请求失败（错误码 ${businessCode}）`;
					toastErrorOnce(msg);
				}
				// silent 请求让下游 helper 也闭嘴；skipErrorToast 留给调用方出文案
				(res.config as ToastMarked).__toastShown = silent ? true : !skipToast;
			}
			return res;
		},
		async (error: AxiosError<Result>) => {
			// 请求被主动取消，静默忽略
			if (error.code === "ERR_CANCELED" || error.name === "CanceledError") {
				return Promise.reject(error);
			}
			const originalRequest = error.config as AxiosRequestConfig & {
				_retry?: boolean;
			};
			// silentError：后台/非关键请求，拦截器与下游 helper 全程静默；
			// skipErrorToast：调用方自己展示定制文案，拦截器不弹但保留「未提示」标记。
			const silent = originalRequest?.silentError === true;
			const skipToast = silent || originalRequest?.skipErrorToast === true;
			if (silent) markToasted(error);
			else if (skipToast) markSilent(error);

			// 被封禁等需要强制登出的错误
			if (
				error.response?.data?.code &&
				FORCE_LOGOUT_CODES.has(error.response.data.code)
			) {
				// 跳登录页本身就是提示，标记为已提示避免调用方再弹一条
				markToasted(error);
				redirectToLogin(true);
				return Promise.reject(error);
			}

			// 被禁言显示提示但不登出
			if (
				error.response?.data?.code &&
				MUTE_ERROR_CODES.has(error.response.data.code)
			) {
				if (!skipToast) {
					toastErrorOnce(error.response.data?.msg || "你已被禁言");
					markToasted(error);
				}
				return Promise.reject(error);
			}

			// 本地回环代理报告后端不可达（6002）：提示网络/地址，
			// 不要和普通服务器错误混在一起，避免用户误以为要重新登录。
			const unreachable = unreachableMessage(error);
			if (unreachable) {
				if (!skipToast) {
					toastErrorOnce(unreachable);
					markToasted(error);
				}
				return Promise.reject(error);
			}

			// 有响应体且是 token 相关错误
			if (
				error.response?.data?.code &&
				TOKEN_ERROR_CODES.has(error.response.data.code)
			) {
				if (!originalRequest._retry) {
					originalRequest._retry = true;
					try {
						await refreshSession();
						return axiosInstance(originalRequest);
					} catch (e) {
						const code = (e as AxiosError<Result>)?.response?.data?.code;
						// refresh 被限流(1017)：沿用现有会话重试原调用方自行处理，不跳登录
						if (code === RATE_LIMITED_CODE) return Promise.reject(error);
						redirectToLogin();
						return Promise.reject(error);
					}
				}
				redirectToLogin();
				return Promise.reject(error);
			}

			// 其余 HTTP/网络错误：后台/自行处理的请求直接静默返回
			if (skipToast) return Promise.reject(error);
			const status = error.response?.status;
			let message: string;
			if (!error.response) {
				message = "网络连接失败，请检查网络";
			} else if (status && status >= 400) {
				message = toastMessage(error, statusFallback(status));
			} else {
				return Promise.reject(error);
			}
			toastErrorOnce(message);
			markToasted(error);

			return Promise.reject(error);
		},
	);
	return axiosInstance;
};

export class APIClient {
	private axiosInstance: AxiosInstance;
	constructor(baseUrl?: string) {
		this.axiosInstance = createInstance(baseUrl);
	}

	get<T = any, U = any>(config: AxiosRequestConfig<U>): Promise<T> {
		return this.request({ ...config, method: "GET" });
	}

	post<T = any, U = any>(config: AxiosRequestConfig<U>): Promise<T> {
		return this.request({ ...config, method: "POST" });
	}

	put<T = any, U = any>(config: AxiosRequestConfig<U>): Promise<T> {
		return this.request({ ...config, method: "PUT" });
	}

	delete<T = any, U = any>(config: AxiosRequestConfig<U>): Promise<T> {
		return this.request({ ...config, method: "DELETE" });
	}

	request<T = any, U = any>(config: AxiosRequestConfig<U>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.axiosInstance
				.request<any, AxiosResponse<Result<T>>>(config)
				.then((res: AxiosResponse<Result<T>>) => {
					if (res.data && res.data.code !== 0) {
						// 拦截器已经弹过提示（或调用方声明跳过），把标记带给调用方
						const err = new Error(res.data.msg) as Error & ToastMarked;
						err.__toastShown =
							(res.config as ToastMarked)?.__toastShown === true;
						reject(err);
						return;
					}
					resolve(res.data?.data as T);
				})
				.catch((e: Error | AxiosError) => {
					reject(e);
				});
		});
	}
}

export default new APIClient("/");
