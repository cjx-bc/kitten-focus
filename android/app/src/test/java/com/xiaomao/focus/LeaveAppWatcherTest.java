package com.xiaomao.focus;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class LeaveAppWatcherTest {
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
        @Override public void scheduleFocus(JSONObject session) {}
        @Override public void showFocus(JSONObject session, long elapsedMs) {}
        @Override public void cancelFocusAlarm() {}
        @Override public void cancelFocus() {}
        @Override public void showFinished(JSONObject session) {}
        @Override public void exitRest() {}
        @Override public void syncRest() {}
        @Override public JSONObject readRest() { return new JSONObject(); }
    }

    private static final class FakeScheduler implements LeaveAppWatcher.TimerScheduler {
        Runnable scheduledTask;
        long scheduledDelayMs = -1L;
        int scheduleCalls = 0;
        int cancelCalls = 0;

        @Override
        public void schedule(long delayMs, Runnable task) {
            this.scheduledDelayMs = delayMs;
            this.scheduledTask = task;
            this.scheduleCalls++;
        }

        @Override
        public void cancel() {
            this.scheduledTask = null;
            this.cancelCalls++;
        }

        boolean hasPending() {
            return scheduledTask != null;
        }

        void fire(FakeClock clock) {
            Runnable task = scheduledTask;
            if (task == null) return;
            clock.advance(scheduledDelayMs);
            scheduledTask = null;
            task.run();
        }
    }

    private static final class FakeEnvironment implements LeaveAppWatcher.LeaveEnvironment {
        final MemoryStore store = new MemoryStore();
        final FakeClock clock = new FakeClock();
        final FocusEngine engine = new FocusEngine(store, clock, new NoopEffects());

        boolean interactive = true;
        boolean keyguardLocked = false;
        boolean inActiveCall = false;
        boolean yieldedWhitelist = false;
        boolean settingsAuthInFlight = false;
        boolean canAttachOverlay = false;

        int showWarningCount = 0;
        int cancelWarningCount = 0;
        int failByLeaveCount = 0;
        int sessionChangedCount = 0;

        @Override public boolean isInteractive() { return interactive; }
        @Override public boolean isKeyguardLocked() { return keyguardLocked; }
        @Override public boolean isInActiveCall() { return inActiveCall; }
        @Override public boolean isYieldedWhitelist() { return yieldedWhitelist; }
        @Override public boolean isSettingsAuthorizationInFlight() { return settingsAuthInFlight; }
        @Override public boolean canAttachOverlay() { return canAttachOverlay; }
        @Override public JSONObject readActiveSession() throws JSONException { return store.read("active"); }
        @Override public JSONObject readData() throws JSONException { return store.read("data"); }
        @Override public long monotonicNowMs() { return clock.mono(); }
        @Override public void showLeaveWarning() { showWarningCount++; }
        @Override public void cancelLeaveWarning() { cancelWarningCount++; }

        @Override
        public void failByLeave() {
            failByLeaveCount++;
            try {
                JSONObject res = engine.action("fail_leave");
                if (res != null && res.isNull("session")) {
                    sessionChangedCount++;
                }
            } catch (JSONException e) {
                throw new RuntimeException(e);
            }
        }
    }

    private static JSONObject focusSession(String state, boolean study, boolean studyLocked, boolean withdrawn) throws JSONException {
        JSONObject protection = new JSONObject()
            .put("study", study)
            .put("studyLocked", studyLocked)
            .put("applicationsWithdrawn", withdrawn);
        return new JSONObject()
            .put("id", "sess-1")
            .put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL)
            .put("title", "高数刷题")
            .put("themeName", "高数")
            .put("color", "#ef4e36")
            .put("mode", "countdown")
            .put("targetMs", 25 * 60_000L)
            .put("startedAt", 0L)
            .put("timeZone", "Asia/Shanghai")
            .put("state", state)
            .put("elapsedMs", 0L)
            .put("pausedMs", 0L)
            .put("strictMode", false)
            .put("animalId", "black-cat")
            .put("skinId", "default")
            .put("protection", protection)
            .put("segments", new JSONArray());
    }

    private static JSONObject lockSession() throws JSONException {
        return new JSONObject()
            .put("id", "lock-1")
            .put("kind", "lock")
            .put("title", "晚自习锁机")
            .put("mode", "countdown")
            .put("targetMs", 25 * 60_000L)
            .put("state", "running")
            .put("protection", new JSONObject().put("study", true));
    }

    @Test
    public void brightScreenLeaveTriggersWarningAndFailsAsEarlyLeftAppAt10s() throws Exception {
        FakeEnvironment env = new FakeEnvironment();
        FakeScheduler scheduler = new FakeScheduler();
        LeaveAppWatcher watcher = new LeaveAppWatcher(env, scheduler);

        env.engine.start(focusSession("running", false, false, false));
        // No leaveAppFail preference set -> defaults to true
        env.clock.advance(2_000L);

        watcher.onStop();
        assertEquals(1, env.showWarningCount);
        assertTrue(scheduler.hasPending());
        assertEquals(10_000L, scheduler.scheduledDelayMs);
        assertEquals(0, env.failByLeaveCount);

        scheduler.fire(env.clock);
        assertEquals(1, env.failByLeaveCount);
        assertEquals(1, env.cancelWarningCount);
        assertEquals(1, env.sessionChangedCount);
        assertNull(env.store.read("active"));
        JSONObject record = env.store.read("lastFinished");
        assertNotNull(record);
        assertEquals("early", record.getString("status"));
        assertEquals("left_app", record.getString("failReason"));
    }

    @Test
    public void returningBefore10sCancelsTimerAndWarningWithoutFailingSession() throws Exception {
        FakeEnvironment env = new FakeEnvironment();
        FakeScheduler scheduler = new FakeScheduler();
        LeaveAppWatcher watcher = new LeaveAppWatcher(env, scheduler);

        env.engine.start(focusSession("running", false, false, false));
        env.clock.advance(5_000L);
        watcher.onStop();
        assertEquals(1, env.showWarningCount);
        assertTrue(scheduler.hasPending());

        env.clock.advance(9_000L);
        watcher.onForeground();
        assertFalse(scheduler.hasPending());
        assertEquals(1, env.cancelWarningCount);
        assertEquals(0, env.failByLeaveCount);
        assertNotNull(env.store.read("active"));
        assertNull(env.store.read("lastFinished"));
    }

    @Test
    public void exemptsNoActiveSessionAndIndependentLockSession() throws Exception {
        FakeEnvironment env = new FakeEnvironment();
        FakeScheduler scheduler = new FakeScheduler();
        LeaveAppWatcher watcher = new LeaveAppWatcher(env, scheduler);

        // 1a. No active session
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());

        // 1b. Independent lock session (LockEngine.owns)
        env.store.write("active", lockSession());
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());
    }

    @Test
    public void exemptsPausedSessionAndDisabledPreference() throws Exception {
        FakeEnvironment env = new FakeEnvironment();
        FakeScheduler scheduler = new FakeScheduler();
        LeaveAppWatcher watcher = new LeaveAppWatcher(env, scheduler);

        // 2. Paused focus session
        env.engine.start(focusSession("running", false, false, false));
        env.engine.action("pause");
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());

        // 3. preferences.leaveAppFail === false
        env.engine.action("resume");
        env.store.write("data", new JSONObject().put("preferences", new JSONObject().put("leaveAppFail", false)));
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());
    }

    @Test
    public void exemptsScreenOffLockscreenAndActiveCall() throws Exception {
        FakeEnvironment env = new FakeEnvironment();
        FakeScheduler scheduler = new FakeScheduler();
        LeaveAppWatcher watcher = new LeaveAppWatcher(env, scheduler);
        env.engine.start(focusSession("running", false, false, false));

        // 4. Screen off
        env.interactive = false;
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());

        // 5. Lockscreen showing
        env.interactive = true;
        env.keyguardLocked = true;
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());

        // 6. Cellular call / ringing
        env.keyguardLocked = false;
        env.inActiveCall = true;
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());
    }

    @Test
    public void exemptsYieldedWhitelistTemporaryAccessAndSettingsAuthorizationJump() throws Exception {
        FakeEnvironment env = new FakeEnvironment();
        FakeScheduler scheduler = new FakeScheduler();
        LeaveAppWatcher watcher = new LeaveAppWatcher(env, scheduler);
        env.engine.start(focusSession("running", false, false, false));

        // 7a. Yielded whitelist app
        env.yieldedWhitelist = true;
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());
        env.yieldedWhitelist = false;

        // 7b. Active temporaryAccess grant on session
        JSONObject active = env.store.read("active");
        active.put("temporaryAccessRuntime", new JSONObject().put("grant", new JSONObject()
            .put("targetPackage", "com.tencent.mm")
            .put("bootId", env.clock.boot())
            .put("startedMono", env.clock.mono())
            .put("deadlineMono", env.clock.mono() + 60_000L)));
        env.store.write("active", active);
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());
        active.remove("temporaryAccessRuntime");
        env.store.write("active", active);

        // 8. In-app authorization jump to system settings
        env.settingsAuthInFlight = true;
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());
    }

    @Test
    public void exemptsReadyStudyOverlayAndFallsBackWhenOverlayMissingOrWithdrawn() throws Exception {
        FakeEnvironment env = new FakeEnvironment();
        FakeScheduler scheduler = new FakeScheduler();
        LeaveAppWatcher watcher = new LeaveAppWatcher(env, scheduler);

        // 9. Study mode active + overlay ready -> exempt (overlay handles 0ms pullback)
        env.engine.start(focusSession("running", true, false, false));
        env.canAttachOverlay = true;
        watcher.onStop();
        assertEquals(0, env.showWarningCount);
        assertFalse(scheduler.hasPending());

        // Study mode active + overlay NOT attachable -> falls back to 轻看护
        env.canAttachOverlay = false;
        watcher.onStop();
        assertEquals(1, env.showWarningCount);
        assertTrue(scheduler.hasPending());
        watcher.onForeground();

        // Study protection withdrawn via recovery -> falls back to 轻看护 even if overlay is attachable
        env.canAttachOverlay = true;
        env.store.write("active", focusSession("running", true, false, true));
        watcher.onStop();
        assertEquals(2, env.showWarningCount);
        assertTrue(scheduler.hasPending());
    }

    @Test
    public void exemptionArisingBeforeTimeoutCancelsFailByLeave() throws Exception {
        FakeEnvironment env = new FakeEnvironment();
        FakeScheduler scheduler = new FakeScheduler();
        LeaveAppWatcher watcher = new LeaveAppWatcher(env, scheduler);

        env.engine.start(focusSession("running", false, false, false));
        watcher.onStop();
        assertTrue(scheduler.hasPending());

        // Incoming call starts 3 seconds after leaving
        env.inActiveCall = true;
        scheduler.fire(env.clock);
        assertEquals(0, env.failByLeaveCount);
        assertEquals(1, env.cancelWarningCount);
        assertNotNull(env.store.read("active"));
    }
}
