import { logout as logoutApi } from "@/api/auth";
import { userStore } from "@/stores/userStore";

const LOGOUT_TIMEOUT_MS = 2000;

/**
 * 移动端切换服务器地址前清理会话。
 *
 * 本地用户缓存与过期时间先同步清掉（clearAuth），避免带着旧账号进新服务器；
 * 再尽力请求旧服务器登出：HttpOnly Cookie 只能由服务端下发过期 Set-Cookie
 * 清除，JS 无法直接删。旧服务器不可达/超时不能卡住切换，原生插件切换反代
 * 目标后会 reload WebView，页面随即卸载。
 */
export async function clearSessionForServerSwitch(): Promise<void> {
	userStore.clearAuth();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			logoutApi(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("logout timeout")),
					LOGOUT_TIMEOUT_MS,
				);
			}),
		]);
	} catch {
		// 旧服务器不可达或登出失败：本地会话已清，继续切换。
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
