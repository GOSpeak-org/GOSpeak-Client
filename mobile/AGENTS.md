# mobile — 移动宿主（Capacitor）

Capacitor 8 原生壳。**不自带前端**：加载 `web` 的 mobile 目标产物（`GOSPEAK_TARGET=mobile` → `web/dist-mobile`）。

## 构建链

1. `pnpm --filter @gospeak/web build:mobile` 产出 `web/dist-mobile`。
2. `cap sync` 把产物拷进 `ios/`、`android/` 并安装原生插件。
3. dev：设 `GOSPEAK_MOBILE_DEV_URL=http://<局域网IP>:3000` 走真机热重载；release：加载内嵌 bundle。

```bash
pnpm --filter @gospeak/mobile sync          # 构建 + 同步两端
pnpm --filter @gospeak/mobile run:ios       # 同步后跑 iOS
pnpm --filter @gospeak/mobile run:android   # 同步后跑 Android
```

## 原生工程

- `ios/App/App/Info.plist`：`UIBackgroundModes: audio`、`NSMicrophoneUsageDescription`、`gospeak` URL scheme。**删掉任一项都会导致后台静音或深链失效**。
- `android/.../AndroidManifest.xml`：`RECORD_AUDIO`、`FOREGROUND_SERVICE_MICROPHONE`、`POST_NOTIFICATIONS` 与 `gospeak` intent-filter。
- 自定义插件：`AudioSessionPlugin`（会话 + 路由）、`MediaControlPlugin`（锁屏通知）、`ServerConfigPlugin`（服务器地址 + 反代目标），须在 `MainActivity.onCreate` 里 `registerPlugin`；`LocalProxyServer` 必须在 `super.onCreate` 前启动。
- `assets/icon.png`：品牌图标源（1024×1024，取自 `desktop/resources/icon.png`）。`cap sync` 会据此重建两端 launcher icon；删掉会退回 Capacitor 默认蓝色占位图。
- `android/app/src/debug/AndroidManifest.xml`：**仅 debug 变体**放行明文 HTTP，供 dev 连局域网 `http://<开发机IP>:3000`；release 不合并该文件。
- `Info.plist` 的 `NSAppTransportSecurity/NSAllowsLocalNetworking` 同理只放行本地网络，未使用 `NSAllowsArbitraryLoads`。
- 安全区：`viewport-fit=cover` + `#app` 的 `env(safe-area-inset-*)` 内缩，`contentInset` 保持 `never` 以免双重留白。
- 键盘：`plugins.Keyboard.resize: native`（iOS 默认值）——**必须装 `@capacitor/keyboard`**，否则 WKWebView 不缩放、键盘直接盖住底部输入框；`autoBackdropColor: auto` 让键盘底部留白跟随主题。

## 共享反代规则层（proxyrules）

移动端与桌面端的本地反代判定（服务器地址校验、Set-Cookie 重写、worker 可信来源、host:port 归一）只有一份实现：`proxyrules`（module `gospeak/proxyrules`，纯 Go，五个导出函数，无 CGO / 平台依赖）。

- 桌面宿主直接 `import "gospeak/proxyrules"`（`desktop/go.mod` 用 `replace` 指向本地目录）。
- 移动端经 `gomobile bind` 产出的 AAR / XCFramework 调用，**原生调用点已接入**，内联等价实现已删除：
  - Android：`LocalProxyServer` 调 `proxyrules.Proxyrules.{validateBaseURL,isTrustedWorker,rewriteSetCookie}`，AAR 由 `app/build.gradle` 以 `flatDir` 依赖 `../../build/proxyrules`。
  - iOS：`LocalProxyServer` 调 `ProxyrulesIsTrustedWorker` / `ProxyrulesRewriteSetCookie`，`ServerConfigPlugin` 调 `ProxyrulesValidateBaseURL`（经 `App/Proxyrules-Bridging-Header.h`）。
- **构建前必须先产出绑定产物**：`pnpm --filter @gospeak/mobile sync`（或 `sync:ios` / `sync:android`）已把 `bind:rules` 串进链路。缺产物时 Gradle 与 Xcode 会以明确信息让你去跑 bind，而不是报 "package proxyrules does not exist"。

### 工具链与版本锁定

`proxyrules/go.mod` 的 `tool` 指令锁定了绑定工具，版本随模块走，不再依赖全局安装：

```go
tool (
	golang.org/x/mobile/cmd/gobind
	golang.org/x/mobile/cmd/gomobile
)
```

- 绑定工具版本：`golang.org/x/mobile v0.0.0-20261011034528-197770444867`。
- 模块声明 `go 1.26.0`；本机默认 `go` 是 1.24.5，靠 `GOTOOLCHAIN=auto` 解析到 go1.26.0。
- 在模块目录内用 `go tool gobind` / `go tool gomobile` 即可，不依赖 `$(go env GOPATH)/bin` 是否装过。
  `go tool gomobile version` 会打印 "binary is out of date, re-install it"，这是 gomobile 的自检对比，`bind` 不受影响（已实测）。

### 校验与产物

```bash
node scripts/mobile-bind-proxyrules.mjs --target=all   # 默认 all；另有 android / ios
```

- 产物目录 `mobile/build/proxyrules/`，已被根 `.gitignore` 的 `build/` 覆盖，不入库。
- `gobind`（`-lang=objc` / `-lang=java`）**不需要 Xcode / Android SDK**，是任何机器都能跑的门禁：脚本解析生成的 `Proxyrules.objc.h` 与 `Proxyrules.java`，断言五个导出函数都在，并拒绝任何 `// skipped function ...` 行——gobind 遇到不支持的签名会静默跳过函数且仍 exit 0，只看退出码等于没门禁。
- `gomobile bind` 缺 Xcode / Android SDK / NDK / JDK 时脚本以 **exit 0** 退出并打印下一步（已知且已文档化的降级）；绑定真的坏了才 exit 1。
- **本机现状**：`xcode-select -p` 仍指向 CommandLineTools（无 Xcode），且无 Android SDK/NDK/JDK，因此本地只能验证 gobind；AAR/XCFramework 由手动触发的移动端构建产出。
- **CI 现状**：移动端原生构建由独立 workflow `.github/workflows/build-mobile.yml` 负责（`ubuntu-latest`）。触发方式：`version-bump` 在 `mobile.yaml` 版本变化时通过 `workflow_call` 调用（正式发版，打 `gospeak-mobile-v*` tag 并发布到独立 Release）；`gospeak-mobile-v*` tag push；或手动 dispatch（测试包，仍发到固定 pre-release `gospeak-mobile-test`）。push / PR 不会跑它，也不进 CI Gate。手动 Run workflow 时**只构建 Android**（`assembleDebug`），产物 APK 发布到固定 pre-release `gospeak-mobile-test`（同名覆盖），可用 `gh release download gospeak-mobile-test -p '*.apk'` 拿最新测试包；XCFramework 一并上传。**iOS 构建已暂时禁用**（新 workflow 末尾保留注释形式，解开即恢复）。因此改 `mobile/ios/` 或 `App.xcodeproj` 目前**不会被 CI 拦住**，只能靠本地 `swiftc -typecheck` 与 release 前的人工验证。iOS 原生接入本身不是未验证状态——它在 run 44006296505 实跑通过过一次。

## 约束

- 原生插件方法名与 `@gospeak/mobile-capabilities` 的 `pluginMethod()` 必须逐字一致，`scripts/check-mobile-bridge.mjs` 会拦。
- 改 `web` 后要重跑 `build:mobile` + `cap sync`，否则真机看到的是旧包。
- 服务器地址在登录页填：移动端与桌面端一样内置本地反代（Android/iOS 的 `LocalProxyServer`），在 `47900-47919` 内挑选可用端口并持久化，WebView 地址由原生层在启动时注入，始终同源；反代托管前端并转发 `/api/v1`、`/uploads`、`/livekit`、`/ws`、`/wsworker` 到配置的服务器，地址由 `ServerConfig` 插件持久化，切换后原生 reload。
- 移动产物在 `web/dist-mobile`（与 `dist` 平级）：Vite 会清空自己的 outDir，放进 `dist/` 里会被一次 web 构建删掉。
- 后台音频成立与否由真机 PoC 结论决定，见 `agent_test_logs/` 记录。
