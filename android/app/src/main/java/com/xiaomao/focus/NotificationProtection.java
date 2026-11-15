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
        return phase.equals("requested") || phase.equals("snoozed") || phase.equals("failed") || phase.equals("removed");
    }
    private static int pendingCount(JSONObject journal) throws JSONException {
        int count = 0; JSONArray entries = journal.getJSONArray("entries");
        for (int i = 0; i < entries.length(); i++) if (pending(entries.getJSONObject(i))) count++;
        return count;
    }
    private static JSONObject entry(JSONObject journal, String key) throws JSONException {
        JSONArray entries = journal.getJSONArray("entries");
        for (int i = entries.length() - 1; i >= 0; i--) if (entries.getJSONObject(i).optString("key").equals(key)) return entries.getJSONObject(i);
        return null;
    }
    private boolean canHold(JSONObject journal, NotificationSystem.Notice notice) throws JSONException {
        JSONObject previous = entry(journal, notice.key);
        if (previous == null) return true;
        if ((!previous.optString("phase").equals("absent") && !previous.optBoolean("observedAbsent")) || notice.postTime == 0
            || notice.postTime == previous.optLong("postTime")) return false;
        // Absence belongs to the preceding original. Accept a different currently posted
        // original, even after wall-clock rollback; a delayed callback alone is not proof.
        for (NotificationSystem.Notice current : system.active())
            if (current.key.equals(notice.key) && current.uid == notice.uid
                && current.packageName.equals(notice.packageName) && current.postTime == notice.postTime) return true;
        return false;
    }
    void checkStart(JSONObject active) throws JSONException {
        if (active.optBoolean("notificationsRequested") && pendingCount(read()) > 0)
            throw new IllegalStateException("上一轮原通知仍待系统释放，请先进入故障恢复核实或重试");
    }
    private boolean ready() { return system.supported() && system.authorized() && system.connected(); }
    private static String groupIdentity(NotificationSystem.Notice notice) {
        return notice.packageName + ":" + notice.uid + ":" + notice.group;
    }
    private static final long LEASE_MS = 60000, RENEW_BEFORE_MS = 15000;
    private static boolean fixedDeadline(JSONObject active) {
        return active != null && active.optBoolean("strictMode") && active.optString("mode").equals("countdown");
    }
    private long remaining(JSONObject active) {
        if (!active.optString("mode").equals("countdown")) return Long.MAX_VALUE;
        long elapsed = active.optLong("elapsedMs");
        if (active.optString("state").equals("running")) elapsed += Math.max(0, clock.mono() - active.optLong("anchorMono"));
        return Math.max(0, active.optLong("targetMs") - elapsed);
    }
    private long cutoff(JSONObject active) {
        long duration = active.optString("state").equals("paused") ? LEASE_MS : remaining(active);
        return clock.mono() + (fixedDeadline(active) ? duration : Math.min(LEASE_MS, duration));
    }
    private boolean controlling(JSONObject journal, JSONObject active) {
        return active != null && active.optBoolean("notificationsRequested")
            && journal.optString("sessionId").equals(active.optString("id"))
            && !journal.optBoolean("withdrawn") && !journal.optBoolean("ended")
            && journal.optInt("bootId") == clock.boot() && active.optInt("bootId") == clock.boot()
            && clock.mono() >= active.optLong("anchorMono") && remaining(active) > 0;
    }
    void synchronize(JSONObject active) throws JSONException { synchronize(active, null); }
    private void synchronize(JSONObject active, NotificationSystem.Notice posted) throws JSONException {
        JSONObject journal = read();
        boolean requested = active != null && active.optBoolean("notificationsRequested");
        if (requested && !journal.optString("sessionId").equals(active.optString("id"))) {
            if (pendingCount(journal) > 0) { save(journal); return; }
            journal = new JSONObject().put("entries", new JSONArray()).put("sessionId", active.optString("id"))
                .put("bootId", active.optInt("bootId")).put("withdrawn", false)
                .put("fixedDeadline", fixedDeadline(active));
            save(journal);
        }
        if (!requested || !journal.optString("sessionId").equals(active.optString("id"))) journal.put("ended", true);
        boolean controlling = controlling(journal, active);
        if (controlling) journal.put("deadlineMono", cutoff(active)).put("deadlineEpoch", clock.epoch() + cutoff(active) - clock.mono());
        verify(journal, controlling, posted);
        save(journal);
        if (!controlling) { release(journal); return; }
        if (!ready()) return;
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
            synchronize(active, notice);
            return; // Only a still-controlled lease can be renewed; restored keys stay terminal.
        }
        if (controlling(journal, active) && ready()) {
            // Group snooze may affect siblings; enumerate the public active set before the first request.
            synchronize(active);
            journal = read();
            if (entry(journal, notice.key) == null) hold(journal, active, notice);
        }
    }
    private void hold(JSONObject journal, JSONObject active, NotificationSystem.Notice notice) throws JSONException {
        if (!canHold(journal, notice)) return;
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
            if (!sibling.key.equals(notice.key) && canHold(journal, sibling)) linked.add(sibling);
        }
        for (NotificationSystem.Notice member : linked) {
            journal.getJSONArray("entries").put(new JSONObject().put("key", member.key).put("package", member.packageName)
                .put("uid", member.uid).put("group", member.group).put("postTime", member.postTime).put("phase", "requested")
                .put("requestMono", clock.mono()).put("deadlineMono", journal.optLong("deadlineMono")));
        }
        save(journal); // A durable responsibility must precede the system effect.
        try {
            system.snooze(notice.key, duration);
            for (NotificationSystem.Notice stillActive : system.active())
                for (NotificationSystem.Notice member : linked)
                    if (stillActive.key.equals(member.key) && !stillActive.key.equals(notice.key))
                        system.snooze(member.key, Math.max(1, journal.optLong("deadlineMono") - clock.mono()));
            verify(journal, true); save(journal);
        } catch (RuntimeException error) {
            entry(journal, notice.key).put("phase", "failed");
            save(journal.put("error", error.getClass().getSimpleName()));
        }
    }
    void removed(String key, boolean snoozed, boolean clicked) throws JSONException {
        JSONObject journal = read(); JSONObject saved = entry(journal, key);
        // Later consumption cannot undo a restoration already verified from Android.
        if (saved == null || !pending(saved)) return;
        if (clicked && saved.optBoolean("observedHeld")) saved.put("phase", "restored").put("observedMono", clock.mono());
        else if (snoozed) saved.put("observedHeld", true).put("phase", "snoozed");
        else saved.put("phase", "removed");
        save(journal);
    }
    /** Executed on lifecycle/reconnect, never on observation. Absence does not claim restoration. */
    private void verify(JSONObject journal, boolean controlling) throws JSONException { verify(journal, controlling, null); }
    private void verify(JSONObject journal, boolean controlling, NotificationSystem.Notice posted) throws JSONException {
        if (!ready()) return;
        try {
            Map<String, NotificationSystem.Notice> active = new HashMap<>();
            Map<String, NotificationSystem.Notice> held = new HashMap<>();
            for (NotificationSystem.Notice notice : system.active()) active.put(notice.key, notice);
            for (NotificationSystem.Notice notice : system.snoozed()) held.put(notice.key, notice);
            journal.remove("error");
            JSONArray entries = journal.getJSONArray("entries");
            for (int i = 0; i < entries.length(); i++) {
                JSONObject saved = entries.getJSONObject(i);
                String key = saved.optString("key");
                if (!pending(saved)) {
                    // Preserve verified restoration history, while recording a later disappearance
                    // as the boundary for another sender posting under the same Android key.
                    if (!active.containsKey(key) && !held.containsKey(key)) saved.put("observedAbsent", true);
                    continue;
                }
                NotificationSystem.Notice observed = active.containsKey(key) ? active.get(key) : held.get(key);
                if (observed != null && observed.postTime != 0) saved.put("postTime", observed.postTime);
                NotificationSystem.Notice current = posted != null && posted.key.equals(key) ? posted
                    : active.containsKey(key) ? active.get(key) : held.get(key);
                // A necessary update ends the ordinary hold for this original. Keep the exemption
                // through stale enumeration/callback races until its actual release is observed.
                if (current != null && current.necessary) saved.put("exempt", true);
                if (held.containsKey(key)) {
                    saved.put("observedHeld", true).put("phase", "snoozed");
                    if (controlling && saved.optBoolean("exempt")) releaseEntry(journal, saved);
                    else if (controlling && !journal.optBoolean("fixedDeadline") && saved.optLong("deadlineMono") - clock.mono() <= RENEW_BEFORE_MS)
                        renew(journal, saved);
                } else if (active.containsKey(key)) {
                    if (controlling && !saved.optBoolean("exempt")) renew(journal, saved);
                    else saved.put("phase", saved.optBoolean("observedHeld") ? "restored" : "present").put("observedMono", clock.mono());
                } else if (saved.optBoolean("observedHeld") || clock.mono() - saved.optLong("requestMono") >= 2000 || journal.optInt("bootId") != clock.boot())
                    saved.put("phase", "absent");
            }
        } catch (RuntimeException error) { journal.put("error", error.getClass().getSimpleName()); }
    }
    private void renew(JSONObject journal, JSONObject saved) throws JSONException {
        long duration = journal.optLong("deadlineMono") - clock.mono();
        if (duration <= 0) return;
        saved.put("phase", "requested").put("requestMono", clock.mono()).put("deadlineMono", journal.optLong("deadlineMono")); save(journal);
        system.snooze(saved.optString("key"), duration);
        // Retain independently verified history while a renewal is awaiting its asynchronous callback.
        for (NotificationSystem.Notice held : system.snoozed()) if (held.key.equals(saved.optString("key")))
            saved.put("observedHeld", true).put("phase", "snoozed");
    }
    private void release(JSONObject journal) throws JSONException {
        if (!ready()) return;
        JSONArray entries = journal.getJSONArray("entries");
        for (int i = 0; i < entries.length(); i++) releaseEntry(journal, entries.getJSONObject(i));
    }
    private void releaseEntry(JSONObject journal, JSONObject saved) throws JSONException {
        if (!pending(saved) || saved.optBoolean("releaseRequested") && clock.mono() - saved.optLong("releaseRequestMono") < 5000) return;
        // A returned request is not verified restoration. Keep the original responsibility.
        saved.put("releaseRequested", true).put("releaseFailed", false).put("releaseRequestMono", clock.mono()); save(journal);
        try { system.snooze(saved.optString("key"), 1L); }
        catch (RuntimeException error) {
            saved.put("releaseRequested", false).put("releaseFailed", true).put("phase", "failed");
            journal.put("error", error.getClass().getSimpleName());
        }
        save(journal);
    }
    JSONObject restore(JSONObject active) throws JSONException {
        JSONObject journal = read();
        if (active != null && active.optBoolean("notificationsRequested") && journal.optString("sessionId").isEmpty())
            journal.put("sessionId", active.optString("id"));
        save(journal.put("withdrawn", true));
        verify(journal, false); save(journal); release(journal);
        return observe(active);
    }
    JSONObject recoveryStep(JSONObject active) throws JSONException {
        JSONObject journal = read(); if (journal.optString("sessionId").isEmpty()) return null;
        JSONObject status = observe(active); boolean controlling = controlling(journal, active);
        int pending = pendingCount(journal);
        return new JSONObject().put("sessionId", journal.optString("sessionId")).put("capability", "notificationInterception")
            .put("title", "原应用通知暂缓").put("withdrawn", journal.optBoolean("withdrawn"))
            .put("status", pending > 0 ? status.optInt("releaseFailedCount") > 0 ? "failed" : "limited" : controlling ? "active" : "restored")
            .put("reason", pending > 0 ? journal.optBoolean("withdrawn")
                ? "已停止新拦截；原通知释放请求与失败分别保留，只有系统确认原通知再次出现才记为恢复。可重试；断连时等待授权、重连或有限租期结束后核实"
                : "撤销将停止新拦截，并对系统仍持有的原通知请求立即改期释放；请求不等于已恢复，计时和严格约束保留"
                : controlling ? "停止本轮通知拦截；计时和严格约束保留" : status.optString("reason"));
    }
    /** No preferences, journal, timer or system writes. */
    JSONObject observe(JSONObject active) throws JSONException {
        JSONObject journal = read(); boolean requested = active != null && active.optBoolean("notificationsRequested");
        int pending = pendingCount(journal), restored = 0, absent = 0, present = 0, snoozed = 0, releaseRequested = 0, releaseFailed = 0;
        JSONArray entries = journal.getJSONArray("entries");
        for (int i = 0; i < entries.length(); i++) {
            JSONObject saved = entries.getJSONObject(i);
            String phase = saved.optString("phase");
            if (pending(saved) && saved.optBoolean("releaseRequested")) releaseRequested++;
            if (pending(saved) && saved.optBoolean("releaseFailed")) releaseFailed++;
            if (phase.equals("restored")) restored++;
            if (phase.equals("absent")) absent++;
            if (phase.equals("present")) present++;
            if (phase.equals("snoozed")) snoozed++;
        }
        boolean controlling = controlling(journal, active);
        boolean supported = system.supported(), authorized = system.authorized(), connected = system.connected();
        String error = journal.optString("error", system.failure());
        String phase = !supported ? "unsupported" : journal.optBoolean("withdrawn") ? "withdrawn"
            : requested && !authorized ? "permission_required" : requested && !connected ? "disconnected"
            : !error.isEmpty() ? "failed" : controlling ? snoozed > 0 ? "holding" : pending > 0 ? "requested" : "ready"
            : pending > 0 ? "release_pending" : entries.length() > 0 ? "released" : "off";
        return new JSONObject().put("supported", supported).put("authorized", authorized).put("connected", connected)
            .put("requested", requested).put("phase", phase).put("active", controlling && authorized && connected && error.isEmpty())
            .put("sessionId", journal.optString("sessionId")).put("deadlineEpoch", journal.optLong("deadlineEpoch"))
            .put("pendingCount", pending).put("restoredCount", restored).put("absentCount", absent).put("presentCount", present)
            .put("snoozedCount", snoozed).put("releaseRequestedCount", releaseRequested).put("releaseFailedCount", releaseFailed)
            .put("leaseDurationMs", journal.optBoolean("fixedDeadline") ? 0 : LEASE_MS)
            .put("recoveryPending", pending > 0).put("error", error)
            .put("reason", "原通知与点击动作始终由 Android 保留。普通专注、暂停、正计时和普通锁机使用最长 60 秒的滚动暂缓；监听失联会让有限租期到期。结束、休息或故障恢复会请求立即改期释放，实际恢复需由系统核实；不同系统可能受限。");
    }
}
