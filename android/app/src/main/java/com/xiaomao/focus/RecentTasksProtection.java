package com.xiaomao.focus;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.List;

/** Reversible own-task state; original state is committed before every Android write. */
final class RecentTasksProtection {
    static final String KEY = "recentTasksHidden";
    private final SharedPreferences preferences;
    private final RecentTasksSystem system;
    private final SessionClock clock;
    RecentTasksProtection(Context context, String database, SessionClock clock, RecentTasksSystem system) {
        preferences = context.getSharedPreferences("catfocus-recents-" + database, Context.MODE_PRIVATE);
        this.system = system; this.clock = clock;
    }
    private JSONObject journal() throws JSONException { return new JSONObject(preferences.getString("journal", "{}")); }
    private void save(JSONObject journal) {
        if (!preferences.edit().putString("journal", journal.toString()).commit())
            throw new IllegalStateException("无法保存原任务卡状态，没有继续修改系统任务");
    }
    static boolean requested(JSONObject session) {
        JSONObject protection = session == null ? null : session.optJSONObject("protection");
        JSONArray keys = protection == null ? null : protection.optJSONArray("enhancements");
        if (keys != null) for (int i = 0; i < keys.length(); i++) if (KEY.equals(keys.optString(i))) return true;
        return false;
    }
    private boolean pending(JSONObject journal) {
        JSONArray tasks = journal.optJSONArray("tasks");
        if (tasks != null) for (int i = 0; i < tasks.length(); i++) if (!tasks.optJSONObject(i).optBoolean("restored")) return true;
        return false;
    }
    void checkStart(JSONObject session) throws JSONException {
        if (!requested(session)) return;
        if (pending(journal())) throw new IllegalStateException("上一轮任务卡仍待恢复，请先进入故障恢复重试");
        if (!system.recoveryAvailable()) throw new IllegalStateException("请先开启小猫通知，以保留控制及帮助恢复入口，再隐藏任务卡");
        // No system write here. A running status notification is checked again immediately before hiding.
        if (system.ownTasks().isEmpty()) throw new IllegalStateException("没有可核实的小猫主任务，未隐藏任务卡");
    }
    private RecentTasksSystem.Task find(List<RecentTasksSystem.Task> tasks, JSONObject original) {
        for (RecentTasksSystem.Task task : tasks)
            if (task.id == original.optInt("id") && task.identity.equals(original.optString("identity"))) return task;
        return null;
    }
    void synchronize(JSONObject active) throws JSONException {
        JSONObject journal = journal();
        boolean current = requested(active) && active.optInt("bootId") == clock.boot();
        if (!current || !journal.optString("sessionId").equals(active.optString("id"))) {
            if (!release(journal)) return;
            if (!current) return;
            journal = new JSONObject().put("sessionId", active.optString("id")).put("bootId", clock.boot())
                .put("tasks", new JSONArray()).put("phase", "ready").put("withdrawn", false);
            save(journal);
        }
        if (journal.optBoolean("withdrawn")) return;
        try {
            if (!system.recoveryReachable()) {
                if (pending(journal)) {
                    save(journal.put("withdrawn", true));
                    if (release(journal)) save(journal.put("error", "控制通知入口已失效，已恢复任务卡；本轮不再隐藏"));
                    return;
                }
                throw new IllegalStateException("控制通知及帮助恢复入口不可达，未隐藏任务卡；请开启通知后重试");
            }
            List<RecentTasksSystem.Task> currentTasks = system.ownTasks();
            JSONArray originals = journal.getJSONArray("tasks");
            for (int i = 0; i < originals.length(); i++) {
                JSONObject original = originals.getJSONObject(i);
                RecentTasksSystem.Task now = find(currentTasks, original);
                if ((original.optBoolean("applied") || original.optBoolean("excluded")) && now != null && !now.excluded) {
                    save(journal.put("withdrawn", true).put("phase", "withdrawn").put("error", "任务卡已有后续更改，已保留；本轮不再重新隐藏"));
                    release(journal); return;
                }
            }
            for (RecentTasksSystem.Task task : currentTasks) {
                JSONObject original = null;
                for (int i = 0; i < originals.length(); i++) {
                    JSONObject row = originals.getJSONObject(i);
                    if (row.optInt("id") == task.id && row.optString("identity").equals(task.identity)) { original = row; break; }
                }
                if (original == null) {
                    original = new JSONObject().put("id", task.id).put("identity", task.identity).put("excluded", task.excluded)
                        .put("restored", task.excluded).put("applied", false);
                    originals.put(original); save(journal);
                }
                if (!task.excluded) {
                    // Persist intent before the Android call, including the crash-between-write-and-ack case.
                    original.put("applied", true).put("restored", false); save(journal);
                    system.exclude(task, true);
                }
            }
            save(journal.put("phase", currentTasks.isEmpty() ? "failed" : "active")
                .put("error", currentTasks.isEmpty() ? "主任务已移除，当前没有任务卡可隐藏" : ""));
        } catch (RuntimeException failure) {
            save(journal.put("phase", "failed").put("error", message(failure)));
        }
    }
    private boolean release(JSONObject journal) throws JSONException {
        if (!pending(journal)) {
            if (!journal.optString("sessionId").isEmpty())
                save(journal.put("phase", journal.optBoolean("withdrawn") ? "withdrawn" : "restored"));
            return true;
        }
        String error = "";
        try {
            List<RecentTasksSystem.Task> current = system.ownTasks();
            JSONArray tasks = journal.getJSONArray("tasks");
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject original = tasks.getJSONObject(i);
                if (original.optBoolean("restored")) continue;
                try {
                    // Android may retain a recent task (and its exclusion flag) across reboot.
                    // Match the saved persistent ID and exact own base-intent identity on every boot.
                    RecentTasksSystem.Task task = find(current, original);
                    if (task != null && task.excluded && original.optBoolean("applied"))
                        system.exclude(task, original.optBoolean("excluded"));
                    original.put("restored", true); save(journal);
                } catch (RuntimeException failure) { error = message(failure); }
            }
        } catch (RuntimeException failure) { error = message(failure); }
        boolean pending = pending(journal);
        save(journal.put("phase", pending ? "restoration_failed" : journal.optBoolean("withdrawn") ? "withdrawn" : "restored").put("error", error));
        return !pending;
    }
    void restore(JSONObject active) throws JSONException {
        JSONObject journal = journal();
        if (requested(active)) {
            if (journal.optString("sessionId").isEmpty()) journal.put("sessionId", active.optString("id"));
            journal.put("withdrawn", true); save(journal);
        }
        release(journal);
        if (!pending(journal) && journal.optBoolean("withdrawn")) save(journal.put("phase", "withdrawn"));
    }
    JSONObject observe(JSONObject active) throws JSONException {
        JSONObject journal = journal();
        String phase = journal.optString("phase", "off"), error = journal.optString("error");
        boolean verified = false;
        if (phase.equals("active")) try {
            List<RecentTasksSystem.Task> tasks = system.ownTasks();
            verified = !tasks.isEmpty();
            for (RecentTasksSystem.Task task : tasks) verified &= task.excluded;
            if (!verified) { phase = "failed"; error = "实际任务卡状态已变化，请返回控制页核实"; }
        } catch (RuntimeException failure) { phase = "failed"; error = message(failure); }
        return new JSONObject().put("supported", true).put("requested", requested(active)).put("phase", phase)
            .put("recoveryAvailable", system.recoveryAvailable())
            .put("active", verified).put("verified", verified).put("error", error)
            .put("recoveryPending", pending(journal) && (!requested(active) || journal.optBoolean("withdrawn") || phase.equals("restoration_failed")));
    }
    JSONObject recoveryStep(JSONObject active) throws JSONException {
        JSONObject journal = journal();
        if (journal.optString("sessionId").isEmpty()) return null;
        boolean pending = pending(journal), failed = journal.optString("phase").equals("restoration_failed");
        boolean roundEnabled = requested(active) && active.optString("id").equals(journal.optString("sessionId")) && !journal.optBoolean("withdrawn");
        return new JSONObject().put("sessionId", journal.optString("sessionId")).put("capability", KEY).put("title", "自身最近任务卡")
            .put("status", failed && pending ? "failed" : pending || roundEnabled ? "active" : "restored").put("withdrawn", journal.optBoolean("withdrawn"))
            .put("reason", !pending && !roundEnabled ? "本轮任务卡更改已恢复；原先隐藏的任务保持原状"
                : failed ? journal.optString("error") : "恢复本轮修改前的自身任务卡状态；专注或锁机计时和严格规则继续保留");
    }
    private static String message(RuntimeException failure) { return failure.getMessage() == null ? failure.getClass().getSimpleName() : failure.getMessage(); }
}
