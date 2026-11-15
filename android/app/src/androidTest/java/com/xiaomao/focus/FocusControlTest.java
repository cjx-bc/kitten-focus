package com.xiaomao.focus;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class FocusControlTest {
    private Context context;
    private LocalStore store;
    private FocusControl control;
    private TestClock clock;
    private String databaseName;

    private static final class TestClock implements SessionClock {
        long epoch = 1794729600000L;
        long mono = 1000000L;
        int boot = 1;
        public long epoch() { return epoch; }
        public long mono() { return mono; }
        public int boot() { return boot; }
        void advance(long ms) { epoch += ms; mono += ms; }
    }

    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Run on the isolated QA application", context.getPackageName().endsWith(".qa"));
        databaseName = "focus-control-" + System.nanoTime() + ".db";
        store = new LocalStore(context, databaseName);
        clock = new TestClock();
        control = new FocusControl(context, store, clock);
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false}}"));
    }

    @After public void cleanup() {
        if (context == null || store == null) return;
        Reminders.cancelFocus(context);
        Reminders.cancelRest(context);
        store.close();
        context.deleteDatabase(databaseName);
    }

    private JSONObject session(String mode) throws Exception {
        return new JSONObject().put("id", "focus-one").put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL).put("title", "自由专注").put("themeName", "自由专注")
            .put("color", "#222222").put("mode", mode).put("targetMs", 60000)
            .put("startedAt", clock.epoch()).put("timeZone", "UTC").put("state", "running")
            .put("elapsedMs", 0).put("pausedMs", 0).put("segments", new JSONArray());
    }

    @Test public void navigationChoiceIsIndependentAndFixedWhilePausedThenRecoverable() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("study", false)
            .put("enhancements", new JSONArray().put("navigationHomeRecents")));
        control.replaceData(data);
        FocusProtection.AccessibilityState available = new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; }
            public boolean connected() { return true; }
        };
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), available);
        JSONObject started = control.startFocus(session("countdown"));
        assertEquals("navigationHomeRecents", started.getJSONObject("session").getJSONObject("protection")
            .getJSONArray("enhancements").getString(0));
        assertFalse(started.getJSONObject("session").getJSONObject("protection").getBoolean("study"));
        data.getJSONObject("preferences").getJSONObject("protection").put("enhancements", new JSONArray());
        store.saveData(data, false);
        clock.advance(1000);
        control.focusAction("pause");
        assertTrue(control.observeControl().getJSONObject("navigation").getBoolean("requested"));
        JSONObject recovery = control.previewRecovery();
        assertEquals("navigationRestriction", recovery.getJSONArray("steps").getJSONObject(0).getString("capability"));
        control.confirmRecovery(recovery.getString("revision"));
        assertEquals("recovered", control.observeControl().getJSONObject("navigation").getString("state"));
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), available);
        assertFalse(control.observeControl().getJSONObject("navigation").getBoolean("active"));
        assertEquals("paused", control.observeControl().getJSONObject("focus").getJSONObject("session").getString("state"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
    }

    @Test public void navigationReportsObservedReturnAndStopsAtDeadlineWithoutSettling() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject()
            .put("enhancements", new JSONArray().put("navigationHomeRecents")));
        control.replaceData(data);
        int[] returns = {0};
        FocusNavigation.Device device = new FocusNavigation.Device() {
            public boolean supported() { return true; }
            public boolean authorized() { return true; }
            public boolean connected() { return true; }
            public String target(String pkg, String cls) { return "launcher".equals(pkg) && "Home".equals(cls) ? "home" : ""; }
            public void returnToFocus(String target) { returns[0]++; }
        };
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), null,
            new AndroidDndSystem(context), packageName -> () -> {}, device);
        control.startFocus(session("countdown"));
        assertEquals("armed", control.observeControl().getJSONObject("navigation").getString("state"));
        assertFalse(control.navigationWindow("com.android.phone", "Dialer"));
        assertFalse(control.navigationWindow("com.android.settings", "Settings"));
        assertTrue(control.navigationWindow("launcher", "Home"));
        assertEquals(1, returns[0]);
        assertFalse(control.observeControl().getJSONObject("navigation").getBoolean("active"));
        control.navigationWindow(context.getPackageName(), "com.xiaomao.focus.MainActivity");
        assertEquals("protecting", control.observeControl().getJSONObject("navigation").getString("state"));
        clock.advance(60000);
        assertTrue(control.observeControl().getBoolean("needsReconcile"));
        assertFalse(control.navigationWindow("launcher", "Home"));
        assertFalse(control.observeControl().getJSONObject("navigation").getBoolean("active"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
        control.reconcile();
        assertEquals("rest", control.observeControl().getString("owner"));
        assertFalse(control.previewRecovery().getBoolean("pending"));
    }

    @Test public void strictCountdownRequiresConfirmationBeforeStart() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("strict", true));
        control.replaceData(data);
        try {
            control.startFocus(session("countdown").put("strictMode", false));
            fail("Strict countdown must be confirmed before it can start");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("确认"));
        }
        assertTrue(control.observeControl().isNull("owner"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
    }

    @Test public void strictCountdownKeepsItsRulesAfterPreferenceChangesAndRecreation() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("strict", true));
        control.replaceData(data);
        JSONObject started = control.startFocus(session("countdown").put("strictMode", false), true);
        assertTrue(started.getJSONObject("session").getBoolean("strictMode"));
        assertFalse(started.getJSONObject("session").getJSONObject("protection").getBoolean("study"));
        clock.advance(10000);
        data.getJSONObject("preferences").getJSONObject("protection").put("strict", false);
        store.saveData(data, false);
        control = new FocusControl(context, store, clock);
        for (String action : new String[] { "pause", "finish", "cancel", "resume", "replace" }) {
            try { control.focusAction(action); fail("Strict countdown accepted " + action); }
            catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("严格")); }
        }
        try { control.startFocus(session("stopwatch"), true); fail("Strict countdown was replaced"); }
        catch (IllegalStateException expected) { }
        try { control.replaceData(data); fail("Strict countdown was erased by restore"); }
        catch (IllegalStateException expected) { }
        JSONObject observed = control.observeControl();
        assertEquals("running", observed.getJSONObject("focus").getJSONObject("session").getString("state"));
        assertEquals(10000, observed.getJSONObject("focus").getLong("elapsedMs"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
        clock.advance(50000);
        for (int i = 0; i < 2; i++) {
            assertTrue(control.observeControl().getBoolean("needsReconcile"));
            assertEquals(0, control.loadData().getJSONArray("records").length());
        }
        JSONObject completed = control.focusAction("read").getJSONObject("record");
        assertEquals("completed", completed.getString("status"));
        assertEquals(60000, completed.getLong("durationMs"));
        assertEquals(300000, control.observeControl().getJSONObject("rest").getLong("remainingMs"));
        control.reconcile();
        assertEquals(1, control.loadData().getJSONArray("records").length());
    }

    @Test public void strictPreferenceDoesNotTurnStopwatchIntoCountdownOrTrustClientFlags() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("strict", true));
        control.replaceData(data);
        JSONObject started = control.startFocus(session("stopwatch").put("strictMode", true));
        assertEquals("stopwatch", started.getJSONObject("session").getString("mode"));
        assertFalse(started.getJSONObject("session").getBoolean("strictMode"));
        clock.advance(10000);
        control.focusAction("pause");
        clock.advance(20000);
        control.focusAction("resume");
        clock.advance(5000);
        JSONObject record = control.focusAction("finish").getJSONObject("record");
        assertEquals("completed", record.getString("status"));
        assertEquals(15000, record.getLong("durationMs"));
        assertEquals(20000, record.getLong("pausedMs"));
        assertEquals(300000, control.observeControl().getJSONObject("rest").getLong("remainingMs"));
        control.restAction("exit");
        data.getJSONObject("preferences").getJSONObject("protection").put("strict", false);
        control.replaceData(data);
        assertFalse(control.startFocus(session("countdown").put("strictMode", true), true)
            .getJSONObject("session").getBoolean("strictMode"));
        clock.advance(10000);
        assertEquals("early", control.focusAction("finish").getJSONObject("record").getString("status"));
    }

    @Test public void strictCountdownRebootKeepsOnlyCheckpointedTimeAndDoesNotStartRest() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("strict", true));
        control.replaceData(data);
        control.startFocus(session("countdown"), true);
        clock.advance(10000);
        control.focusAction("read");
        clock.advance(20000);
        clock.boot++;
        clock.mono = 100;
        control = new FocusControl(context, store, clock);
        JSONObject interrupted = control.focusAction("finish").getJSONObject("record");
        assertEquals("interrupted", interrupted.getString("status"));
        assertEquals(10000, interrupted.getLong("durationMs"));
        assertTrue(control.observeControl().isNull("owner"));
        assertTrue(control.observeControl().getJSONObject("rest").isNull("session"));
        control.reconcile();
        assertEquals(1, control.loadData().getJSONArray("records").length());
    }

    @Test public void observationDoesNotSettleAnExpiredCountdown() throws Exception {
        control.startFocus(session("countdown"));
        clock.advance(90000);
        for (int i = 0; i < 3; i++) {
            JSONObject observed = control.observeControl();
            assertEquals("focus", observed.getString("owner"));
            assertTrue(observed.getBoolean("needsReconcile"));
            assertEquals("running", observed.getJSONObject("focus").getJSONObject("session").getString("state"));
            assertEquals(0, observed.getJSONObject("focus").getJSONObject("session").getLong("elapsedMs"));
            assertEquals(60000, observed.getJSONObject("focus").getLong("elapsedMs"));
            assertTrue(observed.getJSONObject("rest").isNull("session"));
            assertEquals(0, control.loadData().getJSONArray("records").length());
        }

        JSONObject record = control.focusAction("read").getJSONObject("record");
        assertEquals("completed", record.getString("status"));
        assertEquals(60000, record.getLong("durationMs"));
        assertEquals(270000, control.observeControl().getJSONObject("rest").getLong("remainingMs"));
        control.focusAction("read");
        assertEquals(1, control.loadData().getJSONArray("records").length());
    }

    @Test public void pauseResumeAndRestKeepOneOwnerAndExcludePausedTime() throws Exception {
        control.startFocus(session("stopwatch"));
        clock.advance(12000);
        control.focusAction("pause");
        clock.advance(25000);
        JSONObject paused = control.observeControl();
        assertEquals("focus", paused.getString("owner"));
        assertFalse(paused.getBoolean("needsReconcile"));
        assertEquals(12000, paused.getJSONObject("focus").getLong("elapsedMs"));
        try { control.startFocus(session("countdown")); fail("Paused focus still owns control"); }
        catch (IllegalStateException expected) { }
        control.focusAction("resume");
        clock.advance(8000);
        JSONObject record = control.focusAction("finish").getJSONObject("record");
        assertEquals("completed", record.getString("status"));
        assertEquals(20000, record.getLong("durationMs"));
        assertEquals(25000, record.getLong("pausedMs"));
        assertEquals(2, record.getJSONArray("segments").length());
        assertEquals("rest", control.observeControl().getString("owner"));
        assertEquals(300000, control.observeControl().getJSONObject("rest").getLong("remainingMs"));
        try { control.startFocus(session("countdown")); fail("Running rest still owns control"); }
        catch (IllegalStateException expected) { }
        control.restAction("exit");
        assertTrue(control.observeControl().isNull("owner"));
        assertEquals(1, control.loadData().getJSONArray("records").length());
    }

    @Test public void earlyFinishKeepsManualRestIdempotentAndObservationLeavesExpiryPending() throws Exception {
        control.startFocus(session("countdown"));
        clock.advance(10000);
        JSONObject record = control.focusAction("finish").getJSONObject("record");
        assertEquals("early", record.getString("status"));
        assertEquals(10000, record.getLong("durationMs"));
        assertTrue(control.observeControl().isNull("owner"));
        JSONObject first = control.startRest(record.getString("id"));
        long deadline = first.getJSONObject("session").getLong("endMono");
        clock.advance(60000);
        assertEquals(deadline, control.startRest(record.getString("id")).getJSONObject("session").getLong("endMono"));
        clock.advance(240000);
        JSONObject observed = control.observeControl();
        assertEquals("rest", observed.getString("owner"));
        assertTrue(observed.getBoolean("needsReconcile"));
        assertEquals("running", observed.getJSONObject("rest").getJSONObject("session").getString("state"));
        assertEquals(0, observed.getJSONObject("rest").getLong("remainingMs"));
        control.restAction("read");
        assertTrue(control.observeControl().isNull("owner"));
        assertEquals("completed", control.observeControl().getJSONObject("rest").getJSONObject("session").getString("state"));
        assertEquals(1, control.loadData().getJSONArray("records").length());
    }

    @Test public void recreationKeepsDeadlineAndRebootSettlesOnlyCheckpointedTimeOnce() throws Exception {
        control.startFocus(session("countdown"));
        clock.advance(12000);
        JSONObject checkpoint = control.focusAction("read").getJSONObject("session");
        long deadline = checkpoint.getLong("anchorMono") + 48000;
        control = new FocusControl(context, store, clock);
        clock.advance(3000);
        JSONObject recovered = control.observeControl().getJSONObject("focus");
        assertEquals(15000, recovered.getLong("elapsedMs"));
        assertEquals(deadline, recovered.getJSONObject("session").getLong("anchorMono") + 48000);
        clock.boot++;
        clock.mono = 100;
        clock.epoch += 600000;
        JSONObject interrupted = control.observeControl();
        assertTrue(interrupted.getBoolean("needsReconcile"));
        assertEquals(12000, interrupted.getJSONObject("focus").getLong("elapsedMs"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
        control.reconcile();
        JSONObject record = control.loadData().getJSONArray("records").getJSONObject(0);
        assertEquals("interrupted", record.getString("status"));
        assertEquals(12000, record.getLong("durationMs"));
        assertTrue(control.observeControl().isNull("owner"));
        assertTrue(control.observeControl().getJSONObject("rest").isNull("session"));
        control.reconcile();
        assertEquals(1, control.loadData().getJSONArray("records").length());
    }
}
