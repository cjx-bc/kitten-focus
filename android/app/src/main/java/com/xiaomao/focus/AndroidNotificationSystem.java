package com.xiaomao.focus;

import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import java.util.List;

final class AndroidNotificationSystem implements NotificationSystem {
    private final Context context;
    AndroidNotificationSystem(Context context) { this.context = context.getApplicationContext(); }
    public boolean supported() { return Build.VERSION.SDK_INT >= 26; }
    public boolean authorized() {
        String enabled = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        ComponentName own = new ComponentName(context, FocusNotificationListener.class);
        if (enabled != null) for (String component : enabled.split(":"))
            if (own.equals(ComponentName.unflattenFromString(component))) return true;
        return false;
    }
    public boolean connected() { return FocusNotificationListener.connected(); }
    public String failure() { return context.getSharedPreferences("catfocus-listener-health", Context.MODE_PRIVATE).getString("error", ""); }
    public List<Notice> active() { return FocusNotificationListener.metadata(FocusNotificationListener.require().getActiveNotifications()); }
    public List<Notice> snoozed() {
        if (!supported()) throw new UnsupportedOperationException("系统不支持通知暂缓");
        return FocusNotificationListener.metadata(FocusNotificationListener.require().getSnoozedNotifications());
    }
    public void snooze(String key, long durationMs) {
        if (!supported()) throw new UnsupportedOperationException("系统不支持通知暂缓");
        FocusNotificationListener.require().snoozeNotification(key, durationMs);
    }
}
