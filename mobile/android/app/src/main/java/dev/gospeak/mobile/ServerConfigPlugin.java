package dev.gospeak.mobile;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.URI;

@CapacitorPlugin(name = "ServerConfig")
public class ServerConfigPlugin extends Plugin {

    @PluginMethod
    public void getBaseURL(PluginCall call) {
        JSObject result = new JSObject();
        result.put("baseUrl", LocalProxyServer.readBaseUrl(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void setBaseURL(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("base URL is required");
            return;
        }
        url = url.trim();
        if (!url.isEmpty() && !isValidBaseURL(url)) {
            call.reject("invalid base URL: " + url);
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(
            LocalProxyServer.PREFS_NAME, Context.MODE_PRIVATE
        );
        prefs.edit().putString(LocalProxyServer.KEY_BASE_URL, url).apply();
        LocalProxyServer.setBaseUrl(url);

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                getBridge().getWebView().reload();
            }
        });
        call.resolve(new JSObject());
    }

    private static boolean isValidBaseURL(String value) {
        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme();
            return uri.isAbsolute()
                && uri.getHost() != null
                && !uri.getHost().isEmpty()
                && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme));
        } catch (IllegalArgumentException error) {
            return false;
        }
    }
}
