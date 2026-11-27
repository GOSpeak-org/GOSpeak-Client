import { createPlugin } from "@gospeak/plugin-sdk";

const plugin = await createPlugin({
	pluginId: "com.gospeak.message-logger",
	name: "消息日志插件",
	version: "1.0.0",
	hookTypes: ["message:created"],
	onEvent(event, payload) {
		if (event !== "message:created") return;
		const roomUuid = payload?.room_uuid;
		const authorUuid = payload?.author_uuid ?? payload?.user_uuid;
		if (!roomUuid || !authorUuid) return;
		const key = `messages:${roomUuid}`;
		plugin.kv
			.load(key)
			.then((current) => {
				const count = typeof current === "number" ? current : 0;
				return plugin.kv.save(key, count + 1, "message logger");
			})
			.catch((err) =>
				plugin.reportError("message logger failed", { message: String(err) }),
			);
	},
});

process.on("SIGTERM", () => {
	plugin.close().finally(() => process.exit(0));
});
