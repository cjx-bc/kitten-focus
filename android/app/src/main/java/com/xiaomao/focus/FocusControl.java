package com.xiaomao.focus;

import android.content.Context;
import org.json.JSONException;
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

    JSONObject startFocus(JSONObject session) throws JSONException { return focus.start(session); }
    JSONObject focusAction(String action) throws JSONException { return focus.action(action); }
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
