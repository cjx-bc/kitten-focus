package com.xiaomao.focus;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public class FocusNotificationActionsTest {
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
        long mono = 10_000L;
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
        @Override public void scheduleFocus(JSONObject session) {}
        @Override public void showFocus(JSONObject session, long elapsedMs) {}
        @Override public void cancelFocusAlarm() {}
        @Override public void cancelFocus() {}
        @Override public void showFinished(JSONObject session) {}
        @Override public void exitRest() {}
        @Override public void syncRest() {}
        @Override public JSONObject readRest() { return new JSONObject(); }
    }

    private JSONObject session(String mode, String state, boolean strictMode) throws JSONException {
        return new JSONObject()
            .put("id", "sess-notif")
            .put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL)
            .put("title", "高数刷题")
            .put("themeName", "数学")
            .put("color", "#ef4e36")
            .put("mode", mode)
            .put("targetMs", 25 * 60_000L)
            .put("startedAt", 0L)
            .put("timeZone", "Asia/Shanghai")
            .put("state", state)
            .put("elapsedMs", 0L)
            .put("pausedMs", 0L)
            .put("strictMode", strictMode)
            .put("segments", new JSONArray());
    }

    @Test
    public void exposesPauseResumeAndFinishOnlyForNonStrictOrNonLockFocusNotifications() throws Exception {
        assertEquals(
            Arrays.asList("暂停", "结束", "帮助与故障恢复"),
            Reminders.focusNotificationActionLabels(session("countdown", "running", false))
        );
        assertEquals(
            Arrays.asList("继续", "结束", "帮助与故障恢复"),
            Reminders.focusNotificationActionLabels(session("countdown", "paused", false))
        );
        assertEquals(
            Arrays.asList("暂停", "结束", "帮助与故障恢复"),
            Reminders.focusNotificationActionLabels(session("stopwatch", "running", false))
        );
        // Stopwatch is not constrained by strictMode
        assertEquals(
            Arrays.asList("暂停", "结束", "帮助与故障恢复"),
            Reminders.focusNotificationActionLabels(session("stopwatch", "running", true))
        );

        // Strict countdown must NOT expose pause or finish
        assertFalse(Reminders.shouldShowFocusControls(session("countdown", "running", true)));
        assertEquals(
            Collections.singletonList("帮助与故障恢复"),
            Reminders.focusNotificationActionLabels(session("countdown", "running", true))
        );

        // Lock session must NOT expose focus pause or finish
        JSONObject lock = session("countdown", "running", false).put("kind", "lock");
        assertFalse(Reminders.shouldShowFocusControls(lock));
        assertEquals(
            Collections.singletonList("帮助与故障恢复"),
            Reminders.focusNotificationActionLabels(lock)
        );
    }

    @Test
    public void routesNotificationActionsToFocusLifecycleAndRejectsStrictCountdown() throws Exception {
        MemoryStore store = new MemoryStore();
        FakeClock clock = new FakeClock();
        FocusEngine engine = new FocusEngine(store, clock, new NoopEffects());

        ReminderReceiver.FocusActionDispatcher guardedDispatcher = action -> {
            JSONObject active = store.read("active");
            FocusControl.enforceFocusActionAllowed(active, action, false);
            engine.action(action);
        };

        // Non-strict countdown: pause -> resume -> finish
        engine.start(session("countdown", "running", false));
        clock.advance(15_000L);
        assertTrue(ReminderReceiver.handleNotificationAction(guardedDispatcher, Reminders.FOCUS_ACTION_PAUSE));
        assertEquals("paused", store.read("active").getString("state"));

        assertTrue(ReminderReceiver.handleNotificationAction(guardedDispatcher, Reminders.FOCUS_ACTION_RESUME));
        assertEquals("running", store.read("active").getString("state"));

        assertTrue(ReminderReceiver.handleNotificationAction(guardedDispatcher, Reminders.FOCUS_ACTION_FINISH));
        assertNull(store.read("active"));
        assertEquals("early", store.read("lastFinished").getString("status"));

        // Unrelated action returns false
        assertFalse(ReminderReceiver.handleNotificationAction(guardedDispatcher, Reminders.FOCUS_ACTION));

        // Strict countdown: direct broadcast invocation MUST be rejected without altering session
        engine.start(session("countdown", "running", true));
        clock.advance(15_000L);
        assertThrows(IllegalStateException.class, () ->
            ReminderReceiver.handleNotificationAction(guardedDispatcher, Reminders.FOCUS_ACTION_PAUSE)
        );
        assertThrows(IllegalStateException.class, () ->
            ReminderReceiver.handleNotificationAction(guardedDispatcher, Reminders.FOCUS_ACTION_RESUME)
        );
        assertThrows(IllegalStateException.class, () ->
            ReminderReceiver.handleNotificationAction(guardedDispatcher, Reminders.FOCUS_ACTION_FINISH)
        );
        assertEquals("running", store.read("active").getString("state"));
        assertEquals("sess-notif", store.read("active").getString("id"));
    }
}
