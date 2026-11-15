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
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

/** Public coordinator seam; only Android's own-task API and time are substituted. */
@RunWith(AndroidJUnit4.class)
public class RecentTasksControlTest {
    Context context; LocalStore store; FocusControl control; String database;
    final Clock clock = new Clock();
    final Tasks tasks = new Tasks();
    int sequence;
    static class Clock implements SessionClock {
        long time = 1000000; int boot = 1;
        public long epoch() { return 1794729600000L + time; }
        public long mono() { return time; }
        public int boot() { return boot; }
    }
    static class Tasks implements RecentTasksSystem {
        boolean reachable = true, failRestore; final List<Task> values = new ArrayList<>();
        public boolean recoveryReachable() { return reachable; }
        public List<Task> ownTasks() { return new ArrayList<>(values); }
        public void exclude(Task task, boolean excluded) {
            if (!excluded && failRestore) throw new IllegalStateException("device denied restore");
            values.removeIf(value -> value.id == task.id);
            values.add(new Task(task.id, task.identity, excluded));
        }
        boolean excluded(int id) { return values.stream().filter(t -> t.id == id).findFirst().get().excluded; }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "recents-control-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database);
        tasks.values.add(new RecentTasksSystem.Task(9, "own-main", false));
        tasks.values.add(new RecentTasksSystem.Task(10, "already-hidden-own-main", true));
        recreate();
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false}}"));
    }
    void recreate() {
        FocusProtection.AccessibilityState access = new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; }
            public boolean connected() { return true; }
        };
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), access,
            new AndroidDndSystem(context), new AndroidNotificationSystem(context), target -> () -> {}, FocusNavigation.android(context, access), tasks);
    }
    @After public void cleanup() {
        Reminders.cancelFocus(context); Reminders.cancelRest(context); store.close(); context.deleteDatabase(database);
        context.getSharedPreferences("catfocus-recents-" + database, 0).edit().clear().commit();
    }
    void preference(boolean enabled) throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("enhancements", new JSONArray(enabled ? "[\"recentTasksHidden\"]" : "[]")));
        store.saveData(data, false);
    }
    JSONObject session(String mode) throws Exception {
        return new JSONObject().put("id", "recents-" + (++sequence)).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "自由专注").put("themeName", "自由专注").put("color", "#222222")
            .put("mode", mode).put("targetMs", 60000).put("startedAt", clock.epoch())
            .put("timeZone", "UTC").put("segments", new JSONArray());
    }
    JSONObject status() throws Exception { return control.observeControl().getJSONObject("recentTasks"); }
    @Test public void optInFreezesAtStartKeepsPauseHiddenAndRestoresOriginalOnRest() throws Exception {
        control.startFocus(session("stopwatch")); assertFalse(tasks.excluded(9));
        clock.time += 1000; control.focusAction("finish"); control.restAction("exit");
        preference(true); control.startFocus(session("stopwatch"));
        assertTrue(tasks.excluded(9)); assertTrue(tasks.excluded(10)); assertEquals("active", status().getString("phase"));
        preference(false); clock.time += 1000; control.focusAction("pause");
        recreate(); control.reconcile(); assertTrue(tasks.excluded(9));
        control.focusAction("resume"); clock.time += 1000; control.focusAction("finish");
        assertEquals("rest", control.observeControl().getString("owner"));
        assertFalse(tasks.excluded(9)); assertTrue(tasks.excluded(10)); assertEquals("restored", status().getString("phase"));
    }
    @Test public void failedRestorationRemainsRetryableBlocksConflictingStartAndWithdrawsThisRound() throws Exception {
        preference(true); control.startFocus(session("stopwatch")); tasks.failRestore = true;
        JSONObject preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertEquals("restoration_failed", status().getString("phase")); assertTrue(status().getBoolean("recoveryPending"));
        tasks.failRestore = false; recreate(); preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertFalse(tasks.excluded(9)); assertTrue(tasks.excluded(10)); assertEquals("withdrawn", status().getString("phase"));
        control.reconcile(); assertFalse(tasks.excluded(9)); assertEquals("focus", control.observeControl().getString("owner"));
        clock.time += 1000; control.focusAction("finish"); control.restAction("exit");
        control.startFocus(session("stopwatch")); tasks.failRestore = true; clock.time += 1000; control.focusAction("finish"); control.restAction("exit");
        try { control.startFocus(session("stopwatch")); fail("Unfinished duty must block new hiding"); } catch (IllegalStateException expected) { }
        tasks.failRestore = false; preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertFalse(status().getBoolean("recoveryPending"));
    }
    @Test public void rebootDoesNotChangeReusedTaskOrReactivateProtection() throws Exception {
        preference(true); control.startFocus(session("stopwatch")); clock.time += 6000; control.focusAction("read");
        clock.boot++; clock.time = 50;
        tasks.values.clear(); tasks.values.add(new RecentTasksSystem.Task(9, "new-task-after-boot", true));
        recreate(); control.reconcile();
        assertTrue(tasks.excluded(9)); assertTrue(control.observeControl().isNull("owner"));
        assertFalse(status().getBoolean("recoveryPending"));
        assertEquals("interrupted", control.loadData().getJSONArray("records").getJSONObject(0).getString("status"));
    }
    @Test public void noRecoveryEntryRejectsBeforeStartingAndLaterTaskChangeIsPreserved() throws Exception {
        preference(true); tasks.reachable = false;
        try { control.startFocus(session("stopwatch")); fail("Must retain a reachable recovery entry"); } catch (IllegalStateException expected) { }
        assertTrue(control.observeControl().isNull("owner")); assertFalse(tasks.excluded(9));
        tasks.reachable = true; control.startFocus(session("stopwatch"));
        tasks.exclude(tasks.values.stream().filter(t -> t.id == 9).findFirst().get(), false);
        control.reconcile(); assertFalse(tasks.excluded(9));
        assertEquals("withdrawn", status().getString("phase"));
    }
    @Test public void rebootRestoresTheSamePersistedOwnTaskInsteadOfAssumingItVanished() throws Exception {
        preference(true); control.startFocus(session("stopwatch"));
        clock.time += 1000; control.focusAction("read"); clock.boot++; clock.time = 50;
        recreate(); control.reconcile();
        assertFalse(tasks.excluded(9)); assertTrue(tasks.excluded(10));
        assertEquals("restored", status().getString("phase"));
        assertTrue(control.observeControl().isNull("owner"));
    }
    @Test public void countdownExpiryAndOrdinaryLockBothRestoreOwnTaskWithoutAddingLockFocusTime() throws Exception {
        preference(true); control.startFocus(session("countdown")); clock.time += 60000; control.reconcile();
        assertFalse(tasks.excluded(9)); assertEquals("rest", control.observeControl().getString("owner"));
        control.restAction("exit");
        JSONObject data = control.loadData();
        data.put("lockConfigurations", new JSONArray().put(new JSONObject().put("id", "lock-one").put("name", "阅读")
            .put("minutes", 1).put("strict", false).put("whitelist", new JSONObject().put("source", "global"))));
        store.saveData(data, false); control.startLock("lock-one"); assertTrue(tasks.excluded(9));
        clock.time += 1000; control.lockAction("finish", true);
        assertFalse(tasks.excluded(9)); assertTrue(tasks.excluded(10));
        assertEquals(1, control.loadData().getJSONArray("records").length()); assertTrue(control.observeControl().isNull("owner"));
    }
    @Test public void lostNotificationRecoveryEntryRestoresTasksAndDoesNotHideAgainWhenItReturns() throws Exception {
        preference(true); control.startFocus(session("stopwatch")); assertTrue(tasks.excluded(9));
        tasks.reachable = false; control.reconcile();
        assertFalse(tasks.excluded(9)); assertEquals("withdrawn", status().getString("phase"));
        tasks.reachable = true; recreate(); control.reconcile();
        assertFalse(tasks.excluded(9)); assertEquals("focus", control.observeControl().getString("owner"));
    }
}
