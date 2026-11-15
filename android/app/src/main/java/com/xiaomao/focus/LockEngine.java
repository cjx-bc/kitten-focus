package com.xiaomao.focus;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.UUID;

/** Independent countdowns share the native active owner, never focus records. */
final class LockEngine {
    private final Context context; private final LocalStore store; private final SessionClock clock;
    LockEngine(Context context, LocalStore store, SessionClock clock) {
        this.context = context.getApplicationContext(); this.store = store; this.clock = clock;
    }
    static boolean owns(JSONObject session) { return session != null && "lock".equals(session.optString("kind")); }
    JSONObject configuration(String id) throws JSONException {
        JSONObject data = store.read("data"); JSONArray rows = data == null ? null : data.optJSONArray("lockConfigurations");
        if (rows != null) for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null && id.equals(row.optString("id")) && !id.isEmpty()) {
                Object minutes = row.opt("minutes");
                if (!(minutes instanceof Number) || ((Number) minutes).doubleValue() != row.optLong("minutes")
                    || row.optLong("minutes") < 1 || row.optLong("minutes") > 1440 || row.optString("name").trim().isEmpty())
                    throw new IllegalArgumentException("请检查锁机名称与时长（1–1440 整数分钟）");
                return row;
            }
        }
        throw new IllegalArgumentException("锁机配置不存在，请保存配置后重试");
    }
    JSONObject create(JSONObject configuration) throws JSONException {
        return new JSONObject().put("id", UUID.randomUUID().toString()).put("kind", "lock")
            .put("configurationId", configuration.getString("id")).put("title", configuration.getString("name"))
            .put("mode", "countdown").put("state", "running").put("targetMs", configuration.getLong("minutes") * 60000)
            .put("elapsedMs", 0).put("anchorMono", clock.mono()).put("anchorEpoch", clock.epoch())
            .put("startedAt", clock.epoch()).put("bootId", clock.boot())
            .put("strictMode", Boolean.TRUE.equals(configuration.opt("strict")));
    }
    JSONObject start(JSONObject session) throws JSONException {
        store.write("active", session);
        Reminders.scheduleFocus(context, session); Reminders.showFocus(context, session, 0);
        return observe();
    }
    private boolean interrupted(JSONObject session) { return session.optInt("bootId") != clock.boot() || clock.mono() < session.optLong("anchorMono"); }
    private long elapsed(JSONObject session) {
        return Math.min(session.optLong("targetMs"), session.optLong("elapsedMs") + (interrupted(session) ? 0 : Math.max(0, clock.mono() - session.optLong("anchorMono"))));
    }
    JSONObject observe() throws JSONException {
        JSONObject session = store.read("active"); if (!owns(session)) session = null;
        JSONObject history = store.read("lockHistory");
        return new JSONObject().put("session", session == null ? JSONObject.NULL : session)
            .put("remainingMs", session == null ? 0 : Math.max(0, session.optLong("targetMs") - elapsed(session)))
            .put("records", history == null ? new JSONArray() : history.getJSONArray("records"));
    }
    JSONObject action(String action, boolean confirmed) throws JSONException {
        JSONObject session = store.read("active");
        if (!owns(session)) {
            if (!action.equals("read") && !action.equals("finish")) throw new IllegalArgumentException("锁机操作无效");
            return observe();
        }
        boolean interrupted = interrupted(session); long elapsed = elapsed(session); boolean reached = elapsed >= session.optLong("targetMs");
        if (!action.equals("read") && session.optBoolean("strictMode") && !interrupted && !reached)
            throw new IllegalStateException("严格锁机不能暂停、取消或提前解除；请等待本轮到期，帮助和故障恢复仍可进入");
        if (!action.equals("read") && !action.equals("finish")) throw new IllegalArgumentException("锁机操作无效");
        if (action.equals("finish") && !confirmed && !interrupted && !reached)
            throw new IllegalStateException("提前解除锁机需要确认；取消后本轮继续");
        if (interrupted || reached || action.equals("finish")) {
            JSONObject record = new JSONObject();
            for (String key : new String[]{"id", "configurationId", "title", "targetMs", "startedAt"}) record.put(key, session.get(key));
            record.put("durationMs", elapsed).put("status", interrupted ? "interrupted" : reached ? "completed" : "early")
                .put("endedAt", interrupted ? session.optLong("anchorEpoch") : reached ? session.optLong("startedAt") + session.optLong("targetMs") : clock.epoch());
            store.finishLock(record); Reminders.cancelFocus(context);
            if (reached) Reminders.showLockFinished(context, session);
        } else {
            if (clock.mono() - session.optLong("anchorMono") >= 5000) {
                session.put("elapsedMs", elapsed).put("anchorMono", clock.mono()).put("anchorEpoch", clock.epoch());
                store.write("active", session);
            }
            Reminders.showFocus(context, session, elapsed);
        }
        return observe();
    }
}
