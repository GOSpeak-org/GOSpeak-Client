package dev.gospeak.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Local loopback reverse proxy. The WebView loads http://localhost:<port>/ so the
 * page, API and WebSocket share one origin. Static assets are served from the
 * bundled "public" assets; API/WS traffic is forwarded to the configured backend.
 */
public final class LocalProxyServer {

    public static final int PORT_FIRST = 47900;
    public static final int PORT_LAST = 47919;

    static final String PREFS_NAME = "gospeak";
    static final String KEY_BASE_URL = "gospeak.server.baseUrl";
    private static final String KEY_PROXY_PORT = "gospeak.proxyPort";

    private static final String TAG = "GOSpeakProxy";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 50_000;
    private static final int HEADER_TIMEOUT_MS = 10_000;
    private static final int BUFFER_SIZE = 8192;
    private static final int MAX_BODY = 32 * 1024 * 1024;

    private static final Set<String> ALLOWED_METHODS = new HashSet<>(Arrays.asList(
        "GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"
    ));

    private static final Set<String> SKIP_REQUEST_HEADERS = new HashSet<>(Arrays.asList(
        "host", "content-length", "transfer-encoding", "accept-encoding"
    ));

    private static final Set<String> SKIP_RESPONSE_HEADERS = new HashSet<>(Arrays.asList(
        "transfer-encoding", "content-length", "content-encoding", "connection", "keep-alive"
    ));

    private static final LocalProxyServer INSTANCE = new LocalProxyServer();

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicLong connectionIds = new AtomicLong();

    private volatile String baseUrl = "";
    private volatile int port;
    private Context appContext;
    private ServerSocket serverSocket;
    private Thread acceptThread;
    private ExecutorService workers;

    private LocalProxyServer() {
    }

    public static LocalProxyServer getInstance() {
        return INSTANCE;
    }

    public static void start(Context context) {
        INSTANCE.startInternal(context);
    }

    /** Port the listener actually bound to; 0 until start() succeeds. */
    public static int getPort() {
        return INSTANCE.port;
    }

    /** True when capacitor.config.json carries an explicit dev server URL. */
    public static boolean hasConfiguredServerUrl(String url) {
        return url != null && !url.trim().isEmpty();
    }

    public static void stop() {
        INSTANCE.stopInternal();
    }

    static void setBaseUrl(String url) {
        INSTANCE.baseUrl = url == null ? "" : url.trim();
    }

    static String readBaseUrl(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_BASE_URL, "").trim();
    }

    private synchronized void startInternal(Context context) {
        if (running.get()) {
            return;
        }
        Context app = context.getApplicationContext();
        appContext = app;
        baseUrl = readBaseUrl(app);

        ExecutorService pool = Executors.newCachedThreadPool(new ThreadFactory() {
            @Override
            public Thread newThread(Runnable task) {
                Thread thread = new Thread(task, "gospeak-proxy-conn-" + connectionIds.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            }
        });

        ServerSocket socket = null;
        int chosenPort = readPersistedPort(app);
        if (chosenPort >= PORT_FIRST && chosenPort <= PORT_LAST) {
            socket = tryBind(chosenPort);
        }
        if (socket == null) {
            for (int candidate = PORT_FIRST; candidate <= PORT_LAST; candidate++) {
                socket = tryBind(candidate);
                if (socket != null) {
                    chosenPort = candidate;
                    break;
                }
            }
        }
        if (socket == null) {
            try {
                socket = new ServerSocket();
                socket.setReuseAddress(true);
                socket.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 64);
                chosenPort = socket.getLocalPort();
            } catch (IOException error) {
                Log.e(TAG, "failed to bind an ephemeral loopback port", error);
                pool.shutdownNow();
                return;
            }
        }

        workers = pool;
        serverSocket = socket;
        port = chosenPort;
        if (chosenPort >= PORT_FIRST && chosenPort <= PORT_LAST) {
            writePersistedPort(app, chosenPort);
        }
        running.set(true);

        Thread acceptor = new Thread(new Runnable() {
            @Override
            public void run() {
                acceptLoop();
            }
        }, "gospeak-proxy-accept");
        acceptor.setDaemon(true);
        acceptThread = acceptor;
        acceptor.start();

        Log.i(TAG, "listening on http://localhost:" + port + "/");
    }

    private static ServerSocket tryBind(int candidate) {
        try {
            ServerSocket socket = new ServerSocket();
            socket.setReuseAddress(true);
            socket.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), candidate), 64);
            return socket;
        } catch (IOException ignored) {
            return null;
        }
    }

    private static int readPersistedPort(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getInt(KEY_PROXY_PORT, 0);
    }

    private static void writePersistedPort(Context context, int value) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putInt(KEY_PROXY_PORT, value).apply();
    }

    private synchronized void stopInternal() {
        if (!running.getAndSet(false)) {
            return;
        }
        closeQuietly(serverSocket);
        if (workers != null) {
            workers.shutdownNow();
        }
        if (acceptThread != null) {
            acceptThread.interrupt();
        }
        serverSocket = null;
        acceptThread = null;
        workers = null;
        Log.i(TAG, "stopped");
    }

    private void acceptLoop() {
        while (running.get() && serverSocket != null && !serverSocket.isClosed()) {
            try {
                final Socket client = serverSocket.accept();
                client.setTcpNoDelay(true);
                client.setSoTimeout(HEADER_TIMEOUT_MS);
                ExecutorService pool = workers;
                if (pool == null || pool.isShutdown()) {
                    closeQuietly(client);
                    continue;
                }
                pool.execute(new Runnable() {
                    @Override
                    public void run() {
                        handleConnection(client);
                    }
                });
            } catch (SocketTimeoutException ignored) {
                // accept itself has no timeout; kept for completeness
            } catch (SocketException error) {
                if (running.get()) {
                    Log.w(TAG, "accept failed: " + error.getMessage());
                }
                break;
            } catch (IOException error) {
                if (running.get()) {
                    Log.w(TAG, "accept failed: " + error.getMessage());
                }
                break;
            }
        }
    }

    private void handleConnection(Socket client) {
        try (Socket socket = client;
             InputStream input = new BufferedInputStream(socket.getInputStream());
             OutputStream output = socket.getOutputStream()) {

            Request request = readRequest(input);
            if (request == null) {
                sendSimple(output, 400, "text/plain; charset=utf-8", "Bad Request".getBytes(StandardCharsets.UTF_8));
                return;
            }
            if (!ALLOWED_METHODS.contains(request.method)) {
                sendSimple(output, 405, "text/plain; charset=utf-8", "Method Not Allowed".getBytes(StandardCharsets.UTF_8));
                return;
            }

            if (isWebSocket(request)) {
                client.setSoTimeout(0);
                handleWebSocket(request, input, output, socket);
                return;
            }
            if (isProxied(request.path)) {
                handleProxy(request, output);
                return;
            }
            handleAsset(request, output);
        } catch (SocketTimeoutException error) {
            Log.d(TAG, "connection timed out");
        } catch (IOException error) {
            Log.d(TAG, "connection error: " + error.getMessage());
        }
    }

    private static Request readRequest(InputStream input) throws IOException {
        String line = readLine(input);
        if (line == null || line.isEmpty()) {
            return null;
        }
        String[] parts = line.split(" ");
        if (parts.length < 2) {
            return null;
        }

        Request request = new Request();
        request.method = parts[0].toUpperCase(Locale.ROOT);
        String target = parts[1];
        int question = target.indexOf('?');
        if (question >= 0) {
            request.path = percentDecode(target.substring(0, question));
            request.query = target.substring(question + 1);
        } else {
            request.path = percentDecode(target);
        }
        if (request.path == null || request.path.isEmpty()) {
            request.path = "/";
        }

        while ((line = readLine(input)) != null && !line.isEmpty()) {
            int colon = line.indexOf(':');
            if (colon <= 0) {
                continue;
            }
            String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
            String value = line.substring(colon + 1).trim();
            List<String> values = request.headers.get(name);
            if (values == null) {
                values = new ArrayList<>();
                request.headers.put(name, values);
            }
            values.add(value);
        }

        String rawLength = request.header("content-length");
        if (rawLength != null) {
            long length;
            try {
                length = Long.parseLong(rawLength.trim());
            } catch (NumberFormatException error) {
                throw new IOException("invalid Content-Length");
            }
            if (length < 0 || length > MAX_BODY) {
                throw new IOException("invalid Content-Length");
            }
            request.body = new byte[(int) length];
            readFully(input, request.body);
        }
        return request;
    }

    private static String readLine(InputStream input) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(128);
        int value;
        while ((value = input.read()) != -1) {
            if (value == '\n') {
                break;
            }
            buffer.write(value);
        }
        if (value == -1 && buffer.size() == 0) {
            return null;
        }
        byte[] bytes = buffer.toByteArray();
        int end = bytes.length;
        if (end > 0 && bytes[end - 1] == '\r') {
            end--;
        }
        return new String(bytes, 0, end, StandardCharsets.ISO_8859_1);
    }

    private static void readFully(InputStream input, byte[] target) throws IOException {
        int offset = 0;
        while (offset < target.length) {
            int read = input.read(target, offset, target.length - offset);
            if (read < 0) {
                throw new IOException("unexpected end of body");
            }
            offset += read;
        }
    }

    private static String percentDecode(String value) {
        if (value.indexOf('%') < 0) {
            return value;
        }
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '%' && i + 2 < value.length()) {
                int high = Character.digit(value.charAt(i + 1), 16);
                int low = Character.digit(value.charAt(i + 2), 16);
                if (high >= 0 && low >= 0) {
                    buffer.write((high << 4) | low);
                    i += 2;
                    continue;
                }
            }
            if (c < 128) {
                buffer.write(c);
            } else {
                byte[] encoded = String.valueOf(c).getBytes(StandardCharsets.UTF_8);
                buffer.write(encoded, 0, encoded.length);
            }
        }
        return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    }

    private static boolean isWebSocket(Request request) {
        String upgrade = request.header("upgrade");
        return upgrade != null && "websocket".equalsIgnoreCase(upgrade.trim());
    }

    private static boolean isProxied(String path) {
        return path.startsWith("/api/v1/")
            || path.startsWith("/uploads/")
            || path.startsWith("/livekit/")
            || path.equals("/ws")
            || path.startsWith("/ws/")
            || path.equals("/wsworker")
            || path.startsWith("/wsworker/");
    }

    private static URI parseBase(String base) {
        if (base == null || base.isEmpty()) {
            return null;
        }
        try {
            // 地址校验规则唯一实现在 app/shared/proxyrules，与桌面端同源。
            proxyrules.Proxyrules.validateBaseURL(base);
        } catch (Exception error) {
            return null;
        }
        try {
            URI uri = URI.create(base);
            return uri.getHost() == null ? null : uri;
        } catch (IllegalArgumentException error) {
            return null;
        }
    }

    private void handleProxy(Request request, OutputStream output) {
        URI base = parseBase(baseUrl);
        if (base == null) {
            sendJsonError(output, 503, 5001, "server not configured");
            return;
        }

        String path = request.path;
        String basePath = base.getRawPath();
        if (basePath != null && !basePath.isEmpty() && !"/".equals(basePath)) {
            path = (basePath.endsWith("/") ? basePath.substring(0, basePath.length() - 1) : basePath) + path;
        }
        if (request.query != null) {
            path = path + "?" + request.query;
        }

        String scheme = base.getScheme().toLowerCase(Locale.ROOT);
        int port = base.getPort();
        if (port < 0) {
            port = "https".equals(scheme) ? 443 : 80;
        }
        HttpURLConnection connection = null;
        try {
            URL url = new URL(scheme, base.getHost(), port, path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestMethod(request.method);
            connection.setDoInput(true);

            boolean hasBody = request.body.length > 0;
            connection.setDoOutput(hasBody);
            if (hasBody) {
                connection.setFixedLengthStreamingMode(request.body.length);
            }
            for (Map.Entry<String, List<String>> header : request.headers.entrySet()) {
                String name = header.getKey();
                if (SKIP_REQUEST_HEADERS.contains(name)) {
                    continue;
                }
                for (String value : header.getValue()) {
                    connection.addRequestProperty(name, value);
                }
            }
            String cookie = request.header("cookie");
            if (cookie != null) {
                connection.setRequestProperty("Cookie", cookie);
            }
            // 与桌面端回环反代一致：告诉后端页面实际来源是本地代理地址，
            // 让 serverUrl 推导为同源的 ws://localhost:<proxyPort>/livekit。
            connection.setRequestProperty("X-Forwarded-Host", "localhost:" + LocalProxyServer.this.port);
            connection.setRequestProperty("X-Forwarded-Proto", "http");

            if (hasBody) {
                try (OutputStream upstream = connection.getOutputStream()) {
                    upstream.write(request.body);
                }
            }

            int status = connection.getResponseCode();
            InputStream stream = connection.getErrorStream();
            if (stream == null) {
                stream = connection.getInputStream();
            }
            boolean hasResponse = !"HEAD".equals(request.method)
                && status != HttpURLConnection.HTTP_NO_CONTENT
                && status != HttpURLConnection.HTTP_NOT_MODIFIED;
            byte[] body = hasResponse ? readAll(stream) : new byte[0];
            sendUpstreamResponse(output, status, connection.getHeaderFields(), request, body);
        } catch (IOException error) {
            Log.w(TAG, "proxy error: " + error.getMessage());
            sendJsonError(output, 502, 6002, "backend unreachable");
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static byte[] readAll(InputStream input) throws IOException {
        if (input == null) {
            return new byte[0];
        }
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[BUFFER_SIZE];
        int read;
        while ((read = input.read(chunk)) != -1) {
            buffer.write(chunk, 0, read);
        }
        return buffer.toByteArray();
    }

    private void handleWebSocket(Request request, InputStream clientInput, OutputStream clientOutput, Socket client) {
        URI base = parseBase(baseUrl);
        URI upstream;
        String path;

        boolean worker = request.path.equals("/wsworker") || request.path.startsWith("/wsworker/");
        if (worker) {
            if (base == null) {
                sendJsonError(clientOutput, 503, 5001, "server not configured");
                return;
            }
            String target = queryValue(request.query, "target");
            if (target == null) {
                sendSimple(clientOutput, 400, "text/plain; charset=utf-8", "missing target".getBytes(StandardCharsets.UTF_8));
                return;
            }
            try {
                upstream = URI.create(target);
            } catch (IllegalArgumentException error) {
                sendSimple(clientOutput, 400, "text/plain; charset=utf-8", "invalid target".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String targetScheme = upstream.getScheme() == null ? "" : upstream.getScheme().toLowerCase(Locale.ROOT);
            if (!("ws".equals(targetScheme) || "wss".equals(targetScheme)
                || "http".equals(targetScheme) || "https".equals(targetScheme))) {
                sendSimple(clientOutput, 400, "text/plain; charset=utf-8", "unsupported target scheme".getBytes(StandardCharsets.UTF_8));
                return;
            }
            // Fail closed: /wsworker 只能到达与已配置后端同 host:port 的目标。
            // 判定规则唯一实现在 app/shared/proxyrules（与桌面端同源），容许列表为空，
            // 因此这里的行为与桌面的"仅 baseURL 通道"一致。
            if (!proxyrules.Proxyrules.isTrustedWorker(upstream.toString(), base.toString(), "")) {
                sendSimple(clientOutput, 403, "text/plain; charset=utf-8", "target host not allowed".getBytes(StandardCharsets.UTF_8));
                return;
            }
            path = workerPath(upstream, request.query);
        } else {
            if (base == null) {
                sendJsonError(clientOutput, 503, 5001, "server not configured");
                return;
            }
            upstream = base;
            path = request.path + (request.query == null ? "" : "?" + request.query);
        }

        String scheme = upstream.getScheme().toLowerCase(Locale.ROOT);
        boolean secure = "wss".equals(scheme) || "https".equals(scheme);
        int port = upstream.getPort();
        if (port < 0) {
            port = secure ? 443 : 80;
        }
        String host = upstream.getHost();

        StringBuilder handshake = new StringBuilder();
        handshake.append("GET ").append(path).append(" HTTP/1.1\r\n");
        handshake.append("Host: ").append(host).append(':').append(port).append("\r\n");
        for (Map.Entry<String, List<String>> header : request.headers.entrySet()) {
            String name = header.getKey();
            if (SKIP_REQUEST_HEADERS.contains(name)) {
                continue;
            }
            for (String value : header.getValue()) {
                handshake.append(displayName(name)).append(": ").append(value).append("\r\n");
            }
        }
        handshake.append("\r\n");

        Socket remote = null;
        try {
            if (secure) {
                SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
                SSLSocket ssl = (SSLSocket) factory.createSocket();
                ssl.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
                SSLParameters parameters = ssl.getSSLParameters();
                parameters.setEndpointIdentificationAlgorithm("HTTPS");
                ssl.setSSLParameters(parameters);
                ssl.startHandshake();
                remote = ssl;
            } else {
                Socket plain = new Socket();
                plain.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
                remote = plain;
            }
            remote.setTcpNoDelay(true);
            remote.setSoTimeout(READ_TIMEOUT_MS);

            InputStream remoteInput = remote.getInputStream();
            OutputStream remoteOutput = remote.getOutputStream();
            remoteOutput.write(handshake.toString().getBytes(StandardCharsets.ISO_8859_1));
            remoteOutput.flush();

            byte[] headerBytes = readHeaderBlock(remoteInput);
            int marker = indexOf(headerBytes, "\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
            if (marker < 0) {
                sendSimple(clientOutput, 502, "text/plain; charset=utf-8", "bad gateway".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String head = new String(headerBytes, 0, marker + 2, StandardCharsets.ISO_8859_1);
            String[] lines = head.split("\r\n");
            int status = 502;
            List<String> responseHeaders = new ArrayList<>();
            for (int i = 0; i < lines.length; i++) {
                if (i == 0) {
                    String[] statusParts = lines[i].split(" ", 3);
                    if (statusParts.length >= 2) {
                        try {
                            status = Integer.parseInt(statusParts[1]);
                        } catch (NumberFormatException ignored) {
                            status = 502;
                        }
                    }
                    continue;
                }
                int colon = lines[i].indexOf(':');
                if (colon <= 0) {
                    continue;
                }
                String name = lines[i].substring(0, colon);
                String lower = name.toLowerCase(Locale.ROOT);
                String value = lines[i].substring(colon + 1).trim();
                if (SKIP_RESPONSE_HEADERS.contains(lower)
                    && !(status == 101 && "connection".equals(lower))) {
                    continue;
                }
                if ("set-cookie".equals(lower)) {
                    value = proxyrules.Proxyrules.rewriteSetCookie(value);
                }
                responseHeaders.add(name + ": " + value);
            }
            String origin = request.header("origin");
            if (origin != null) {
                responseHeaders.add("Origin: " + origin);
            }
            sendHandshake(clientOutput, status, responseHeaders, marker + 4 < headerBytes.length
                ? Arrays.copyOfRange(headerBytes, marker + 4, headerBytes.length) : new byte[0]);

            if (status != 101) {
                return;
            }

            remote.setSoTimeout(0);
            final AtomicBoolean closed = new AtomicBoolean(false);
            Thread toRemote = tunnelThread(clientInput, remoteOutput, closed, client, remote);
            Thread toClient = tunnelThread(remoteInput, clientOutput, closed, remote, client);
            toRemote.start();
            toClient.start();
            try {
                toRemote.join(5_000);
                toClient.join(5_000);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            } finally {
                closeBoth(closed, client, remote);
            }
        } catch (IOException error) {
            Log.w(TAG, "websocket error: " + error.getMessage());
        } finally {
            closeQuietly(remote);
        }
    }

    private static Thread tunnelThread(final InputStream from, final OutputStream to,
                                        final AtomicBoolean closed, final Socket first, final Socket second) {
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() {
                byte[] buffer = new byte[BUFFER_SIZE];
                try {
                    int read;
                    while (!closed.get() && (read = from.read(buffer)) != -1) {
                        to.write(buffer, 0, read);
                        to.flush();
                    }
                } catch (IOException ignored) {
                    // either peer closed; the tunnel is done
                } finally {
                    closeBoth(closed, first, second);
                }
            }
        });
        thread.setDaemon(true);
        return thread;
    }

    private static void closeBoth(AtomicBoolean closed, Socket first, Socket second) {
        if (closed.compareAndSet(false, true)) {
            closeQuietly(first);
            closeQuietly(second);
        }
    }

    private static byte[] readHeaderBlock(InputStream input) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(2048);
        int value;
        int matched = 0;
        byte[] marker = "\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1);
        while ((value = input.read()) != -1) {
            buffer.write(value);
            if (value == marker[matched]) {
                matched++;
                if (matched == marker.length) {
                    break;
                }
            } else {
                matched = value == marker[0] ? 1 : 0;
            }
            if (buffer.size() > 64 * 1024) {
                throw new IOException("websocket headers too large");
            }
        }
        return buffer.toByteArray();
    }

    private static int indexOf(byte[] source, byte[] needle) {
        outer:
        for (int i = 0; i <= source.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (source[i + j] != needle[j]) {
                    continue outer;
                }
            }
            return i;
        }
        return -1;
    }

    private static String queryValue(String query, String wanted) {
        if (query == null) {
            return null;
        }
        for (String pair : query.split("&")) {
            int equals = pair.indexOf('=');
            String name = equals < 0 ? pair : pair.substring(0, equals);
            if (wanted.equals(percentDecode(name))) {
                return equals < 0 ? "" : percentDecode(pair.substring(equals + 1));
            }
        }
        return null;
    }

    private static String workerPath(URI upstream, String inboundQuery) {
        StringBuilder query = new StringBuilder();
        if (inboundQuery != null) {
            for (String pair : inboundQuery.split("&")) {
                if (pair.isEmpty()) {
                    continue;
                }
                int equals = pair.indexOf('=');
                String name = equals < 0 ? pair : pair.substring(0, equals);
                if ("target".equalsIgnoreCase(percentDecode(name))) {
                    continue;
                }
                if (query.length() > 0) {
                    query.append('&');
                }
                query.append(pair);
            }
        }
        String own = upstream.getRawQuery();
        if (own != null && !own.isEmpty()) {
            if (query.length() > 0) {
                query.append('&');
            }
            query.append(own);
        }
        return "/ws" + (query.length() > 0 ? "?" + query : "");
    }

    private void handleAsset(Request request, OutputStream output) throws IOException {
        if (appContext == null) {
            sendSimple(output, 500, "text/plain; charset=utf-8", "not initialized".getBytes(StandardCharsets.UTF_8));
            return;
        }
        String path = request.path;
        boolean root = "/".equals(path);
        int slash = path.lastIndexOf('/');
        boolean withExtension = !root && path.lastIndexOf('.') > slash;

        if (!root && withExtension) {
            String asset = sanitize(path);
            byte[] body = asset == null ? null : readAsset(asset);
            if (body == null) {
                sendSimple(output, 404, "text/plain; charset=utf-8", "Not Found".getBytes(StandardCharsets.UTF_8));
                return;
            }
            sendAsset(output, asset, body, request.method);
            return;
        }

        String asset = root ? "/index.html" : sanitize(path);
        byte[] body = asset == null ? null : readAsset(asset);
        if (body == null) {
            asset = "/index.html";
            body = readAsset(asset);
        }
        if (body == null) {
            sendSimple(output, 404, "text/plain; charset=utf-8", "frontend not built".getBytes(StandardCharsets.UTF_8));
            return;
        }
        sendAsset(output, asset, body, request.method);
    }

    private static String sanitize(String path) {
        if (path == null || path.isEmpty() || path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) {
            return null;
        }
        Deque<String> segments = new ArrayDeque<>();
        for (String part : path.split("/")) {
            if (part.isEmpty() || ".".equals(part)) {
                continue;
            }
            if ("..".equals(part)) {
                return null;
            }
            segments.addLast(part);
        }
        if (segments.isEmpty()) {
            return null;
        }
        return "/" + String.join("/", segments);
    }

    private byte[] readAsset(String asset) {
        try (InputStream stream = appContext.getAssets().open("public" + asset)) {
            return readAll(stream);
        } catch (IOException error) {
            return null;
        }
    }

    private static String mime(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".json") || lower.endsWith(".map")) return "application/json; charset=utf-8";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private void sendAsset(OutputStream output, String asset, byte[] body, String method) throws IOException {
        List<String> headers = new ArrayList<>();
        headers.add("Content-Type: " + mime(asset));
        headers.add("X-Content-Type-Options: nosniff");
        headers.add("Cache-Control: " + cacheControl(asset));
        send(output, 200, headers, "HEAD".equals(method) ? new byte[0] : body);
    }

    private static String cacheControl(String asset) {
        if (asset.endsWith("/index.html")) {
            return "no-cache";
        }
        if (asset.startsWith("/assets/") || asset.startsWith("/chunks/") || asset.startsWith("/entries/")) {
            return "public, max-age=31536000, immutable";
        }
        return "public, max-age=3600";
    }

    private static void sendUpstreamResponse(OutputStream output, int status,
                                              Map<String, List<String>> upstream,
                                              Request request, byte[] body) throws IOException {
        List<String> headers = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (upstream != null) {
            for (Map.Entry<String, List<String>> header : upstream.entrySet()) {
                if (header.getKey() == null) {
                    continue;
                }
                String lower = header.getKey().toLowerCase(Locale.ROOT);
                if (SKIP_RESPONSE_HEADERS.contains(lower)) {
                    continue;
                }
                for (String value : header.getValue()) {
                    if ("set-cookie".equals(lower)) {
                        value = proxyrules.Proxyrules.rewriteSetCookie(value);
                    }
                    headers.add(header.getKey() + ": " + value);
                }
                seen.add(lower);
            }
        }
        String origin = request.header("origin");
        if (origin != null && !seen.contains("origin")) {
            headers.add("Origin: " + origin);
        }
        if (!seen.contains("cache-control")) {
            headers.add("Cache-Control: no-store");
        }
        send(output, status, headers, "HEAD".equals(request.method) ? new byte[0] : body);
    }

    private static void sendHandshake(OutputStream output, int status, List<String> headers, byte[] leftover) {
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        for (String header : headers) {
            head.append(header).append("\r\n");
        }
        if (status != 101) {
            head.append("Content-Length: 0\r\n").append("Connection: close\r\n");
        }
        head.append("\r\n");
        try {
            output.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
            if (leftover.length > 0) {
                output.write(leftover);
            }
            output.flush();
        } catch (IOException ignored) {
            // client went away
        }
    }

    private static void sendSimple(OutputStream output, int status, String contentType, byte[] body) {
        List<String> headers = new ArrayList<>();
        headers.add("Content-Type: " + contentType);
        headers.add("Cache-Control: no-store");
        try {
            send(output, status, headers, body);
        } catch (IOException ignored) {
            // client went away
        }
    }

    private static void sendJsonError(OutputStream output, int status, int code, String message) {
        String json = "{\"code\":" + code + ",\"msg\":\"" + message + "\",\"data\":null}";
        List<String> headers = new ArrayList<>();
        headers.add("Content-Type: application/json; charset=utf-8");
        headers.add("Cache-Control: no-store");
        try {
            send(output, status, headers, json.getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            // client went away
        }
    }

    private static void send(OutputStream output, int status, List<String> headers, byte[] body) throws IOException {
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        for (String header : headers) {
            head.append(header).append("\r\n");
        }
        head.append("Content-Length: ").append(body.length).append("\r\n");
        head.append("Connection: close\r\n");
        head.append("\r\n");
        output.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
        if (body.length > 0) {
            output.write(body);
        }
        output.flush();
    }

    private static String displayName(String name) {
        StringBuilder result = new StringBuilder();
        boolean upper = true;
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c == '-') {
                result.append(c);
                upper = true;
            } else {
                result.append(upper ? Character.toUpperCase(c) : c);
                upper = false;
            }
        }
        return result.toString();
    }

    private static String reason(int status) {
        switch (status) {
            case 101: return "Switching Protocols";
            case 200: return "OK";
            case 201: return "Created";
            case 204: return "No Content";
            case 206: return "Partial Content";
            case 301: return "Moved Permanently";
            case 302: return "Found";
            case 304: return "Not Modified";
            case 307: return "Temporary Redirect";
            case 308: return "Permanent Redirect";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 409: return "Conflict";
            case 422: return "Unprocessable Entity";
            case 429: return "Too Many Requests";
            case 500: return "Internal Server Error";
            case 501: return "Not Implemented";
            case 502: return "Bad Gateway";
            case 503: return "Service Unavailable";
            case 504: return "Gateway Timeout";
            default: return "Status";
        }
    }

    private static void closeQuietly(Socket socket) {
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
                // nothing to do
            }
        }
    }

    private static void closeQuietly(ServerSocket socket) {
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
                // nothing to do
            }
        }
    }

    private static final class Request {
        String method;
        String path;
        String query;
        final Map<String, List<String>> headers = new LinkedHashMap<>();
        byte[] body = new byte[0];

        String header(String name) {
            List<String> values = headers.get(name);
            return values == null || values.isEmpty() ? null : values.get(0);
        }
    }
}
