# scripts — 工程门禁与发布脚本

Node 原生脚本（仅用 `node:*` 内置模块，零第三方依赖）。多数是 **CI / lefthook 门禁**，改了会影响全仓。

## 文件

| 脚本 | 作用 | 门禁位置 |
|------|------|----------|
| `check-version.mjs` | 版本一致性：以 `.github/versions/*.yaml` 为单一事实源 | CI `test-scripts` / 发布 |
| `release-naming.mjs` | 产物命名规范 `gospeak-<component>-v<semver>[-os-arch][.ext]` | release 工作流 |
| `release-notes.mjs` | 按组件生成 Release 正文（`--component server\|desktop\|mobile`；server 含二进制表+Docker+部署指引，desktop 只含安装包表，mobile 只含 APK 说明；一组件一 Release） | release 工作流 |
| `build-changelog.mjs` | 按版本生成 CHANGELOG 段并幂等插入顶部 | 发版 |
| `check-ui-tokens.mjs` | UI token 护栏（任意圆角/字号/文字透明度/`ds-*`/图标尺寸） | CI lint + pre-push |
| `check-radius-tokens.mjs` | 圆角 token 专门护栏（被上面复用） | CI lint + pre-push |
| `check-hook-deps.mjs` | `useExhaustiveDependencies` 棘轮：只许减少、不许新增告警 | CI lint + pre-push |
| `check-desktop-commands.mjs` | Go `mygo.Bind` ↔ TS 命令字符串一致性 | CI lint + pre-push |
| `check-mobile-bridge.mjs` | 移动端**自定义原生插件**（AudioSession / MediaControl / ServerConfig）的 TS `pluginMethod` ↔ iOS / Android 方法名与插件注册一致性；官方 Capacitor 插件不在范围 | CI lint + pre-push |
| `mobile-bind-proxyrules.mjs` | proxyrules 的 gomobile 绑定面：gobind 导出符号集合断言 + 可选 AAR/XCFramework 产出（`--surface-only` 只跑前者，供任何机器在 gate 里跑） | `build-mobile.yml`（ubuntu，由 version-bump 按 tag 编排；不入 CI gate）/ CI `desktop-go`（`--surface-only`，在 gate 内）/ 手动 |
| `dev-livekit.sh` | 本地 LiveKit 开发启动（宿主机二进制 `.local/bin/livekit-server`） | 手动 |

## 约定

- **发布类脚本必须配同名 `.test.mjs`**（`build-changelog` / `check-version` / `release-naming` / `release-notes` / `check-desktop-commands`），由 `node --test` 在 CI `test-scripts` job 跑；改脚本必须同步改测试。
- `mobile-bind-proxyrules.mjs` 的单测覆盖 stderr 分类（缺 Xcode/Android SDK/NDK/JDK → exit 0）与 gobind 产物解析（`skipped function` → exit 1），由 CI `test-scripts` 的 `node --test scripts/*.test.mjs` 自动带上。
- `check-mobile-bridge.mjs` 只校验仓库自有的 3 个自定义原生插件（AudioSession / MediaControl / ServerConfig）；push / keyboard / local-notification / deeplink / back-button / lifecycle 走官方 Capacitor 插件，不在校验范围，本地没有原生实现可比对。要校验就必须先在 `mobile` 落地原生实现，**不要**为了让门禁显得更全面而扩白名单。其单测 `check-mobile-bridge.test.mjs` 在 CI `lint` 里随脚本一起跑。
- `check-radius-tokens` / `check-hook-deps` 没有单测，靠 CI 直接跑全仓扫描 —— 改它们等于改全仓门禁，先本地跑一遍再提交。`check-ui-tokens` 已有 `check-ui-tokens.test.mjs`（覆盖裸圆角/CSS 字面量圆角/斜杠行高字号/任意属性顺序图标尺寸与误报），改门禁时须同步补测试。
- 版本单一事实源在 `.github/versions/*.yaml`，不要在脚本里硬编码版本号。
- `check-version.mjs` 覆盖 server / desktop / mobile：mobile 以 `.github/versions/mobile.yaml` 为声明源，校验 `mobile/package.json`、Android `build.gradle`、iOS `project.pbxproj`；`release-naming.mjs` 已定义 mobile tag 前缀（`gospeak-mobile-v`）。
- `check-hook-deps.mjs` 的基线代表已存在的技术债：**下调基线需要先修掉对应告警**，不要为了过门禁放宽。
- `check-ui-tokens.mjs` 的规则对应 `packages/components/src/theme.css`；规范变更要同时改两处。
- UI 护栏的豁免要用 `biome-ignore` 并在注释里写理由，不要私自加白名单目录。
- `dev-livekit.sh` 依赖本地编译的 LiveKit 二进制，找不到时会打印编译指引。
