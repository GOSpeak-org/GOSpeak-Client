package dev.gospeak.mobile;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

import java.lang.reflect.Field;
import java.util.Iterator;
import java.util.List;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        LocalProxyServer.start(this);
        registerPlugin(AudioSessionPlugin.class);
        registerPlugin(MediaControlPlugin.class);
        registerPlugin(ServerConfigPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Release builds carry no server.url in capacitor.config.json. Capacitor 8
     * then keeps its own WebViewLocalServer and answers /api/* with the SPA
     * fallback (an HTML page), so the loopback reverse proxy is never reached.
     * Capacitor 8 also never initializes BridgeActivity.config, so the old
     * "reflect into config.serverUrl" hook was a no-op (config was always null).
     *
     * Build the CapConfig explicitly, inject the loopback proxy URL into it, and
     * hand it to the bridge builder. Dev builds keep their explicit Vite URL.
     */
    @Override
    protected void load() {
        int port = LocalProxyServer.getPort();
        CapConfig config = CapConfig.loadDefault(this);
        if (port > 0 && !LocalProxyServer.hasConfiguredServerUrl(config.getServerUrl())) {
            try {
                Field serverUrl = CapConfig.class.getDeclaredField("serverUrl");
                serverUrl.setAccessible(true);
                serverUrl.set(config, "http://localhost:" + port + "/");
            } catch (ReflectiveOperationException error) {
                Log.e("GOSpeak", "failed to inject loopback URL", error);
            }
        }
        // BridgeActivity.load() calls setConfig(this.config) again, so assign the
        // field itself or our injected config gets overwritten by its null default.
        this.config = config;
        dropPushPluginWithoutFirebase();
        super.load();
    }

    /**
     * Self-hosted builds have no google-services.json, so Firebase is never
     * initialized. Loading @capacitor/push-notifications then makes the frontend
     * push.register() call crash the whole process in FirebaseMessaging.getInstance()
     * (a native IllegalStateException that JS try/catch cannot contain). Remove it
     * from the bridge plugin list when Firebase config is absent; the push
     * capability already degrades gracefully when the plugin is unavailable.
     */
    private void dropPushPluginWithoutFirebase() {
        // google-services.json 编进 APK 时会生成 google_app_id 字符串资源；
        // 没有它（自托管默认）就移除插件。有真实 Firebase 项目时保留推送能力。
        int googleAppId = getResources().getIdentifier("google_app_id", "string", getPackageName());
        if (googleAppId != 0) {
            return;
        }
        try {
            Field builderField = BridgeActivity.class.getDeclaredField("bridgeBuilder");
            builderField.setAccessible(true);
            Object builder = builderField.get(this);
            Field pluginsField = builder.getClass().getDeclaredField("plugins");
            pluginsField.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<Class<?>> plugins = (List<Class<?>>) pluginsField.get(builder);
            Iterator<Class<?>> it = plugins.iterator();
            while (it.hasNext()) {
                if (it.next().getName().contains("PushNotificationsPlugin")) {
                    it.remove();
                    Log.i("GOSpeak", "PushNotifications plugin disabled (no Firebase config)");
                }
            }
        } catch (Exception error) {
            Log.w("GOSpeak", "failed to filter PushNotifications plugin", error);
        }
    }
}
