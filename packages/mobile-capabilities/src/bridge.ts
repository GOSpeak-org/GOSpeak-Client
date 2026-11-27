/**
 * Capacitor 插件访问层。
 *
 * 与 @gospeak/desktop 的 bridge.ts 对应：Capacitor 插件以
 * registerPlugin("<Name>") 取得代理，方法名必须与原生侧
 * @CapacitorPlugin(name = ...) + @PluginMethod 逐字一致。
 * 方法名拼错时运行期只会得到 "not implemented"，多数能力会静默吞掉，
 * 因此由 scripts/check-mobile-bridge.mjs 在 CI 拦截。
 *
 * @capacitor/core 只在原生分支动态加载，web / desktop 构建里整段被折叠剔除。
 */

export function pluginMethod(plugin: string, method: string): string {
	return `${plugin}.${method}`;
}

interface PluginProxy {
	addListener?(
		event: string,
		handler: (payload: unknown) => void,
	): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
}

/**
 * Capacitor 的 registerPlugin 返回 Proxy：读任何未知属性（包括 then）都会
 * 动态生成一个"调用原生方法"的函数。若把它直接作为 async 的返回值，
 * Promise.resolve 会把它当 thenable adopt，触发 `ServerConfig.then()`，
 * 原生报 "not implemented"，getPlugin 的 Promise 卡在 pending —— 表现为
 * 保存服务器地址后一直转圈、进不去页面。
 *
 * 这里再包一层 Proxy：除 `then` 外原样转发到 Capacitor 代理；`then` 返回
 * undefined，使其不再是 thenable。方法集合完全动态，不枚举、不遗漏。
 */
function detachThenable<T extends object>(proxy: T): T {
	return new Proxy(proxy, {
		get(target, prop, receiver) {
			if (prop === "then") return undefined;
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

export async function getPlugin<T extends object>(name: string): Promise<T> {
	if (!__GOSPEAK_MOBILE__) {
		throw new Error(
			`[gospeak/mobile] 插件 "${name}" 需要移动端运行时（当前不是 mobile 构建）。`,
		);
	}
	const { registerPlugin } = await import("@capacitor/core");
	return detachThenable<T>(registerPlugin<T>(name));
}

export async function listenPlugin<T>(
	name: string,
	event: string,
	handler: (payload: T) => void,
): Promise<() => void> {
	if (!__GOSPEAK_MOBILE__) return () => {};
	const plugin = await getPlugin<PluginProxy>(name);
	if (typeof plugin.addListener !== "function") return () => {};
	const handle = await plugin.addListener(event, (payload) =>
		handler(payload as T),
	);
	return () => {
		void handle.remove();
	};
}
