package com.xiaomao.focus;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

/**
 * Foreground keep-alive service active strictly while a focus or independent lock session is open.
 * Reuses Reminders.FOCUS_ID (40) on channel "focus-status" and hosts UsageAppMonitor during sessions.
 */
public final class FocusKeepAliveService extends Service {
    private static volatile boolean running;

    static boolean isRunning() {
        return running;
    }

    static void ensureStarted(Context context) {
        if (context == null || running) return;
        Context app = context.getApplicationContext();
        try {
            ContextCompat.startForegroundService(app, new Intent(app, FocusKeepAliveService.class));
        } catch (IllegalStateException | SecurityException ignored) {
            // Android 12+ may restrict background FGS starts in edge transitions; Reminders notification remains intact.
        }
    }

    static void stop(Context context) {
        running = false;
        UsageAppMonitor.stop();
        FocusBlockOverlay.dismiss();
        if (context == null) return;
        Context app = context.getApplicationContext();
        try {
            app.stopService(new Intent(app, FocusKeepAliveService.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        JSONObject active = null;
        try {
            active = LocalStore.get(this).read("active");
        } catch (Exception ignored) {
        }

        Notification notification = active != null
            ? Reminders.buildFocusNotification(this, active, currentElapsed(active))
            : Reminders.buildFallbackKeepAliveNotification(this);

        int fgsType = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        try {
            ServiceCompat.startForeground(this, Reminders.FOCUS_ID, notification, fgsType);
        } catch (RuntimeException failure) {
            running = false;
            UsageAppMonitor.stop();
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (active == null) {
            running = false;
            UsageAppMonitor.stop();
            FocusBlockOverlay.dismiss();
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        running = true;
        UsageAppMonitor.start(this);
        return START_STICKY;
    }

    private long currentElapsed(JSONObject session) {
        SessionClock clock = SessionClock.system(this);
        long now = clock.mono();
        boolean interrupted = session.optInt("bootId") != clock.boot() || now < session.optLong("anchorMono");
        if (interrupted) return Math.max(0L, session.optLong("elapsedMs"));
        long ms = session.optLong("elapsedMs")
            + ("running".equals(session.optString("state")) ? Math.max(0L, now - session.optLong("anchorMono")) : 0L);
        return "countdown".equals(session.optString("mode")) ? Math.min(ms, session.optLong("targetMs")) : ms;
    }

    @Override
    public void onDestroy() {
        running = false;
        UsageAppMonitor.stop();
        FocusBlockOverlay.dismiss();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
