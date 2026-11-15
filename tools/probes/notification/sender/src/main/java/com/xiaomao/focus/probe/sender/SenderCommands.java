package com.xiaomao.focus.probe.sender;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import com.xiaomao.focus.probe.common.ProbeLog;

final class SenderCommands {
    private static final String CHANNEL = "probe_v1";
    private SenderCommands() { }

    static void execute(Context context, Intent command) {
        String op = command.getStringExtra("op");
        int id = command.getIntExtra("id", 101);
        int revision = command.getIntExtra("revision", 1);
        String kind = command.getStringExtra("kind");
        if (kind == null) kind = "normal";
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        try {
            if ("withdraw".equals(op)) {
                manager.cancel("probe", id);
                ProbeLog.event(context, "withdraw_requested", ProbeLog.fields("id", id));
            } else if ("cancel_all".equals(op)) {
                manager.cancelAll();
                ProbeLog.event(context, "sender_cleanup_requested", ProbeLog.fields());
            } else if ("group".equals(op)) {
                post(context, manager, 201, revision, "normal", "probe_group", false);
                post(context, manager, 202, revision, "normal", "probe_group", false);
                post(context, manager, 200, revision, "normal", "probe_group", true);
            } else if ("duplicate".equals(op)) {
                post(context, manager, id, revision, kind, null, false);
                post(context, manager, id, revision + 1, kind, null, false);
            } else if ("post".equals(op) || "update".equals(op)) {
                post(context, manager, id, revision, kind, null, false);
            } else {
                ProbeLog.event(context, "command_rejected", ProbeLog.fields("reason", "unknown_operation"));
            }
        } catch (Exception error) {
            ProbeLog.event(context, "command_failed", ProbeLog.fields("operation", op,
                "exception", error.getClass().getSimpleName()));
        }
    }

    private static void post(Context context, NotificationManager manager, int id, int revision,
                             String kind, String group, boolean summary) {
        if (!java.util.Arrays.asList("normal", "ongoing", "call", "alarm", "full_screen").contains(kind)) {
            ProbeLog.event(context, "command_rejected", ProbeLog.fields("reason", "unknown_kind"));
            return;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,
                "Synthetic probe notifications", NotificationManager.IMPORTANCE_HIGH));
        }
        Intent click = new Intent(context, SenderActivity.class)
            .setAction("com.xiaomao.focus.probe.CLICK")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(Uri.parse("kitten-probe://notification/" + id))
            .putExtra("id", id).putExtra("revision", revision);
        PendingIntent content = PendingIntent.getActivity(context, id, click,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Synthetic probe #" + id)
            .setContentText("Generated revision " + revision + " · " + kind)
            .setContentIntent(content).setAutoCancel(false).setOnlyAlertOnce(true)
            .setPriority(Notification.PRIORITY_HIGH);
        android.os.Bundle metadata = new android.os.Bundle();
        metadata.putInt("probe_revision", revision);
        metadata.putString("probe_kind", kind);
        builder.addExtras(metadata);
        if ("ongoing".equals(kind)) builder.setOngoing(true);
        if ("call".equals(kind)) builder.setCategory(Notification.CATEGORY_CALL);
        if ("alarm".equals(kind)) builder.setCategory(Notification.CATEGORY_ALARM);
        if ("full_screen".equals(kind)) builder.setFullScreenIntent(content, true);
        if (group != null) builder.setGroup(group).setGroupSummary(summary);
        manager.notify("probe", id, builder.build());
        ProbeLog.event(context, "post_requested", ProbeLog.fields("id", id, "tag", "probe",
            "revision", revision, "kind", kind, "group", group, "groupSummary", summary,
            "notificationsEnabled", manager.areNotificationsEnabled(),
            "postPermission", Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(
                Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED,
            "fullScreenAllowed", Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent(),
            "contentIntentCreatorPackage", content.getCreatorPackage(),
            "contentIntentCreatorUid", content.getCreatorUid()));
    }
}
