package com.xiaomao.focus;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONException;
import org.json.JSONObject;

final class RestEngine {
    static final long DURATION_MS = 5 * 60 * 1000L;
    private final Context context;
    private final LocalStore store;

    RestEngine(Context context) {
        this.context = context.getApplicationContext();
        this.store = LocalStore.get(context);
    }

    private static int boot(Context context) {
        return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, 0);
    }

    static JSONObject create(Context context, JSONObject record, long epoch, long mono) throws JSONException {
        if (record.optLong("durationMs") <= 0 || record.optString("status").equals("interrupted"))
            throw new IllegalArgumentException("本次专注不能开始休息");
        return new JSONObject().put("record", new JSONObject(record.toString()))
            .put("startedAt", epoch).put("endsAt", epoch + DURATION_MS)
            .put("endMono", mono + DURATION_MS).put("bootId", boot(context)).put("state", "running");
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
            store.write("rest", create(context, source, System.currentTimeMillis(), SystemClock.elapsedRealtime()));
            sync();
            return read();
        }
    }

    JSONObject read() throws JSONException {
        synchronized (store) {
            JSONObject session = store.read("rest");
            if (session == null) return snapshot(null, 0);
            if (session.optString("state").equals("completed")) return snapshot(session, 0);
            long now = SystemClock.elapsedRealtime();
            boolean restarted = session.optInt("bootId") != boot(context);
            if (restarted) {
                long remaining = Math.max(0, Math.min(DURATION_MS, session.optLong("endsAt") - System.currentTimeMillis()));
                session.put("endMono", now + remaining).put("bootId", boot(context));
                store.write("rest", session);
                if (remaining > 0) Reminders.scheduleRest(context, session.optLong("endMono"));
            }
            long remaining = Math.max(0, Math.min(DURATION_MS, session.optLong("endMono") - now));
            if (remaining == 0) {
                session.put("state", "completed");
                store.write("rest", session);
                Reminders.cancelRest(context);
                Reminders.showRestFinished(context);
            }
            return snapshot(session, remaining);
        }
    }

    void sync() throws JSONException {
        synchronized (store) {
            JSONObject session = read().optJSONObject("session");
            if (session != null && session.optString("state").equals("running"))
                Reminders.scheduleRest(context, session.optLong("endMono"));
        }
    }

    JSONObject exit() {
        synchronized (store) {
            store.write("rest", null);
            Reminders.cancelRest(context);
            return new JSONObject();
        }
    }

    private JSONObject snapshot(JSONObject session, long remaining) throws JSONException {
        return new JSONObject().put("session", session == null ? JSONObject.NULL : session).put("remainingMs", remaining);
    }
}
