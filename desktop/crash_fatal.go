package main

// 不可逆崩溃的三个判定点。三个入口最终都走 reportFatal（crashwindow.go）：
//
//  1. 页面加载失败 —— 主窗口的应用根 URL 加载不出来（刷新/子资源失败不算）；
//  2. 宿主 panic —— 主循环或绑定服务 panic（IPC 层 mygo 自带 recover，不重复）；
//  3. 前端白屏 / 错误风暴 —— 由页面侧判定后经 ClientLog.ReportFatal 上报。
//
// 判定逻辑抽成纯函数，便于单测。

import (
	"fmt"
	"net/url"
	"runtime/debug"
	"strings"
)

// isFatalLoadFailure reports whether a failed page load means the app shell
// itself is gone. A reload of the app root, or the very first load, counts; a
// failed sub-resource or a navigation to some other path does not.
func isFatalLoadFailure(loadURL, appBase string, code int) bool {
	if appBase == "" {
		return false
	}
	load, err := url.Parse(loadURL)
	if err != nil || load.Host == "" {
		return false
	}
	base, err := url.Parse(appBase)
	if err != nil || base.Host == "" {
		return false
	}
	if load.Host != base.Host {
		return false
	}
	// Only the shell: "/" or the index document.
	path := strings.TrimSuffix(load.Path, "index.html")
	if path != "" && path != "/" {
		return false
	}
	// 102 = ERR_CONNECTION_REFUSED, 0/-3 = cancelled or WebKit's generic
	// failure. A cancelled load is usually a navigation, not a crash.
	if code == -3 {
		return false
	}
	return true
}

// fatalLoadReason renders the crash window's reason line for a load failure.
func fatalLoadReason(loadURL string, code int, description string) string {
	return fmt.Sprintf("应用页面加载失败（%s，错误码 %d）。界面无法继续运行。", description, code)
}

// panicReason renders a recovered panic into the crash window's reason line.
func panicReason(r any) string {
	return fmt.Sprintf("宿主程序发生未恢复的异常：%v", r)
}

// panicDetail returns the panic value plus its goroutine stack.
func panicDetail(r any) string {
	return fmt.Sprintf("%v\n\n%s", r, debug.Stack())
}

// recoverToCrashWindow is the deferred handler for the main goroutine. It
// reports the panic and keeps the process alive so the native window can show.
func recoverToCrashWindow() {
	if r := recover(); r != nil {
		reportFatal(panicReason(r), panicDetail(r))
	}
}
