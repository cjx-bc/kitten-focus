package com.xiaomao.focus;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Original bounded navigation executor. No device-owner or lock-task claim. */
final class FocusNavigation {
    static final String OPTION = "navigationHomeRecents";
    interface Device {
        boolean supported();
        boolean authorized();
        boolean connected();
        String target(String packageName, String className);
        void returnToFocus(String target) throws Exception;
    }
    static Device android(Context context, FocusProtection.AccessibilityState state) {
        return new Device() {
            private Set<String> launchers() {
                Set<String> names = new HashSet<>();
                Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
                for (ResolveInfo info : context.getPackageManager().queryIntentActivities(home, PackageManager.MATCH_DEFAULT_ONLY))
                    names.add(info.activityInfo.packageName);
                return names;
            }
            public boolean supported() { return !launchers().isEmpty(); }
            public boolean authorized() { return state == null ? FocusProtection.authorized(context) : state.authorized(); }
            public boolean connected() { return state == null ? FocusAccessibilityService.connected() : state.connected(); }
            public String target(String pkg, String cls) {
                // A launcher owns Home and, on Quickstep devices, Overview. Restrict only its
                // activity windows; IME, permission dialogs and arbitrary SystemUI stay untouched.
                if (launchers().contains(pkg) && cls != null) {
                    Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
                    for (ResolveInfo info : context.getPackageManager().queryIntentActivities(home, PackageManager.MATCH_DEFAULT_ONLY))
                        if (pkg.equals(info.activityInfo.packageName) && cls.equals(info.activityInfo.name)) return "launcher";
                    if (cls.startsWith(pkg + ".") && (cls.endsWith("RecentsActivity") || cls.endsWith("OverviewActivity"))) return "recents";
                }
                if ("com.android.systemui".equals(pkg) && ("com.android.systemui.recents.RecentsActivity".equals(cls)
                    || "com.android.systemui.recents.tv.RecentsTvActivity".equals(cls))) return "recents";
                return "";
            }
            public void returnToFocus(String target) {
                if (!FocusAccessibilityService.returnToFocus(context, target)) throw new IllegalStateException("无障碍导航执行器未连接");
            }
        };
    }
    private final SharedPreferences runtime;
    private final LocalStore store;
    private final SessionClock clock;
    private final Device device;
    private final String ownPackage;
    FocusNavigation(Context context, LocalStore store, SessionClock clock, Device device) {
        this.store = store; this.clock = clock; this.device = device; ownPackage = context.getPackageName();
        runtime = context.getSharedPreferences("catfocus-navigation-" + store.getDatabaseName(), Context.MODE_PRIVATE);
    }
    void checkStart(JSONObject session) throws JSONException {
        if (!FocusProtection.navigationRequested(session.optJSONObject("protection"))) return;
        if (!device.supported()) throw new IllegalStateException("本设备尚无法识别桌面导航，不能启用此增强");
        if (!device.authorized() || !device.connected()) throw new IllegalStateException("桌面与最近任务限制待授权：请启用无障碍并等待服务连接");
    }
    private boolean eligible(JSONObject observation, JSONObject session) {
        JSONObject policy = session == null ? null : session.optJSONObject("protection");
        return policy != null && FocusProtection.navigationRequested(policy) && !policy.optBoolean("navigationWithdrawn")
            && !observation.optBoolean("needsReconcile") && device.supported() && device.authorized() && device.connected();
    }
    /** Only actual OS events update evidence; observe() is read-only. */
    boolean window(JSONObject observation, String pkg, String cls) throws JSONException {
        JSONObject session = ControlSession.from(observation);
        if (!eligible(observation, session)) return false;
        String id = session.optString("id");
        long now = clock.mono();
        boolean same = id.equals(runtime.getString("sessionId", ""));
        long pending = same ? runtime.getLong("pendingUntil", 0) : 0;
        if (ownPackage.equals(pkg) && cls != null && cls.endsWith("MainActivity") && pending > 0) {
            SharedPreferences.Editor edit = runtime.edit().putLong("pendingUntil", 0).putString("failure", "");
            if (now <= pending) edit.putLong("returnedAt", clock.epoch());
            else edit.putLong("returnedAt", 0);
            edit.apply();
            return false;
        }
        String target = device.target(pkg, cls);
        if (target.isEmpty()) return false;
        if (pending > now) return true;
        if (same && !runtime.getString("failure", "").isEmpty() && now - runtime.getLong("attemptMono", 0) < 1200) return true;
        SharedPreferences.Editor edit = runtime.edit();
        if (!same) edit.clear();
        edit.putString("sessionId", id).putString("target", target).putLong("attemptMono", now)
            .putLong("pendingUntil", now + 3000).putString("failure", "").apply();
        try { device.returnToFocus(target); }
        catch (Exception error) { runtime.edit().putLong("pendingUntil", 0).putString("failure", "无法返回专注：" + error.getClass().getSimpleName()).apply(); }
        return true;
    }
    JSONObject observe(JSONObject observation) throws JSONException {
        JSONObject session = ControlSession.from(observation);
        JSONObject policy = session == null ? null : session.optJSONObject("protection");
        boolean requested = FocusProtection.navigationRequested(policy);
        boolean withdrawn = policy != null && policy.optBoolean("navigationWithdrawn");
        boolean preferred = FocusProtection.navigationRequested(FocusProtection.preferences(store));
        boolean supported = device.supported(), authorized = device.authorized(), connected = device.connected();
        boolean same = session != null && session.optString("id").equals(runtime.getString("sessionId", ""));
        long returned = same ? runtime.getLong("returnedAt", 0) : 0;
        long pending = same ? runtime.getLong("pendingUntil", 0) : 0;
        String failure = same ? runtime.getString("failure", "") : "";
        if (pending > 0 && clock.mono() > pending) failure = "已请求返回，但未观察到专注界面；请检查本机导航支持";
        boolean eligible = eligible(observation, session);
        boolean active = eligible && returned > 0 && failure.isEmpty() && pending == 0;
        String state = withdrawn ? "recovered" : !supported ? "unsupported" : requested && (!authorized || !connected) ? "failed"
            : requested && !failure.isEmpty() ? "failed" : requested && eligible ? active ? "protecting" : "armed"
            : !preferred ? "off" : !authorized || !connected ? "authorization" : "ready";
        String reason = withdrawn ? "本轮导航限制已撤销；服务重连不会重新开启" : !supported ? "没有找到可识别的桌面；此设备不支持当前执行路线"
            : requested && (!authorized || !connected) ? "本轮导航限制失效：请检查无障碍授权与服务连接"
            : !failure.isEmpty() ? failure : active ? "已观察到导航后返回专注；仅限制桌面与最近任务"
            : eligible ? "执行器已就绪，等待桌面或最近任务事件；尚未验证实际返回"
            : requested ? "本轮已到期或设备重启，导航限制已停止" : preferred ? "开始计时后执行；权限和服务就绪不表示已验证本机导航" : "桌面与最近任务限制未开启";
        return new JSONObject().put("supported", supported).put("authorized", authorized).put("connected", connected)
            .put("requested", requested).put("preferenceEnabled", preferred).put("active", active).put("state", state).put("reason", reason)
            .put("lastReturnedAt", returned > 0 ? returned : JSONObject.NULL).put("lastTarget", same ? runtime.getString("target", "") : JSONObject.NULL)
            .put("identity", "ordinary-accessibility").put("supportScope", "launcher-window-events; OEM and gesture navigation require device verification");
    }
    void release() { runtime.edit().clear().apply(); }
}
