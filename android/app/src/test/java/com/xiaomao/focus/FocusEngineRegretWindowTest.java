package com.xiaomao.focus;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FocusEngineRegretWindowTest {
    private static final class MemoryStore implements FocusEngine.Store {
        final Map<String, JSONObject> docs = new HashMap<>();
        final Map<String, JSONObject> records = new HashMap<>();

        @Override
        public JSONObject read(String key) throws JSONException {
            JSONObject value = docs.get(key);
            return value == null ? null : new JSONObject(value.toString());
        }

        @Override
        public void write(String key, JSONObject value) {
            if (value == null) docs.remove(key);
            else {
                try {
                    docs.put(key, new JSONObject(value.toString()));
                } catch (JSONException e) {
                    throw new RuntimeException(e);
                }
            }
        }

        @Override
        public void finish(JSONObject record, JSONObject rest) {
            if (record != null && record.optLong("durationMs") > 0) {
                records.put(record.optString("id"), record);
                write("lastFinished", record);
            }
            write("active", null);
            write("rest", rest);
        }
    }

    private static final class FakeClock implements SessionClock {
        long epoch = 1_700_000_000_000L;
        long mono = 100_000L;
        int boot = 1;

        @Override public long epoch() { return epoch; }
        @Override public long mono() { return mono; }
        @Override public int boot() { return boot; }

        void advance(long ms) {
            epoch += ms;
            mono += ms;
        }
    }

    private static final class NoopEffects implements FocusEngine.SideEffects {
        int cancelledCount = 0;
        int syncRestCount = 0;

        @Override public void scheduleFocus(JSONObject session) {}
        @Override public void showFocus(JSONObject session, long elapsedMs) {}
        @Override public void cancelFocusAlarm() {}
        @Override public void cancelFocus() { cancelledCount++; }
        @Override public void showFinished(JSONObject session) {}
        @Override public void exitRest() {}
        @Override public void syncRest() { syncRestCount++; }
        @Override public JSONObject readRest() { return new JSONObject(); }
    }

    private JSONObject session(String mode, boolean strictMode) throws JSONException {
        return new JSONObject()
            .put("id", "sess-1")
            .put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL)
            .put("title", "高数刷题")
            .put("themeName", "高数")
            .put("color", "#ef4e36")
            .put("mode", mode)
            .put("targetMs", 25 * 60_000L)
            .put("startedAt", 0L)
            .put("timeZone", "Asia/Shanghai")
            .put("state", "running")
            .put("elapsedMs", 0L)
            .put("pausedMs", 0L)
            .put("strictMode", strictMode)
            .put("animalId", "yellow-chick")
            .put("skinId", "chestnut")
            .put("segments", new JSONArray());
    }

    @Test
    public void cancelBefore10sClearsActiveSessionWithoutCreatingRecordOrRest() throws Exception {
        MemoryStore store = new MemoryStore();
        FakeClock clock = new FakeClock();
        NoopEffects effects = new NoopEffects();
        FocusEngine engine = new FocusEngine(store, clock, effects);

        engine.start(session("countdown", false));
        clock.advance(9_999L);

        JSONObject result = engine.action("cancel");
        assertTrue(result.isNull("session"));
        assertFalse(result.has("record"));
        assertEquals(0L, result.getLong("elapsedMs"));
        assertNull(store.read("active"));
        assertNull(store.read("lastFinished"));
        assertNull(store.read("rest"));
        assertEquals(0, store.records.size());
        assertEquals(1, effects.cancelledCount);
    }

    @Test
    public void cancelAtOrAfter10sRejectsAndPreservesActiveSession() throws Exception {
        MemoryStore store = new MemoryStore();
        FakeClock clock = new FakeClock();
        NoopEffects effects = new NoopEffects();
        FocusEngine engine = new FocusEngine(store, clock, effects);

        engine.start(session("countdown", false));
        clock.advance(10_000L);

        IllegalStateException error = assertThrows(IllegalStateException.class, () -> engine.action("cancel"));
        assertTrue(error.getMessage().contains("已超过 10 秒无责取消时间"));
        assertEquals("sess-1", store.read("active").getString("id"));
        assertEquals(0, store.records.size());
    }

    @Test
    public void cancelInStrictCountdownIsRejectedEvenUnder10s() throws Exception {
        MemoryStore store = new MemoryStore();
        FakeClock clock = new FakeClock();
        NoopEffects effects = new NoopEffects();
        FocusEngine engine = new FocusEngine(store, clock, effects);

        engine.start(session("countdown", true));
        clock.advance(3_000L);

        assertThrows(IllegalStateException.class, () -> engine.action("cancel"));
        assertEquals("sess-1", store.read("active").getString("id"));
    }

    @Test
    public void propagatesPetFieldsAndGatesAutoRestOnPreferences() throws Exception {
        MemoryStore store = new MemoryStore();
        FakeClock clock = new FakeClock();
        NoopEffects effects = new NoopEffects();
        FocusEngine engine = new FocusEngine(store, clock, effects);

        // Default (no autoRest) -> completed focus MUST NOT create rest session
        engine.start(session("countdown", false));
        clock.advance(25 * 60_000L);
        JSONObject completed = engine.action("read");
        JSONObject record = completed.getJSONObject("record");
        assertEquals("completed", record.getString("status"));
        assertEquals("yellow-chick", record.getString("animalId"));
        assertEquals("chestnut", record.getString("skinId"));
        assertEquals("timer", record.getString("source"));
        assertFalse(record.has("failReason"));
        assertNull(store.read("rest"));
        assertEquals(0, effects.syncRestCount);

        // Early finish propagates manual_giveup
        engine.start(session("countdown", false));
        clock.advance(15_000L);
        JSONObject early = engine.action("finish").getJSONObject("record");
        assertEquals("early", early.getString("status"));
        assertEquals("manual_giveup", early.getString("failReason"));
        assertEquals("yellow-chick", early.getString("animalId"));
        assertEquals("chestnut", early.getString("skinId"));
        assertEquals("timer", early.getString("source"));

        // With autoRest=true and restMinutes=10 -> creates 10m rest session
        store.write("data", new JSONObject().put("preferences", new JSONObject().put("autoRest", true).put("restMinutes", 10)));
        engine.start(session("countdown", false));
        clock.advance(25 * 60_000L);
        engine.action("read");
        JSONObject rest = store.read("rest");
        assertEquals(10 * 60_000L, rest.getLong("durationMs"));
        assertEquals(1, effects.syncRestCount);
    }

    @Test
    public void failLeaveSettlesRunningCountdownAndStopwatchAsEarlyLeftAppAfterRegretWindow() throws Exception {
        MemoryStore store = new MemoryStore();
        FakeClock clock = new FakeClock();
        NoopEffects effects = new NoopEffects();
        FocusEngine engine = new FocusEngine(store, clock, effects);

        // Countdown >= 10s settles as early with failReason=left_app
        engine.start(session("countdown", false));
        clock.advance(10_500L);
        JSONObject leaveResult = engine.action("fail_leave");
        assertTrue(leaveResult.isNull("session"));
        JSONObject record = leaveResult.getJSONObject("record");
        assertEquals("early", record.getString("status"));
        assertEquals("left_app", record.getString("failReason"));
        assertEquals(10_500L, record.getLong("durationMs"));
        assertNull(store.read("active"));
        assertEquals(1, effects.cancelledCount);

        // Stopwatch >= 10s also settles as early/left_app (not completed!)
        engine.start(session("stopwatch", false));
        clock.advance(12_000L);
        JSONObject stopwatchLeave = engine.action("fail_leave");
        JSONObject swRecord = stopwatchLeave.getJSONObject("record");
        assertEquals("early", swRecord.getString("status"));
        assertEquals("left_app", swRecord.getString("failReason"));

        // Paused session must NOT be failed by fail_leave
        engine.start(session("countdown", false));
        clock.advance(15_000L);
        engine.action("pause");
        JSONObject pausedLeave = engine.action("fail_leave");
        assertFalse(pausedLeave.isNull("session"));
        assertEquals("paused", pausedLeave.getJSONObject("session").getString("state"));
        assertFalse(pausedLeave.has("record"));
    }

    @Test
    public void failLeaveRejectsStrictCountdownBothUnderAndOver10s() throws Exception {
        MemoryStore store = new MemoryStore();
        FakeClock clock = new FakeClock();
        NoopEffects effects = new NoopEffects();
        FocusEngine engine = new FocusEngine(store, clock, effects);

        engine.start(session("countdown", true));
        clock.advance(3_000L);
        JSONObject activeUnder10s = store.read("active");
        assertThrows(IllegalStateException.class, () ->
            FocusControl.enforceFocusActionAllowed(activeUnder10s, "fail_leave", false)
        );
        assertThrows(IllegalStateException.class, () -> engine.action("fail_leave"));
        assertNotNull(store.read("active"));
        assertNull(store.read("lastFinished"));

        clock.advance(12_000L);
        JSONObject activeOver10s = store.read("active");
        assertThrows(IllegalStateException.class, () ->
            FocusControl.enforceFocusActionAllowed(activeOver10s, "fail_leave", false)
        );
        assertThrows(IllegalStateException.class, () -> engine.action("fail_leave"));
        assertEquals("sess-1", store.read("active").getString("id"));
        assertNull(store.read("lastFinished"));
    }
}
