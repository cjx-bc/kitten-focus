package com.xiaomao.focus;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;

/** Runtime restoration duties, deliberately outside business data and upgrade backups. */
final class FocusRecovery {
    static final String APPLICATIONS = "applicationRestriction";
    static final String DISMISS_BLOCK = "com.xiaomao.focus.DISMISS_RECOVERED_BLOCK";
    interface DeviceEffects { void releaseApplicationRestriction() throws Exception; }
    /** Adapters keep their own original-state journal; preview must be read-only. */
    interface RecoveryOperation {
        JSONObject preview() throws JSONException;
        void restore() throws JSONException;
    }
    private final SharedPreferences journal;
    private final DeviceEffects effects;
    private final List<RecoveryOperation> operations = new ArrayList<>();

    FocusRecovery(Context context, LocalStore store) {
        this(context, store, () -> context.sendBroadcast(new Intent(DISMISS_BLOCK).setPackage(context.getPackageName())));
    }
    FocusRecovery(Context context, LocalStore store, DeviceEffects effects) {
        journal = context.getSharedPreferences("catfocus-recovery-" + store.getDatabaseName(), Context.MODE_PRIVATE);
        this.effects = effects;
    }
    void register(RecoveryOperation operation) { operations.add(operation); }
    private JSONObject read() throws JSONException {
        String raw = journal.getString("duties", null);
        return raw == null ? new JSONObject().put("revision", "").put("steps", new JSONArray()) : new JSONObject(raw);
    }
    private void write(JSONObject value) throws JSONException {
        value.put("revision", UUID.randomUUID().toString());
        if (!journal.edit().putString("duties", value.toString()).commit())
            throw new IllegalStateException("无法保存恢复责任；没有执行新的系统更改，请重试");
    }
    void prepare(JSONObject session) throws JSONException {
        JSONObject protection = session.optJSONObject("protection");
        if (protection == null || !protection.optBoolean("study")) return;
        JSONObject value = read(); JSONArray steps = value.getJSONArray("steps");
        for (int i = 0; i < steps.length(); i++) {
            JSONObject step = steps.getJSONObject(i);
            if (step.optString("capability").equals(APPLICATIONS) && !step.optString("status").equals("restored"))
                throw new IllegalStateException("上一轮应用限制仍有待恢复项目，请先进入故障恢复重试");
        }
        // Retain outstanding responsibilities and the current round, not unlimited history.
        JSONArray retained = new JSONArray();
        for (int i = 0; i < steps.length(); i++)
            if (!steps.getJSONObject(i).optString("status").equals("restored")) retained.put(steps.getJSONObject(i));
        retained.put(new JSONObject().put("sessionId", session.getString("id")).put("capability", APPLICATIONS)
            .put("title", "应用使用限制").put("status", "active").put("withdrawn", false)
            .put("reason", "撤销本轮应用限制；计时、严格规则和保存的白名单继续保留"));
        write(value.put("steps", retained));
    }
    boolean withdrawn(String sessionId, String capability) throws JSONException {
        JSONArray steps = read().getJSONArray("steps");
        for (int i = 0; i < steps.length(); i++) {
            JSONObject step = steps.getJSONObject(i);
            if (step.optString("sessionId").equals(sessionId) && step.optString("capability").equals(capability)
                && step.optBoolean("withdrawn")) return true;
        }
        return false;
    }
    JSONObject preview() throws JSONException {
        JSONObject value = read(); JSONArray steps = value.getJSONArray("steps"); boolean pending = false;
        JSONArray adapterSteps = new JSONArray();
        for (RecoveryOperation operation : operations) {
            JSONObject step = operation.preview();
            if (step != null) { adapterSteps.put(step); steps.put(step); }
        }
        // Bind confirmation to both the coordinator journal and adapter-owned responsibilities.
        value.put("revision", new JSONArray().put(value.optString("revision")).put(adapterSteps).toString());
        for (int i = 0; i < steps.length(); i++) {
            JSONObject step = steps.getJSONObject(i);
            boolean retryable = !step.optString("status").equals("restored");
            step.put("retryable", retryable); pending |= retryable;
        }
        return value.put("supported", true).put("pending", pending);
    }
    JSONObject confirm(String revision) throws JSONException {
        JSONObject value = read();
        JSONObject before = preview();
        if (!before.optString("revision").equals(revision) && before.optBoolean("pending"))
            throw new IllegalStateException("恢复项目已变化，请重新查看影响清单后确认");
        restore(value, null);
        for (RecoveryOperation operation : operations) {
            JSONObject step = operation.preview();
            if (step != null && !step.optString("status").equals("restored")) operation.restore();
        }
        return preview();
    }
    /** Only lifecycle work invokes automatic release; observe/preview never mutate. */
    void releaseFinished(String activeId) throws JSONException { restore(read(), activeId == null ? "" : activeId); }
    private void restore(JSONObject value, String keepActiveId) throws JSONException {
        JSONArray steps = value.getJSONArray("steps");
        for (int i = 0; i < steps.length(); i++) {
            JSONObject step = steps.getJSONObject(i);
            if (step.optString("status").equals("restored")
                || keepActiveId != null && !step.optString("status").equals("active")
                || keepActiveId != null && step.optString("sessionId").equals(keepActiveId)) continue;
            // Persist the user's withdrawal before changing any effect. Rebind must honor this even after a crash.
            step.put("withdrawn", true); write(value);
            try {
                if (step.optString("capability").equals(APPLICATIONS)) effects.releaseApplicationRestriction();
                else throw new UnsupportedOperationException("此版本无法恢复该项目，请更新后重试");
                step.put("status", "restored").put("reason", "已撤销本轮应用限制；计时和偏好保留");
            } catch (UnsupportedOperationException limited) {
                step.put("status", "limited").put("reason", limited.getMessage());
            } catch (Exception error) {
                step.put("status", "failed").put("reason", "恢复未完成（" + error.getClass().getSimpleName() + "），请重试");
            }
            write(value);
        }
    }
}
