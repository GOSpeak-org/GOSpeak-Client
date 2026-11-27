# packages/mobile-capabilities — 移动能力 SDK

`@gospeak/mobile-capabilities`：`@gospeak/web` 与原生宿主（`mobile`，Capacitor 8）之间的 TS 桥接。**每个能力都有原生实现 + Web 安全降级**，同一份组件代码在浏览器与原生壳里都能跑。模式对齐 `packages/desktop`。

## 结构

| 文件 | 职责 |
|------|------|
| `conditional.ts` | `BUILD_TARGET` `MOBILE_BUILD` `WEB_BUILD` `inMobile()` `assertMobile` `ifMobile` `importMobile` |
| `bridge.ts` | `pluginMethod` / `getPlugin` / `listenPlugin`，动态加载 `@capacitor/core` |
| `capabilities/*` | audio-session / audio-route / media-control / push / deeplink / lifecycle / local-notification / back-button / keyboard / server（本地反代目标） |
| `index.ts` | 具名导出 + `createMobile()` 聚合对象 |

## 条件编译

`GOSPEAK_TARGET=mobile` 时 Vite 注入 `__GOSPEAK_MOBILE__=true`。

- 业务代码判定平台**一律用 `inMobile()`**；模块级裁剪写 `if (__GOSPEAK_MOBILE__)`。
- `@capacitor/core` 只在 `__GOSPEAK_MOBILE__` 分支内动态 import，web/desktop 构建整段被剔除。

## 桥接契约

- TS 侧 `pluginMethod("Plugin", "method")` 必须与原生 `@CapacitorPlugin(name=)` / `CAPPluginMethod(name:)` / `@PluginMethod fun` 逐字一致。
- `scripts/check-mobile-bridge.mjs` 在 CI 与 pre-push 校验，写错会在运行期得到 "not implemented"。

## 共享反代规则层

`capabilities/server` 只负责持久化服务器地址；地址是否可信、Set-Cookie 如何重写、worker 来源如何判定，统一由 `proxyrules`（module `gospeak/proxyrules`，纯 Go，五个导出函数）决定：桌面端直接 import，移动端经 `gomobile bind` 调用。

- 移动端原生调用点已接入（Android 走 AAR、iOS 走 XCFramework），内联等价实现已删除；改规则只需改 `proxyrules`，三端同时生效。
- 绑定面用 `node scripts/mobile-bind-proxyrules.mjs`（默认 `--target=all`）校验：gobind 不需要 Xcode/Android SDK，本机永远能跑；缺平台工具链时 exit 0 并打印下一步。
- 工具链版本锁定方式与产物路径见 `mobile/AGENTS.md` 的「共享反代规则层」。

## 约定

- 新增能力：`capabilities/<name>.ts` 导出 `create<Name>()`，内部同时实现 native 与 fallback，并在 `index.ts` 导出（加入 `createMobile()`）。
- 降级必须**无副作用且可调用**，不要抛异常让调用方崩；失败要有明确返回值或 `console.warn`。
- `local-notification` 是设备本地通知（被踢/断连等本地事件），首次排期前会申请系统通知权限；**不能替代服务端推送**，离线时别人邀请你仍需要 APNs/FCM 服务端链路。
- `media-control` 的 Android 通知带 静音 / 挂断 按钮，点击经 `action` 事件回传；iOS 侧沿用系统媒体控件，不单独建插件。
- `back-button` 接管 Android 硬件返回键：注册监听后 Capacitor 不再自行回退/退出，由 `@gospeak/web` 的 `useMobileBackButton` 决定「有历史回退、无历史 minimize」，避免房间内误触直接杀进程。
- `keyboard`：iOS 的 WebView 内缩由 `@capacitor/keyboard` 原生负责（`capacitor.config.ts` 的 `resize: native` 是默认值，**但只有装了插件才生效**）；能力层只抛 show/hide 事件并提供 `hide()`。
