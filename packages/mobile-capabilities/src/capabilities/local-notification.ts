import { getPlugin } from "../bridge";

/**
 * 本地通知（仅设备本地触发）。
 *
 * 通过 Capacitor 官方 @capacitor/local-notifications 在设备本地排期或取消通知，
 * 适合定时提醒等纯本地场景。它不能替代服务端推送（APNs / FCM）：应用进程不在、
 * 被系统终止或需要远端下发时本地通知无法送达，远端消息请走 push 能力。
 */

export interface LocalNotificationOptions {
	id: number;
	title: string;
	body: string;
}

interface LocalNotificationsPlugin {
	requestPermissions(): Promise<{ display?: string }>;
	schedule(options: {
		notifications: LocalNotificationOptions[];
	}): Promise<void>;
	cancel(options: { notifications: { id: number }[] }): Promise<void>;
}

export interface LocalNotification {
	requestPermission(): Promise<void>;
	notify(options: LocalNotificationOptions): Promise<void>;
	cancel(id: number): Promise<void>;
}

export function createLocalNotification(): LocalNotification {
	let permissionPromise: Promise<unknown> | null = null;

	const ensurePermission = async () => {
		if (!permissionPromise) {
			permissionPromise = getPlugin<LocalNotificationsPlugin>(
				"LocalNotifications",
			)
				.then((plugin) => plugin.requestPermissions())
				.catch((error) => {
					console.warn(
						"[gospeak/mobile] LocalNotifications.requestPermissions failed",
						error,
					);
				});
		}
		await permissionPromise;
	};

	return {
		async requestPermission() {
			if (!__GOSPEAK_MOBILE__) return;
			await ensurePermission();
		},
		async notify(options) {
			if (!__GOSPEAK_MOBILE__) {
				try {
					if (typeof Notification !== "undefined") {
						new Notification(options.title, { body: options.body });
					}
				} catch (error) {
					console.warn(
						"[gospeak/mobile] LocalNotifications web fallback failed",
						error,
					);
				}
				return;
			}
			try {
				await ensurePermission();
				const plugin =
					await getPlugin<LocalNotificationsPlugin>("LocalNotifications");
				await plugin.schedule({
					notifications: [
						{ id: options.id, title: options.title, body: options.body },
					],
				});
			} catch (error) {
				console.warn(
					"[gospeak/mobile] LocalNotifications.schedule failed",
					error,
				);
			}
		},
		async cancel(id) {
			if (!__GOSPEAK_MOBILE__) return;
			try {
				const plugin =
					await getPlugin<LocalNotificationsPlugin>("LocalNotifications");
				await plugin.cancel({ notifications: [{ id }] });
			} catch (error) {
				console.warn(
					"[gospeak/mobile] LocalNotifications.cancel failed",
					error,
				);
			}
		},
	};
}
