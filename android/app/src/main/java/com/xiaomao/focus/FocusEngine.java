package com.xiaomao.focus;

import android.content.Context;
import org.json.JSONObject;
import org.json.JSONArray;
import org.json.JSONException;

final class FocusEngine {
    static final long REGRET_WINDOW_MS = 10_000L;

    interface Store {
        JSONObject read(String key) throws JSONException;
        void write(String key, JSONObject value);
        void finish(JSONObject record, JSONObject rest);
    }

    interface SideEffects {
        void scheduleFocus(JSONObject session);
        void showFocus(JSONObject session, long elapsedMs);
        void cancelFocusAlarm();
        void cancelFocus();
        void showFinished(JSONObject session);
        void exitRest();
        void syncRest() throws JSONException;
        JSONObject readRest() throws JSONException;
    }

    private final Store store;
    private final SessionClock clock;
    private final SideEffects effects;

    FocusEngine(Context context) {
        this(context, LocalStore.get(context), SessionClock.system(context));
    }

    FocusEngine(Context context, LocalStore store, SessionClock clock) {
        this(store, clock, androidEffects(context, store, clock));
    }

    FocusEngine(Store store, SessionClock clock, SideEffects effects) {
        this.store = store;
        this.clock = clock;
        this.effects = effects;
    }

    private static SideEffects androidEffects(Context context, LocalStore store, SessionClock clock) {
        final Context app = context.getApplicationContext();
        final RestEngine rest = new RestEngine(app, store, clock);
        return new SideEffects() {
            public void scheduleFocus(JSONObject session) { Reminders.scheduleFocus(app, session); }
            public void showFocus(JSONObject session, long elapsedMs) { Reminders.showFocus(app, session, elapsedMs); }
            public void cancelFocusAlarm() { Reminders.cancelFocusAlarm(app); }
            public void cancelFocus() { Reminders.cancelFocus(app); }
            public void showFinished(JSONObject session) { Reminders.showFinished(app, session); }
            public void exitRest() { rest.exit(); }
            public void syncRest() throws JSONException { rest.sync(); }
            public JSONObject readRest() throws JSONException { return rest.read(); }
        };
    }

    JSONObject start(JSONObject session) throws JSONException { synchronized (store) { return startLocked(session); } }

    private JSONObject startLocked(JSONObject session) throws JSONException {
        checkStart(session);
        effects.exitRest();
        session.put("anchorMono", clock.mono());
        session.put("anchorEpoch", clock.epoch());
        session.put("startedAt", clock.epoch());
        session.put("bootId", clock.boot());
        store.write("active", session);
        effects.scheduleFocus(session);
        effects.showFocus(session, 0);
        return snapshot(session, 0, null);
    }

    void checkStart(JSONObject session) throws JSONException {
        if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注");
        JSONObject resting = effects.readRest().optJSONObject("session");
        if (resting != null && resting.optString("state").equals("running"))
            throw new IllegalStateException("请先退出休息，再开始新的专注");
        if (session.optLong("targetMs") <= 0 || (!session.optString("mode").equals("countdown") && !session.optString("mode").equals("stopwatch")))
            throw new IllegalArgumentException("计时参数无效");
    }

    private long elapsed(JSONObject s, long now) {
        long ms = s.optLong("elapsedMs") + (s.optString("state").equals("running") ? Math.max(0, now - s.optLong("anchorMono")) : 0);
        return s.optString("mode").equals("countdown") ? Math.min(ms, s.optLong("targetMs")) : ms;
    }

    static boolean canResumeAfterReboot(boolean rebootResume, boolean strictMode, String mode, int savedBootId, long deadlineEpoch, int currentBootId, long currentEpoch) {
        return rebootResume && strictMode && "countdown".equals(mode) && savedBootId != currentBootId && deadlineEpoch > currentEpoch;
    }

    static boolean canResumeAfterReboot(JSONObject s, SessionClock clock) {
        if (s == null || clock == null) return false;
        return canResumeAfterReboot(s.optBoolean("rebootResume"), s.optBoolean("strictMode"), s.optString("mode"), s.optInt("bootId"), s.optLong("deadlineEpoch"), clock.boot(), clock.epoch());
    }

    static long resumedElapsedAfterReboot(long targetMs, long elapsedMs, long deadlineEpoch, long epoch) {
        long remaining = Math.max(0L, deadlineEpoch - epoch);
        return Math.max(elapsedMs, Math.min(targetMs, targetMs - remaining));
    }

    static long resumedElapsedAfterReboot(JSONObject s, long epoch) {
        return resumedElapsedAfterReboot(s.optLong("targetMs"), s.optLong("elapsedMs"), s.optLong("deadlineEpoch"), epoch);
    }

    JSONObject observe() throws JSONException {
        synchronized (store) {
            JSONObject session = store.read("active");
            long now = clock.mono();
            if (LockEngine.owns(session)) session = null;
            boolean interrupted = session != null && (session.optInt("bootId") != clock.boot() || now < session.optLong("anchorMono"));
            long value = session == null ? 0 : interrupted ? (canResumeAfterReboot(session, clock) ? resumedElapsedAfterReboot(session, clock.epoch()) : session.optLong("elapsedMs")) : elapsed(session, now);
            return snapshot(session, value, null);
        }
    }

    private void checkpoint(JSONObject s, long now, long epoch) throws JSONException {
        long delta = Math.max(0, now - s.optLong("anchorMono"));
        if (s.optString("mode").equals("countdown")) delta = Math.min(delta, Math.max(0, s.optLong("targetMs") - s.optLong("elapsedMs")));
        if (delta > 0) {
            JSONArray segments = s.getJSONArray("segments");
            JSONObject last = segments.length() > 0 ? segments.getJSONObject(segments.length() - 1) : null;
            if (last != null && last.optLong("end") == s.optLong("anchorEpoch")) last.put("end", s.optLong("anchorEpoch") + delta);
            else segments.put(new JSONObject().put("start", s.optLong("anchorEpoch")).put("end", s.optLong("anchorEpoch") + delta));
        }
        s.put("elapsedMs", s.optLong("elapsedMs") + delta);
        s.put("anchorMono", now);
        s.put("anchorEpoch", epoch);
    }

    JSONObject action(String action) throws JSONException { synchronized (store) { return actionLocked(action); } }

    private JSONObject actionLocked(String action) throws JSONException {
        JSONObject s = store.read("active");
        if (LockEngine.owns(s)) return snapshot(null, 0, null);
        if (s == null) return snapshot(null, 0, store.read("lastFinished"));
        long now = clock.mono(), epoch = clock.epoch();
        boolean interrupted = s.optInt("bootId") != clock.boot() || now < s.optLong("anchorMono");
        if (interrupted && canResumeAfterReboot(s, clock)) {
            long resumed = resumedElapsedAfterReboot(s, epoch);
            long prevElapsed = s.optLong("elapsedMs");
            long delta = Math.max(0L, resumed - prevElapsed);
            if (delta > 0) {
                long segStart = s.optLong("anchorEpoch");
                s.getJSONArray("segments").put(new JSONObject().put("start", segStart).put("end", segStart + delta));
                s.put("elapsedMs", resumed);
            }
            s.put("bootId", clock.boot()).put("anchorMono", now).put("anchorEpoch", epoch);
            store.write("active", s);
            effects.scheduleFocus(s);
            effects.showFocus(s, resumed);
            return snapshot(s, resumed, null);
        }
        boolean expiredAfterReboot = interrupted && s.optBoolean("rebootResume") && s.optBoolean("strictMode") && "countdown".equals(s.optString("mode")) && s.optLong("deadlineEpoch") > 0 && s.optLong("deadlineEpoch") <= epoch;
        if (expiredAfterReboot) {
            long targetMs = s.optLong("targetMs");
            long prevElapsed = s.optLong("elapsedMs");
            long delta = Math.max(0L, targetMs - prevElapsed);
            if (delta > 0) {
                long segStart = s.optLong("anchorEpoch");
                s.getJSONArray("segments").put(new JSONObject().put("start", segStart).put("end", segStart + delta));
                s.put("elapsedMs", targetMs);
            }
            s.put("bootId", clock.boot()).put("anchorMono", now).put("anchorEpoch", epoch);
            interrupted = false;
        }
        long value = interrupted ? s.optLong("elapsedMs") : elapsed(s, now);
        boolean reached = s.optString("mode").equals("countdown") && value >= s.optLong("targetMs");
        long completedAgo = reached ? (expiredAfterReboot ? Math.max(0L, epoch - s.optLong("deadlineEpoch")) : Math.max(0, now - s.optLong("anchorMono") - Math.max(0, s.optLong("targetMs") - s.optLong("elapsedMs")))) : 0;
        boolean failLeave = "fail_leave".equals(action);
        if (failLeave && !interrupted && !reached) {
            if (!"running".equals(s.optString("state"))) {
                return snapshot(s, value, null);
            }
            if (value < REGRET_WINDOW_MS) {
                store.write("active", null);
                effects.cancelFocus();
                return snapshot(null, 0, null);
            }
        }
        if (interrupted || reached || action.equals("finish") || failLeave) {
            if (!interrupted && !expiredAfterReboot && s.optString("state").equals("running")) checkpoint(s, now, epoch);
            if (!interrupted && s.optString("state").equals("paused")) s.put("pausedMs", s.optLong("pausedMs") + Math.max(0, now - s.optLong("anchorMono")));
            String status = interrupted ? "interrupted" : reached ? "completed" : failLeave ? "early" : s.optString("mode").equals("stopwatch") ? "completed" : "early";
            JSONArray segments = s.getJSONArray("segments");
            long ended = interrupted || reached ? (segments.length() > 0 ? segments.getJSONObject(segments.length() - 1).optLong("end") : s.optLong("startedAt")) : epoch;
            JSONObject record = new JSONObject();
            for (String key : new String[]{"id", "itemId", "themeId", "title", "themeName", "color", "mode", "targetMs", "startedAt", "timeZone", "pausedMs", "segments"})
                record.put(key, s.get(key));
            record.put("animalId", s.has("animalId") && !s.isNull("animalId") ? s.getString("animalId") : "black-cat");
            record.put("skinId", s.has("skinId") && !s.isNull("skinId") ? s.getString("skinId") : "default");
            record.put("source", "timer");
            if ("early".equals(status)) record.put("failReason", failLeave ? "left_app" : "manual_giveup");
            record.put("endedAt", ended);
            record.put("durationMs", s.optLong("elapsedMs"));
            record.put("status", status);
            JSONObject data = store.read("data");
            JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
            boolean autoRest = prefs != null && prefs.optBoolean("autoRest", false);
            JSONObject nextRest = autoRest && status.equals("completed") && record.optLong("durationMs") > 0
                ? RestEngine.create(record, epoch - completedAgo, now - completedAgo, clock.boot(), RestEngine.resolveDurationMs(prefs))
                : null;
            store.finish(record, nextRest);
            effects.cancelFocus();
            if (reached) effects.showFinished(s);
            if (nextRest != null) effects.syncRest();
            return snapshot(null, s.optLong("elapsedMs"), record.optLong("durationMs") > 0 ? record : null);
        }
        if (action.equals("cancel")) {
            if (s.optBoolean("strictMode") && "countdown".equals(s.optString("mode"))) {
                throw new IllegalStateException("严格倒计时不能暂停、取消或提前结束");
            }
            if (value >= REGRET_WINDOW_MS) {
                throw new IllegalStateException("已超过 10 秒无责取消时间，请左滑放弃");
            }
            store.write("active", null);
            effects.cancelFocus();
            return snapshot(null, 0, null);
        }
        if (action.equals("pause") && s.optString("state").equals("running")) {
            checkpoint(s, now, epoch);
            s.put("state", "paused");
            s.put("anchorMono", now);
            effects.cancelFocusAlarm();
        } else if (action.equals("resume") && s.optString("state").equals("paused")) {
            s.put("pausedMs", s.optLong("pausedMs") + Math.max(0, now - s.optLong("anchorMono")));
            s.put("state", "running");
            s.put("anchorMono", now);
            s.put("anchorEpoch", epoch);
            effects.scheduleFocus(s);
        } else if (s.optString("state").equals("running") && now - s.optLong("anchorMono") >= 5000) {
            checkpoint(s, now, epoch);
        }
        store.write("active", s);
        effects.showFocus(s, elapsed(s, now));
        return snapshot(s, elapsed(s, now), null);
    }

    private JSONObject snapshot(JSONObject session, long elapsed, JSONObject record) throws JSONException {
        JSONObject result = new JSONObject().put("session", session == null ? JSONObject.NULL : session).put("elapsedMs", elapsed);
        if (record != null) result.put("record", record);
        return result;
    }
}
