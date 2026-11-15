package com.xiaomao.focus;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

/** One native boundary for session ownership, lifecycle commands and observation. */
final class FocusControl {
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
            started.put("state", "running").put("elapsedMs", 0).put("pausedMs", 0)
                .put("segments", new JSONArray());
            started.put("protection", accessibility == null ? FocusProtection.capture(context, store) : FocusProtection.capture(context, store, accessibility));
            recovery.prepare(started);
            JSONObject result = focus.start(started);
            FocusProtection.executionSucceeded();
            return result;
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
            return result;
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
                .put("focus", focusSnapshot).put("rest", restSnapshot)
                .put("needsReconcile", needsReconcile);
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
