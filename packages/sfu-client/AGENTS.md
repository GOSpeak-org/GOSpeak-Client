# packages/sfu-client — 前端媒体会话客户端

`@gospeak/sfu-client`：页面侧的**媒体会话生命周期**抽象。名字里的 SFU 是历史遗留，它**不是** moderation / 管理面 / 本地播放控制的抽象。

## 结构

| 文件 | 职责 |
|------|------|
| `provider.ts` | `SFUProvider = "livekit"`、`SFU_PROVIDERS`、`isSFUProvider`、`PROVIDER_LABELS` |
| `factory.ts` | `createSFUClient` / `preloadSFUClient`（动态 import，按 provider 懒加载） |
| `livekit-client.ts` | 唯一实现 `LiveKitSFUClient` |
| `types.ts` | `SFUClient` 接口与各类 Options/Info 类型 |
| `reconnect-policy.ts` | 纯函数重连节奏策略 |
| `speaking-meter / speaking-detector / speaking-meter-worklet` | 本地发言检测（AudioWorklet） |
| `screen-share-quality.ts` | 屏幕共享档位预设与图层编码计算 |

## SFUClient 契约

必选：`joinRoom` / `leaveRoom` / `setMicEnabled` / `onActiveSpeakers` / `onRemoteAudioTrack` / `onRemoteAudioTrackRemoved` / `getExistingRemoteAudioTracks` / `onDisconnected` / `isConnected` / `destroy`。

可选（调用方**必须特性检测**）：`setAudioInputDevice` `onLocalSpeakingChange` `setScreenShareEnabled` `setScreenShareQuality` `getScreenShareQuality` `getLocalScreenShareTrack` `onLocalScreenShareChanged` `onRemoteVideoTrack` `onRemoteVideoTrackRemoved` `getExistingRemoteVideoTracks` `subscribePeers` `unsubscribePeer` `onReconnecting` `onReconnected`。

**`getExistingRemoteAudioTracks()` 解决 join 竞态**：`joinRoom` 可能在回调注册前就已订阅远端 track，只靠事件会漏掉它们，导致全局静音/音量失效。

## 重连策略

用墙钟预算而非重试次数：15s 内接不回就**快速失败**交回上层完整 re-join；退避 1s→2s→4s 封顶，最多 3 次封顶退避；浏览器离线时降到 1s 慢速继续等待，网络恢复立即回基础退避。纯函数 + 仿真测试，改参数请同步更新 `reconnect-policy.simulation.test.ts`。

## 约束

- **provider SDK 类型不得外泄**：页面只依赖 `SFUClient` 与 `RemoteTrackInfo` 等抽象。
- 网络下发的 provider 值必须先过 `isSFUProvider` 运行时校验再用。
- 本地静音/音量属于 web 播放层，只通过 `RemoteAudioTrackLike.setVolume` 施加，不要建模成会话方法。
- 当前只有 `livekit`；新增实现需同时更新 `provider.ts`、`factory.ts` 的 loader 与后端能力矩阵。
