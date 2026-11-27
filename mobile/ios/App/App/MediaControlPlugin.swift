import AVFoundation
import Capacitor
import Foundation
import MediaPlayer

@objc(MediaControlPlugin)
public class MediaControlPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MediaControlPlugin"
    public let jsName = "MediaControl"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setMetadata", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    private var muted = false

    private var commands: [MPRemoteCommand] {
        let center = MPRemoteCommandCenter.shared()
        return [center.togglePlayPauseCommand, center.nextTrackCommand]
    }

    @objc func setMetadata(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "GOSpeak"
        let subtitle = call.getString("subtitle") ?? ""
        muted = call.getBool("muted") ?? false

        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: subtitle,
        ]

        registerCommands()

        // 会话配置失败不阻断锁屏展示，音频通路由 AudioSessionPlugin 负责。
        try? AVAudioSession.sharedInstance().setActive(true, options: [])
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        for command in commands {
            command.removeTarget(nil)
            command.isEnabled = false
        }
        muted = false
        call.resolve()
    }

    private func registerCommands() {
        // 先摘除旧 target，重复 setMetadata 才不会叠加回调导致事件成倍触发。
        for command in commands {
            command.removeTarget(nil)
        }

        let center = MPRemoteCommandCenter.shared()
        center.togglePlayPauseCommand.isEnabled = true
        center.nextTrackCommand.isEnabled = true

        // 回调统一切回主线程，JS 事件必须在桥接线程派发。
        _ = center.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            DispatchQueue.main.async {
                self.muted.toggle()
                self.notifyAction(self.muted ? "mute" : "unmute")
            }
            return .success
        }
        _ = center.nextTrackCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            DispatchQueue.main.async {
                self.notifyAction("hangup")
            }
            return .success
        }
    }

    private func notifyAction(_ action: String) {
        notifyListeners("action", data: ["action": action])
    }
}
