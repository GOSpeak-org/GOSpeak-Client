# packages/desktop — 桌面能力 SDK

`@gospeak/desktop`：`@gospeak/web` 与原生宿主（`desktop`，Go + MyGo）之间的 TS 桥接。**每个能力都有原生实现 + 浏览器安全降级**，同一份组件代码在浏览器与桌面都能跑。

## 结构

| 文件 | 职责 |
|------|------|
| `runtime.ts` | `isDesktop()` / `runtime`（**仅供 SDK 内部与能力降级使用**） |
| `conditional.ts` | `BUILD_TARGET` `DESKTOP_BUILD` `WEB_BUILD` `inDesktop()` `assertDesktop` `ifDesktop` `desktopOnly` `webOnly` `importDesktop` `importWeb` |
| `bridge.ts` | `bridge`：`mygo-runtime` 的 `call("<Struct>.<Method>")` / `on(event)` 封装 |
| `capabilities/*` | window / tray / notification / autostart / overlay / deeplink / dialog / updater / server / clientlog / screenCapture |
| `index.ts` | 具名导出 + `createDesktop()` 聚合对象 |

## 条件编译

Vite 注入 `__GOSPEAK_TARGET__`（由 `GOSPEAK_TARGET=web|desktop|mobile` 决定）。桌面独享模块在 Web 与移动构建中被摇树剔除，因此：

- **业务代码判定平台一律用 `inDesktop()`**；禁止新增裸 `isDesktop()` 调用点。
- 改本包或 `desktop/` 后必须跑 `pnpm --filter @gospeak/web build:desktop` 验证（`tsc --noEmit` 会完整检查死分支）。
- 惰性加载用 `importDesktop` / `importWeb`，不要写裸 `import()` + 运行时判断。

## 桥接契约

- MyGo 以 `"<Struct>.<Method>"` 注册绑定（`desktop/*.go` 的 `mygo.Bind(...)`）；TS 侧字符串必须**逐字一致**。
- `scripts/check-desktop-commands.mjs` 在 CI 与 pre-push 校验一致性；写错会在运行期得到 `method X is not bound` 的 rejected Promise，且多数能力会静默吞掉。
- `desktop/mygo.ts` 是 `mygo generate` 产物且被 gitignore，不要手动引用或提交。

## 约定

- 新增能力：`capabilities/<name>.ts` 导出 `create<Name>()`，内部同时实现 native 与 fallback，并在 `index.ts` 导出（可选加入 `createDesktop()`）。
- 浏览器降级必须**无副作用且可调用**，不要抛异常让调用方崩。
- 能力方法失败要有明确返回值或 console 记录，不要静默吞掉。
