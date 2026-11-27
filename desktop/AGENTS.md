# desktop — 桌面宿主（Go + MyGo）

Go 1.27 + MyGo 0.8.3 原生宿主。**自带前端**（embed `webui/dist`），通过**本地回环反代**连接用户配置的服务器，页面/接口/WS 全程同源。

## 启动链（`main.go`）

1. `RequestSingleInstanceLock`：第二实例把命令行交给已运行实例后退出。
2. `mygo.Bind(...)` × 13：Window / Tray / Notification / AutoStart / DeepLink / Dialog / Clipboard / Browser / Updater / Overlay / ServerConfig / ClientLog / ScreenCapture —— 每个导出方法都会变成 TS 侧 `"<Struct>.<Method>"` 命令。
3. `registerDeepLink()`（`gospeak://invite/d/<CODE>`，必须在 Run 之前）。
4. `WhenReady`：`initHostLog` → `loadServerConfig` → release 下 `ensureProxyStarted` → `openMainWindow`。

## 窗口与页面

`windows.go`：`TitleBarStyle: mygo.TitleBarHidden` + 高度 28px（与 Web 自绘标题栏对齐，见 `web/src/components/titleBar/`）。dev 直连 `http://localhost:3000`（HMR）；release 加载回环代理地址。

## 回环反代（`proxyserver.go`）

- 同源托管内嵌前端，代理 `/api/v1`、`/uploads`、`/livekit`、`/ws` 到用户配置的 base URL。
- `/wsworker?target=<ws-url>` 转发到 SFU/信令 worker，**目标受 allowlist 限制**（只允许信任后端下发的 host）；`stripWorkerCookies` 防凭据外泄。
- `/healthz` 暴露端口、上游错误分类与当前路由（`route` / `route_fallbacks`），供看门狗与崩溃窗使用；`recordUpstreamError` 分类记录。
- WS upgrade 有专门的 round tripper 与超时处理，改动容易把 `/ws` 打成 502。
- 纯规则（服务器地址校验与归一、`Set-Cookie` 改写、worker 白名单）实现在 `proxyrules`，桌面只是调用方。改规则去那里改，并跑 `cd proxyrules && go test ./...`；桌面侧对应测试（`TestValidateBaseURL`、`TestNormalizedHostPort`、`TestWorker*`）会验证行为未漂移。

## 上游路由与回退（`proxyroute.go` / `systemproxy.go`）

- **直连优先，按需回退**：`upstreamRouter` 先走直连；只有失败发生在请求发出前（DNS / 拨号 / TLS 握手）且请求体可重放时，才用系统代理重试一次。切换后路由粘住，后台探针确认直连恢复再切回。写操作（带 body 的 POST）不会被自动重放，只切换后续请求的路由。
- **系统代理解析**：环境变量优先（`http.ProxyFromEnvironment`），其次 macOS `scutil --proxy`（`systemproxy_darwin.go`，非 cgo），其他平台读环境变量。PAC 不实现，遇到 PAC 按直连兜底而不是全网黑洞。
- **回环 / 局域网永远直连**：`isDirectHost`（loopback、RFC1918、link-local、`*.local`）与 `hostExcluded`（系统代理 ExceptionsList，支持后缀 / 通配 / CIDR）。开发态 `127.0.0.1:3000`、内网自托管都不会被代理抓走。
- **多地址并发拨号**：`multiDialContext` 对解析出的每个地址错峰 250ms 起连、单地址 2.5s 限时，取最先成功的。一个被黑洞的 Cloudflare 边缘 IP 不再吃掉整个拨号预算（`net.Dialer` 对同族地址是串行、共享 deadline 的）。
- **不再永久挂起**：非升级请求有 12s 响应头上限（`upstreamHeaderTimeout`）；HTTP/2 通道配 `HTTP2Config.SendPingTimeout` / `PingTimeout`，半开连接由 ping 探测关闭。升级请求（`/ws`、`/wsworker`）不受响应头上限约束，靠 `ResponseHeaderTimeout`。
- 新增行为有对应单测：`proxyroute_test.go`（直连 / 回退 / 不重放 body / 探针恢复 / 内网直连）、`systemproxy_test.go`（scutil 解析、绕过规则、PAC 兜底）。

## 自愈

`supervisor.go`（重启预算与退避）、`crashwindow.go`（页面加载失败/渲染进程崩溃的独立崩溃窗）、`watchMainWindowFailures` 把失败映射成 supervisor 事件。

## 其余能力

`overlay*` 原生覆盖层（Panel + 原生重绘）、`tray.go`、`autostart.go`、`notification.go`、`dialog.go`、`clipboard.go`、`updater.go`、`deeplink.go`、`server_config.go`、`clientlog.go`、`screencapture.go`（屏幕录制权限检查/引导，`ScreenCapture.Check/Guide`）+ `preload_*.js`。

## 构建

```bash
pnpm --filter @gospeak/desktop-app dev     # mygo dev（GOSPEAK_DESKTOP_DEV=1 走 Vite）
pnpm --filter @gospeak/desktop-app build   # mygo build（打包）
```

`mygo.config.ts` 的 `buildCommand` 先做 `GOSPEAK_TARGET=desktop` 前端构建，再同步到 `webui/dist` 并生成 `.gz` 边车（宿主直接发预压缩字节）。

## 约束

- `mygo.ts` 由 `mygo generate` 生成且被 gitignore，**不要手改或提交**。
- 绑定方法与 `packages/desktop` 的命令字符串必须逐字一致，`scripts/check-desktop-commands.mjs` 会拦。
- 版本号与 `.github/versions/desktop.yaml` 同步（release CI 用 ldflags 覆盖）。
- 新增能力记得同时补 `packages/desktop/src/capabilities/` 的 fallback。
