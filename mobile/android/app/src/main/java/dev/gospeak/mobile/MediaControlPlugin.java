package dev.gospeak.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaControl")
public class MediaControlPlugin extends Plugin {

    private static final String CHANNEL_ID = "gospeak_voice";
    static final int NOTIFICATION_ID = 1001;

    private static final String ACTION_MUTE = "dev.gospeak.mobile.action.MUTE";
    private static final String ACTION_UNMUTE = "dev.gospeak.mobile.action.UNMUTE";
    private static final String ACTION_HANGUP = "dev.gospeak.mobile.action.HANGUP";

    private final BroadcastReceiver actionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context receivedContext, Intent intent) {
            String action = intent.getAction();
            String value;
            if (ACTION_MUTE.equals(action)) {
                value = "mute";
            } else if (ACTION_UNMUTE.equals(action)) {
                value = "unmute";
            } else if (ACTION_HANGUP.equals(action)) {
                value = "hangup";
            } else {
                return;
            }
            JSObject data = new JSObject();
            data.put("action", value);
            notifyListeners("action", data);
        }
    };

    @Override
    public void load() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_MUTE);
        filter.addAction(ACTION_UNMUTE);
        filter.addAction(ACTION_HANGUP);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(actionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(actionReceiver, filter);
        }
    }

    @PluginMethod
    public void setMetadata(PluginCall call) {
        String title = call.getString("title");
        if (title == null) {
            title = "GOSpeak";
        }
        String subtitle = call.getString("subtitle");
        if (subtitle == null) {
            subtitle = "";
        }
        Boolean rawMuted = call.getBoolean("muted");
        boolean muted = Boolean.TRUE.equals(rawMuted);
        Notification notification = buildNotification(getContext(), title, subtitle, muted);
        notificationManager().notify(NOTIFICATION_ID, notification);
        Intent serviceIntent = new Intent(getContext(), ForegroundAudioService.class);
        serviceIntent.putExtra(ForegroundAudioService.EXTRA_TITLE, title);
        serviceIntent.putExtra(ForegroundAudioService.EXTRA_SUBTITLE, subtitle);
        serviceIntent.putExtra(ForegroundAudioService.EXTRA_MUTED, muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        notificationManager().cancel(NOTIFICATION_ID);
        getContext().stopService(new Intent(getContext(), ForegroundAudioService.class));
        call.resolve();
    }

    @PluginMethod
    public void emitAction(PluginCall call) {
        String action = call.getString("action");
        if (action == null) {
            action = "";
        }
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("action", data);
        call.resolve();
    }

    static Notification buildNotification(Context context, String title, String subtitle, boolean muted) {
        ensureChannel(context);
        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(new NotificationCompat.Action(
                android.R.drawable.ic_btn_speak_now,
                muted ? "取消静音" : "静音",
                actionIntent(context, muted ? ACTION_UNMUTE : ACTION_MUTE, 1)
            ))
            .addAction(new NotificationCompat.Action(
                android.R.drawable.ic_menu_call,
                "挂断",
                actionIntent(context, ACTION_HANGUP, 2)
            ))
            .build();
    }

    private static PendingIntent actionIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(action).setPackage(context.getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }

    private NotificationManager notificationManager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        manager.createNotificationChannel(
            new NotificationChannel(CHANNEL_ID, "语音通话", NotificationManager.IMPORTANCE_LOW)
        );
    }
}
