import AVFoundation
import Capacitor
import Foundation

@objc(AudioSessionPlugin)
public class AudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioSessionPlugin"
    public let jsName = "AudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "activate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deactivate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "current", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    ]

    @objc func activate(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
            )
            try session.setActive(true, options: [])
            call.resolve()
        } catch {
            call.reject("failed to activate audio session: \(error.localizedDescription)")
        }
    }

    @objc func deactivate(_ call: CAPPluginCall) {
        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: [.notifyOthersOnDeactivation]
            )
            call.resolve()
        } catch {
            call.reject("failed to deactivate audio session: \(error.localizedDescription)")
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        var routes: [[String: String]] = [
            ["kind": "speaker", "label": "扬声器"],
            ["kind": "earpiece", "label": "听筒"],
        ]
        let available = AVAudioSession.sharedInstance().availableInputs ?? []
        for input in available {
            switch input.portType {
            case .bluetoothHFP, .bluetoothLE:
                routes.append(["kind": "bluetooth", "label": "蓝牙耳机"])
            case .headsetMic, .headphones:
                routes.append(["kind": "headset", "label": "有线耳机"])
            default:
                break
            }
        }
        call.resolve(["routes": routes])
    }

    @objc func current(_ call: CAPPluginCall) {
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        let isBluetooth = outputs.contains {
            $0.portType == .bluetoothHFP || $0.portType == .bluetoothLE
        }
        let isHeadset = outputs.contains {
            $0.portType == .headphones || $0.portType == .headsetMic
        }
        let kind = isBluetooth ? "bluetooth" : (isHeadset ? "headset" : "speaker")
        call.resolve(["kind": kind])
    }

    @objc func set(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "speaker"
        do {
            let session = AVAudioSession.sharedInstance()
            let available = session.availableInputs ?? []
            if kind == "speaker" {
                try session.overrideOutputAudioPort(.speaker)
            } else if kind == "earpiece" {
                try session.overrideOutputAudioPort(.none)
            } else if kind == "bluetooth" {
                guard available.contains(where: {
                    $0.portType == .bluetoothHFP || $0.portType == .bluetoothLE
                }) else {
                    call.reject("bluetooth audio route is unavailable")
                    return
                }
                try session.overrideOutputAudioPort(.none)
            } else if kind == "headset" {
                guard available.contains(where: {
                    $0.portType == .headsetMic || $0.portType == .headphones
                }) else {
                    call.reject("wired headset audio route is unavailable")
                    return
                }
                try session.overrideOutputAudioPort(.none)
            } else {
                call.reject("unsupported audio route: \(kind)")
                return
            }
            call.resolve()
        } catch {
            call.reject("failed to set audio route: \(error.localizedDescription)")
        }
    }
}
