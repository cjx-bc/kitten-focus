package com.xiaomao.focus;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class RestEngineCustomDurationTest {
    private static final class MemoryStore implements FocusEngine.Store {
        final Map<String, JSONObject> docs = new HashMap<>();

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
                write("lastFinished", record);
            }
            write("active", null);
            write("rest", rest);
        }
    }

    private static final class FakeClock implements SessionClock {
        long epoch = 1_700_000_000_000L;
        long mono = 50_000L;
        int boot = 1;

        @Override public long epoch() { return epoch; }
        @Override public long mono() { return mono; }
        @Override public int boot() { return boot; }

        void advance(long ms) {
            epoch += ms;
            mono += ms;
        }
    }

    private static final class FakeEffects implements RestEngine.SideEffects {
        int scheduledCount = 0;
        long lastScheduledEndMono = -1L;
        int cancelledCount = 0;
        int finishedShownCount = 0;

        @Override
        public void scheduleRest(long endMono) {
            scheduledCount++;
            lastScheduledEndMono = endMono;
        }

        @Override
        public void cancelRest() {
            cancelledCount++;
        }

        @Override
        public void showRestFinished() {
            finishedShownCount++;
        }
    }

    private JSONObject completedFocusRecord(String id) throws JSONException {
        return new JSONObject()
            .put("id", id)
            .put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL)
            .put("title", "高数复习")
            .put("themeName", "数学")
            .put("color", "#ef4e36")
            .put("mode", "countdown")
            .put("targetMs", 25 * 60_000L)
            .put("startedAt", 1_699_998_500_000L)
            .put("endedAt", 1_700_000_000_000L)
            .put("timeZone", "Asia/Shanghai")
            .put("durationMs", 25 * 60_000L)
            .put("pausedMs", 0L)
            .put("segments", new JSONArray())
            .put("status", "completed");
    }

    @Test
    public void createsAndObserves10_15_20MinuteRestFromPreferencesWithout5MinCap() throws Exception {
        for (int minutes : new int[]{10, 15, 20}) {
            MemoryStore store = new MemoryStore();
            FakeClock clock = new FakeClock();
            FakeEffects effects = new FakeEffects();
            RestEngine engine = new RestEngine(store, clock, effects);

            JSONObject record = completedFocusRecord("rec-" + minutes);
            store.write("lastFinished", record);
            store.write("data", new JSONObject().put("preferences", new JSONObject().put("restMinutes", minutes)));

            JSONObject started = engine.start("rec-" + minutes);
            long expectedMs = minutes * 60_000L;
            assertEquals(expectedMs, started.getLong("remainingMs"));
            assertEquals(expectedMs, started.getJSONObject("session").getLong("durationMs"));
            assertEquals("running", started.getJSONObject("session").getString("state"));
            assertEquals(1, effects.scheduledCount);

            clock.advance(6 * 60_000L);
            JSONObject observed = engine.observe();
            assertEquals(expectedMs - 6 * 60_000L, observed.getLong("remainingMs"));
            assertEquals("running", observed.getJSONObject("session").getString("state"));
            // observe() must not mutate completion or fire notifications
            assertEquals(0, effects.finishedShownCount);
        }
    }

    @Test
    public void recoversRemainingRestAcrossRebootAndCompletesOnExpiry() throws Exception {
        MemoryStore store = new MemoryStore();
        FakeClock clock = new FakeClock();
        FakeEffects effects = new FakeEffects();
        RestEngine engine = new RestEngine(store, clock, effects);

        JSONObject record = completedFocusRecord("rec-reboot");
        store.write("lastFinished", record);
        store.write("data", new JSONObject().put("preferences", new JSONObject().put("restMinutes", 15)));
        engine.start("rec-reboot");

        // Simulate device reboot after 7 minutes of wall-clock time; monotonic clock resets to 10_000
        clock.epoch += 7 * 60_000L;
        clock.boot = 2;
        clock.mono = 10_000L;

        // Pure observe() reports 8 minutes remaining across boot change
        JSONObject observed = engine.observe();
        assertEquals(8 * 60_000L, observed.getLong("remainingMs"));

        // read() rebases endMono/bootId and reschedules alarm
        JSONObject recovered = engine.read();
        assertEquals(8 * 60_000L, recovered.getLong("remainingMs"));
        assertEquals("running", recovered.getJSONObject("session").getString("state"));
        assertEquals(2, store.read("rest").getInt("bootId"));
        assertEquals(10_000L + 8 * 60_000L, store.read("rest").getLong("endMono"));
        assertEquals(2, effects.scheduledCount);

        // Advance past remaining 8 minutes -> completes & notifies
        clock.advance(8 * 60_000L);
        JSONObject done = engine.read();
        assertEquals(0L, done.getLong("remainingMs"));
        assertEquals("completed", done.getJSONObject("session").getString("state"));
        assertEquals(1, effects.finishedShownCount);
        assertEquals(1, effects.cancelledCount);

        // Focus record remains untouched and exit clears rest
        assertEquals(25 * 60_000L, store.read("lastFinished").getLong("durationMs"));
        engine.exit();
        assertNull(store.read("rest"));
    }
}
