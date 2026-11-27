import { createPlugin } from "@gospeak/plugin-sdk";

const plugin = await createPlugin({
	pluginId: "com.gospeak.room-audit",
	name: "房间巡检插件",
	version: "1.0.0",
	hookTypes: ["member:joined", "member:left"],
	onEvent(event, payload) {
		const roomUuid = payload?.room_uuid;
		if (!roomUuid) return;
		const key = `audit:${roomUuid}`;
		plugin.kv
			.load(key)
			.then((current) => {
				const state = current ?? { joined: 0, left: 0 };
				if (event === "member:joined") state.joined += 1;
				else state.left += 1;
				state.lastEventAt = Date.now();
				return plugin.kv.save(key, state, "room audit");
			})
			.catch((err) =>
				plugin.reportError("room audit failed", { message: String(err) }),
			);
	},
});

plugin.config
	.get()
	.then((config) => {
		const domainUuid = config.domainUuid;
		if (typeof domainUuid !== "string" || !domainUuid) return;
		const timer = setInterval(() => {
			plugin.api
				.listRooms(domainUuid)
				.then((rooms) => plugin.kv.save("room-list", rooms, "room audit"))
				.catch((err) =>
					plugin.reportError("listRooms failed", { message: String(err) }),
				);
		}, 60000);
		timer.unref();
	})
	.catch((err) =>
		plugin.reportError("config.get failed", { message: String(err) }),
	);

process.on("SIGTERM", () => {
	plugin.close().finally(() => process.exit(0));
});
