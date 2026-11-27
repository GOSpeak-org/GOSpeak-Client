/**
 * Cross-process event names (wire strings) shared by the desktop host and the
 * capability SDK. The Go side declares the same names in app/desktop/events.go;
 * scripts/check-desktop-commands.mjs verifies both sides never drift.
 */
export const desktopEvents = {
	overlayVisibility: "overlay.visibility",
	overlayEnabled: "overlay.enabled",
	overlayLock: "overlay.lock",
	deeplinkOpen: "deeplink.open",
	notificationClick: "notification.click",
	updaterProgress: "updater.progress",
	trayMenuClick: "tray.menuClick",
} as const;
