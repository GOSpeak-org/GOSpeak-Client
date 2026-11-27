# web/src — 前端源码结构

## 目录职责

| 目录 | 职责 |
|------|------|
| `pages/` | TanStack 文件路由：`(app)/` 路由组（index/chat/discover/domain.$domainUUID/profile/manage）、`invite/d/$code`、`settings`、`login`、`register`、`__root` |
| `layouts/` | 应用外壳 `layout.tsx` + `common/`（header/main/sidebar/domainWorkspace） |
| `components/` | 业务组件，按 room / chat / textRoom / domain / discover / manage / modal / form / oauth / profile / dashboard 分组；`common/` 含三层错误边界 |
| `stores/` | zustand：`useXxxStore` hook + `xxxStore` 门面（socket/user/domain/chat/voiceChat/theme/notification/screenShare/…） |
| `hooks/` | React hooks（节选：media、useUpload、useDeepLinkNavigation、useOverlayRelay、useMemberRoster、useTypingReporter、移动端 hooks…） |
| `api/` | `apiClient`(axios) + `authTransport`(懒续期) + 按领域拆分的 typed API |
| `socket/` | `wsClient` / `events`(重导出 protocol) / `socketEvents` / `roomState` / `providerReload` / `tabLock` |
| `handler_audio/` | 音频装配：`index`、`speakingStore`、`notificationSounds` |
| `protocol/` | `generated/` 为 gen-protocol 产物（**勿手改**）+ `conversation`/`announcement`/`ws` |
| `types/` `utils/` `assets/` | 共享类型、工具（errorReport/exportLog/apiError/clientLog…）、静态资源 |

## 约定

- 页面只做编排：复杂 UI 下沉到同级 `components/`（该目录不参与路由生成）。
- 服务端状态用 react-query；客户端状态用 zustand 双入口；组件用 selector 订阅。
- 异步错误不重抛进边界：UI 反馈走 `apiClient` 拦截器 toast / `utils/backgroundFailure.ts`，`utils/errorReport.ts` 的 `installGlobalErrorHandlers()` 只负责 `window.error` / `unhandledrejection` 上报。
- 事件名/payload 只从 `socket/events.ts`（即 `protocol/generated`）取，禁止手写字符串。
- 图标 `lucide-react`、品牌图标 `components/oauth/ProviderIcon.tsx`；样式只用 token 类名。

## 易错点

- **远端 track join 竞态**：`joinRoom` 可能在回调注册前就订阅了远端 track，必须同时用 `getExistingRemoteAudioTracks()` 补齐，否则全局静音/音量对它失效。
- 单标签页 socket 所有权由 `socket/tabLock.ts` 维护，不要绕过它直接 new 连接。
- 桌面能力判定用 `inDesktop()`；`isDesktop()` 仅限 SDK 内部。
- **权限判定只读服务端下发的 `user.permissions`**：`utils/permissions.ts` 禁止内置 role → 权限码映射表。历史上手抄 `model.DefaultRolePermissions` 曾漏掉 `domain:room-layout:manage`，属猴子补丁，已移除。新增权限码只改后端 `permcode` + 默认角色授权即可，前端零改动；登录 / 注册 / 首改密 / profile 响应都带 `permissions`。
- 更多细节：`docs/design/AGENTS-{pages,components,stores,hooks}.md`。
