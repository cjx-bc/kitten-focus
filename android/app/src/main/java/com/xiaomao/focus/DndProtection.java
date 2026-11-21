package com.xiaomao.focus;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.UUID;

/** A reversible sound aid. Its journal is private runtime state and is never an AppData backup. */
final class DndProtection {
    private final DndSystem system;
    private final SharedPreferences preferences;
    private final String packageName;

    DndProtection(Context context, String databaseName, DndSystem system) {
        this.system = system;
        this.packageName = context.getPackageName();
        preferences = context.getSharedPreferences("catfocus-dnd-" + databaseName, Context.MODE_PRIVATE);
    }

    private JSONObject journal() throws JSONException {
        String text = preferences.getString("journal", null);
        return text == null ? new JSONObject() : new JSONObject(text);
    }

    private void save(JSONObject journal) {
        String text = journal.toString();
        if (text.equals(preferences.getString("journal", null))) return;
        if (!preferences.edit().putString("journal", text).commit())
            throw new IllegalStateException("声音辅助恢复记录保存失败");
    }

    void checkStart(JSONObject session) throws JSONException {
        if (!session.optBoolean("dndRequested")) return;
        JSONObject journal = journal();
        if (journal.has("condition"))
            throw new IllegalStateException("上一轮声音规则仍有待恢复项目，请先进入故障恢复重试");
        if (!system.supported()) throw new IllegalStateException("本机不支持声音免打扰辅助，请在设置中明确关闭该选项后再开始");
        if (!system.permissionGranted()) throw new IllegalStateException("声音免打扰辅助尚未授权，请完成勿扰授权，或在设置中明确关闭该选项后再开始");
    }

    /** Exposes the real private duty to the shared recovery flow, without creating one. */
    JSONObject recoveryStep() throws JSONException {
        JSONObject journal = journal();
        if (journal.optString("sessionId").isEmpty()) return null;
        boolean pending = journal.has("condition");
        boolean failed = pending && journal.optString("phase").equals("restoration_failed");
        return new JSONObject().put("sessionId", journal.getString("sessionId"))
            .put("capability", "soundDnd").put("title", "声音免打扰辅助")
            .put("status", !pending ? "restored" : failed ? "failed" : "active")
            .put("withdrawn", journal.optBoolean("withdrawn"))
            .put("reason", !pending ? "小猫声音规则已撤销；计时和偏好保留"
                : failed ? journal.optString("error", "声音规则恢复未完成，请重试")
                : "撤销本轮小猫声音规则；计时、严格规则和其他系统勿扰选择保留");
    }

    void synchronize(JSONObject active) throws JSONException {
        JSONObject journal = journal();
        String session = active == null ? "" : active.optString("id");
        boolean requested = active != null && active.optBoolean("dndRequested");
        if (!journal.optString("sessionId").equals(session) || !requested) {
            if (!release(journal)) return;
            if (!requested) return;
            journal = new JSONObject().put("sessionId", session).put("requested", true)
                .put("condition", "condition://" + packageName + "/focus-sound/" + UUID.randomUUID())
                .put("originalRule", JSONObject.NULL).put("phase", "ready");
            save(journal);
        }
        if (journal.optBoolean("withdrawn") || !requested) return;
        if (!system.supported()) { save(journal.put("phase", "unsupported")); return; }
        if (!system.permissionGranted()) { save(journal.put("phase", "permission_required")); return; }
        if (journal.optBoolean("applied")) return; // Never reactivate a user-disabled rule this round.
        try {
            String condition = journal.getString("condition");
            DndSystem.Rule rule = journal.optString("ruleId").isEmpty()
                ? system.find(condition) : system.read(journal.getString("ruleId"), condition);
            if (rule == null) {
                save(journal.put("creationAttempted", true));
                String id = system.create(condition);
                if (id == null || id.isEmpty()) throw new IllegalStateException("系统未创建声音规则");
                journal.put("ruleId", id);
                save(journal);
                rule = system.read(id, condition);
            }
            if (rule == null) throw new IllegalStateException("系统无法读取刚创建的声音规则");
            journal.put("ruleId", rule.id).put("fingerprint", rule.fingerprint);
            save(journal);
            if (!rule.original) throw new IllegalStateException("声音规则不符合默认范围，未请求激活；可撤销本应用规则");
            // The journal exists before the system can apply an effect.
            save(journal.put("phase", "requested").put("applied", true));
            system.activate(rule.id, condition);
            save(journal.put("applied", true).put("phase", "requested").put("error", JSONObject.NULL));
        } catch (RuntimeException error) {
            save(journal.put("phase", "error").put("error", message(error)));
        }
    }

    private boolean release(JSONObject journal) throws JSONException {
        if (journal.optString("condition").isEmpty()) return true;
        try {
            if (!journal.optBoolean("creationAttempted") && !journal.has("ruleId")) {
                journal.remove("condition");
                save(journal.put("phase", "restored").put("requested", false).put("error", JSONObject.NULL));
                return true;
            }
            if (!system.supported()) throw new IllegalStateException("系统无法读取待恢复的声音规则");
            if (!system.permissionGranted()) throw new IllegalStateException("需要勿扰授权才能核实并撤销小猫规则");
            String condition = journal.getString("condition");
            DndSystem.Rule rule = journal.optString("ruleId").isEmpty()
                ? system.find(condition) : system.read(journal.getString("ruleId"), condition);
            if (rule != null) {
                if (!rule.condition.equals(condition)
                    || (journal.has("fingerprint") ? !journal.getString("fingerprint").equals(rule.fingerprint) : !rule.original))
                    throw new IllegalStateException("声音规则已有后续修改；已保留，请在系统勿扰设置中处理");
                if (!system.remove(rule.id) || system.read(rule.id, condition) != null)
                    throw new IllegalStateException("系统未确认移除小猫声音规则，请重试");
            }
            journal.remove("condition"); journal.remove("ruleId"); journal.remove("fingerprint");
            save(journal.put("phase", "restored").put("requested", false).put("error", JSONObject.NULL));
            return true;
        } catch (RuntimeException error) {
            save(journal.put("phase", "restoration_failed").put("error", message(error)));
            return false;
        }
    }

    JSONObject restore(JSONObject active) throws JSONException {
        JSONObject journal = journal();
        if (active != null && active.optBoolean("dndRequested")) {
            if (!journal.has("condition")) journal.put("sessionId", active.optString("id"));
            journal.put("withdrawn", true);
            save(journal);
        }
        release(journal);
        return observe(active);
    }

    /** Reads Android and journal state only; no rule, preference or timing writes. */
    JSONObject observe(JSONObject active) throws JSONException {
        JSONObject journal = journal();
        boolean supported = system.supported(), granted = system.permissionGranted();
        String phase = journal.optString("phase", "off"), error = journal.optString("error", "");
        boolean requested = active != null && active.optBoolean("dndRequested");
        boolean sameRound = requested && active.optString("id").equals(journal.optString("sessionId"));
        Boolean ruleActive = null;
        boolean enabled = false;
        try {
            if (!supported) phase = "unsupported";
            else if (!granted && (requested || journal.has("condition"))) phase = journal.optString("phase").equals("restoration_failed") ? "restoration_failed" : "permission_required";
            else if (journal.optBoolean("withdrawn") && !journal.has("condition")) phase = sameRound ? "withdrawn" : "restored";
            else if (journal.has("ruleId")) {
                DndSystem.Rule rule = system.read(journal.getString("ruleId"), journal.getString("condition"));
                if (rule == null) phase = "missing";
                else {
                    enabled = rule.enabled; ruleActive = rule.active;
                    if (!rule.enabled) phase = "user_disabled";
                    else if (!rule.original || !journal.optString("fingerprint").equals(rule.fingerprint)) phase = "user_modified";
                    else if (Boolean.TRUE.equals(rule.active)) phase = "active";
                    else if (Boolean.FALSE.equals(rule.active) && journal.optBoolean("applied")) phase = "inactive";
                    else if (journal.optBoolean("applied")) phase = "requested";
                }
            }
            if (journal.optString("phase").equals("restoration_failed")) phase = "restoration_failed";
        } catch (RuntimeException failure) { phase = "error"; error = message(failure); }
        int globalFilter = 0;
        try { globalFilter = system.globalFilter(); } catch (RuntimeException failure) { error = message(failure); }
        return new JSONObject().put("supported", supported).put("permissionGranted", granted)
            .put("requested", requested).put("phase", phase)
            .put("sessionId", journal.optString("sessionId")).put("ruleEnabled", enabled)
            .put("ruleActive", ruleActive == null ? JSONObject.NULL : ruleActive)
            .put("verified", ruleActive != null).put("globalFilter", globalFilter)
            .put("recoveryPending", journal.has("condition") && (!requested || journal.optBoolean("withdrawn") || phase.equals("restoration_failed")))
            .put("error", error.equals("null") ? "" : error);
    }

    private static String message(RuntimeException error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }
}
