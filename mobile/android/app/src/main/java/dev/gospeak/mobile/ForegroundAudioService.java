package dev.gospeak.mobile;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public class ForegroundAudioService extends Service {

    static final String EXTRA_TITLE = "title";
    static final String EXTRA_SUBTITLE = "subtitle";
    static final String EXTRA_MUTED = "muted";

    private boolean foregroundStarted = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (foregroundStarted) {
            return START_STICKY;
        }
        String title = intent == null ? null : intent.getStringExtra(EXTRA_TITLE);
        String subtitle = intent == null ? null : intent.getStringExtra(EXTRA_SUBTITLE);
        boolean muted = intent != null && intent.getBooleanExtra(EXTRA_MUTED, false);
        Notification notification = MediaControlPlugin.buildNotification(
            this,
            title == null ? "GOSpeak" : title,
            subtitle == null ? "" : subtitle,
            muted
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startForeground(
                MediaControlPlugin.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(MediaControlPlugin.NOTIFICATION_ID, notification);
        }
        foregroundStarted = true;
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
}
