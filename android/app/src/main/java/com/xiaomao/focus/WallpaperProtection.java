package com.xiaomao.focus;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.UUID;

/** One private original-state journal, exposed through the shared recovery adapter. */
final class WallpaperProtection {
    static final String KEY = "wallpaperProtection";
    private final SharedPreferences preferences;
    private final WallpaperSystem system;
    private final SessionClock clock;
    WallpaperProtection(Context context, String database, SessionClock clock, WallpaperSystem system) {
        preferences = context.getSharedPreferences("catfocus-wallpaper-" + database, Context.MODE_PRIVATE);
        this.system = system; this.clock = clock;
    }
    static boolean requested(JSONObject session) {
        JSONObject protection = session == null ? null : session.optJSONObject("protection");
        JSONArray values = protection == null ? null : protection.optJSONArray("enhancements");
        if (values != null) for (int i = 0; i < values.length(); i++) if (KEY.equals(values.optString(i))) return true;
        return false;
    }
    private JSONObject journal() throws JSONException { return new JSONObject(preferences.getString("journal", "{}")); }
    private void save(JSONObject value) {
        if (!preferences.edit().putString("journal", value.toString()).commit())
            throw new IllegalStateException("无法保存壁纸原状态与恢复责任，未继续修改系统壁纸");
    }
    private static boolean sameHome(JSONObject a, JSONObject b) {
        return a != null && b != null && a.optInt("homeId", -1) >= 0 && a.optInt("homeId") == b.optInt("homeId")
            && a.optString("component").equals(b.optString("component"));
    }
    private static boolean sameLock(JSONObject a, JSONObject b) {
        return a != null && b != null && a.optInt("lockId", -1) == b.optInt("lockId", -1)
            && a.optString("lockComponent").equals(b.optString("lockComponent"));
    }
    private boolean selected(JSONObject current) { return system.ownComponent().equals(current.optString("component")); }
    private boolean selectedLock(JSONObject current) { return system.ownComponent().equals(current.optString("lockComponent")); }
    private boolean round(JSONObject active, JSONObject value) {
        if (!requested(active) || active.optInt("bootId") != clock.boot()
            || !active.optString("id").equals(value.optString("sessionId"))) return false;
        long elapsed = active.optLong("elapsedMs") + (active.optString("state").equals("running")
            ? Math.max(0, clock.mono() - active.optLong("anchorMono")) : 0);
        return !active.optString("mode").equals("countdown") || elapsed < active.optLong("targetMs");
    }
    void engineCreated(boolean preview) throws JSONException {
        JSONObject value = journal();
        if (value.has("sessionId")) save(value.put("preview", preview));
    }
    void previewDestroyed() throws JSONException {
        JSONObject value = journal();
        if (value.optBoolean("preview")) save(value.put("preview", false));
    }
    void importOriginal(String uri, boolean lock) throws JSONException {
        JSONObject value = journal();
        if (value.optBoolean("pending") || value.optBoolean("pickerOpen")) throw new IllegalStateException("请先完成本轮壁纸恢复，再更换原图来源");
        String field = lock ? "lockSource" : "homeSource";
        // Invalidate the old source receipt before replacing its bounded private file.
        value.remove(field); value.remove(field + "Identity");
        save(value.put("prepared", false));
        try {
            JSONObject before = system.current(); String source = system.importOriginal(uri, lock);
            JSONObject after = system.current();
            if (!sameHome(before, after) || !sameLock(before, after))
                throw new IllegalStateException("选择图片期间壁纸已变化，请重新提供与当前原壁纸匹配的图片");
            save(value.put(field, source).put(field + "Identity", before).put("phase", "off").put("error", "原图已私有保存，还需确认它与当前原壁纸匹配"));
        } catch (JSONException error) { throw error; }
        catch (Exception error) { throw new IllegalStateException(message(error), error); }
    }
    private boolean sourceMatches(JSONObject value, String field, JSONObject original) {
        JSONObject identity = value.optJSONObject(field + "Identity");
        return sameHome(identity, original) && sameLock(identity, original) && system.sourceAvailable(value.optString(field));
    }
    void prepare(boolean limitsAccepted, boolean originalMatches) throws JSONException {
        JSONObject old = journal();
        if (old.optBoolean("pending") || old.optBoolean("pickerOpen")) throw new IllegalStateException("上一轮壁纸或系统选择器仍待处理，请先关闭选择器并重试恢复");
        if (!limitsAccepted || !originalMatches) throw new IllegalStateException("请先确认原状态及裁剪、动态壁纸设置和系统确认限制");
        if (!system.supported()) throw new IllegalStateException("本机不支持设置动态壁纸或系统策略禁止修改");
        try {
            JSONObject original = system.current();
            if (original.optInt("homeId", -1) < 0 || selected(original) || selectedLock(original))
                throw new IllegalStateException("无法取得可追踪的原壁纸；请先在系统中恢复原壁纸");
            boolean staticHome = original.optString("component").isEmpty();
            if (staticHome && !sourceMatches(old, "homeSource", original))
                throw new IllegalStateException("静态原壁纸需要先通过文件选择器提供匹配原图；Android 13+ 无法读取任意真实原图");
            boolean staticLock = original.optInt("lockId", -1) >= 0 && original.optString("lockComponent").isEmpty();
            boolean sharedSource = staticHome && original.optInt("lockId", -1) == original.optInt("homeId", -2);
            if (staticLock && !sharedSource && !sourceMatches(old, "lockSource", original))
                throw new IllegalStateException("当前锁屏另有静态原图，请提供匹配的锁屏原图后再确认");
            JSONObject value = new JSONObject().put("original", original).put("prepared", true).put("pending", false)
                .put("phase", "baseline_ready").put("error", "")
                .put("homeSource", old.optString("homeSource")).put("lockSource", sharedSource ? old.optString("homeSource") : old.optString("lockSource"))
                .put("homeSourceIdentity", old.optJSONObject("homeSourceIdentity"))
                .put("lockSourceIdentity", sharedSource ? old.optJSONObject("homeSourceIdentity") : old.optJSONObject("lockSourceIdentity"));
            save(value);
        } catch (JSONException error) { throw error; }
        catch (Exception error) { throw new IllegalStateException(message(error), error); }
    }
    void checkStart(JSONObject active) throws JSONException {
        if (!requested(active)) return;
        JSONObject value = journal();
        if (value.optBoolean("pending") || value.optBoolean("pickerOpen")) throw new IllegalStateException("上一轮壁纸或系统选择器仍待处理，不能覆盖旧恢复责任");
        if (!value.optBoolean("prepared")) throw new IllegalStateException("请先在提升强制性选项中保存可恢复的原壁纸并确认限制");
        try {
            JSONObject original = value.getJSONObject("original"), current = system.current();
            if (!sameHome(original, current) || !sameLock(original, current))
                throw new IllegalStateException("壁纸已变化，请重新确认本轮原壁纸；没有打开选择器");
            if (original.optString("component").isEmpty() && !system.sourceAvailable(value.optString("homeSource")))
                throw new IllegalStateException("私有原图已不可用，未启动壁纸保护；请重新提供原图");
            if (original.optInt("lockId", -1) >= 0 && original.optString("lockComponent").isEmpty()
                && !system.sourceAvailable(value.optString("lockSource")))
                throw new IllegalStateException("私有锁屏原图已不可用，未启动壁纸保护；请重新提供原图");
        } catch (JSONException error) { throw error; }
        catch (Exception error) { throw new IllegalStateException(message(error), error); }
    }
    void synchronize(JSONObject active) throws JSONException {
        JSONObject value = journal();
        if (!round(active, value)) {
            if (value.optBoolean("pending")) { restore(active); return; }
            if (!requested(active) || active.optInt("bootId") != clock.boot()) return;
            // Admission checked the exact original. Freeze it before any picker launch.
            value.put("sessionId", active.optString("id")).put("bootId", clock.boot()).put("pending", true)
                .put("withdrawn", false).put("prepared", false).put("phase", "requested");
            value.remove("owned"); save(value);
            open(value, system.ownComponent(), false);
            return;
        }
        if (value.optBoolean("withdrawn")) { if (value.optBoolean("pending")) restore(active); return; }
        try {
            JSONObject current = system.current(), owned = value.optJSONObject("owned");
            if (selected(current) && owned == null && value.optString("phase").equals("requested")) {
                save(value.put("owned", current).put("phase", "active").put("error", ""));
            } else if (owned != null && (!sameHome(owned, current) || selectedLock(current) && !sameLock(owned, current))) {
                restore(active);
            }
        } catch (Exception error) { save(value.put("error", message(error)).put("phase", "failed")); }
    }
    private void open(JSONObject value, String component, boolean original) throws JSONException {
        if (value.optBoolean("pickerOpen")) throw new IllegalStateException("请先完成或关闭当前系统壁纸选择器");
        String token = UUID.randomUUID().toString();
        save(value.put("pickerOpen", true).put("pickerToken", token).put("restoringOriginal", original).put("phase", original ? "recovery_pending" : "requested"));
        try { system.openPicker(component, token); }
        catch (Exception error) {
            value.put("pickerOpen", false).put("error", message(error));
            if (!original) value.put("pending", false).put("withdrawn", true).put("phase", "declined");
            else value.put("phase", "restoration_failed");
            save(value);
        }
    }
    void requestPicker(JSONObject active, boolean original) throws JSONException {
        JSONObject value = journal();
        if (original) {
            restore(active); value = journal();
            if (!value.optBoolean("pending")) return;
            JSONObject current;
            try { current = system.current(); } catch (Exception error) { throw new IllegalStateException(message(error)); }
            if (value.getJSONObject("original").optString("component").isEmpty())
                throw new IllegalStateException("静态原图恢复未完成，请在故障恢复中重试或前往系统壁纸设置修复");
            if ((!selected(current) || !sameHome(value.optJSONObject("owned"), current))
                && !value.getJSONObject("original").optString("component").equals(current.optString("component")))
                throw new IllegalStateException("主屏已有后续选择，不能用原动态壁纸覆盖；请在系统壁纸设置恢复仍受影响的锁屏");
            open(value, value.getJSONObject("original").getString("component"), true);
        } else {
            if (!round(active, value) || value.optBoolean("withdrawn"))
                throw new IllegalStateException("本轮未请求壁纸辅助或已撤销，请在下一轮重新选择");
            if (!value.optString("phase").equals("requested")) throw new IllegalStateException("本轮已处理壁纸选择，请查看实际状态");
            open(value, system.ownComponent(), false);
        }
    }
    void pickerReturned(JSONObject active, String token) throws JSONException {
        JSONObject value = journal();
        if (!value.optBoolean("pickerOpen") || token == null || !token.equals(value.optString("pickerToken"))) return;
        value.put("pickerOpen", false).put("preview", false); save(value);
        try {
            JSONObject current = system.current();
            if (value.optBoolean("restoringOriginal")) {
                restore(active); return;
            }
            if (selected(current)) {
                save(value.put("owned", current).put("phase", "active").put("pending", true).put("error", ""));
                if (!round(active, value) || value.optBoolean("withdrawn")) restore(active);
            } else if (selectedLock(current)) {
                save(value.put("owned", current).put("withdrawn", true).put("phase", "recovery_pending")
                    .put("error", "只选择了锁屏，主屏辅助未启用；请在系统壁纸设置恢复锁屏"));
            } else save(value.put("pending", false).put("withdrawn", true).put("phase", "declined").put("error", "系统未选择小猫壁纸，原状态保持"));
        } catch (Exception error) { save(value.put("phase", "failed").put("error", message(error))); }
    }
    void restore(JSONObject active) throws JSONException {
        JSONObject value = journal();
        if (!value.has("sessionId")) return;
        save(value.put("withdrawn", true));
        if (!value.optBoolean("pending")) return;
        try {
            JSONObject current = system.current(), original = value.getJSONObject("original");
            JSONObject owned = value.optJSONObject("owned");
            if (owned == null && value.optBoolean("pickerOpen") && !selected(current) && !selectedLock(current)) {
                save(value.put("phase", "recovery_pending").put("error", "系统选择器尚未返回，恢复责任保留；请关闭选择器后重试"));
                return;
            }
            if (owned == null && (value.optString("phase").equals("requested")
                || value.optBoolean("pickerOpen") && !value.optBoolean("restoringOriginal"))
                && (selected(current) || selectedLock(current))) {
                owned = current; value.put("owned", current); save(value);
            }
            boolean homeOwned = owned != null && sameHome(owned, current) && selected(current);
            boolean lockOwned = owned != null && sameLock(owned, current) && selectedLock(current);
            if (value.optBoolean("restoreAttempted") && (!sameHome(owned, current) || !sameLock(owned, current)))
                value.put("uncertain", true);
            if (value.optBoolean("uncertain")) {
                save(value.put("phase", "restoration_failed").put("error", "此前恢复写入可能部分成功；当前壁纸保持，请在系统中核对后明确确认手动恢复")); return;
            }
            if (!homeOwned && !lockOwned) {
                // A completed original picker is observed, never inferred from its RESULT_OK.
                boolean originalComponent = !original.optString("component").isEmpty()
                    && original.optString("component").equals(current.optString("component"));
                boolean awaiting = value.optBoolean("pickerOpen");
                save(value.put("pending", awaiting).put("phase", awaiting ? "recovery_pending" : originalComponent ? "restored" : "user_choice_preserved")
                    .put("error", originalComponent ? "原动态组件已观察到；私有设置与裁剪不能保证，请核对" : "保留用户后续壁纸选择，未执行覆盖"));
                return;
            }
            boolean staticHome = original.optString("component").isEmpty();
            boolean lockChanged = owned != null && !sameLock(original, owned);
            boolean restoreLock = lockChanged && sameLock(owned, current) && original.optString("lockComponent").isEmpty()
                && (staticHome || !homeOwned && original.optString("component").equals(current.optString("component")));
            if (staticHome && homeOwned || restoreLock && lockOwned) {
                if (staticHome && homeOwned && !system.sourceAvailable(value.optString("homeSource")))
                    throw new IllegalStateException("已保存的原图不可用，恢复责任保留，请手动恢复后核对");
                if (restoreLock && original.optInt("lockId", -1) >= 0 && !system.sourceAvailable(value.optString("lockSource")))
                    throw new IllegalStateException("已保存的锁屏原图不可用，恢复责任保留");
                save(value.put("restoreAttempted", true));
                system.restoreStatic(original, value.optString("homeSource"), value.optString("lockSource"), staticHome && homeOwned, restoreLock);
                JSONObject after = system.current();
                if (staticHome && homeOwned && (selected(after) || !after.optString("component").isEmpty() || after.optInt("homeId") == current.optInt("homeId")))
                    throw new IllegalStateException("静态原图写入后未观察到正确主屏身份，恢复未核验");
                value.put("restoreAttempted", false);
                boolean ownHomeRemains = sameHome(owned, after) && selected(after);
                // A sequential write may change the still-owned lock ID. Never clear its duty
                // merely because our own Home write changed that identity before lock cleanup.
                boolean ownLockRemains = lockOwned && selectedLock(after);
                if (ownLockRemains) {
                    owned.put("lockId", after.optInt("lockId", -1)).put("lockComponent", after.optString("lockComponent"));
                    value.put("owned", owned);
                }
                if (!ownHomeRemains && !ownLockRemains) {
                    boolean awaiting = value.optBoolean("pickerOpen");
                    save(value.put("pending", awaiting).put("phase", awaiting ? "recovery_pending" : "restored")
                        .put("error", awaiting ? "原图已写回，系统选择器尚未返回；可能的后续选择仍由本轮负责，请完成或关闭选择器"
                            : "所提供原图已写回；后续锁屏选择保留。原裁剪、偏移与显示仍需核对")); return;
                }
            }
            save(value.put("phase", "recovery_pending").put("error", homeOwned
                ? "原动态壁纸需要再次打开系统选择器并确认；恢复责任保留，私有设置和裁剪无法导出"
                : "主屏后续选择已保留；仍需在系统壁纸设置恢复小猫锁屏"));
        } catch (Exception error) {
            if (value.optBoolean("restoreAttempted")) try {
                JSONObject afterFailure = system.current(), owned = value.optJSONObject("owned");
                if (!sameHome(owned, afterFailure) || !sameLock(owned, afterFailure)) value.put("uncertain", true);
            } catch (Exception unreadable) { value.put("uncertain", true); }
            save(value.put("phase", "restoration_failed").put("error", message(error)));
        }
    }
    void confirmManualRecovery(boolean acknowledged) throws JSONException {
        if (!acknowledged) throw new IllegalStateException("请先在系统中核对原状态，再确认手动恢复");
        JSONObject value = journal();
        if (value.optBoolean("pickerOpen")) throw new IllegalStateException("请先完成或关闭本轮系统选择器，不能确认仍可能产生变更的恢复");
        try {
            JSONObject current = system.current(), owned = value.optJSONObject("owned");
            if (sameHome(owned, current) && selected(current) || sameLock(owned, current) && selectedLock(current))
                throw new IllegalStateException("仍观察到本轮小猫壁纸，请先恢复受影响的主屏或锁屏");
            save(value.put("pending", false).put("withdrawn", true).put("uncertain", false).put("phase", "restored")
                .put("error", "用户已明确核对手动恢复；裁剪和私有设置未经自动核验"));
        } catch (JSONException error) { throw error; }
        catch (Exception error) { throw new IllegalStateException(message(error), error); }
    }
    JSONObject observe(JSONObject active) throws JSONException {
        JSONObject value = journal(), current = new JSONObject(); String phase = value.optString("phase", "off"), error = value.optString("error");
        boolean selected = false, lockSelected = false;
        try { current = system.current(); selected = selected(current); lockSelected = selectedLock(current); }
        catch (Exception failure) { error = message(failure); phase = "failed"; }
        boolean verified = round(active, value) && !value.optBoolean("withdrawn") && selected
            && sameHome(value.optJSONObject("owned"), current) && phase.equals("active");
        if (phase.equals("active") && !verified) {
            phase = "failed"; error = "本轮会话或实际壁纸身份已变化，辅助未核验；请协调恢复，当前后续选择保持";
        }
        if (phase.equals("requested") && value.optBoolean("preview") && !selected) phase = "picker_preview";
        return new JSONObject().put("supported", system.supported()).put("requested", requested(active))
            .put("phase", phase).put("selected", selected).put("lockSelected", lockSelected)
            .put("active", verified).put("verified", verified).put("current", current)
            .put("prepared", value.optBoolean("prepared")).put("pickerOpen", value.optBoolean("pickerOpen"))
            .put("preview", value.optBoolean("preview"))
            .put("recoveryPending", value.optBoolean("pending") && !verified)
            .put("withdrawn", value.optBoolean("withdrawn")).put("error", error)
            .put("homeSourceAvailable", system.sourceAvailable(value.optString("homeSource")))
            .put("lockSourceAvailable", system.sourceAvailable(value.optString("lockSource")))
            .put("manualConfirmationRequired", value.optBoolean("uncertain"))
            .put("forceStopImmune", false).put("cropVerified", false).put("providerSettingsVerified", false);
    }
    JSONObject recoveryStep(JSONObject active) throws JSONException {
        JSONObject value = journal(); if (!value.has("sessionId")) return null;
        boolean pending = value.optBoolean("pending"), current = round(active, value) && !value.optBoolean("withdrawn");
        return new JSONObject().put("sessionId", value.optString("sessionId")).put("capability", KEY).put("title", "壁纸辅助与原状态")
            .put("status", pending && value.optString("phase").equals("restoration_failed") ? "failed" : pending && value.optBoolean("withdrawn") ? "limited" : pending || current ? "active" : "restored")
            .put("withdrawn", value.optBoolean("withdrawn")).put("reason", pending
                ? "撤销本轮壁纸辅助并恢复原状态；动态原组件需系统确认。" + value.optString("error")
                : "本轮壁纸责任已解决；裁剪和第三方私有设置需要用户核对");
    }
    private static String message(Exception error) { return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(); }
}
