export const USER_STORAGE_KEY = "user";
export const SESSION_EXPIRES_KEY = "gospeak_session_expires_at";

/**
 * 清除本地缓存的登录态，让 /login 守卫不再把用户弹回应用外壳。
 * apiClient 不能依赖 userStore（userStore -> auth -> apiClient 会成环），
 * 因此这里只做无依赖的 localStorage 清理，是会话失效时的单一清理入口。
 */
export function clearSessionCache(): void {
	localStorage.removeItem(USER_STORAGE_KEY);
	localStorage.removeItem(SESSION_EXPIRES_KEY);
}
