import { getPlugin, listenPlugin } from "../bridge";

/**
 * 推送通知（APNs / FCM）。
 *
 * 只负责「拿到 device token 并交给上层上报」与「点击通知时把 payload 交回」；
 * 后端绑定关系、去重、权限策略都留在 web 层与后端，能力层不做业务。
 */

interface PushPlugin {
	requestPermissions(): Promise<{ receive: string }>;
	register(): Promise<void>;
}

export interface Push {
	register(): Promise<string | null>;
	onToken(handler: (token: string) => void): () => void;
	onNotificationOpened(
		handler: (data: Record<string, unknown>) => void,
	): () => void;
}

export function normalizePushData(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null) return {};
	return { ...(value as Record<string, unknown>) };
}

export function createPush(): Push {
	const tokenHandlers = new Set<(token: string) => void>();
	const openHandlers = new Set<(data: Record<string, unknown>) => void>();
	let started = false;
	let cachedToken: string | null = null;

	const start = async () => {
		if (started || !__GOSPEAK_MOBILE__) return;
		started = true;
		const unsubscribers: (() => void)[] = [];
		try {
			const plugin = await getPlugin<PushPlugin>("PushNotifications");
			const result = await plugin.requestPermissions();
			if (result.receive !== "granted") {
				started = false;
				console.warn(
					"[gospeak/mobile] push permission not granted",
					result.receive,
				);
				return;
			}
			unsubscribers.push(
				await listenPlugin<{ value?: string }>(
					"PushNotifications",
					"registration",
					(payload) => {
						const token =
							typeof payload?.value === "string" ? payload.value : null;
						if (!token) return;
						cachedToken = token;
						for (const handler of tokenHandlers) handler(token);
					},
				),
			);
			unsubscribers.push(
				await listenPlugin<{ notification?: { data?: unknown } }>(
					"PushNotifications",
					"pushNotificationActionPerformed",
					(payload) => {
						const data = normalizePushData(payload?.notification?.data);
						for (const handler of openHandlers) handler(data);
					},
				),
			);
			await plugin.register();
		} catch (error) {
			for (const off of unsubscribers) off();
			unsubscribers.length = 0;
			started = false;
			console.warn("[gospeak/mobile] push registration failed", error);
		}
	};

	return {
		async register() {
			await start();
			return cachedToken;
		},
		onToken(handler) {
			tokenHandlers.add(handler);
			if (cachedToken) handler(cachedToken);
			void start();
			return () => {
				tokenHandlers.delete(handler);
			};
		},
		onNotificationOpened(handler) {
			openHandlers.add(handler);
			void start();
			return () => {
				openHandlers.delete(handler);
			};
		},
	};
}
