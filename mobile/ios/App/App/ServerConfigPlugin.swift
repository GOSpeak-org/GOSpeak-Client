import Capacitor
import Foundation

@objc(ServerConfigPlugin)
public class ServerConfigPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ServerConfigPlugin"
    public let jsName = "ServerConfig"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getBaseURL", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBaseURL", returnType: CAPPluginReturnPromise),
    ]

    @objc func getBaseURL(_ call: CAPPluginCall) {
        let base = UserDefaults.standard.string(forKey: LocalProxyServer.baseURLDefaultsKey) ?? ""
        call.resolve(["baseUrl": base])
    }

    @objc func setBaseURL(_ call: CAPPluginCall) {
        let raw = call.getString("url") ?? call.getString("baseUrl") ?? ""
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        if !value.isEmpty {
            // 地址校验规则唯一实现在 app/shared/proxyrules（经 gomobile 绑定），与桌面/安卓同源。
            var validationError: NSError?
            let accepted = ProxyrulesValidateBaseURL(value, &validationError)
            if !accepted || validationError != nil {
                call.reject("invalid server URL: must be an absolute http(s) URL")
                return
            }
        }

        LocalProxyServer.shared.setBackendBaseURL(value)
        call.resolve(["baseUrl": value])

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let webView = self.bridge?.webView ?? self.webView
            webView?.reload()
        }
    }
}
