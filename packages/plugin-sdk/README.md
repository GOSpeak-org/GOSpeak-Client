# @gospeak/plugin-sdk

GOSpeak 插件 JS SDK。插件作者只需调用 `createPlugin()`，无需接触 gRPC、proto、端口或凭据文件。

## 用法

```js
import { createPlugin } from "@gospeak/plugin-sdk"

const plugin = await createPlugin({
	pluginId: "com.example.audit",
	name: "内容审核插件",
	version: "1.0.0",
	hookTypes: ["message.created"],
	onEvent(event, payload) {
		plugin.reportError("not implemented")
	},
})

console.log(await plugin.config.get()) // 返回 Record<string, unknown>
await plugin.kv.save("key", { value: 1 }, "reason") // 返回 void
console.log(await plugin.kv.load("key")) // 返回 T | undefined，未找到时为 undefined
```

宿主进程通过 `GOSPEAK_PLUGIN_CREDENTIAL` 注入一次性凭据文件（内容 `127.0.0.1:<port>`）。
SDK 读取该文件并建立本地回环 gRPC channel。

## proto 单一事实源

`proto/plugin.proto` 由 `pnpm copy:proto` 从 GOSpeak-Server 仓的 `server/plugin/proto/plugin.proto` 复制而来
（三仓拆分前为 `app/server/plugin/proto/plugin.proto`）；可用 `GOSPEAK_SERVER_PROTO` 指定服务端检出位置。
`build` / `test` 脚本会自动执行复制；没有服务端检出时退回本仓已版本化的快照，请勿手写修改副本。
