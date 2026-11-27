import Foundation
import Network

final class LocalProxyServer {
    static let shared = LocalProxyServer()

    static let portFirst: UInt16 = 47900
    static let portLast: UInt16 = 47919
    static let portDefaultsKey = "gospeak.proxyPort"
    static let baseURLDefaultsKey = "gospeak.server.baseUrl"

    private(set) var port: UInt16 = 0

    func boundPort() -> UInt16 {
        lock.lock()
        defer { lock.unlock() }
        return port
    }

    private let queue = DispatchQueue(label: "dev.gospeak.mobile.proxy", qos: .userInitiated, attributes: .concurrent)
    private let lock = NSLock()
    private var listener: NWListener?
    private var connections: [NWConnection] = []
    private var started = false

    private let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }()

    private init() {}

    // MARK: - Public

    func start() {
        lock.lock()
        if started {
            lock.unlock()
            return
        }
        started = true
        lock.unlock()

        for candidate in Self.portCandidates() {
            if startListener(on: candidate) {
                return
            }
        }
        lock.lock()
        started = false
        lock.unlock()
    }

    private final class Flag {
        private let lock = NSLock()
        private var value = false
        func set(_ next: Bool) { lock.lock(); value = next; lock.unlock() }
        func get() -> Bool { lock.lock(); defer { lock.unlock() }; return value }
    }

    private static func portCandidates() -> [UInt16] {
        var result: [UInt16] = []
        let persisted = UserDefaults.standard.integer(forKey: portDefaultsKey)
        if persisted >= Int(portFirst) && persisted <= Int(portLast) {
            result.append(UInt16(persisted))
        }
        for candidate in portFirst...portLast where !result.contains(candidate) {
            result.append(candidate)
        }
        result.append(0)
        return result
    }

    private func startListener(on candidate: UInt16) -> Bool {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = NWEndpoint.hostPort(
            host: NWEndpoint.Host("127.0.0.1"),
            port: NWEndpoint.Port(integerLiteral: candidate)
        )
        let ready = DispatchSemaphore(value: 0)
        let succeeded = Flag()
        do {
            let newListener = try NWListener(using: parameters)
            newListener.stateUpdateHandler = { [weak self] state in
                guard let self = self else { ready.signal(); return }
                switch state {
                case .ready:
                    let actual = newListener.port?.rawValue ?? candidate
                    self.lock.lock()
                    self.port = actual
                    self.listener = newListener
                    self.lock.unlock()
                    if actual >= Self.portFirst && actual <= Self.portLast {
                        UserDefaults.standard.set(Int(actual), forKey: Self.portDefaultsKey)
                    }
                    succeeded.set(true)
                    ready.signal()
                case .failed, .cancelled:
                    self.stopListener(newListener)
                    ready.signal()
                default:
                    break
                }
            }
            newListener.newConnectionHandler = { [weak self] connection in
                guard let self = self else {
                    connection.cancel()
                    return
                }
                self.accept(connection)
            }
            newListener.start(queue: queue)
            _ = ready.wait(timeout: .now() + 2.0)
            return succeeded.get()
        } catch {
            return false
        }
    }

    func setBackendBaseURL(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            UserDefaults.standard.removeObject(forKey: LocalProxyServer.baseURLDefaultsKey)
        } else {
            UserDefaults.standard.set(trimmed, forKey: LocalProxyServer.baseURLDefaultsKey)
        }
    }

    // MARK: - Connection lifecycle

    private func accept(_ connection: NWConnection) {
        lock.lock()
        connections.append(connection)
        lock.unlock()

        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .failed, .cancelled:
                self.removeConnection(connection)
            default:
                break
            }
        }
        connection.start(queue: queue)
        readRequest(from: connection)
    }

    private func removeConnection(_ connection: NWConnection) {
        lock.lock()
        if let index = connections.firstIndex(where: { $0 === connection }) {
            connections.remove(at: index)
        }
        lock.unlock()
    }

    private func stopListener(_ listener: NWListener) {
        listener.cancel()
        lock.lock()
        if self.listener === listener {
            self.listener = nil
        }
        started = false
        lock.unlock()
    }

    // MARK: - HTTP request reading

    private struct HTTPRequest {
        var method: String
        var target: String
        var path: String
        var query: String
        var headers: [String: String]
        var body: Data

        func header(_ name: String) -> String? {
            return headers[name.lowercased()]
        }

        func withBody(_ body: Data) -> HTTPRequest {
            var copy = self
            copy.body = body
            return copy
        }
    }

    private func readRequest(from connection: NWConnection) {
        readData(from: connection, until: Data([13, 10, 13, 10]), limit: 64 * 1024) { [weak self] headData in
            guard let self = self else {
                connection.cancel()
                return
            }
            guard let headData = headData,
                  let head = String(data: headData, encoding: .utf8),
                  let request = self.parseRequestHead(head) else {
                self.reply(connection, response: .plain(status: 400, reason: "Bad Request", body: "invalid request"))
                return
            }
            let contentLength = Int(request.header("content-length") ?? "") ?? 0
            if contentLength < 0 || contentLength > 32 * 1024 * 1024 {
                self.reply(connection, response: .plain(status: 413, reason: "Payload Too Large", body: "body too large"))
                return
            }
            if contentLength == 0 {
                self.route(request.withBody(Data()), on: connection)
                return
            }
            self.readExactly(from: connection, length: contentLength) { body in
                guard let body = body else {
                    connection.cancel()
                    return
                }
                self.route(request.withBody(body), on: connection)
            }
        }
    }

    private func parseRequestHead(_ head: String) -> HTTPRequest? {
        let lines = head.components(separatedBy: "\r\n")
        guard let first = lines.first else { return nil }
        let parts = first.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true).map(String.init)
        guard parts.count >= 2 else { return nil }

        let target = parts[1]
        let targetParts = target.components(separatedBy: "?")
        let path = targetParts[0]
        let query = targetParts.count > 1 ? targetParts[1] : ""

        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            if line.isEmpty { continue }
            guard let colon = line.firstIndex(of: ":") else { return nil }
            let key = String(line[..<colon]).trimmingCharacters(in: .whitespaces).lowercased()
            let value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
            if !key.isEmpty {
                headers[key] = value
            }
        }
        return HTTPRequest(
            method: parts[0].uppercased(),
            target: target,
            path: path,
            query: query,
            headers: headers,
            body: Data()
        )
    }

    private func readData(from connection: NWConnection, until delimiter: Data, limit: Int, completion: @escaping (Data?) -> Void) {
        var buffer = Data()
        func step() {
            let maximum = max(1, min(4096, limit - buffer.count + delimiter.count))
            connection.receive(minimumIncompleteLength: 1, maximumLength: maximum) { content, _, isComplete, error in
                if let content = content, !content.isEmpty {
                    buffer.append(content)
                    if let range = buffer.range(of: delimiter) {
                        completion(buffer.subdata(in: buffer.startIndex..<(range.lowerBound + delimiter.count)))
                        return
                    }
                    if buffer.count > limit {
                        completion(nil)
                        return
                    }
                }
                if isComplete || error != nil {
                    completion(nil)
                    return
                }
                step()
            }
        }
        step()
    }

    private func readExactly(from connection: NWConnection, length: Int, completion: @escaping (Data?) -> Void) {
        var buffer = Data()
        buffer.reserveCapacity(length)
        func step() {
            let remaining = length - buffer.count
            if remaining <= 0 {
                completion(buffer)
                return
            }
            connection.receive(minimumIncompleteLength: 1, maximumLength: remaining) { content, _, isComplete, error in
                if let content = content, !content.isEmpty {
                    buffer.append(content)
                }
                if buffer.count >= length {
                    completion(buffer)
                    return
                }
                if isComplete || error != nil {
                    completion(nil)
                    return
                }
                step()
            }
        }
        step()
    }

    // MARK: - Routing

    private func route(_ request: HTTPRequest, on connection: NWConnection) {
        if isProxyPath(request.path) {
            if isUpgrade(request) {
                handleWebSocket(request, on: connection)
            } else {
                handleProxy(request, on: connection)
            }
            return
        }
        if isUpgrade(request) {
            reply(connection, response: .plain(status: 400, reason: "Bad Request", body: "unsupported websocket path"))
            return
        }
        serveStatic(request, on: connection)
    }

    private func isProxyPath(_ path: String) -> Bool {
        if path.hasPrefix("/api/v1/") || path.hasPrefix("/uploads/") || path.hasPrefix("/livekit/") {
            return true
        }
        return isExactOrChild(path, "/ws") || isExactOrChild(path, "/wsworker")
    }

    private func isExactOrChild(_ path: String, _ prefix: String) -> Bool {
        return path == prefix || path.hasPrefix(prefix + "/")
    }

    private func isUpgrade(_ request: HTTPRequest) -> Bool {
        let upgrade = request.header("upgrade")?.lowercased() ?? ""
        let connection = request.header("connection")?.lowercased() ?? ""
        return upgrade.contains("websocket") || connection.contains("upgrade")
    }

    // MARK: - Static assets

    private func serveStatic(_ request: HTTPRequest, on connection: NWConnection) {
        let decodedPath = request.path.removingPercentEncoding ?? request.path
        var parts: [String] = []
        for component in decodedPath.components(separatedBy: "/") {
            if component.isEmpty || component == "." {
                continue
            }
            if component == ".." {
                if !parts.isEmpty {
                    parts.removeLast()
                }
                continue
            }
            parts.append(component)
        }

        let last = parts.last ?? ""
        let hasExtension = !(last as NSString).pathExtension.isEmpty
        var usingIndex = false
        var url = parts.isEmpty ? nil : bundleURL(forRelative: parts.joined(separator: "/"))
        if url == nil && !hasExtension {
            url = bundleURL(forRelative: "index.html")
            usingIndex = url != nil
        }

        guard let assetURL = url, let data = try? Data(contentsOf: assetURL) else {
            reply(connection, response: .plain(status: 404, reason: "Not Found", body: "asset not found"))
            return
        }
        let name = usingIndex ? "index.html" : parts.joined(separator: "/")
        let response = ProxyResponse(
            status: 200,
            reason: "OK",
            headers: [
                ("Content-Type", mimeType(forPath: name)),
                ("Cache-Control", usingIndex ? "no-cache" : "public, max-age=3600"),
                ("X-Content-Type-Options", "nosniff")
            ],
            body: data
        )
        reply(connection, response: response, requestMethod: request.method)
    }

    private func bundleURL(forRelative relative: String) -> URL? {
        let path = relative as NSString
        let directory = path.deletingLastPathComponent
        let name = path.deletingPathExtension
        let ext = path.pathExtension
        let subdirectory = directory.isEmpty ? "public" : "public/" + directory
        if let url = Bundle.main.url(
            forResource: name,
            withExtension: ext.isEmpty ? nil : ext,
            subdirectory: subdirectory
        ) {
            return url
        }
        if let url = Bundle.main.url(forResource: relative, withExtension: nil, subdirectory: "public") {
            return url
        }
        if let root = Bundle.main.resourceURL {
            let url = root.appendingPathComponent("public").appendingPathComponent(relative)
            if FileManager.default.fileExists(atPath: url.path) {
                return url
            }
        }
        return nil
    }

    private func mimeType(forPath path: String) -> String {
        switch (path as NSString).pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "map": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ttf", "otf": return "font/ttf"
        case "wasm": return "application/wasm"
        case "txt", "xml": return "text/plain; charset=utf-8"
        case "mp4": return "video/mp4"
        case "mp3": return "audio/mpeg"
        default: return "application/octet-stream"
        }
    }

    // MARK: - HTTP reverse proxy

    private static let hopByHopHeaders: Set<String> = [
        "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
        "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length"
    ]

    private func handleProxy(_ request: HTTPRequest, on connection: NWConnection) {
        guard let base = LocalProxyServer.configuredBase(),
              let baseComponents = URLComponents(string: base),
              let upstreamURL = makeUpstreamURL(base: baseComponents, request: request) else {
            reply(connection, response: serviceUnavailable())
            return
        }

        var urlRequest = URLRequest(url: upstreamURL)
        urlRequest.httpMethod = request.method
        for (key, value) in request.headers where !LocalProxyServer.hopByHopHeaders.contains(key) {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        urlRequest.setValue("localhost:\(port)", forHTTPHeaderField: "X-Forwarded-Host")
        urlRequest.setValue("http", forHTTPHeaderField: "X-Forwarded-Proto")
        if !request.body.isEmpty {
            urlRequest.httpBody = request.body
        }

        let task = session.dataTask(with: urlRequest) { [weak self] data, response, _ in
            guard let self = self else { return }
            let result: ProxyResponse
            if let http = response as? HTTPURLResponse {
                var headers: [(String, String)] = []
                for (key, value) in http.allHeaderFields {
                    let name = String(describing: key)
                    let stringValue = String(describing: value)
                    let lower = name.lowercased()
                    if LocalProxyServer.hopByHopHeaders.contains(lower) { continue }
                    if stringValue.contains("\r") || stringValue.contains("\n") { continue }
                    if lower == "set-cookie" {
                        // 规则唯一实现在 app/shared/proxyrules（经 gomobile 绑定），与桌面/安卓同源。
                        headers.append(("Set-Cookie", ProxyrulesRewriteSetCookie(stringValue)))
                    } else {
                        headers.append((name, stringValue))
                    }
                }
                result = ProxyResponse(
                    status: http.statusCode,
                    reason: LocalProxyServer.reasonPhrase(http.statusCode),
                    headers: headers,
                    body: data ?? Data()
                )
            } else {
                result = ProxyResponse.json(status: 502, reason: "Bad Gateway", object: [
                    "code": 6002,
                    "msg": "backend unreachable",
                    "data": NSNull()
                ])
            }
            self.reply(connection, response: result, requestMethod: request.method)
        }
        task.resume()
    }

    private static func configuredBase() -> String? {
        guard let raw = UserDefaults.standard.string(forKey: baseURLDefaultsKey) else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func makeUpstreamURL(base: URLComponents, request: HTTPRequest) -> URL? {
        var components = base
        let basePath = components.percentEncodedPath
        let trimmedPath = basePath.hasSuffix("/") ? String(basePath.dropLast()) : basePath
        components.percentEncodedPath = trimmedPath + request.path
        components.percentEncodedQuery = request.query.isEmpty ? nil : request.query
        components.fragment = nil
        return components.url
    }

    private static func reasonPhrase(_ code: Int) -> String {
        switch code {
        case 200: return "OK"
        case 201: return "Created"
        case 204: return "No Content"
        case 301: return "Moved Permanently"
        case 302: return "Found"
        case 304: return "Not Modified"
        case 400: return "Bad Request"
        case 401: return "Unauthorized"
        case 403: return "Forbidden"
        case 404: return "Not Found"
        case 405: return "Method Not Allowed"
        case 409: return "Conflict"
        case 413: return "Payload Too Large"
        case 422: return "Unprocessable Entity"
        case 429: return "Too Many Requests"
        case 500: return "Internal Server Error"
        case 501: return "Not Implemented"
        case 502: return "Bad Gateway"
        case 503: return "Service Unavailable"
        case 504: return "Gateway Timeout"
        default: return "Response"
        }
    }

    private func serviceUnavailable() -> ProxyResponse {
        return ProxyResponse.json(status: 503, reason: "Service Unavailable", object: [
            "code": 5001,
            "msg": "server not configured",
            "data": NSNull()
        ])
    }

    // MARK: - WebSocket tunnel

    private func handleWebSocket(_ request: HTTPRequest, on connection: NWConnection) {
        guard let base = LocalProxyServer.configuredBase(),
              let components = URLComponents(string: base),
              let backend = endpoint(of: components) else {
            reply(connection, response: serviceUnavailable())
            return
        }

        var host = backend.host
        var port = backend.port
        var secure = backend.secure
        var path = request.path
        var query = request.query

        if isExactOrChild(request.path, "/wsworker") {
            guard let rawTarget = LocalProxyServer.queryValue("target", in: request.query),
                  let targetComponents = URLComponents(string: rawTarget),
                  targetComponents.user == nil,
                  let targetEndpoint = endpoint(of: targetComponents) else {
                reply(connection, response: .plain(status: 403, reason: "Forbidden", body: "target host not allowed"))
                return
            }
            // /wsworker 的 target 来自页面，只有可信 target 才放行，默认拒绝。
            // 判定规则唯一实现在 app/shared/proxyrules（与桌面/安卓同源）。
            if !ProxyrulesIsTrustedWorker(rawTarget, base, "") {
                reply(connection, response: .plain(status: 403, reason: "Forbidden", body: "target host not allowed"))
                return
            }
            host = targetEndpoint.host
            port = targetEndpoint.port
            secure = targetEndpoint.secure
            path = "/ws"
            query = LocalProxyServer.removingQueryItem("target", from: targetComponents.percentEncodedQuery ?? "")
        }

        let hostHeader = port == (secure ? 443 : 80) ? host : "\(host):\(port)"
        let handshake = websocketHandshake(request, path: path, query: query, hostHeader: hostHeader)
        let parameters: NWParameters = secure ? .tls : .tcp
        let upstream = NWConnection(
            host: NWEndpoint.Host(host),
            port: NWEndpoint.Port(integerLiteral: port),
            using: parameters
        )
        lock.lock()
        connections.append(upstream)
        lock.unlock()
        upstream.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .ready:
                upstream.send(content: handshake, completion: .contentProcessed({ error in
                    if error != nil {
                        connection.cancel()
                        upstream.cancel()
                        return
                    }
                    self.pump(from: connection, to: upstream, client: connection, upstream: upstream)
                    self.pump(from: upstream, to: connection, client: connection, upstream: upstream)
                }))
            case .failed, .cancelled:
                connection.cancel()
                upstream.cancel()
            default:
                break
            }
        }
        upstream.start(queue: queue)
    }

    private func websocketHandshake(_ request: HTTPRequest, path: String, query: String, hostHeader: String) -> Data {
        var lines: [String] = []
        lines.append("GET \(path)\(query.isEmpty ? "" : "?" + query) HTTP/1.1")
        lines.append("Host: \(hostHeader)")
        lines.append("Upgrade: websocket")
        lines.append("Connection: Upgrade")
        lines.append("Sec-WebSocket-Key: \(request.header("sec-websocket-key") ?? "dGhlIHNhbXBsZSBub25jZQ==")")
        lines.append("Sec-WebSocket-Version: 13")
        if let cookie = request.header("cookie") {
            lines.append("Cookie: \(cookie)")
        }
        if let origin = request.header("origin") {
            lines.append("Origin: \(origin)")
        }
        lines.append("X-Forwarded-Host: localhost:\(port)")
        lines.append("X-Forwarded-Proto: http")
        lines.append("")
        lines.append("")
        return lines.joined(separator: "\r\n").data(using: .utf8) ?? Data()
    }

    private func pump(from source: NWConnection, to destination: NWConnection, client: NWConnection, upstream: NWConnection) {
        source.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] content, _, isComplete, error in
            guard let self = self else { return }
            if let content = content, !content.isEmpty {
                destination.send(content: content, completion: .contentProcessed({ sendError in
                    if sendError != nil {
                        client.cancel()
                        upstream.cancel()
                    }
                }))
            }
            if isComplete || error != nil {
                source.cancel()
                destination.cancel()
                return
            }
            self.pump(from: source, to: destination, client: client, upstream: upstream)
        }
    }

    private func endpoint(of components: URLComponents) -> (host: String, port: UInt16, secure: Bool)? {
        guard let host = components.host,
              let scheme = components.scheme?.lowercased(),
              scheme == "http" || scheme == "https" || scheme == "ws" || scheme == "wss" else {
            return nil
        }
        let secure = scheme == "https" || scheme == "wss"
        let port = components.port.flatMap({ UInt16(exactly: $0) }) ?? (secure ? 443 : 80)
        return (host.lowercased(), port, secure)
    }

    private static func queryValue(_ name: String, in query: String) -> String? {
        for pair in query.components(separatedBy: "&") {
            let keyValue = pair.components(separatedBy: "=")
            guard keyValue.count >= 2 else { continue }
            let key = keyValue[0].removingPercentEncoding?.lowercased() ?? keyValue[0].lowercased()
            if key == name.lowercased() {
                let raw = keyValue.dropFirst().joined(separator: "=").replacingOccurrences(of: "+", with: " ")
                return raw.removingPercentEncoding ?? raw
            }
        }
        return nil
    }

    private static func removingQueryItem(_ name: String, from query: String) -> String {
        let kept = query.components(separatedBy: "&").filter { pair in
            let key = pair.components(separatedBy: "=").first ?? ""
            let decoded = key.removingPercentEncoding?.lowercased() ?? key.lowercased()
            return decoded != name.lowercased()
        }
        return kept.joined(separator: "&")
    }

    // MARK: - Response writing

    private struct ProxyResponse {
        var status: Int
        var reason: String
        var headers: [(String, String)]
        var body: Data

        static func plain(status: Int, reason: String, body: String) -> ProxyResponse {
            return ProxyResponse(
                status: status,
                reason: reason,
                headers: [("Content-Type", "text/plain; charset=utf-8")],
                body: body.data(using: .utf8) ?? Data()
            )
        }

        static func json(status: Int, reason: String, object: [String: Any]) -> ProxyResponse {
            let data = try? JSONSerialization.data(withJSONObject: object, options: [])
            return ProxyResponse(
                status: status,
                reason: reason,
                headers: [("Content-Type", "application/json; charset=utf-8"), ("Cache-Control", "no-store")],
                body: data ?? Data()
            )
        }

        func serialized(headOnly: Bool) -> Data {
            var head = "HTTP/1.1 \(status) \(reason)\r\n"
            for (key, value) in headers {
                head += "\(key): \(value)\r\n"
            }
            head += "Content-Length: \(body.count)\r\n"
            head += "Connection: close\r\n\r\n"
            var data = head.data(using: .utf8) ?? Data()
            if !headOnly {
                data.append(body)
            }
            return data
        }
    }

    private func reply(_ connection: NWConnection, response: ProxyResponse, requestMethod: String? = nil) {
        let headOnly = requestMethod?.uppercased() == "HEAD"
        let sent = response.serialized(headOnly: headOnly)
        connection.send(content: sent, completion: .contentProcessed({ [weak self] _ in
            self?.removeConnection(connection)
            connection.cancel()
        }))
    }
}
