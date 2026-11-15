package com.xiaomao.focus;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import java.util.*;
import static org.junit.Assert.*;

/** Exercises the native control seam; only the Android listener boundary is simulated. */
@RunWith(AndroidJUnit4.class)
public class FocusNotificationTest {
    Context context; LocalStore store; FocusControl control; String database;
    long now = 1000000; final FakeNotifications system = new FakeNotifications();
    final SessionClock clock = new SessionClock() {
        public long epoch() { return 1794729600000L + now; }
        public long mono() { return now; }
        public int boot() { return 1; }
    };
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "focus-notifications-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database);
        control = new FocusControl(context, store, clock, system);
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"preferences\":{\"sound\":false,\"vibration\":false,\"protection\":{\"strict\":true,\"interceptNotifications\":true,\"globalWhitelist\":[\"allowed.app\"]}}}"));
    }
    @After public void cleanup() {
        Reminders.cancelFocus(context); Reminders.cancelRest(context); store.close(); context.deleteDatabase(database);
        context.getSharedPreferences("catfocus-notifications-" + database, 0).edit().clear().commit();
    }
    JSONObject session() throws Exception {
        return new JSONObject().put("id", "notice-round").put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "通知验证").put("themeName", "自由专注").put("color", "#222222")
            .put("mode", "countdown").put("targetMs", 60000).put("startedAt", clock.epoch())
            .put("timeZone", "UTC").put("state", "running").put("elapsedMs", 0).put("pausedMs", 0).put("segments", new JSONArray());
    }
    NotificationSystem.Notice notice(String key, String pkg, boolean necessary) {
        return new NotificationSystem.Notice(key, pkg, 10001, "", necessary);
    }
    @Test public void fixedDeadlineUsesFrozenWhitelistAndReleasesWithoutHoldingAgain() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("allowed", "allowed.app", false));
        control.notificationPosted(notice("call", "other.app", true));
        control.notificationPosted(notice("held", "other.app", false));
        assertEquals(Collections.singletonMap("held", 60000L), system.requests);
        control.notificationPosted(notice("held", "other.app", false));
        assertEquals(1, system.calls);
        now += 60000; system.active.addAll(system.snoozed); system.snoozed.clear();
        control.notificationPosted(notice("held", "other.app", false));
        assertEquals(1, system.calls);
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
    }
    @Test public void authorizationConnectionAndProcessingAreSeparateAndObservationDoesNotApply() throws Exception {
        system.granted = false; system.connected = false;
        system.active.add(notice("waiting", "other.app", false));
        control.startFocus(session(), true);
        assertEquals("permission_required", control.getNotificationStatus().getString("phase"));
        system.granted = true;
        assertEquals("disconnected", control.getNotificationStatus().getString("phase"));
        system.connected = true;
        FocusControl rebuilt = new FocusControl(context, store, clock, system);
        for (int i = 0; i < 5; i++) { rebuilt.observeControl(); rebuilt.getNotificationStatus(); rebuilt.previewRecovery(); }
        assertTrue("Read-only observation must leave the original active", system.snoozed.isEmpty());
        rebuilt.synchronizeNotifications();
        assertEquals(1, system.snoozed.size());
        assertEquals("holding", rebuilt.getNotificationStatus().getString("phase"));
    }
    @Test public void verifiedOriginalRestorationRemainsRecordedAfterSenderRemovesIt() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("read-original", "other.app", false));
        now += 60000;
        system.active.addAll(system.snoozed); system.snoozed.clear();
        control.notificationPosted(notice("read-original", "other.app", false));
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        system.active.removeIf(value -> value.key.equals("read-original"));
        control.notificationRemoved("read-original", false);
        control.synchronizeNotifications();
        assertEquals("An original already observed restored remains verified after it is read or withdrawn",
            1, control.getNotificationStatus().getInt("restoredCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
    }
    @Test public void preferenceEditsDoNotChangeEffectiveNotificationWhitelist() throws Exception {
        control.startFocus(session(), true);
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").getJSONObject("protection").put("globalWhitelist", new JSONArray().put("other.app"));
        store.saveData(data, false);
        control.notificationPosted(notice("allowed", "allowed.app", false));
        control.notificationPosted(notice("held", "other.app", false));
        assertFalse(system.requests.containsKey("allowed"));
        assertTrue(system.requests.containsKey("held"));
        assertFalse(control.observeControl().getJSONObject("focus").getJSONObject("session").getJSONObject("protection").getBoolean("study"));
    }
    @Test public void sharedRecoveryWithdrawsNewHoldsRetainsPendingAndKeepsStrictTimer() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("held", "other.app", false));
        JSONObject preview = control.previewRecovery();
        assertTrue(preview.getBoolean("pending"));
        JSONObject recovered = control.confirmRecovery(preview.getString("revision"));
        assertTrue("Original notification is still held until Android releases it", recovered.getBoolean("pending"));
        assertEquals("withdrawn", control.getNotificationStatus().getString("phase"));
        FocusControl rebuilt = new FocusControl(context, store, clock, system);
        rebuilt.synchronizeNotifications();
        rebuilt.notificationPosted(notice("new", "other.app", false));
        assertFalse(system.requests.containsKey("new"));
        assertEquals("notice-round", rebuilt.observeControl().getJSONObject("focus").getJSONObject("session").getString("id"));
        try { rebuilt.focusAction("finish"); fail("Recovery must retain strict rules"); } catch (IllegalStateException expected) { }
        now += 60000; system.active.addAll(system.snoozed); system.snoozed.clear();
        preview = rebuilt.previewRecovery();
        assertFalse(rebuilt.confirmRecovery(preview.getString("revision")).getBoolean("pending"));
    }
    @Test public void withdrawnOriginalIsNotReportedAsRestoredAndDisconnectedReleaseStaysPending() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("withdrawn", "other.app", false));
        system.snoozed.clear(); system.connected = false; now += 60000;
        control.reconcile();
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        system.connected = true; control.synchronizeNotifications();
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
        assertEquals(1, control.getNotificationStatus().getInt("absentCount"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
    }
    @Test public void ordinaryPauseKeepsHoldingAndEarlyFinishRequestsOriginalRelease() throws Exception {
        JSONObject data = control.loadData(); data.getJSONObject("preferences").getJSONObject("protection").put("strict", false);
        store.saveData(data, false);
        control.startFocus(session());
        control.notificationPosted(notice("ordinary", "other.app", false));
        assertEquals("holding", control.getNotificationStatus().getString("phase"));
        control.focusAction("pause");
        now += 45000; control.synchronizeNotifications();
        assertEquals("holding", control.getNotificationStatus().getString("phase"));
        control.focusAction("finish");
        assertEquals("Original key must be rescheduled rather than abandoned", Long.valueOf(1), system.requests.get("ordinary"));
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        system.active.addAll(system.snoozed); system.snoozed.clear();
        control.synchronizeNotifications();
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
    }
    @Test public void stopwatchUsesBoundedRenewableLeaseBeyondItsOriginalTargetAndPause() throws Exception {
        control.startFocus(session().put("mode", "stopwatch").put("targetMs", 300000));
        control.notificationPosted(notice("open-ended", "other.app", false));
        assertEquals("A dead listener must not leave an indefinite original hold", Long.valueOf(60000), system.requests.get("open-ended"));
        now += 45000; control.synchronizeNotifications();
        assertEquals(Long.valueOf(60000), system.requests.get("open-ended"));
        now += 300000; control.focusAction("pause");
        control.notificationPosted(notice("paused-new", "other.app", false));
        assertEquals(Long.valueOf(60000), system.requests.get("paused-new"));
        assertEquals("holding", control.getNotificationStatus().getString("phase"));
        control.focusAction("finish");
        assertEquals(Long.valueOf(1), system.requests.get("open-ended"));
        assertEquals(Long.valueOf(1), system.requests.get("paused-new"));
        assertEquals("rest", control.observeControl().getString("owner"));
    }
    @Test public void postedUpdateWhileSnoozedIsNotReportedAsRestoredAndEarlySurfaceIsHeldToOriginalDeadline() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("updated", "other.app", false));
        now += 1000;
        control.notificationPosted(notice("updated", "other.app", false));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
        system.active.addAll(system.snoozed); system.snoozed.clear();
        control.notificationPosted(notice("updated", "other.app", false));
        assertEquals(Long.valueOf(59000), system.requests.get("updated"));
        assertEquals(1, system.snoozed.size());
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
    }
    @Test public void independentLockReportsPendingNotificationLifecycleAndRetainsOwner() throws Exception {
        JSONObject data = control.loadData();
        data.put("lockConfigurations", new JSONArray().put(new JSONObject().put("id", "lock-notifications")
            .put("name", "锁机通知边界").put("minutes", 1).put("whitelist", new JSONObject().put("source", "global"))));
        store.saveData(data, false);
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; } public boolean connected() { return true; }
        }, new AndroidDndSystem(context), system);
        control.startLock("lock-notifications");
        assertEquals("lock", control.observeControl().getString("owner"));
        assertTrue(control.getNotificationStatus().getBoolean("requested"));
        assertEquals("lifecycle_pending", control.getNotificationStatus().getString("phase"));
        assertFalse(control.getNotificationStatus().getBoolean("active"));
        control.notificationPosted(notice("during-lock", "other.app", false));
        assertTrue(system.requests.isEmpty());
        JSONObject edited = control.loadData();
        edited.getJSONObject("preferences").getJSONObject("protection").put("interceptNotifications", false);
        store.saveData(edited, false);
        control.lockAction("read", false);
        assertTrue("This round keeps its notification preference snapshot", control.getNotificationStatus().getBoolean("requested"));
        control.lockAction("finish", true);
        assertFalse(control.getNotificationStatus().getBoolean("requested"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
        assertTrue(control.observeControl().isNull("owner"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
    }
    @Test public void lockWithoutNotificationRequestPreservesPreviousFocusReleaseResponsibility() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("previous-focus", "other.app", false));
        system.connected = false; now += 60000; control.reconcile();
        assertEquals("rest", control.observeControl().getString("owner"));
        control.restAction("exit");
        JSONObject data = control.loadData();
        data.put("lockConfigurations", new JSONArray().put(new JSONObject().put("id", "next-lock")
            .put("name", "后续锁机").put("minutes", 1).put("whitelist", new JSONObject().put("source", "global"))));
        store.saveData(data, false);
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; } public boolean connected() { return true; }
        }, new AndroidDndSystem(context), system);
        try { control.startLock("next-lock"); fail("Requested interception must reject unresolved preceding notifications"); }
        catch (IllegalStateException expected) { }
        assertTrue(control.observeControl().isNull("owner"));
        data.getJSONObject("preferences").getJSONObject("protection").put("interceptNotifications", false);
        store.saveData(data, false);
        control.startLock("next-lock");
        assertEquals("lock", control.observeControl().getString("owner"));
        assertFalse(control.getNotificationStatus().getBoolean("requested"));
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
        control.lockAction("finish", true);
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
        system.active.addAll(system.snoozed); system.snoozed.clear(); system.connected = true;
        control.synchronizeNotifications();
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
    }
    static final class FakeNotifications implements NotificationSystem {
        boolean granted = true, connected = true; int calls;
        final Map<String, Long> requests = new LinkedHashMap<>();
        final List<Notice> active = new ArrayList<>(), snoozed = new ArrayList<>();
        public boolean supported() { return true; }
        public boolean authorized() { return granted; }
        public boolean connected() { return connected; }
        public List<Notice> active() { return new ArrayList<>(active); }
        public List<Notice> snoozed() { return new ArrayList<>(snoozed); }
        public void snooze(String key, long ms) {
            calls++; requests.put(key, ms);
            Notice value = active.stream().filter(n -> n.key.equals(key)).findFirst().orElse(new Notice(key, "other.app", 10001, "", false));
            active.removeIf(n -> n.key.equals(key)); snoozed.removeIf(n -> n.key.equals(key)); snoozed.add(value);
        }
    }
}
