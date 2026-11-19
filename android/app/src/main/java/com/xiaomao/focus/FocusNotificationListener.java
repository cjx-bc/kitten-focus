package com.xiaomao.focus;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.*;

/** Ordinary public NLS identity. Never cancels, copies, or re-posts another app's message. */
public final class FocusNotificationListener extends NotificationListenerService {
    private static volatile FocusNotificationListener listener;
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
    static void rebind(Context context) { requestRebind(new ComponentName(context, FocusNotificationListener.class)); }
    @Override public void onListenerConnected() {
        listener = this; update(null, null, false);
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
