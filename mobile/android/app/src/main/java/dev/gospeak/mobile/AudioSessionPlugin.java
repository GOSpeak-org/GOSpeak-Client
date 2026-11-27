package dev.gospeak.mobile;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioSession")
public class AudioSessionPlugin extends Plugin {

    private Integer previousMode = null;
    private boolean previousSpeakerphone = false;

    @PluginMethod
    public void activate(PluginCall call) {
        try {
            AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (previousMode == null) {
                previousMode = audio.getMode();
                previousSpeakerphone = audio.isSpeakerphoneOn();
            }
            audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audio.setSpeakerphoneOn(true);
            call.resolve();
        } catch (Exception error) {
            call.reject("failed to activate audio session: " + error.getMessage());
        }
    }

    @PluginMethod
    public void deactivate(PluginCall call) {
        try {
            AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (previousMode != null) {
                audio.setMode(previousMode);
                audio.setSpeakerphoneOn(previousSpeakerphone);
            }
            previousMode = null;
            call.resolve();
        } catch (Exception error) {
            call.reject("failed to deactivate audio session: " + error.getMessage());
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray routes = new JSArray();
        routes.put(new JSObject().put("kind", "speaker").put("label", "扬声器"));
        routes.put(new JSObject().put("kind", "earpiece").put("label", "听筒"));
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio.isBluetoothScoAvailableOffCall()) {
            routes.put(new JSObject().put("kind", "bluetooth").put("label", "蓝牙耳机"));
        }
        if (audio.isWiredHeadsetOn()) {
            routes.put(new JSObject().put("kind", "headset").put("label", "有线耳机"));
        }
        JSObject result = new JSObject();
        result.put("routes", routes);
        call.resolve(result);
    }

    @PluginMethod
    public void current(PluginCall call) {
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        String kind;
        if (audio.isBluetoothScoOn()) {
            kind = "bluetooth";
        } else if (audio.isWiredHeadsetOn()) {
            kind = "headset";
        } else if (audio.isSpeakerphoneOn()) {
            kind = "speaker";
        } else {
            kind = "earpiece";
        }
        JSObject result = new JSObject();
        result.put("kind", kind);
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String kind = call.getString("kind");
        if (kind == null) {
            kind = "speaker";
        }
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        try {
            if ("speaker".equals(kind)) {
                audio.stopBluetoothSco();
                audio.setBluetoothScoOn(false);
                audio.setSpeakerphoneOn(true);
            } else if ("earpiece".equals(kind)) {
                audio.stopBluetoothSco();
                audio.setBluetoothScoOn(false);
                audio.setSpeakerphoneOn(false);
            } else if ("bluetooth".equals(kind)) {
                audio.startBluetoothSco();
                audio.setBluetoothScoOn(true);
                audio.setSpeakerphoneOn(false);
            } else if ("headset".equals(kind)) {
                if (!audio.isWiredHeadsetOn()) {
                    call.reject("wired headset audio route is unavailable");
                    return;
                }
                audio.stopBluetoothSco();
                audio.setBluetoothScoOn(false);
                audio.setSpeakerphoneOn(false);
            } else {
                call.reject("unsupported audio route: " + kind);
                return;
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("failed to set audio route: " + error.getMessage());
        }
    }
}
