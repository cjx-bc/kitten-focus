package com.xiaomao.focus;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONObject;

final class RestEngine {
    static final long DURATION_MS = 5 * 60 * 1000L;

    interface SideEffects {
        void scheduleRest(long endMono);
        void cancelRest();
        void showRestFinished();
        default void showRestFinished(boolean pomodoroLoop) {
            showRestFinished();
        }
    }

    private final FocusEngine.Store store;
    private final SessionClock clock;
    private final SideEffects effects;

    RestEngine(Context context) {
        this(context, LocalStore.get(context), SessionClock.system(context));
    }

    RestEngine(Context context, LocalStore store, SessionClock clock) {
        this(store, clock, androidEffects(context));
    }

    RestEngine(FocusEngine.Store store, SessionClock clock, SideEffects effects) {
        this.store = store;
        this.clock = clock;
        this.effects = effects;
    }

    private static SideEffects androidEffects(Context context) {
        final Context app = context.getApplicationContext();
        return new SideEffects() {
            @Override public void scheduleRest(long endMono) { Reminders.scheduleRest(app, endMono); }
            @Override public void cancelRest() { Reminders.cancelRest(app); }
            @Override public void showRestFinished() { Reminders.showRestFinished(app, false); }
            @Override public void showRestFinished(boolean pomodoroLoop) { Reminders.showRestFinished(app, pomodoroLoop); }
        };
    }

    static long resolveDurationMs(JSONObject preferences) {
        int minutes = preferences != null ? preferences.optInt("restMinutes", 5) : 5;
        if (minutes < 1 || minutes > 60) minutes = 5;
        return minutes * 60_000L;
    }

    static JSONObject create(JSONObject record, long epoch, long mono, int boot) throws JSONException {
        return create(record, epoch, mono, boot, DURATION_MS);
    }

    static JSONObject create(JSONObject record, long epoch, long mono, int boot, long durationMs) throws JSONException {
        if (record.optLong("durationMs") <= 0 || record.optString("status").equals("interrupted"))
            throw new IllegalArgumentException("本次专注不能开始休息");
        long safeDuration = durationMs > 0 ? durationMs : DURATION_MS;
        return new JSONObject().put("record", new JSONObject(record.toString()))
            .put("durationMs", safeDuration)
            .put("startedAt", epoch).put("endsAt", epoch + safeDuration)
            .put("endMono", mono + safeDuration).put("bootId", boot).put("state", "running");
    }

    JSONObject start(String recordId) throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注");
            JSONObject source = store.read("lastFinished");
            if (source == null || !source.optString("id").equals(recordId))
                throw new IllegalArgumentException("没有可用于休息的专注记录");
            JSONObject current = store.read("rest");
            if (current != null && current.getJSONObject("record").optString("id").equals(recordId))
                return read();
            if (current != null && current.optString("state").equals("running"))
                throw new IllegalStateException("已有一段休息正在进行");
            JSONObject data = store.read("data");
            JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
            store.write("rest", create(source, clock.epoch(), clock.mono(), clock.boot(), resolveDurationMs(prefs)));
            sync();
            return read();
        }
    }

    JSONObject read() throws JSONException {
        synchronized (store) {
            JSONObject session = store.read("rest");
            if (session == null) return snapshot(null, 0);
            if (session.optString("state").equals("completed")) return snapshot(session, 0);
            long totalMs = session.optLong("durationMs", DURATION_MS);
            if (totalMs <= 0) totalMs = DURATION_MS;
            long now = clock.mono();
            boolean restarted = session.optInt("bootId") != clock.boot();
            if (restarted) {
                long remaining = Math.max(0, Math.min(totalMs, session.optLong("endsAt") - clock.epoch()));
                session.put("endMono", now + remaining).put("bootId", clock.boot());
                store.write("rest", session);
                if (remaining > 0) effects.scheduleRest(session.optLong("endMono"));
            }
            long remaining = Math.max(0, Math.min(totalMs, session.optLong("endMono") - now));
            if (remaining == 0) {
                session.put("state", "completed");
                store.write("rest", session);
                effects.cancelRest();
                boolean pomodoroLoop = false;
                try {
                    JSONObject data = store.read("data");
                    JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
                    pomodoroLoop = prefs != null && prefs.optBoolean("pomodoroLoop", false);
                } catch (Exception ignored) {
                }
                effects.showRestFinished(pomodoroLoop);
            }
            return snapshot(session, remaining);
        }
    }

    JSONObject observe() throws JSONException {
        synchronized (store) {
            JSONObject session = store.read("rest");
            if (session == null || session.optString("state").equals("completed")) return snapshot(session, 0);
            long totalMs = session.optLong("durationMs", DURATION_MS);
            if (totalMs <= 0) totalMs = DURATION_MS;
            long remaining = session.optInt("bootId") == clock.boot()
                ? session.optLong("endMono") - clock.mono() : session.optLong("endsAt") - clock.epoch();
            return snapshot(session, Math.max(0, Math.min(totalMs, remaining)));
        }
    }

    void sync() throws JSONException {
        synchronized (store) {
            JSONObject session = read().optJSONObject("session");
            if (session != null && session.optString("state").equals("running"))
                effects.scheduleRest(session.optLong("endMono"));
        }
    }

    JSONObject exit() {
        synchronized (store) {
            store.write("rest", null);
            effects.cancelRest();
            return new JSONObject();
        }
    }

    private JSONObject snapshot(JSONObject session, long remaining) throws JSONException {
        return new JSONObject().put("session", session == null ? JSONObject.NULL : session).put("remainingMs", remaining);
    }
}
