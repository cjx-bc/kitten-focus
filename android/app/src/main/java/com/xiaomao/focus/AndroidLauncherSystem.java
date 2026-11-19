package com.xiaomao.focus;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.service.notification.StatusBarNotification;

/** Never disables MainActivity: notification control/help intents keep their own enabled target. */
final class AndroidLauncherSystem implements LauncherSystem {
    private final Context context;
    private final ComponentName alias;
    AndroidLauncherSystem(Context context) {
        this.context = context.getApplicationContext();
        alias = new ComponentName(context.getPackageName(), MainActivity.class.getPackage().getName() + ".LauncherAlias");
    }
    public int componentState() { return context.getPackageManager().getComponentEnabledSetting(alias); }
    public void componentState(int state) {
        context.getPackageManager().setComponentEnabledSetting(alias, state, PackageManager.DONT_KILL_APP);
        if (componentState() != state) throw new IllegalStateException("系统未确认桌面入口组件状态，请进入故障恢复重试");
    }
    public boolean launcherVisible() {
        Intent launch = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.getPackageName());
        for (android.content.pm.ResolveInfo info : context.getPackageManager().queryIntentActivities(launch, 0))
            if (alias.getClassName().equals(info.activityInfo.name)) return true;
        return false;
    }
    public boolean recoveryAvailable() {
        if (!new AndroidRecentTasksSystem(context).recoveryAvailable()) return false;
        try {
            ComponentName main = new ComponentName(context, MainActivity.class);
            int setting = context.getPackageManager().getComponentEnabledSetting(main);
            return (setting == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT || setting == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)
                && context.getPackageManager().getActivityInfo(main, 0).enabled;
        } catch (PackageManager.NameNotFoundException absent) { return false; }
    }
    public boolean recoveryReachable() {
        if (!recoveryAvailable()) return false;
        for (StatusBarNotification item : context.getSystemService(NotificationManager.class).getActiveNotifications()) {
            Notification notice = item.getNotification();
            if (item.getId() != Reminders.FOCUS_ID || (android.os.Build.VERSION.SDK_INT >= 26 && !"focus-status".equals(notice.getChannelId()))
                || notice.contentIntent == null || !context.getPackageName().equals(notice.contentIntent.getCreatorPackage()) || notice.actions == null) continue;
            for (Notification.Action action : notice.actions)
                if ("帮助与故障恢复".contentEquals(action.title) && action.actionIntent != null
                    && context.getPackageName().equals(action.actionIntent.getCreatorPackage())) return true;
        }
        return false;
    }
}
