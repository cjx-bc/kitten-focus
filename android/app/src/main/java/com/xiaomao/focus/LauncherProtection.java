package com.xiaomao.focus;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Private durable restoration duty; journal commits always precede component mutations. */
final class LauncherProtection {
    static final String KEY = "launcherIconHidden";
    private static final int DISABLED = PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
    private final SharedPreferences preferences;
    private final LauncherSystem system;
    private final SessionClock clock;
    LauncherProtection(Context context, String database, SessionClock clock, LauncherSystem system) {
        preferences = context.getSharedPreferences("catfocus-launcher-" + database, Context.MODE_PRIVATE);
        this.clock = clock; this.system = system;
    }
    static boolean requested(JSONObject active) {
        JSONObject protection = active == null ? null : active.optJSONObject("protection");
        JSONArray keys = protection == null ? null : protection.optJSONArray("enhancements");
        if (keys != null) for (int i = 0; i < keys.length(); i++) if (KEY.equals(keys.optString(i))) return true;
        return false;
    }
    private JSONObject journal() throws JSONException { return new JSONObject(preferences.getString("journal", "{}")); }
    private void save(JSONObject value) {
        if (!preferences.edit().putString("journal", value.toString()).commit())
            throw new IllegalStateException("???????????????????");
    }
    void checkStart(JSONObject active) throws JSONException {
        if (!requested(active)) return;
        if (journal().optBoolean("pending")) throw new IllegalStateException("??????????????????????");
        if (!system.recoveryAvailable()) throw new IllegalStateException("????????????????????????????");
    }
    void synchronize(JSONObject active) throws JSONException {
        JSONObject value = journal();
        boolean current = requested(active) && active.optInt("bootId") == clock.boot();
        if (!current || !value.optString("sessionId").equals(active.optString("id"))) {
            if (!release(value)) return;
            if (!current) return;
            value = new JSONObject().put("sessionId", active.optString("id")).put("bootId", clock.boot())
                .put("version", system.installedVersion()).put("phase", "ready").put("withdrawn", false).put("pending", false);
            save(value);
        }
        if (value.optBoolean("withdrawn")) { release(value); return; }
        try {
            if (value.optLong("version") != system.installedVersion()) {
                save(value.put("withdrawn", true).put("error", "?????????????????")); release(value); return;
            }
            if (!system.recoveryReachable()) {
                save(value.put("withdrawn", true).put("error", "??????????????????????????")); release(value); return;
            }
            int state = system.componentState();
            if (value.optBoolean("applied") && state != DISABLED) {
                save(value.put("pending", false).put("withdrawn", true).put("error", "?????????????????????")); release(value); return;
            }
            if (!value.has("original")) { value.put("original", state); save(value); }
            if (state != DISABLED) {
                save(value.put("pending", true).put("applied", true));
                system.componentState(DISABLED);
            }
            if (system.componentState() != DISABLED || system.launcherVisible()) throw new IllegalStateException("?????????????????");
            save(value.put("phase", "active").put("error", ""));
        } catch (RuntimeException failure) {
            save(value.put("withdrawn", true).put("error", message(failure))); release(value);
        }
    }
    private boolean release(JSONObject value) throws JSONException {
        if (value.optBoolean("pending")) {
            try {
                int state = system.componentState();
                // A subsequent user/system component choice is never overwritten.
                if (state == DISABLED) system.componentState(value.getInt("original"));
                if (system.componentState() == DISABLED && value.getInt("original") != DISABLED)
                    throw new IllegalStateException("??????????????");
                value.put("pending", false);
            } catch (RuntimeException failure) {
                save(value.put("phase", "restoration_failed").put("error", message(failure))); return false;
            }
        }
        if (!value.optString("sessionId").isEmpty()) save(value.put("phase", value.optBoolean("withdrawn") ? "withdrawn" : "restored"));
        return true;
    }
    void restore(JSONObject active) throws JSONException {
        JSONObject value = journal();
        if (requested(active)) {
            if (value.optString("sessionId").isEmpty()) value.put("sessionId", active.optString("id"));
            save(value.put("withdrawn", true));
        }
        release(value);
    }
    JSONObject observe(JSONObject active) throws JSONException {
        JSONObject value = journal(); String phase = value.optString("phase", "off"), error = value.optString("error");
        boolean verified = false, visible = false, available = false, reachable = false;
        int state = -1;
        try {
            state = system.componentState(); visible = system.launcherVisible();
            available = system.recoveryAvailable(); reachable = system.recoveryReachable();
            verified = phase.equals("active") && state == DISABLED && !visible && reachable;
            if (phase.equals("active") && !verified) { phase = "failed"; error = "??????????????????????????"; }
        } catch (RuntimeException failure) { phase = "failed"; error = message(failure); }
        return new JSONObject().put("supported", true).put("requested", requested(active)).put("phase", phase)
            .put("active", verified).put("verified", verified).put("recoveryAvailable", available).put("recoveryReachable", reachable)
            .put("componentState", state).put("launcherResolved", visible).put("launcherCacheVerified", false)
            .put("error", error).put("recoveryPending", value.optBoolean("pending") && (!requested(active) || value.optBoolean("withdrawn") || !verified));
    }
    JSONObject recoveryStep(JSONObject active) throws JSONException {
        JSONObject value = journal(); if (value.optString("sessionId").isEmpty()) return null;
        boolean pending = value.optBoolean("pending"), round = requested(active) && active.optString("id").equals(value.optString("sessionId")) && !value.optBoolean("withdrawn");
        return new JSONObject().put("sessionId", value.optString("sessionId")).put("capability", KEY).put("title", "????????")
            .put("status", pending && value.optString("phase").equals("restoration_failed") ? "failed" : pending || round ? "active" : "restored")
            .put("withdrawn", value.optBoolean("withdrawn"))
            .put("reason", pending || round ? "????????????????????????????????????" : "???????????????????????????????????");
    }
    private static String message(RuntimeException failure) { return failure.getMessage() == null ? failure.getClass().getSimpleName() : failure.getMessage(); }
}
