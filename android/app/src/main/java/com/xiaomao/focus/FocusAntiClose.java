package com.xiaomao.focus;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import org.json.JSONException;

/** One original bounded executor. No installed admin, owner provisioning or uninstall policy. */
final class FocusAntiClose {
    static final String OPTION = "preciseAntiClose";
    static final String STRICT_SETTINGS_OPTION = "strictSettingsGuard";
    private final Context context;
    private final LocalStore store;
    private final SessionClock clock;
    private final AntiCloseSystem system;
    private final SharedPreferences runtime;
    FocusAntiClose(Context context, LocalStore store, SessionClock clock, AntiCloseSystem system) {
        this.context = context; this.store = store; this.clock = clock; this.system = system;
        runtime = context.getSharedPreferences("catfocus-anti-close-" + store.getDatabaseName(), Context.MODE_PRIVATE);
    }
    static boolean requested(JSONObject policy) { return FocusProtection.enhancementRequested(policy, OPTION); }
    static boolean strictSettingsRequested(JSONObject policy) { return FocusProtection.enhancementRequested(policy, STRICT_SETTINGS_OPTION); }
    void checkStart(JSONObject session) {
        JSONObject policy = session.optJSONObject("protection");
        if ((requested(policy) || strictSettingsRequested(policy)) && (!system.authorized() || !system.connected()))
            throw new IllegalStateException("精确防关闭待授权：请启用无障碍并等待连接；普通授权不能保证无法强停或卸载");
    }
    private boolean eligible(JSONObject observation, JSONObject session) {
        JSONObject policy = session == null ? null : session.optJSONObject("protection");
        return (requested(policy) || strictSettingsRequested(policy)) && !policy.optBoolean("antiCloseWithdrawn") && !observation.optBoolean("needsReconcile")
            && system.authorized() && system.connected();
    }
    boolean window(JSONObject observation, String pkg, String cls) throws JSONException {
        JSONObject session = ControlSession.from(observation);
        if (!eligible(observation, session)) return false;
        String id = session.optString("id"); boolean same = id.equals(runtime.getString("sessionId", ""));
        long now = clock.mono(), pending = same ? runtime.getLong("pendingUntil", 0) : 0;
        if (context.getPackageName().equals(pkg) && "com.xiaomao.focus.MainActivity".equals(cls) && pending > 0) {
            SharedPreferences.Editor edit = runtime.edit().putLong("pendingUntil", 0).putString("failure", "");
            if (now <= pending) edit.putLong("returnedAt", clock.epoch());
            else edit.putLong("returnedAt", 0);
            write(edit);
            return false;
        }
        if (!system.systemSurface(pkg) || FocusProtection.settingsAuthorizationAllowed(pkg)) return false;
        JSONObject policy = session.optJSONObject("protection");
        boolean strictSession = session.optBoolean("strictMode") && ("countdown".equals(session.optString("mode")) || LockEngine.owns(session));
        boolean allowStrictGuard = strictSettingsRequested(policy) && strictSession;
        if (!AntiCloseWindow.candidateClass(cls) && !allowStrictGuard) return false;
        // Dedupe before touching a node tree. No handler retry/event loop and no global Settings block.
        if (same && now - runtime.getLong("attemptMono", 0) < 1500) return true;
        String target = "";
        AntiCloseWindow.Node root = null;
        try { root = system.root(pkg); } catch (RuntimeException ignored) { }
        if (requested(policy)) {
            try { target = AntiCloseWindow.target(pkg, cls, root, context.getPackageName(), system.appLabel()); }
            catch (RuntimeException failure) { target = ""; }
        }
        if (target.isEmpty() && allowStrictGuard) {
            try { target = AntiCloseWindow.strictGuardTarget(pkg, cls, root); }
            catch (RuntimeException failure) { target = ""; }
        }
        if (target.isEmpty()) return false;
        SharedPreferences.Editor edit = runtime.edit(); if (!same) edit.clear();
        write(edit.putString("sessionId", id).putString("target", target).putLong("attemptMono", now)
            .putLong("pendingUntil", now + 3000).putString("failure", ""));
        try { system.returnToFocus(); }
        catch (Exception error) { write(runtime.edit().putLong("pendingUntil", 0).putString("failure", "返回专注失败（" + error.getClass().getSimpleName() + "），可重试或故障恢复")); }
        return true;
    }
    private void write(SharedPreferences.Editor edit) { if (!edit.commit()) throw new IllegalStateException("无法保存防关闭执行状态"); }
    void release() { write(runtime.edit().clear()); }
    JSONObject observe(JSONObject observation) throws JSONException {
        JSONObject session = ControlSession.from(observation), policy = session == null ? null : session.optJSONObject("protection");
        boolean requested = requested(policy), preferred = requested(FocusProtection.preferences(store));
        boolean withdrawn = policy != null && policy.optBoolean("antiCloseWithdrawn");
        boolean same = session != null && session.optString("id").equals(runtime.getString("sessionId", ""));
        long pending = same ? runtime.getLong("pendingUntil", 0) : 0, returned = same ? runtime.getLong("returnedAt", 0) : 0;
        String failure = same ? runtime.getString("failure", "") : "";
        boolean ambiguousLabel = system.appLabel().isEmpty();
        if (pending > 0 && clock.mono() > pending) failure = "已请求返回，但未观察到专注窗口；当前系统入口可能不支持";
        boolean eligible = eligible(observation, session), active = eligible && returned > 0 && pending == 0 && failure.isEmpty();
        String state = withdrawn ? "recovered" : requested && (!system.authorized() || !system.connected() || !failure.isEmpty()) ? "failed"
            : eligible ? active ? "protecting" : ambiguousLabel ? "unsupported" : "armed" : !preferred ? "off" : !system.authorized() || !system.connected() ? "authorization" : ambiguousLabel ? "unsupported" : "ready";
        String reason = withdrawn ? "本轮精确防关闭已撤销；服务重连不会重新启用" : !failure.isEmpty() ? failure
            : requested && (!system.authorized() || !system.connected()) ? "本轮保护失效：请检查无障碍授权及连接"
            : active ? "已观察到从本应用相关设置返回专注；仅提高绕开成本"
            : ambiguousLabel ? "存在同名应用或无法确认唯一名称，已停用名称识别；仅精确包名或服务组件可识别，当前入口支持受限"
            : eligible ? "已就绪，等待可识别的本应用强退、撤权或卸载入口；尚未验证本机实际效果"
            : requested ? "本轮已到期或设备重启，防关闭已停止" : preferred ? "下一轮生效；普通授权无法保证防系统强停或卸载" : "精确防关闭未开启";
        JSONObject identity;
        try { identity = system.identity(); } catch (Exception error) { identity = new JSONObject().put("unknown", true); }
        return new JSONObject().put("supported", true).put("authorized", system.authorized()).put("connected", system.connected())
            .put("requested", requested).put("preferenceEnabled", preferred).put("active", active).put("state", state).put("reason", reason)
            .put("lastReturnedAt", returned > 0 ? returned : JSONObject.NULL).put("lastTarget", same ? runtime.getString("target", "") : JSONObject.NULL)
            .put("identity", identity).put("systemUninstallBlocked", false)
            .put("labelIdentificationLimited", ambiguousLabel)
            .put("policyReason", "当前仅执行普通无障碍返回；普通管理员不等于设备所有者，本版本不调用系统防卸载策略")
            .put("supportScope", "AOSP 已知设置/安装器类与中文/英文动作；其他语言、OEM、系统强停和服务已失联需另行验证");
    }
}
