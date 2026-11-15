package com.xiaomao.focus.probe.controller;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import com.xiaomao.focus.probe.common.HoldRequest;
import com.xiaomao.focus.probe.common.ProbeLog;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;

public final class ProbeListener extends NotificationListenerService {
    public static final String SENDER = "com.xiaomao.focus.probe.sender";
    private static volatile ProbeListener connected;
    private final Map<String, PendingIntent> originalClicks = new HashMap<>();

    public static boolean isConnected() { return connected != null; }

    @Override public void onListenerConnected() {
        connected = this;
        ProbeLog.event(this, "listener_connected", ProbeLog.fields("identity", "ordinary_notification_listener"));
        snapshot("connected");
    }

    @Override public void onListenerDisconnected() {
        connected = null;
        ProbeLog.event(this, "listener_disconnected", ProbeLog.fields("pendingHoldCount", journal().getAll().size()));
    }

    @Override public void onDestroy() {
        if (connected == this) connected = null;
        super.onDestroy();
    }

    @Override public void onNotificationPosted(StatusBarNotification notification) {
        if (!isSender(notification)) return;
        JSONObject meta = metadata(notification);
        ProbeLog.event(this, "notification_posted", meta);
        String saved = journal().getString(notification.getKey(), null);
        if (saved == null) return;
        try {
            JSONObject hold = new JSONObject(saved);
            if (!hold.optBoolean("snoozeRemovalObserved")) return;
            PendingIntent original = originalClicks.remove(notification.getKey());
            ProbeLog.event(this, "notification_reappeared", ProbeLog.fields(
                "notification", meta, "hold", hold,
                "actualReappearanceWallMs", System.currentTimeMillis(),
                "actualReappearanceElapsedMs", SystemClock.elapsedRealtime(),
                "delayFromPlannedMs", SystemClock.elapsedRealtime() - hold.getLong("plannedReleaseElapsedMs"),
                "samePendingIntentInProcess", original == null ? null : original.equals(notification.getNotification().contentIntent),
                "identityPreserved", SENDER.equals(notification.getPackageName())
                    && notification.getKey().equals(hold.getString("key"))
                    && creatorPackage(notification).equals(hold.getString("contentIntentCreatorPackage"))));
            journal().edit().remove(notification.getKey()).apply();
        } catch (Exception error) { failure("reappearance_metadata", error); }
    }

    @Override public void onNotificationRemoved(StatusBarNotification notification,
                                                 RankingMap rankingMap, int reason) {
        if (!isSender(notification)) return;
        ProbeLog.event(this, "notification_removed", ProbeLog.fields("notification", metadata(notification),
            "reason", reason, "reasonName", reasonName(reason)));
        String saved = journal().getString(notification.getKey(), null);
        if (saved != null && reason == REASON_SNOOZED) {
            try {
                JSONObject hold = new JSONObject(saved);
                hold.put("snoozeRemovalObserved", true);
                journal().edit().putString(notification.getKey(), hold.toString()).apply();
            } catch (Exception error) { failure("removed_metadata", error); }
        }
    }

    public static void command(Context context, Intent command) {
        String operation = command.getStringExtra("op");
        if ("rebind".equals(operation)) {
            requestRebind(new ComponentName(context, ProbeListener.class));
            ProbeLog.event(context, "rebind_requested", ProbeLog.fields());
            return;
        }
        ProbeListener listener = connected;
        if (listener == null) {
            ProbeLog.event(context, "command_rejected", ProbeLog.fields("operation", operation,
                "reason", "listener_disconnected"));
            return;
        }
        try {
            int id = command.getIntExtra("id", 101);
            if ("snapshot".equals(operation)) listener.snapshot("requested");
            else if ("hold".equals(operation)) listener.hold(id, command.getLongExtra("duration_ms", 15000));
            else if ("no_deadline".equals(operation)) {
                ProbeLog.event(context, "hold_rejected", ProbeLog.fields("id", id,
                    "reason", HoldRequest.evaluate(Build.VERSION.SDK_INT, true, false, null,
                        SystemClock.elapsedRealtime()).code));
                listener.snapshot("no_deadline");
            } else if ("early_release".equals(operation)) {
                ProbeLog.event(context, "early_release_unavailable", ProbeLog.fields("id", id,
                    "reason", "no_public_unsnooze_api_for_ordinary_listener",
                    "systemAssistantIdentity", false, "mutationPerformed", false));
                listener.snapshot("early_release_unavailable");
            } else if ("resnooze_short".equals(operation)) listener.resnooze(id);
            else if ("click".equals(operation)) listener.click(id);
            else if ("disconnect".equals(operation)) {
                ProbeLog.event(context, "unbind_requested", ProbeLog.fields());
                listener.requestUnbind();
                connected = null;
            } else ProbeLog.event(context, "command_rejected", ProbeLog.fields("reason", "unknown_operation"));
        } catch (Exception error) { listener.failure(operation, error); }
    }

    private void hold(int id, long durationMs) {
        if (durationMs < 1 || durationMs > 300000) {
            ProbeLog.event(this, "hold_rejected", ProbeLog.fields("id", id, "reason", "duration_out_of_range_1_to_300000"));
            return;
        }
        if (Build.VERSION.SDK_INT < 26) {
            ProbeLog.event(this, "hold_rejected", ProbeLog.fields("id", id, "reason", "unsupported_api"));
            return;
        }
        long requestedElapsed = SystemClock.elapsedRealtime();
        long plannedRelease = requestedElapsed + durationMs;
        boolean found = false;
        StatusBarNotification[] notifications = getActiveNotifications();
        if (notifications == null) notifications = new StatusBarNotification[0];
        for (StatusBarNotification notification : notifications) {
            if (!isSender(notification) || (id != -1 && notification.getId() != id)) continue;
            found = true;
            HoldRequest.Decision decision = HoldRequest.evaluate(Build.VERSION.SDK_INT, true,
                necessaryException(notification), plannedRelease, SystemClock.elapsedRealtime());
            if (!decision.maySnooze) {
                ProbeLog.event(this, "hold_rejected", ProbeLog.fields("notification", metadata(notification),
                    "reason", decision.code));
                continue;
            }
            JSONObject hold = ProbeLog.fields("key", notification.getKey(), "id", notification.getId(),
                "package", notification.getPackageName(), "requestWallMs", System.currentTimeMillis(),
                "requestElapsedMs", requestedElapsed, "plannedReleaseElapsedMs", plannedRelease,
                "plannedReleaseWallMs", System.currentTimeMillis() + decision.durationMs,
                "durationMs", decision.durationMs, "contentIntentCreatorPackage", creatorPackage(notification),
                "snoozeRemovalObserved", false);
            journal().edit().putString(notification.getKey(), hold.toString()).commit();
            originalClicks.put(notification.getKey(), notification.getNotification().contentIntent);
            ProbeLog.event(this, "snooze_requested", ProbeLog.fields("notification", metadata(notification), "hold", hold));
            try {
                snoozeNotification(notification.getKey(), decision.durationMs);
                ProbeLog.event(this, "snooze_call_returned", ProbeLog.fields("key", notification.getKey(),
                    "meaning", "request_only_not_proof_of_hold_or_release"));
            } catch (Exception error) {
                journal().edit().remove(notification.getKey()).commit();
                originalClicks.remove(notification.getKey());
                failure("snooze", error);
            }
        }
        if (!found) ProbeLog.event(this, "hold_rejected", ProbeLog.fields("id", id, "reason", "target_not_active"));
        snapshot("after_hold_request");
    }

    private void resnooze(int id) {
        if (Build.VERSION.SDK_INT < 26) {
            ProbeLog.event(this, "resnooze_rejected", ProbeLog.fields("reason", "unsupported_api"));
            return;
        }
        for (StatusBarNotification notification : getSnoozedNotifications()) {
            if (isSender(notification) && notification.getId() == id) {
                ProbeLog.event(this, "resnooze_short_requested", ProbeLog.fields("key", notification.getKey(),
                    "durationMs", 1, "meaning", "public_snooze_again_experiment_not_unsnooze"));
                snoozeNotification(notification.getKey(), 1L);
                snapshot("after_resnooze_short");
                return;
            }
        }
        ProbeLog.event(this, "resnooze_rejected", ProbeLog.fields("id", id, "reason", "target_not_snoozed"));
    }

    private void click(int id) throws PendingIntent.CanceledException {
        StatusBarNotification[] notifications = getActiveNotifications();
        if (notifications != null) for (StatusBarNotification notification : notifications) {
            if (!isSender(notification) || notification.getId() != id) continue;
            PendingIntent intent = notification.getNotification().contentIntent;
            if (intent == null) break;
            ProbeLog.event(this, "original_content_intent_send_requested", metadata(notification));
            intent.send();
            return;
        }
        ProbeLog.event(this, "click_rejected", ProbeLog.fields("id", id, "reason", "active_content_intent_not_found"));
    }

    private void snapshot(String trigger) {
        JSONArray active = new JSONArray();
        JSONArray snoozed = new JSONArray();
        try {
            StatusBarNotification[] notifications = getActiveNotifications();
            if (notifications != null) for (StatusBarNotification notification : notifications) {
                if (isSender(notification)) active.put(metadata(notification));
            }
            if (Build.VERSION.SDK_INT >= 26) for (StatusBarNotification notification : getSnoozedNotifications()) {
                if (isSender(notification)) snoozed.put(metadata(notification));
            }
            ProbeLog.event(this, "snapshot", ProbeLog.fields("trigger", trigger, "connected", true,
                "identity", "ordinary_notification_listener", "active", active, "snoozed", snoozed,
                "snoozeSupported", Build.VERSION.SDK_INT >= 26, "publicEarlyReleaseSupported", false,
                "pendingHoldCount", journal().getAll().size()));
        } catch (Exception error) { failure("snapshot", error); }
    }

    private android.content.SharedPreferences journal() { return getSharedPreferences("pending-holds", MODE_PRIVATE); }
    private static boolean isSender(StatusBarNotification notification) { return SENDER.equals(notification.getPackageName()); }

    private static boolean necessaryException(StatusBarNotification sbn) {
        Notification notification = sbn.getNotification();
        return sbn.isOngoing() || !sbn.isClearable()
            || Notification.CATEGORY_CALL.equals(notification.category)
            || Notification.CATEGORY_ALARM.equals(notification.category)
            || notification.fullScreenIntent != null;
    }

    private static String creatorPackage(StatusBarNotification sbn) {
        PendingIntent intent = sbn.getNotification().contentIntent;
        return intent == null || intent.getCreatorPackage() == null ? "" : intent.getCreatorPackage();
    }

    private static JSONObject metadata(StatusBarNotification sbn) {
        Notification notification = sbn.getNotification();
        PendingIntent intent = notification.contentIntent;
        return ProbeLog.fields("package", sbn.getPackageName(), "uid", sbn.getUid(),
            "key", sbn.getKey(), "id", sbn.getId(), "tag", sbn.getTag(), "postTimeMs", sbn.getPostTime(),
            "groupKey", sbn.getGroupKey(), "groupSummary", (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0,
            "ongoing", sbn.isOngoing(), "clearable", sbn.isClearable(), "category", notification.category,
            "hasFullScreenIntent", notification.fullScreenIntent != null,
            "necessaryException", necessaryException(sbn), "flags", notification.flags,
            "channelId", Build.VERSION.SDK_INT >= 26 ? notification.getChannelId() : null,
            "revision", notification.extras.getInt("probe_revision", -1),
            "contentIntentCreatorPackage", creatorPackage(sbn),
            "contentIntentCreatorUid", intent == null ? null : intent.getCreatorUid());
    }

    private static String reasonName(int reason) {
        switch (reason) {
            case REASON_SNOOZED: return "snoozed";
            case REASON_APP_CANCEL: return "app_cancel";
            case REASON_APP_CANCEL_ALL: return "app_cancel_all";
            case REASON_CANCEL: return "user_cancel";
            case REASON_CANCEL_ALL: return "user_cancel_all";
            case REASON_GROUP_SUMMARY_CANCELED: return "group_summary_canceled";
            default: return "other_" + reason;
        }
    }

    private void failure(String operation, Exception error) {
        ProbeLog.event(this, "command_failed", ProbeLog.fields("operation", operation,
            "exception", error.getClass().getSimpleName()));
    }
}
