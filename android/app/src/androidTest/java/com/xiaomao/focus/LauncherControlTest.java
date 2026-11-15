package com.xiaomao.focus;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Public FocusControl seam; only PackageManager/notification effects and clock are substituted. */
@RunWith(AndroidJUnit4.class)
public class LauncherControlTest {
    Context context; LocalStore store; FocusControl control; String database; int sequence;
    final Clock clock = new Clock(); final Launcher launcher = new Launcher();
    static class Clock implements SessionClock {
        long time = 1000000; int boot = 1;
        public long epoch() { return 1794729600000L + time; }
        public long mono() { return time; }
        public int boot() { return boot; }
    }
    static class Launcher implements LauncherSystem {
        int state = 0; long version = 9; boolean reachable = true, available = true, failRestore, resolverMissing;
        public boolean recoveryAvailable() { return available; }
        public long installedVersion() { return version; }
        public boolean recoveryReachable() { return reachable; }
        public int componentState() { return state; }
        public void componentState(int value) {
            if (value != 2 && failRestore) throw new IllegalStateException("restore denied");
            state = value;
        }
        public boolean launcherVisible() { return state != 2 && !resolverMissing; }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "launcher-control-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database); recreate();
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false}}"));
    }
    void recreate() { control = new FocusControl(context, store, clock, launcher); }
    @After public void cleanup() {
        Reminders.cancelFocus(context); Reminders.cancelRest(context); store.close(); context.deleteDatabase(database);
        context.getSharedPreferences("catfocus-launcher-" + database, 0).edit().clear().commit();
    }
    void preference(boolean enabled) throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("enhancements", new JSONArray(enabled ? "[\"launcherIconHidden\"]" : "[]")));
        store.saveData(data, false);
    }
    JSONObject session(String mode) throws Exception {
        return new JSONObject().put("id", "launcher-" + (++sequence)).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("themeName", "自由专注").put("color", "#222222").put("title", "Launcher fixture").put("mode", mode).put("targetMs", 60000).put("startedAt", clock.epoch()).put("timeZone", "UTC").put("segments", new JSONArray());
    }
    JSONObject status() throws Exception { return control.observeControl().getJSONObject("launcher"); }
    @Test public void defaultOffAndOptInFreezesUntilEndRestoresExactDefault() throws Exception {
        control.startFocus(session("stopwatch")); assertEquals(0, launcher.state);
        clock.time += 1000; control.focusAction("finish"); control.restAction("exit");
        preference(true); control.startFocus(session("stopwatch"));
        assertEquals(2, launcher.state); assertTrue(status().getBoolean("verified"));
        preference(false); control.focusAction("pause"); recreate(); control.reconcile(); assertEquals(2, launcher.state);
        control.focusAction("resume"); clock.time += 1000; control.focusAction("finish");
        assertEquals(0, launcher.state); assertEquals("rest", control.observeControl().getString("owner"));
        assertEquals("restored", status().getString("phase"));
    }

    @Test public void noNotificationPermissionRejectsAdmissionAndUnreachablePostedEntryNeverHides() throws Exception {
        preference(true); launcher.available = false;
        try { control.startFocus(session("stopwatch")); fail("Must not hide without permission"); } catch (IllegalStateException expected) { }
        assertEquals(0, launcher.state); assertTrue(control.observeControl().isNull("owner"));
        launcher.available = true; launcher.reachable = false;
        control.startFocus(session("stopwatch")); assertEquals(0, launcher.state);
        assertFalse(status().getBoolean("verified")); assertFalse(status().getBoolean("recoveryPending"));
        launcher.reachable = true; recreate(); control.reconcile();
        assertEquals(0, launcher.state); assertEquals("withdrawn", status().getString("phase"));
    }
    @Test public void recoveryFailureKeepsDutyUntilRetryAndDoesNotReapplyThisRound() throws Exception {
        preference(true); launcher.state = 1; control.startFocus(session("stopwatch")); launcher.failRestore = true;
        JSONObject preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertEquals("restoration_failed", status().getString("phase")); assertTrue(status().getBoolean("recoveryPending"));
        launcher.failRestore = false; recreate(); preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertEquals(1, launcher.state); assertEquals("withdrawn", status().getString("phase"));
        control.reconcile(); assertEquals(1, launcher.state); assertEquals("focus", control.observeControl().getString("owner"));
    }
    @Test public void pendingDutyBlocksNextRoundAndDataReplacementUntilActuallyRestored() throws Exception {
        preference(true); control.startFocus(session("stopwatch")); launcher.failRestore = true;
        clock.time += 1000; control.focusAction("finish"); control.restAction("exit");
        try { control.startFocus(session("stopwatch")); fail("Pending original state blocks new hide"); } catch (IllegalStateException expected) { }
        try { control.replaceData(control.loadData()); fail("Replacement must retain pending duty"); } catch (IllegalStateException expected) { }
        assertTrue(status().getBoolean("recoveryPending"));
        launcher.failRestore = false; JSONObject preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertEquals(0, launcher.state); assertFalse(status().getBoolean("recoveryPending"));
    }
    @Test public void notificationLossRestoresAndServiceReconnectDoesNotHideAgain() throws Exception {
        preference(true); control.startFocus(session("stopwatch")); launcher.reachable = false;
        control.reconcile(); assertEquals(0, launcher.state); launcher.reachable = true;
        recreate(); control.reconcile(); assertEquals(0, launcher.state); assertEquals("withdrawn", status().getString("phase"));
    }
    @Test public void processRecreationRetainsOriginalAndRebootRestoresBeforeNewRound() throws Exception {
        preference(true); launcher.state = 1; control.startFocus(session("stopwatch"));
        recreate(); control.reconcile(); assertEquals(2, launcher.state);
        clock.time += 1000; control.focusAction("read"); clock.boot++; clock.time = 20;
        recreate(); control.reconcile(); assertEquals(1, launcher.state); assertTrue(control.observeControl().isNull("owner"));
        assertEquals("interrupted", control.loadData().getJSONArray("records").getJSONObject(0).getString("status"));
    }
    @Test public void upgradeRestoresEvenWhenActiveRoundSurvivesAndDoesNotRehide() throws Exception {
        preference(true); control.startFocus(session("stopwatch")); launcher.version++;
        recreate(); control.reconcile(); assertEquals(0, launcher.state);
        assertEquals("withdrawn", status().getString("phase")); control.reconcile(); assertEquals(0, launcher.state);
    }
    @Test public void countdownAndLockEndRestoreAndNeverEnableAnOriginallyDisabledAlias() throws Exception {
        preference(true); launcher.state = 2; control.startFocus(session("countdown"));
        clock.time += 60000; control.reconcile(); assertEquals(2, launcher.state);
        control.restAction("exit"); launcher.state = 0;
        JSONObject data = control.loadData();
        data.put("lockConfigurations", new JSONArray().put(new JSONObject().put("id", "lock-one").put("name", "阅读")
            .put("minutes", 1).put("strict", false).put("whitelist", new JSONObject().put("source", "global"))));
        store.saveData(data, false); control.startLock("lock-one"); assertEquals(2, launcher.state);
        clock.time += 1000; control.lockAction("finish", true); assertEquals(0, launcher.state);
        assertTrue(control.observeControl().isNull("owner")); assertEquals(1, control.loadData().getJSONArray("records").length());
    }
    @Test public void laterComponentChoiceIsPreservedAndObservationNeverWrites() throws Exception {
        preference(true); control.startFocus(session("stopwatch")); launcher.state = 1;
        assertEquals("failed", status().getString("phase")); assertEquals(1, launcher.state);
        control.reconcile(); assertEquals(1, launcher.state); assertEquals("withdrawn", status().getString("phase"));
        clock.time += 1000; control.focusAction("finish"); assertEquals(1, launcher.state);
    }

    @Test public void restorationRemainsRetryableUntilEnabledAliasActuallyResolves() throws Exception {
        preference(true); control.startFocus(session("stopwatch")); launcher.resolverMissing = true;
        clock.time += 1000; control.focusAction("finish");
        assertEquals(0, launcher.state); assertEquals("restoration_failed", status().getString("phase"));
        assertTrue(status().getBoolean("recoveryPending"));
        launcher.resolverMissing = false; JSONObject preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertFalse(status().getBoolean("recoveryPending")); assertTrue(status().getBoolean("launcherResolved"));
    }
}
