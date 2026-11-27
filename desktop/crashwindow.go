package main

// 原生崩溃窗口：页面已经不可用时，用 MyGo 自带的 ui 包（纯 Go 绘制，不启动
// WebView）显示崩溃原因与日志路径，并提供导出、重启、退出。
//
// 触发点见 crash_fatal.go：页面加载失败、宿主 panic、前端白名单/错误风暴。

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

const (
	crashWindowWidth  = 620
	crashWindowHeight = 420
	crashLogTailLines = 6
)

// crashInfo is what the crash window shows. It never reads the page: the
// WebView is usually gone by the time the window opens.
type crashInfo struct {
	Reason string
	Detail string
	At     time.Time
	// LogText is filled by the export button; "" until the user asks.
	LogText string
	// SavedPath is the last export destination, shown as confirmation.
	SavedPath string
	// Busy disables the buttons while an export runs.
	Busy bool
	// SaveErr is the last export failure, shown under the buttons.
	SaveErr string
}

var (
	crashWinMu sync.Mutex
	crashWin   *mygo.Window
	crashState *crashInfo
	// crashShown keeps a single crash window: repeated failures (a reload loop,
	// an error storm) must not stack windows.
	crashShown bool
)

// reportFatal opens the native crash window. Safe to call from any goroutine;
// window construction happens on the main thread.
func reportFatal(reason, detail string) {
	crashWinMu.Lock()
	already := crashShown
	crashShown = true
	crashWinMu.Unlock()
	if already {
		// Still record the reason in the ring so the exported log shows it.
		appendHostEntry(ClientLogEntry{
			ID:      fmt.Sprintf("fatal-%d", time.Now().UnixNano()),
			TS:      time.Now().UnixMilli(),
			Level:   "error",
			Scope:   "fatal",
			Message: reason,
			Stack:   detail,
		})
		return
	}

	crashState = &crashInfo{Reason: reason, Detail: detail, At: time.Now()}
	appendHostEntry(ClientLogEntry{
		ID:      fmt.Sprintf("fatal-%d", time.Now().UnixNano()),
		TS:      crashState.At.UnixMilli(),
		Level:   "error",
		Scope:   "fatal",
		Message: reason,
		Stack:   detail,
	})
	log.Printf("[GOSpeak] fatal: %s", reason)

	// A crash must not be swallowed by the tray: let the app be closable again.
	quitting.endQuit()

	mygo.App.WhenReady(func() {
		crashWinMu.Lock()
		if crashWin != nil {
			crashWinMu.Unlock()
			return
		}
		w := mygo.NewWindow(mygo.WindowOptions{
			Title:     "GOSpeak 遇到问题",
			Width:     crashWindowWidth,
			Height:    crashWindowHeight,
			MinWidth:  480,
			MinHeight: 320,
			Content:   ui.View(crashView),
			// The main window is usually unusable; this one must be reachable.
			// X/Y left at zero centers it on the current display.
			AlwaysOnTop: true,
		})
		crashWin = w
		crashWinMu.Unlock()

		// Closing the crash window quits: the app is in an unrecoverable state.
		w.OnClose(func(*mygo.CloseEvent) {
			quitting.beginQuit()
		})
		w.OnClosed(func() {
			mygo.App.Quit()
		})
	})
}

// crashView draws the crash report and its actions.
func crashView(c *ui.Context) {
	t := c.Theme()
	state := crashState
	if state == nil {
		return
	}

	ui.Column(c).Fill().Padding(20).Gap(12).Children(func() {
		ui.Text(c, "GOSpeak 遇到问题").FontSize(20).Bold().TextColor(t.Danger)
		ui.Text(c, state.Reason).FontSize(14).Wrap()

		ui.Text(c, fmt.Sprintf("发生时间：%s", state.At.Format("2006-01-02 15:04:05"))).
			FontSize(12).
			TextColor(t.TextMuted)

		if detail := strings.TrimSpace(state.Detail); detail != "" {
			ui.Scroll(c).Grow(1).Padding(10).Background(t.Surface).Radius(6).Children(func() {
				ui.Text(c, detail).FontSize(12).Font("monospace").Selectable().Wrap()
			})
		} else {
			ui.Box(c).Grow(1)
		}

		if state.LogText != "" {
			ui.Text(c, "日志内容已生成，可导出为文件。").
				FontSize(12).
				TextColor(t.TextMuted)
		}
		if state.SavedPath != "" {
			ui.Text(c, "已保存到："+state.SavedPath).FontSize(12).TextColor(t.Success)
		}
		if state.SaveErr != "" {
			ui.Text(c, "导出失败："+state.SaveErr).FontSize(12).TextColor(t.Danger)
		}

		ui.Row(c).Gap(8).Justify(ui.End).Children(func() {
			if ui.Button(c, "打开日志文件夹").Clicked() {
				if dir := hostLogsDir(); dir != "" {
					mygo.Shell.ShowItemInFolder(dir)
				}
			}
			if ui.Button(c, "重启 GOSpeak").Clicked() {
				restartApp()
			}
			if ui.PrimaryButton(c, "导出日志").Disabled(state.Busy).Clicked() {
				go exportCrashLog()
			}
			if ui.Button(c, "退出").Clicked() {
				requestQuit()
			}
		})
	})
}

// exportCrashLog asks for a destination with the native save dialog and writes
// the merged report there. The crash window has no page, so the Blob path used
// by the settings UI is unavailable.
func exportCrashLog() {
	state := crashState
	if state == nil {
		return
	}
	crashWinMu.Lock()
	state.Busy = true
	state.SaveErr = ""
	crashWinMu.Unlock()
	invalidateCrashWindow()

	path, err := mygo.DialogModule{}.Save(mygo.SaveDialogOptions{
		Title:       "导出 GOSpeak 日志",
		DefaultPath: exportLogFileName(),
		Filters:     []mygo.FileFilter{{Name: "日志文件", Extensions: []string{"txt", "log"}}},
	})
	if err != nil {
		crashWinMu.Lock()
		state.Busy = false
		state.SaveErr = err.Error()
		crashWinMu.Unlock()
		invalidateCrashWindow()
		return
	}
	if path == "" {
		crashWinMu.Lock()
		state.Busy = false
		crashWinMu.Unlock()
		invalidateCrashWindow()
		return
	}

	text := buildHostLogText()
	if writeErr := writeLogFile(path, text); writeErr != nil {
		crashWinMu.Lock()
		state.Busy = false
		state.SaveErr = writeErr.Error()
		crashWinMu.Unlock()
		invalidateCrashWindow()
		return
	}

	crashWinMu.Lock()
	state.Busy = false
	state.LogText = text
	state.SavedPath = path
	crashWinMu.Unlock()
	invalidateCrashWindow()
	mygo.Shell.ShowItemInFolder(path)
}

func invalidateCrashWindow() {
	crashWinMu.Lock()
	w := crashWin
	crashWinMu.Unlock()
	if w != nil {
		w.Invalidate()
	}
}

// restartApp relaunches the process; the crash state resets with it.
func restartApp() {
	quitting.beginQuit()
	mygo.App.Relaunch()
}
