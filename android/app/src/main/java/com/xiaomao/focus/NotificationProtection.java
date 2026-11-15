package com.xiaomao.focus;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.*;
import java.util.*;

/** Metadata-only runtime journal. Original notifications and their click actions remain with Android. */
final class NotificationProtection {
    private final SharedPreferences preferences;
    private final NotificationSystem system;
    private final SessionClock clock;
    private final String ownPackage;
    NotificationProtection(Context context, String database, SessionClock clock, NotificationSystem system) {
        preferences = context.getSharedPreferences("catfocus-notifications-" + database, Context.MODE_PRIVATE);
        this.system = system; this.clock = clock; ownPackage = context.getPackageName();
    }
    private JSONObject read() throws JSONException { return new JSONObject(preferences.getString("journal", "{\"entries\":[]}")); }
    private void save(JSONObject journal) {
        String text = journal.toString();
        if (text.equals(preferences.getString("journal", ""))) return;
        if (!preferences.edit().putString("journal", text).commit())
            throw new IllegalStateException("通知恢复责任保存失败，未请求新的暂缓");
    }
    private static boolean pending(JSONObject entry) {
        String phase = entry.optString("phase");
        return phase.equals("requested") || phase.equals("snoozed") || phase.equals("failed");
    }
    private static int pendingCount(JSONObject journal) throws JSONException {
        int count = 0; JSONArray entries = journal.getJSONArray("entries");
        for (int i = 0; i < entries.length(); i++) if (pending(entries.getJSONObject(i))) count++;
        return count;
    }
    private static JSONObject entry(JSONObject journal, String key) throws JSONException {
        JSONArray entries = journal.getJSONArray("entries");
        for (int i = 0; i < entries.length(); i++) if (entries.getJSONObject(i).optString("key").equals(key)) return entries.getJSONObject(i);
        return null;
    }
    void checkStart(JSONObject active) throws JSONException {
        if (active.optBoolean("notificationsRequested") && pendingCount(read()) > 0)
            throw new IllegalStateException("上一轮原通知仍待系统释放，请先进入故障恢复核实或重试");
    }
    private boolean ready() { return system.supported() && system.authorized() && system.connected(); }
    private static String groupIdentity(NotificationSystem.Notice notice) {
        return notice.packageName + ":" + notice.uid + ":" + notice.group;
    }
    private boolean controlling(JSONObject journal, JSONObject active) {
        return active != null && active.optBoolean("notificationsRequested")
            && active.optBoolean("strictMode") && active.optString("mode").equals("countdown")
            && journal.optString("sessionId").equals(active.optString("id"))
            && !journal.optBoolean("withdrawn") && journal.optInt("bootId") == clock.boot()
            && clock.mono() < journal.optLong("deadlineMono");
    }
    void synchronize(JSONObject active) throws JSONException {
        JSONObject journal = read();
        verify(journal);
        boolean requested = active != null && active.optBoolean("notificationsRequested");
        if (requested && !journal.optString("sessionId").equals(active.optString("id"))) {
            if (pendingCount(journal) > 0) { save(journal); return; }
            journal = new JSONObject().put("entries", new JSONArray()).put("sessionId", active.optString("id"))
                .put("bootId", active.optInt("bootId")).put("withdrawn", false)
                .put("deadlineMono", active.optLong("anchorMono") + active.optLong("targetMs"))
                .put("deadlineEpoch", active.optLong("startedAt") + active.optLong("targetMs"));
            save(journal);
        }
        if (!requested || !journal.optString("sessionId").equals(active.optString("id"))) journal.put("ended", true);
        save(journal);
        if (!controlling(journal, active) || !ready()) return;
        try {
            List<NotificationSystem.Notice> notices = system.active();
            Set<String> necessaryGroups = new HashSet<>();
            for (NotificationSystem.Notice notice : notices) if (notice.necessary && !notice.group.isEmpty()) necessaryGroups.add(groupIdentity(notice));
            for (NotificationSystem.Notice notice : notices)
                if (notice.group.isEmpty() || !necessaryGroups.contains(groupIdentity(notice))) hold(journal, active, notice);
        } catch (RuntimeException error) { save(journal.put("error", error.getClass().getSimpleName())); }
    }
    void posted(JSONObject active, NotificationSystem.Notice notice) throws JSONException {
        JSONObject journal = read(); JSONObject saved = entry(journal, notice.key);
        if (saved != null) {
            // A posted callback can be an update while Android still holds the key. Read both sets.
            verify(journal); save(journal);
            return; // A key owned by this round is never held a second time after restoration.
        }
        if (controlling(journal, active) && ready()) {
            // Group snooze may affect siblings; enumerate the public active set before the first request.
            synchronize(active);
            journal = read();
            if (entry(journal, notice.key) == null) hold(journal, active, notice);
        }
    }
    private void hold(JSONObject journal, JSONObject active, NotificationSystem.Notice notice) throws JSONException {
        if (entry(journal, notice.key) != null) return;
        Set<String> whitelist = new HashSet<>(); whitelist.add(ownPackage);
        JSONObject protection = active.optJSONObject("protection");
        JSONArray packages = protection == null ? null : protection.optJSONArray("whitelist");
        if (packages != null) for (int i = 0; i < packages.length(); i++) whitelist.add(packages.optString(i));
        long duration = NotificationPolicy.duration(notice, whitelist, journal.optLong("deadlineMono"), clock.mono(), ready());
        if (duration == 0) return;
        // Save every sibling before a grouped request can implicitly snooze it.
        List<NotificationSystem.Notice> linked = new ArrayList<>(); linked.add(notice);
        if (!notice.group.isEmpty()) for (NotificationSystem.Notice sibling : system.active()) {
            if (!sibling.group.equals(notice.group) || !sibling.packageName.equals(notice.packageName) || sibling.uid != notice.uid) continue;
            if (sibling.necessary) return; // Do not let a group summary hide an essential sibling.
            if (!sibling.key.equals(notice.key) && entry(journal, sibling.key) == null) linked.add(sibling);
        }
        for (NotificationSystem.Notice member : linked) {
            journal.getJSONArray("entries").put(new JSONObject().put("key", member.key).put("package", member.packageName)
                .put("uid", member.uid).put("group", member.group).put("phase", "requested")
                .put("requestMono", clock.mono()).put("deadlineMono", journal.optLong("deadlineMono")));
        }
        save(journal); // A durable responsibility must precede the system effect.
        try {
            system.snooze(notice.key, duration);
            for (NotificationSystem.Notice stillActive : system.active())
                for (NotificationSystem.Notice member : linked)
                    if (stillActive.key.equals(member.key) && !stillActive.key.equals(notice.key))
                        system.snooze(member.key, Math.max(1, journal.optLong("deadlineMono") - clock.mono()));
            verify(journal); save(journal);
        } catch (RuntimeException error) {
            entry(journal, notice.key).put("phase", "failed");
            save(journal.put("error", error.getClass().getSimpleName()));
        }
    }
    void removed(String key, boolean snoozed) throws JSONException {
        JSONObject journal = read(); JSONObject saved = entry(journal, key);
        if (saved == null) return;
        saved.put("phase", snoozed ? "snoozed" : "removed"); save(journal);
    }
    /** Executed on lifecycle/reconnect, never on observation. Absence does not claim restoration. */
    private void verify(JSONObject journal) throws JSONException {
        if (!ready()) return;
        try {
            Set<String> active = new HashSet<>(), held = new HashSet<>();
            for (NotificationSystem.Notice notice : system.active()) active.add(notice.key);
            for (NotificationSystem.Notice notice : system.snoozed()) held.add(notice.key);
            JSONArray entries = journal.getJSONArray("entries");
            for (int i = 0; i < entries.length(); i++) {
                JSONObject saved = entries.getJSONObject(i); if (!pending(saved)) continue;
                String key = saved.optString("key");
                if (held.contains(key)) saved.put("phase", "snoozed");
                else if (active.contains(key) && saved.optString("phase").equals("snoozed")) {
                    if (!journal.optBoolean("withdrawn") && journal.optInt("bootId") == clock.boot()
                        && clock.mono() < journal.optLong("deadlineMono")) {
                        // Some systems surface an updated original before its cutoff. Keep the same key held.
                        saved.put("phase", "requested"); save(journal);
                        system.snooze(key, journal.optLong("deadlineMono") - clock.mono());
                        for (NotificationSystem.Notice stillHeld : system.snoozed())
                            if (stillHeld.key.equals(key)) saved.put("phase", "snoozed");
                    } else saved.put("phase", "restored").put("observedMono", clock.mono());
                }
                else if (active.contains(key) && (journal.optBoolean("withdrawn") || clock.mono() >= journal.optLong("deadlineMono")))
                    saved.put("phase", "present"); // Active, but no observed hold: never label this verified restoration.
                else if (!active.contains(key) && (!saved.optString("phase").equals("requested") || clock.mono() >= journal.optLong("deadlineMono") || journal.optInt("bootId") != clock.boot()))
                    saved.put("phase", "absent");
            }
            journal.remove("error");
        } catch (RuntimeException error) { journal.put("error", error.getClass().getSimpleName()); }
    }
    JSONObject restore(JSONObject active) throws JSONException {
        JSONObject journal = read();
        if (active != null && active.optBoolean("notificationsRequested") && journal.optString("sessionId").isEmpty())
            journal.put("sessionId", active.optString("id"));
        save(journal.put("withdrawn", true));
        verify(journal); save(journal);
        return observe(active);
    }
    JSONObject recoveryStep(JSONObject active) throws JSONException {
        JSONObject journal = read(); if (journal.optString("sessionId").isEmpty()) return null;
        JSONObject status = observe(active); boolean controlling = controlling(journal, active);
        int pending = pendingCount(journal);
        return new JSONObject().put("sessionId", journal.optString("sessionId")).put("capability", "notificationInterception")
            .put("title", "原应用通知暂缓").put("withdrawn", journal.optBoolean("withdrawn"))
            .put("status", pending > 0 ? "limited" : controlling ? "active" : "restored")
            .put("reason", pending > 0 ? journal.optBoolean("withdrawn")
                ? "已停止新拦截，仍保留原通知责任；本版本等待原截止并核实，提前改期释放由后续实现完成，可重试核实"
                : "撤销会停止新拦截，但尚在系统暂缓的原通知仍需等待原截止并核实；计时和严格约束保留"
                : controlling ? "停止本轮通知拦截；计时和严格约束保留" : status.optString("reason"));
    }
    /** No preferences, journal, timer or system writes. */
    JSONObject observe(JSONObject active) throws JSONException {
        JSONObject journal = read(); boolean requested = active != null && active.optBoolean("notificationsRequested");
        int pending = pendingCount(journal), restored = 0, absent = 0, present = 0, snoozed = 0;
        JSONArray entries = journal.getJSONArray("entries");
        for (int i = 0; i < entries.length(); i++) {
            String phase = entries.getJSONObject(i).optString("phase");
            if (phase.equals("restored")) restored++;
            if (phase.equals("absent") || phase.equals("removed")) absent++;
            if (phase.equals("present")) present++;
            if (phase.equals("snoozed")) snoozed++;
        }
        boolean controlling = controlling(journal, active);
        boolean supported = system.supported(), authorized = system.authorized(), connected = system.connected();
        String error = journal.optString("error", system.failure());
        String phase = !supported ? "unsupported" : journal.optBoolean("withdrawn") ? "withdrawn"
            : requested && !(active.optBoolean("strictMode") && active.optString("mode").equals("countdown")) ? "lifecycle_pending"
            : requested && !authorized ? "permission_required" : requested && !connected ? "disconnected"
            : !error.isEmpty() ? "failed" : controlling ? snoozed > 0 ? "holding" : pending > 0 ? "requested" : "ready"
            : pending > 0 ? "release_pending" : entries.length() > 0 ? "released" : "off";
        return new JSONObject().put("supported", supported).put("authorized", authorized).put("connected", connected)
            .put("requested", requested).put("phase", phase).put("active", controlling && authorized && connected && error.isEmpty())
            .put("sessionId", journal.optString("sessionId")).put("deadlineEpoch", journal.optLong("deadlineEpoch"))
            .put("pendingCount", pending).put("restoredCount", restored).put("absentCount", absent).put("presentCount", present)
            .put("snoozedCount", snoozed)
            .put("recoveryPending", pending > 0).put("error", error)
            .put("reason", "固定截止原通知由 Android 暂缓和恢复；请求返回不等于实际恢复。普通可暂停倒计时、正计时与提前立即释放仍待后续实现。");
    }
}
