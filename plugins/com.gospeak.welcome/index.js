import { createPlugin } from "@gospeak/plugin-sdk";

const plugin = await createPlugin({
	pluginId: "com.gospeak.welcome",
	name: "欢迎插件",
	version: "1.0.0",
	hookTypes: ["member:joined"],
	onEvent(event, payload) {
		if (event !== "member:joined") return;
		const userUuid = payload?.user_uuid;
		const roomUuid = payload?.room_uuid;
		if (!userUuid) return;
		plugin.api
			.getUser(userUuid)
			.then((user) =>
				plugin.kv.save(
					`welcome:${userUuid}`,
					{ displayName: user.displayName, roomUuid, at: Date.now() },
					"welcome plugin",
				),
			)
			.catch((err) =>
				plugin.reportError("welcome: failed", { message: String(err) }),
			);
	},
});

process.on("SIGTERM", () => {
	plugin.close().finally(() => process.exit(0));
});
