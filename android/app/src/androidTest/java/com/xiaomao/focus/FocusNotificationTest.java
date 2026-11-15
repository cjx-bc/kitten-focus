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
    long now = 1000000; int bootId = 1; final FakeNotifications system = new FakeNotifications();
    final SessionClock clock = new SessionClock() {
        public long epoch() { return 1794729600000L + now; }
        public long mono() { return now; }
        public int boot() { return bootId; }
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
    @Test public void newPostingAfterNecessaryOriginalWithdrawalPreservesVerifiedRestorationHistory() throws Exception {
        control.startFocus(session(), true);
        NotificationSystem.Notice first = new NotificationSystem.Notice("released-reuse", "other.app", 10001, "", false, 1001);
        system.active.add(first); control.notificationPosted(first);
        system.snoozed.clear();
        NotificationSystem.Notice necessary = new NotificationSystem.Notice("released-reuse", "other.app", 10001, "", true, 1002);
        system.active.add(necessary); control.notificationPosted(necessary);
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        // Updating the still-visible restored original cannot trigger an endless hold/release cycle.
        system.active.clear();
        NotificationSystem.Notice update = new NotificationSystem.Notice("released-reuse", "other.app", 10001, "", false, 1003);
        system.active.add(update); control.notificationPosted(update);
        assertTrue(system.snoozed.isEmpty());
        system.active.clear(); control.notificationRemoved("released-reuse", false); control.synchronizeNotifications();
        assertEquals("Verified history stays restored after later sender withdrawal", 1, control.getNotificationStatus().getInt("restoredCount"));
        assertEquals(0, control.getNotificationStatus().getInt("absentCount"));
        control.notificationPosted(update); // Delayed callback without a current original must stay terminal.
        assertTrue(system.snoozed.isEmpty());
        NotificationSystem.Notice next = new NotificationSystem.Notice("released-reuse", "other.app", 10001, "", false, 502);
        system.active.add(next); control.notificationPosted(next);
        assertEquals("A different current posting after observed withdrawal is intercepted", 1, system.snoozed.size());
        assertEquals(1, control.getNotificationStatus().getInt("pendingCount"));
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        assertEquals(0, control.getNotificationStatus().getInt("absentCount"));
    }
    @Test public void newPostingReusesAbsentKeyWithoutRewritingWithdrawnOriginalHistory() throws Exception {
        control.startFocus(session().put("targetMs", 300000), true);
        NotificationSystem.Notice first = new NotificationSystem.Notice("reused", "other.app", 10001, "", false, 1001);
        system.active.add(first); control.notificationPosted(first);
        system.snoozed.clear(); control.notificationRemoved("reused", false); control.synchronizeNotifications();
        assertEquals(1, control.getNotificationStatus().getInt("absentCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
        control.notificationPosted(first); // A delayed callback for the absent original is not a new posting.
        assertTrue(system.snoozed.isEmpty());
        now += 1000;
        NotificationSystem.Notice next = new NotificationSystem.Notice("reused", "other.app", 10001, "", false, 502); // Wall-clock rollback must not exempt a new current posting.
        system.active.add(next); control.notificationPosted(next);
        assertEquals("A new ordinary original using the same key is controlled in this round", 1, system.snoozed.size());
        assertEquals(1, control.getNotificationStatus().getInt("pendingCount"));
        assertEquals("Withdrawal history belongs to the preceding original", 1, control.getNotificationStatus().getInt("absentCount"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        control.notificationPosted(new NotificationSystem.Notice("reused", "other.app", 10001, "", false, 603));
        assertEquals("Updates to the current held original do not create another duty", 1, control.getNotificationStatus().getInt("pendingCount"));
        now += 299000; control.reconcile();
        system.active.addAll(system.snoozed); system.snoozed.clear(); control.synchronizeNotifications();
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        assertEquals(1, control.getNotificationStatus().getInt("absentCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
    }
    @Test public void necessaryUpdateWhileStillHeldRequestsOriginalReleaseWithoutRenewing() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("held-call", "other.app", false));
        // Posted metadata can arrive before the held enumeration reflects the update.
        control.notificationPosted(notice("held-call", "other.app", true));
        assertEquals("Release the same original instead of extending its ordinary lease", Long.valueOf(1), system.requests.get("held-call"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
        now += 45000;
        system.snoozed.clear();
        system.snoozed.add(notice("held-call", "other.app", true));
        control.synchronizeNotifications();
        assertEquals(Long.valueOf(1), system.requests.get("held-call"));
        system.snoozed.clear(); system.active.add(notice("held-call", "other.app", true));
        control.synchronizeNotifications(); control.synchronizeNotifications();
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
        assertEquals(1, system.active.size());
    }
    @Test public void trackedOrdinaryUpdateIntoNecessaryOriginalStaysReachable() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("updated-call", "other.app", false));
        system.snoozed.clear();
        system.active.add(notice("updated-call", "other.app", true));
        control.notificationPosted(notice("updated-call", "other.app", true));
        assertEquals("Necessary updates must not be snoozed as ordinary originals", 1, system.calls);
        assertEquals(1, system.active.size());
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
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
    @Test public void failedReleaseIsDurableRetryableAndRequestsAreNotVerifiedSuccess() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("release-failure", "other.app", false));
        system.failRelease = true;
        JSONObject preview = control.previewRecovery();
        JSONObject result = control.confirmRecovery(preview.getString("revision"));
        assertEquals("failed", result.getJSONArray("steps").getJSONObject(0).getString("status"));
        assertEquals(1, control.getNotificationStatus().getInt("releaseFailedCount"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        system.failRelease = false;
        control = new FocusControl(context, store, clock, system);
        preview = control.previewRecovery(); result = control.confirmRecovery(preview.getString("revision"));
        assertTrue(result.getBoolean("pending"));
        assertEquals(1, control.getNotificationStatus().getInt("releaseRequestedCount"));
        assertEquals(0, control.getNotificationStatus().getInt("releaseFailedCount"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        system.active.addAll(system.snoozed); system.snoozed.clear(); control.synchronizeNotifications();
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
        assertEquals("notice-round", control.observeControl().getJSONObject("focus").getJSONObject("session").getString("id"));
    }
    @Test public void originalClickAfterHoldVerifiesConsumedOriginalWithoutAPostedSnapshot() throws Exception {
        control.startFocus(session(), true);
        control.notificationPosted(notice("clicked", "other.app", false));
        now += 60000; system.snoozed.clear();
        control.notificationRemoved("clicked", false, true);
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
    }
    @Test public void silentReleaseFailureCanBeRetriedAfterBackoffWithoutClaimingRestoration() throws Exception {
        control.startFocus(session(), true); control.notificationPosted(notice("silent", "other.app", false));
        JSONObject preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertEquals(1, system.releaseRequests); assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        for (int i = 0; i < 5; i++) { control.observeControl(); control.getNotificationStatus(); control.previewRecovery(); }
        assertEquals("Read-only status must not retry OS changes", 1, system.releaseRequests);
        now += 5001; preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertEquals("A successful call with no OS effect must remain retryable", 2, system.releaseRequests);
        assertEquals(1, control.getNotificationStatus().getInt("releaseRequestedCount"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
    }
    @Test public void permissionLossAndRebootRetainOldDutyBlockConflictAndReportAbsentTruthfully() throws Exception {
        control.startFocus(session(), true); control.notificationPosted(notice("old", "other.app", false));
        system.granted = false; system.connected = false; now += 60000; control.reconcile(); control.restAction("exit");
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
        try { control.startFocus(session().put("id", "conflict"), true); fail("Do not overwrite old original responsibility"); }
        catch (IllegalStateException expected) { }
        bootId++; system.granted = true; system.connected = true; system.snoozed.clear(); control.reconcile();
        assertEquals(1, control.getNotificationStatus().getInt("absentCount"));
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount"));
        assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
    }
    @Test public void temporaryApplicationGrantDoesNotReleaseOrWhitelistItsNotifications() throws Exception {
        JSONObject data = control.loadData(); data.getJSONObject("preferences").getJSONObject("protection").put("strict", false).put("study", true);
        store.saveData(data, false);
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; } public boolean connected() { return true; }
        }, new AndroidDndSystem(context), system, target -> () -> {});
        control.startFocus(session()); control.notificationPosted(notice("before-grant", "other.app", false));
        assertEquals("granted", control.grantTemporaryAccess(new JSONObject().put("sessionId", "notice-round").put("targetPackage", "other.app")
            .put("durationMinutes", 1).put("requestId", "notification-boundary")).getString("status"));
        control.notificationPosted(notice("during-grant", "other.app", false));
        assertEquals(2, system.snoozed.size()); assertEquals(0, system.releaseRequests);
        assertFalse(control.observeControl().getJSONObject("focus").getJSONObject("session").getJSONObject("protection").getJSONArray("whitelist").toString().contains("other.app"));
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
    @Test public void independentLockHoldsAndReleasesOriginalOnConfirmedCancellation() throws Exception {
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
        assertEquals("ready", control.getNotificationStatus().getString("phase"));
        assertTrue(control.getNotificationStatus().getBoolean("active"));
        control.notificationPosted(notice("during-lock", "other.app", false));
        assertEquals(Long.valueOf(60000), system.requests.get("during-lock"));
        JSONObject edited = control.loadData();
        edited.getJSONObject("preferences").getJSONObject("protection").put("interceptNotifications", false);
        store.saveData(edited, false);
        control.lockAction("read", false);
        assertTrue("This round keeps its notification preference snapshot", control.getNotificationStatus().getBoolean("requested"));
        control.lockAction("finish", true);
        assertFalse(control.getNotificationStatus().getBoolean("requested"));
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
        assertEquals(Long.valueOf(1), system.requests.get("during-lock"));
        system.active.addAll(system.snoozed); system.snoozed.clear(); control.synchronizeNotifications();
        assertEquals(1, control.getNotificationStatus().getInt("restoredCount"));
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
        boolean granted = true, connected = true, failRelease; int calls, releaseRequests;
        final Map<String, Long> requests = new LinkedHashMap<>();
        final List<Notice> active = new ArrayList<>(), snoozed = new ArrayList<>();
        public boolean supported() { return true; }
        public boolean authorized() { return granted; }
        public boolean connected() { return connected; }
        public List<Notice> active() { return new ArrayList<>(active); }
        public List<Notice> snoozed() { return new ArrayList<>(snoozed); }
        public void snooze(String key, long ms) {
            if (ms == 1 && failRelease) throw new SecurityException("Synthetic OS failure");
            if (ms == 1) releaseRequests++;
            calls++; requests.put(key, ms);
            Notice value = active.stream().filter(n -> n.key.equals(key)).findFirst().orElse(new Notice(key, "other.app", 10001, "", false));
            active.removeIf(n -> n.key.equals(key)); snoozed.removeIf(n -> n.key.equals(key)); snoozed.add(value);
        }
    }
}
