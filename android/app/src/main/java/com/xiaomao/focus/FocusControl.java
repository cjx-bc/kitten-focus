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

    FocusControl(Context context) {
        this(context, LocalStore.get(context), SessionClock.system(context));
    }

    FocusControl(Context context, LocalStore store, SessionClock clock) {
        this.context = context.getApplicationContext();
        this.store = store;
        this.clock = clock;
        focus = new FocusEngine(context, store, clock);
        rest = new RestEngine(context, store, clock);
    }

    JSONObject startFocus(JSONObject session) throws JSONException { return startFocus(session, false); }
    JSONObject startFocus(JSONObject session, boolean strictModeConfirmed) throws JSONException {
        synchronized (store) {
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
            started.put("protection", FocusProtection.capture(context, store, session));
            return focus.start(started);
        }
    }
    JSONObject focusAction(String action) throws JSONException {
        synchronized (store) {
            JSONObject observation = observeControl();
            JSONObject active = observation.getJSONObject("focus").optJSONObject("session");
            if (!action.equals("read") && active != null && active.optBoolean("strictMode")
                && active.optString("mode").equals("countdown") && !observation.optBoolean("needsReconcile"))
                throw new IllegalStateException("严格倒计时不能暂停、取消或提前结束；请等待本轮到期，帮助和故障恢复仍可进入");
            return focus.action(action);
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
            return observeControl();
        }
    }

    /** Never checkpoints, settles, writes, schedules alarms or changes notifications. */
    JSONObject observeControl() throws JSONException {
        synchronized (store) {
            JSONObject focusSnapshot = focus.observe();
            JSONObject restSnapshot = rest.observe();
            JSONObject active = focusSnapshot.optJSONObject("session");
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

    void replaceData(JSONObject data) throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注");
            store.saveData(data, true);
            Reminders.cancelFocus(context);
            Reminders.cancelRest(context);
        }
    }
}
