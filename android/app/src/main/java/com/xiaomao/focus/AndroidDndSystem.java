package com.xiaomao.focus;

import android.app.AutomaticZenRule;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Parcel;
import android.service.notification.Condition;
import android.service.notification.ZenPolicy;
import android.util.Base64;
import java.util.Map;

/** Original implementation using rule-local Android APIs, never the global DND setters. */
final class AndroidDndSystem implements DndSystem {
    private static final String NAME = "小猫专注 · 声音辅助";
    private final NotificationManager manager;
    private final ComponentName configuration;

    AndroidDndSystem(Context context) {
        manager = context.getSystemService(NotificationManager.class);
        configuration = new ComponentName(context, DndRuleActivity.class);
    }

    public boolean supported() { return Build.VERSION.SDK_INT >= 29 && manager != null; }
    public boolean permissionGranted() { return manager != null && manager.isNotificationPolicyAccessGranted(); }
    public int globalFilter() { return manager == null ? 0 : manager.getCurrentInterruptionFilter(); }

    private ZenPolicy policy() {
        ZenPolicy.Builder builder = new ZenPolicy.Builder().disallowAllSounds()
            .allowCalls(ZenPolicy.PEOPLE_TYPE_ANYONE).allowRepeatCallers(true)
            .allowAlarms(true).allowMedia(true).showAllVisualEffects();
        // Modern Android fills omitted policy fields from the user's defaults. Set every
        // sound category explicitly so a freshly created rule has an exact definition.
        if (Build.VERSION.SDK_INT >= 30) builder.allowConversations(ZenPolicy.CONVERSATION_SENDERS_NONE);
        if (Build.VERSION.SDK_INT >= 35) builder.allowPriorityChannels(false);
        return builder.build();
    }

    public String create(String condition) {
        if (!supported()) throw new IllegalStateException("此系统不支持独立的声音规则");
        return manager.addAutomaticZenRule(new AutomaticZenRule(NAME, null, configuration,
            Uri.parse(condition), policy(), NotificationManager.INTERRUPTION_FILTER_PRIORITY, true));
    }

    private boolean matchesPolicy(ZenPolicy p) {
        if (p == null) return false;
        return p.getPriorityCategoryCalls() == ZenPolicy.STATE_ALLOW
            && p.getPriorityCallSenders() == ZenPolicy.PEOPLE_TYPE_ANYONE
            && p.getPriorityCategoryRepeatCallers() == ZenPolicy.STATE_ALLOW
            && p.getPriorityCategoryAlarms() == ZenPolicy.STATE_ALLOW
            && p.getPriorityCategoryMedia() == ZenPolicy.STATE_ALLOW
            && p.getPriorityCategoryMessages() == ZenPolicy.STATE_DISALLOW
            && p.getPriorityCategoryEvents() == ZenPolicy.STATE_DISALLOW
            && p.getPriorityCategoryReminders() == ZenPolicy.STATE_DISALLOW
            && p.getPriorityCategorySystem() == ZenPolicy.STATE_DISALLOW
            && (Build.VERSION.SDK_INT < 30 || p.getPriorityCategoryConversations() == ZenPolicy.STATE_DISALLOW)
            && (Build.VERSION.SDK_INT < 35 || p.getPriorityChannelsAllowed() == ZenPolicy.STATE_DISALLOW)
            && p.getVisualEffectAmbient() == ZenPolicy.STATE_ALLOW
            && p.getVisualEffectBadge() == ZenPolicy.STATE_ALLOW
            && p.getVisualEffectFullScreenIntent() == ZenPolicy.STATE_ALLOW
            && p.getVisualEffectLights() == ZenPolicy.STATE_ALLOW
            && p.getVisualEffectNotificationList() == ZenPolicy.STATE_ALLOW
            && p.getVisualEffectPeek() == ZenPolicy.STATE_ALLOW
            && p.getVisualEffectStatusBar() == ZenPolicy.STATE_ALLOW;
    }

    public Rule find(String condition) {
        for (Map.Entry<String, AutomaticZenRule> entry : manager.getAutomaticZenRules().entrySet())
            if (Uri.parse(condition).equals(entry.getValue().getConditionId())) return read(entry.getKey(), condition);
        return null;
    }

    public Rule read(String id, String condition) {
        AutomaticZenRule rule = manager.getAutomaticZenRule(id);
        if (rule == null) return null;
        boolean original = Uri.parse(condition).equals(rule.getConditionId())
            && NAME.equals(rule.getName()) && configuration.equals(rule.getConfigurationActivity())
            && rule.getOwner() == null
            && rule.getInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_PRIORITY
            && matchesPolicy(rule.getZenPolicy());
        Boolean active = null;
        if (Build.VERSION.SDK_INT >= 35) {
            int state = manager.getAutomaticZenRuleState(id);
            if (state == Condition.STATE_TRUE) active = true;
            else if (state == Condition.STATE_FALSE) active = false;
        }
        // Persist the exact app-owned rule definition; an edited rule is never overwritten.
        Parcel parcel = Parcel.obtain();
        String fingerprint;
        try {
            rule.writeToParcel(parcel, 0);
            fingerprint = Base64.encodeToString(parcel.marshall(), Base64.NO_WRAP);
        } finally { parcel.recycle(); }
        return new Rule(id, rule.getConditionId() == null ? "" : rule.getConditionId().toString(),
            fingerprint, original, rule.isEnabled(), active);
    }

    public void activate(String id, String condition) {
        manager.setAutomaticZenRuleState(id, new Condition(Uri.parse(condition), NAME,
            Condition.STATE_TRUE));
    }

    public boolean remove(String id) { return manager.removeAutomaticZenRule(id); }
}
