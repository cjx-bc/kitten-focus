package com.xiaomao.focus;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.service.notification.StatusBarNotification;
import java.util.ArrayList;
import java.util.List;

/** AppTask is already scoped to the calling UID; additionally restrict to our main activity. */
final class AndroidRecentTasksSystem implements RecentTasksSystem {
    private final Context context;
    AndroidRecentTasksSystem(Context context) { this.context = context.getApplicationContext(); }
    public boolean recoveryReachable() {
        if (!Reminders.notificationsAllowed(context)) return false;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (!manager.areNotificationsEnabled()) return false;
        for (StatusBarNotification item : manager.getActiveNotifications()) {
            Notification notification = item.getNotification();
            if (item.getId() == Reminders.FOCUS_ID && notification.contentIntent != null && notification.actions != null)
                for (Notification.Action action : notification.actions)
                    if (action.actionIntent != null && "帮助与故障恢复".contentEquals(action.title)) return true;
        }
        return false;
    }
    private Task describe(ActivityManager.AppTask appTask) {
        ActivityManager.RecentTaskInfo info = appTask.getTaskInfo();
        Intent base = info.baseIntent;
        ComponentName component = base == null ? null : base.getComponent();
        if (component == null || !component.getPackageName().equals(context.getPackageName())
            || !component.getClassName().equals(MainActivity.class.getName())) return null;
        return new Task(info.id, component.flattenToString() + ":" + base.getAction() + ":" + base.getDataString(),
            (base.getFlags() & Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS) != 0);
    }
    public List<Task> ownTasks() {
        List<Task> tasks = new ArrayList<>();
        for (ActivityManager.AppTask task : context.getSystemService(ActivityManager.class).getAppTasks()) {
            Task value = describe(task); if (value != null) tasks.add(value);
        }
        return tasks;
    }
    public void exclude(Task expected, boolean excluded) {
        for (ActivityManager.AppTask task : context.getSystemService(ActivityManager.class).getAppTasks()) {
            Task value = describe(task);
            if (value != null && value.id == expected.id && value.identity.equals(expected.identity)) {
                task.setExcludeFromRecents(excluded);
                Task after = describe(task);
                if (after == null || after.excluded != excluded) throw new IllegalStateException("系统未确认任务卡状态");
                return;
            }
        }
        throw new IllegalStateException("原任务已变化，请重新核实恢复状态");
    }
}
