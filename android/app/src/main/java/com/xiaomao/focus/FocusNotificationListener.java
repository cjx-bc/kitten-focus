package com.xiaomao.focus;

import android.app.ActivityManager;
import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.*;

/** Ordinary public NLS identity. Never cancels, copies, or re-posts another app's message. */
public final class FocusNotificationListener extends NotificationListenerService {
    static final long REBIND_COOLDOWN_MS = 10_000L;
    static final long COMPONENT_TOGGLE_COOLDOWN_MS = 30_000L;
    static final long REBIND_VERIFY_DELAY_MS = 800L;
    private static volatile FocusNotificationListener listener;
    // Rebind state is guarded by FocusNotificationListener.class.
    private static long lastRebindRequestMs = 0L;
    private static long lastComponentToggleMs = 0L;
    private static Runnable pendingRebindVerification;
    private static final class RebindMainThread {
        static final Handler HANDLER = new Handler(Looper.getMainLooper());
    }

    private final Handler maintenance = new Handler(Looper.getMainLooper());
    private final Runnable renewLeases = new Runnable() {
        @Override public void run() {
            if (listener != FocusNotificationListener.this) return;
            update(null, null, false);
            maintenance.postDelayed(this, 15000);
        }
    };
    static boolean connected() { return listener != null; }
    static FocusNotificationListener require() {
        FocusNotificationListener current = listener;
        if (current == null) throw new IllegalStateException("通知监听未连接");
        return current;
    }
    static void rebind(Context context) { requestListenerRebind(context, false); }

    static boolean shouldRequestRebind(int sdkInt, boolean authorized, boolean connected) {
        return sdkInt >= Build.VERSION_CODES.N && authorized && !connected;
    }
    static boolean shouldRequestRebind(int sdkInt, boolean authorized, boolean connected, long nowMs, long lastRequestMs) {
        if (!shouldRequestRebind(sdkInt, authorized, connected)) return false;
        return lastRequestMs <= 0L || nowMs - lastRequestMs >= REBIND_COOLDOWN_MS;
    }

    static boolean shouldToggleComponentRebind(int sdkInt, boolean authorized, boolean connected, long nowMs, long lastToggleMs) {
        if (!shouldRequestRebind(sdkInt, authorized, connected)) return false;
        return lastToggleMs <= 0L || nowMs - lastToggleMs >= COMPONENT_TOGGLE_COOLDOWN_MS;
    }

    static void rebindIfAuthorized(Context context) {
        try { requestListenerRebind(context, true); } catch (RuntimeException ignored) { }
    }

    private static synchronized void requestListenerRebind(Context context, boolean respectCooldown) {
        if (pendingRebindVerification != null) return;
        Context app = context.getApplicationContext();
        int sdkInt = Build.VERSION.SDK_INT;
        boolean authorized = new AndroidNotificationSystem(app).authorized();
        boolean connected = connected();
        if (!shouldRequestRebind(sdkInt, authorized, connected)) return;

        long now = SystemClock.elapsedRealtime();
        if (!respectCooldown || shouldRequestRebind(sdkInt, authorized, connected, now, lastRebindRequestMs)) {
            requestRebind(new ComponentName(app, FocusNotificationListener.class));
            lastRebindRequestMs = now;
        }

        // A resume during the request cooldown can still verify a request made in the background.
        Runnable verification = () -> verifyRebind(app);
        if (RebindMainThread.HANDLER.postDelayed(verification, REBIND_VERIFY_DELAY_MS)) {
            pendingRebindVerification = verification;
        }
    }

    private static synchronized void verifyRebind(Context app) {
        pendingRebindVerification = null;
        try {
            long now = SystemClock.elapsedRealtime();
            if (!shouldToggleComponentRebind(
                Build.VERSION.SDK_INT, new AndroidNotificationSystem(app).authorized(), connected(), now, lastComponentToggleMs
            )) return;

            ActivityManager.RunningAppProcessInfo process = new ActivityManager.RunningAppProcessInfo();
            ActivityManager.getMyMemoryState(process);
            if (process.importance != ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) return;

            lastComponentToggleMs = now;
            toggleComponentRebind(app);
        } catch (RuntimeException error) {
            Log.w("FocusNotificationListener", "Component rebind failed: " + error.getClass().getSimpleName());
        }
    }

    static void toggleComponentRebind(Context context) {
        Context app = context.getApplicationContext();
        PackageManager pm = app.getPackageManager();
        ComponentName own = new ComponentName(app, FocusNotificationListener.class);
        try {
            pm.setComponentEnabledSetting(own, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        } finally {
            pm.setComponentEnabledSetting(own, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        }
    }

    @Override public void onListenerConnected() {
        synchronized (FocusNotificationListener.class) {
            listener = this;
            lastRebindRequestMs = 0L;
            if (pendingRebindVerification != null) {
                RebindMainThread.HANDLER.removeCallbacks(pendingRebindVerification);
                pendingRebindVerification = null;
            }
        }
        update(null, null, false);
        maintenance.removeCallbacks(renewLeases); maintenance.postDelayed(renewLeases, 15000);
    }
    @Override public void onListenerDisconnected() { maintenance.removeCallbacks(renewLeases); if (listener == this) listener = null; }
    @Override public void onDestroy() { maintenance.removeCallbacks(renewLeases); if (listener == this) listener = null; super.onDestroy(); }
    @Override public void onNotificationPosted(StatusBarNotification sbn) { update(sbn, null, false); }
    @Override public void onNotificationRemoved(StatusBarNotification sbn, RankingMap ranking, int reason) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try { new FocusControl(this).notificationRemoved(sbn.getKey(), reason == REASON_SNOOZED, reason == REASON_CLICK); }
        catch (Exception error) { getSharedPreferences("catfocus-listener-health", MODE_PRIVATE).edit()
            .putString("error", error.getClass().getSimpleName()).apply(); }
    }
    private void update(StatusBarNotification posted, String removed, boolean snoozed) {
        try {
            FocusControl control = new FocusControl(this);
            if (posted != null) control.notificationPosted(metadata(posted));
            else if (removed != null) control.notificationRemoved(removed, snoozed);
            else control.synchronizeNotifications();
            getSharedPreferences("catfocus-listener-health", MODE_PRIVATE).edit().remove("error").apply();
        } catch (Exception error) {
            // Only the class is surfaced; exception messages may contain Android notification content.
            getSharedPreferences("catfocus-listener-health", MODE_PRIVATE).edit()
                .putString("error", error.getClass().getSimpleName()).apply();
        }
    }
    static NotificationSystem.Notice metadata(StatusBarNotification sbn) {
        Notification n = sbn.getNotification();
        boolean necessary = sbn.isOngoing() || !sbn.isClearable() || n.fullScreenIntent != null
            || Notification.CATEGORY_CALL.equals(n.category) || Notification.CATEGORY_ALARM.equals(n.category)
            || Notification.CATEGORY_SYSTEM.equals(n.category) || Notification.CATEGORY_ERROR.equals(n.category)
            || "android".equals(sbn.getPackageName()) || "com.android.systemui".equals(sbn.getPackageName())
            || "com.android.phone".equals(sbn.getPackageName()) || "com.android.server.telecom".equals(sbn.getPackageName());
        // On API 26–28 the package and Android user identify the source.
        // Keep those identities separate from real app UIDs used on newer Android.
        int identity = Build.VERSION.SDK_INT >= 29 ? sbn.getUid() : ~sbn.getUserId();
        return new NotificationSystem.Notice(sbn.getKey(), sbn.getPackageName(), identity, sbn.getGroupKey(), necessary, sbn.getPostTime());
    }
    static List<NotificationSystem.Notice> metadata(StatusBarNotification[] notifications) {
        List<NotificationSystem.Notice> result = new ArrayList<>();
        if (notifications != null) for (StatusBarNotification sbn : notifications) result.add(metadata(sbn));
        return result;
    }
}
