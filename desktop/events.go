package main

// 桌面跨进程事件名（wire name）：Go 宿主用 mygo.NewEvent 发射，TS SDK 用
// bridge.listen 监听。字面量只在这里定义一次，TS 侧见
// packages/desktop/src/events.ts；scripts/check-desktop-commands.mjs 双向校验。
const (
	eventOverlayVisibility = "overlay.visibility"
	eventOverlayEnabled    = "overlay.enabled"
	eventOverlayLock       = "overlay.lock"
	eventDeeplinkOpen      = "deeplink.open"
	eventNotificationClick = "notification.click"
	eventUpdaterProgress   = "updater.progress"
	eventTrayMenuClick     = "tray.menuClick"
)
