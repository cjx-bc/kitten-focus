package com.xiaomao.focus;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

/** One native boundary for session ownership, lifecycle commands and observation. */
final class FocusControl {
    interface TargetLaunch { Runnable prepare(String packageName) throws Exception; }
    private final TargetLaunch targetLaunch;
    private final Context context;
    private final LocalStore store;
    private final SessionClock clock;
    private final FocusEngine focus;
    private final RestEngine rest;
    private final FocusRecovery recovery;
    private final FocusProtection.AccessibilityState accessibility;

    FocusControl(Context context) {
        this(context, LocalStore.get(context), SessionClock.system(context));
    }

    FocusControl(Context context, LocalStore store, SessionClock clock) {
        this(context, store, clock, new FocusRecovery(context, store));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery) {
        this(context, store, clock, recovery, null);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery, FocusProtection.AccessibilityState accessibility) {
        this(context, store, clock, recovery, accessibility, packageName -> {
            android.content.Intent intent = context.getPackageManager().getLaunchIntentForPackage(packageName);
            if (intent == null) throw new IllegalStateException("此应用已卸载或没有可打开的入口");
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            return () -> context.startActivity(intent);
        });
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, TargetLaunch targetLaunch) {
        this.targetLaunch = targetLaunch;
        this.context = context.getApplicationContext();
        this.store = store;
        this.clock = clock;
        focus = new FocusEngine(context, store, clock);
        rest = new RestEngine(context, store, clock);
        this.recovery = recovery;
        this.accessibility = accessibility;
    }

    JSONObject startFocus(JSONObject session) throws JSONException { return startFocus(session, false); }
    JSONObject startFocus(JSONObject session, boolean strictModeConfirmed) throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注");
            focus.checkStart(session);
            JSONObject data = store.read("data");
            JSONObject preferences = data == null ? null : data.optJSONObject("preferences");
            JSONObject protection = preferences == null ? null : preferences.optJSONObject("protection");
            boolean strict = protection != null && Boolean.TRUE.equals(protection.opt("strict"))
                && session.optString("mode").equals("countdown");
            if (strict && !strictModeConfirmed)
                throw new IllegalStateException("请先确认严格倒计时：开始后不能暂停、取消或提前结束");
            JSONObject started = new JSONObject(session.toString()).put("strictMode", strict);
            started.remove("temporaryAccess");
            started.put("temporaryAccessRuntime", new JSONObject().put("used", 0).put("requests", new JSONArray()));
            started.put("state", "running").put("elapsedMs", 0).put("pausedMs", 0)
                .put("segments", new JSONArray());
            started.put("protection", accessibility == null ? FocusProtection.capture(context, store) : FocusProtection.capture(context, store, accessibility));
            recovery.prepare(started);
            JSONObject result = focus.start(started);
            FocusProtection.executionSucceeded();
            return projectTemporary(result);
        }
    }
    JSONObject focusAction(String action) throws JSONException {
        synchronized (store) {
            JSONObject observation = observeControl();
            JSONObject active = observation.getJSONObject("focus").optJSONObject("session");
            if (!action.equals("read") && active != null && active.optBoolean("strictMode")
                && active.optString("mode").equals("countdown") && !observation.optBoolean("needsReconcile"))
                throw new IllegalStateException("严格倒计时不能暂停、取消或提前结束；请等待本轮到期，帮助和故障恢复仍可进入");
            JSONObject result = focus.action(action);
            JSONObject remaining = result.optJSONObject("session");
            recovery.releaseFinished(remaining == null ? null : remaining.optString("id"));
            return projectTemporary(result);
        }
    }
    JSONObject startRest(String recordId) throws JSONException { return rest.start(recordId); }
    JSONObject restAction(String action) throws JSONException {
        synchronized (store) {
            if (action.equals("exit")) rest.exit();
            return rest.read();
        }
    }

    /** Explicit lifecycle work for alarms, boot and other reconciliation triggers. */
    JSONObject reconcile() throws JSONException {
        synchronized (store) {
            focus.action("read");
            rest.sync();
            JSONObject active = store.read("active");
            recovery.releaseFinished(active == null ? null : active.optString("id"));
            return observeControl();
        }
    }

    /** Never checkpoints, settles, writes, schedules alarms or changes notifications. */
    JSONObject observeControl() throws JSONException {
        synchronized (store) {
            JSONObject focusSnapshot = focus.observe();
            JSONObject restSnapshot = rest.observe();
            JSONObject active = focusSnapshot.optJSONObject("session");
            if (active != null && active.optJSONObject("protection") != null)
                active.getJSONObject("protection").put("applicationsWithdrawn", recovery.withdrawn(active.optString("id"), FocusRecovery.APPLICATIONS));
            JSONObject resting = restSnapshot.optJSONObject("session");
            boolean runningRest = resting != null && resting.optString("state").equals("running");
            boolean needsReconcile = active != null && (
                active.optInt("bootId") != clock.boot() || clock.mono() < active.optLong("anchorMono")
                || active.optString("mode").equals("countdown")
                    && focusSnapshot.optLong("elapsedMs") >= active.optLong("targetMs"));
            needsReconcile |= runningRest && (resting.optInt("bootId") != clock.boot()
                || restSnapshot.optLong("remainingMs") == 0);
            return new JSONObject()
                .put("owner", active != null ? "focus" : runningRest ? "rest" : JSONObject.NULL)
                .put("focus", projectTemporary(focusSnapshot)).put("rest", restSnapshot)
                .put("needsReconcile", needsReconcile);
        }
    }

    private boolean temporaryEligible(JSONObject session) throws JSONException {
        JSONObject policy = session == null ? null : session.optJSONObject("protection");
        return policy != null && policy.optBoolean("study")
            && !recovery.withdrawn(session.optString("id"), FocusRecovery.APPLICATIONS)
            && !(session.optBoolean("strictMode") && session.optString("mode").equals("countdown"))
            && session.optInt("bootId") == clock.boot() && clock.mono() >= session.optLong("anchorMono")
            && !(session.optString("mode").equals("countdown") &&
                session.optLong("elapsedMs") + (session.optString("state").equals("running")
                    ? clock.mono() - session.optLong("anchorMono") : 0) >= session.optLong("targetMs"));
    }
    private JSONObject temporaryState(JSONObject session) throws JSONException {
        JSONObject runtime = session == null ? null : session.optJSONObject("temporaryAccessRuntime");
        int used = runtime == null ? 0 : runtime.optInt("used");
        JSONObject grant = runtime == null ? null : runtime.optJSONObject("grant");
        long remaining = grant != null && temporaryEligible(session) && grant.optInt("bootId") == clock.boot()
            && clock.mono() >= grant.optLong("startedMono") ? Math.max(0, grant.optLong("deadlineMono") - clock.mono()) : 0;
        return new JSONObject().put("used", used).put("remainingUses", Math.max(0, 3 - used))
            .put("targetPackage", remaining > 0 ? grant.optString("targetPackage") : JSONObject.NULL)
            .put("targetLabel", remaining > 0 ? grant.optString("targetLabel") : JSONObject.NULL)
            .put("remainingMs", remaining).put("expiresAt", remaining > 0 ? grant.optLong("expiresAt") : JSONObject.NULL);
    }
    private JSONObject projectTemporary(JSONObject snapshot) throws JSONException {
        JSONObject session = snapshot.optJSONObject("session");
        if (session != null) {
            JSONObject state = temporaryState(session);
            session.remove("temporaryAccessRuntime"); session.put("temporaryAccess", state);
        }
        return snapshot;
    }
    private JSONObject grantResult(String status, String reason, boolean replayed, JSONObject session) throws JSONException {
        return new JSONObject().put("status", status).put("reason", reason).put("replayed", replayed)
            .put("state", temporaryState(session));
    }
    JSONObject grantTemporaryAccess(JSONObject request) throws JSONException {
        synchronized (store) {
            JSONObject session = store.read("active");
            if (request == null || session == null || !session.optString("id").equals(request.optString("sessionId")))
                return grantResult("denied", "本轮专注已变更，请重新打开阻挡页", false, session);
            if (!temporaryEligible(session))
                return grantResult("denied", "只有普通学霸模式可以临时放行；严格倒计时或已撤销的保护不能放行", false, session);
            String target = request.optString("targetPackage"), id = request.optString("requestId");
            Object duration = request.opt("durationMinutes");
            if (!(duration instanceof Number) || ((Number) duration).doubleValue() != ((Number) duration).intValue()
                || !java.util.Arrays.asList(1, 3, 5).contains(((Number) duration).intValue())
                || target.isEmpty() || id.isEmpty() || id.length() > 160)
                return grantResult("denied", "请选择 1、3 或 5 分钟，并提供有效的应用和请求标识", false, session);
            int minutes = ((Number) duration).intValue();
            JSONObject runtime = session.optJSONObject("temporaryAccessRuntime");
            if (runtime == null) runtime = new JSONObject().put("used", 0).put("requests", new JSONArray());
            JSONArray requests = runtime.getJSONArray("requests");
            for (int i = 0; i < requests.length(); i++) {
                JSONObject previous = requests.getJSONObject(i);
                if (id.equals(previous.optString("requestId")))
                    return grantResult(previous.optString("targetPackage").equals(target) && previous.optInt("durationMinutes") == minutes
                        ? "granted" : "denied", "此请求已处理，重试不会再次扣次或延长时间", true, session);
            }
            if (runtime.optInt("used") >= 3) return grantResult("denied", "本轮三次临时放行已用完", false, session);
            JSONObject current = temporaryState(session);
            if (current.optLong("remainingMs") > 0 && !request.optBoolean("replaceConfirmed"))
                return grantResult("confirmation-required", "继续将结束上一个应用的临时放行", false, session);
            JSONObject observation = observeControl();
            observation.getJSONObject("focus").getJSONObject("session").remove("temporaryAccess");
            if (!FocusProtection.shouldBlock(context, observation, target, ""))
                return grantResult("denied", "此应用不受本轮限制，无需临时放行", false, session);
            if (!(accessibility == null ? FocusProtection.authorized(context) && FocusAccessibilityService.connected()
                : accessibility.authorized() && accessibility.connected()))
                return grantResult("failed", "应用限制授权或服务连接已失效，没有扣次", false, session);
            JSONObject before = new JSONObject(session.toString());
            try {
                Runnable launch = targetLaunch.prepare(target);
                if (launch == null) throw new IllegalStateException("应用没有可打开的入口");
                String label = target;
                try { label = context.getPackageManager().getApplicationLabel(context.getPackageManager().getApplicationInfo(target, 0)).toString(); }
                catch (android.content.pm.PackageManager.NameNotFoundException ignored) { }
                long now = clock.mono();
                runtime.put("used", runtime.optInt("used") + 1).put("grant", new JSONObject()
                    .put("targetPackage", target).put("targetLabel", label).put("startedMono", now)
                    .put("deadlineMono", now + minutes * 60000L).put("bootId", clock.boot())
                    .put("expiresAt", clock.epoch() + minutes * 60000L));
                requests.put(new JSONObject().put("requestId", id).put("targetPackage", target).put("durationMinutes", minutes));
                session.put("temporaryAccessRuntime", runtime);
                // One durable state write contains both the grant and its debit. The store lock
                // prevents accessibility observation or concurrent requests seeing a partial grant.
                store.write("active", session);
                launch.run();
                return grantResult("granted", "临时放行已生效，到期后重新限制", false, session);
            } catch (Exception error) {
                store.write("active", before);
                return grantResult("failed", "无法打开此应用，没有扣次：" + error.getClass().getSimpleName(), false, before);
            }
        }
    }

    JSONObject loadData() throws JSONException { return store.loadData(); }
    JSONObject previewRecovery() throws JSONException { synchronized (store) { return recovery.preview(); } }
    JSONObject confirmRecovery(String revision) throws JSONException { synchronized (store) { return recovery.confirm(revision); } }

    void replaceData(JSONObject data) throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注");
            store.saveData(data, true);
            Reminders.cancelFocus(context);
            Reminders.cancelRest(context);
        }
    }
}
