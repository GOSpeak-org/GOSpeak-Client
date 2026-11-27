import { bridge, command } from "../bridge";
import { desktopEvents } from "../events";
import { isDesktop } from "../runtime";

export interface NotificationOptions {
	title: string;
	body?: string;
	/** Sound / icon hint understood by the host. */
	icon?: string;
}

export interface NotificationHandle {
	/** Clicking the notification (desktop only). */
	onClick(handler: () => void): void;
}

/** Native desktop notifications. Falls back to the Web Notifications API in browser. */
export function showNotification(
	options: NotificationOptions,
): NotificationHandle {
	if (isDesktop()) {
		const handlers = new Set<() => void>();
		bridge
			.invoke<string>(command("Notification", "Show"), options)
			.then((eventId) => {
				// Host broadcasts "notification.click" with the ID as payload;
				// match it here so every notification shares one event channel.
				bridge.listen(desktopEvents.notificationClick, (id) => {
					if (id !== eventId) return;
					for (const handler of handlers) handler();
				});
			})
			.catch((error) => {
				console.warn("[gospeak-desktop] Notification.Show failed:", error);
			});
		return {
			onClick(handler) {
				handlers.add(handler);
			},
		};
	}

	// Browser fallback via the Web Notifications API. Always degrade to an
	// inert handle instead of throwing when the API or permission is missing.
	const handlers = new Set<() => void>();
	const handle: NotificationHandle = {
		onClick(handler) {
			handlers.add(handler);
		},
	};

	try {
		if (typeof Notification === "undefined") {
			console.warn("[gospeak-desktop] Notifications API unavailable; dropped.");
			return handle;
		}

		const display = () => {
			try {
				const n = new Notification(options.title, {
					body: options.body,
					icon: options.icon,
				});
				n.onclick = () => {
					for (const handler of handlers) handler();
				};
			} catch {
				console.warn(
					"[gospeak-desktop] Failed to display notification; dropped.",
				);
			}
		};

		if (Notification.permission === "granted") {
			display();
		} else if (
			Notification.permission === "default" &&
			typeof Notification.requestPermission === "function"
		) {
			// requestPermission is async, so display once the user answers;
			// the handle is handed back synchronously with handlers intact.
			void Promise.resolve(Notification.requestPermission())
				.then((permission) => {
					if (permission === "granted") {
						display();
					} else {
						console.warn(
							"[gospeak-desktop] Notification permission not granted; dropped.",
						);
					}
				})
				.catch((error) => {
					console.warn(
						"[gospeak-desktop] Notification.requestPermission failed:",
						error,
					);
				});
		} else {
			console.warn(
				"[gospeak-desktop] Notification permission denied; dropped.",
			);
		}
	} catch {
		console.warn("[gospeak-desktop] Notification fallback failed; dropped.");
	}

	return handle;
}

/** Request/check notification permission (mirrors the browser API). */
export function requestNotificationPermission(): Promise<NotificationPermission> {
	if (isDesktop()) {
		return bridge.invoke<NotificationPermission>(
			command("Notification", "RequestPermission"),
		);
	}
	if (typeof Notification === "undefined") return Promise.resolve("denied");
	return Notification.requestPermission();
}
