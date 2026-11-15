package com.xiaomao.focus;

import android.app.PendingIntent;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;
import static org.junit.Assume.*;

/** Opt-in isolated production control + original independent sender; no copied/reposted messages. */
@RunWith(AndroidJUnit4.class)
public class FocusNotificationLifecycleDeviceTest {
    static final String SENDER = "com.xiaomao.focus.probe.sender";
    Context context; LocalStore store; FocusControl control; JSONObject baseline; SharedPreferences journal;
    String journalBaseline; final int id = 21201;
    @Before public void prepare() throws Exception {
        assumeTrue(InstrumentationRegistry.getArguments().getString("runNotificationLifecycleFixture", "false").equals("true"));
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        store = LocalStore.get(context); control = new FocusControl(context);
        assertNull("Leave another QA session alone", store.read("active"));
        JSONObject rest = store.read("rest");
        assertFalse("Leave another QA rest alone", rest != null && rest.optString("state").equals("running"));
        assertFalse("Retain unresolved existing responsibilities", control.getNotificationStatus().getBoolean("recoveryPending"));
        baseline = store.snapshot(); journal = context.getSharedPreferences("catfocus-notifications-" + store.getDatabaseName(), 0);
        journalBaseline = journal.getString("journal", null);
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("sound", false).put("vibration", false).put("protection", new JSONObject()
            .put("strict", false).put("study", false).put("dnd", false).put("interceptNotifications", true).put("globalWhitelist", new JSONArray()));
        data.put("lockConfigurations", new JSONArray().put(new JSONObject().put("id", "notification-lock").put("name", "Notification release fixture")
            .put("minutes", 2).put("strict", false).put("whitelist", new JSONObject().put("source", "global"))));
        store.saveData(data, false);
        assertTrue(new AndroidNotificationSystem(context).authorized());
        reconnect();
    }
    @After public void restoreFixture() throws Exception {
        if (baseline == null) return;
        sender("withdraw", id, 2, "normal");
        shell("cmd notification allow_listener " + component()); reconnect();
        if (store.read("active") != null) {
            if (LockEngine.owns(store.read("active"))) control.lockAction("finish", true);
            else control.focusAction("finish");
        }
        control.restAction("exit");
        waitFor(() -> { control.synchronizeNotifications(); return !control.getNotificationStatus().getBoolean("recoveryPending"); }, 7000, "Do not discard unresolved duties during fixture cleanup");
        Reminders.cancelFocus(context); Reminders.cancelRest(context);
        store.restoreSnapshot(baseline);
        JSONObject docs = baseline.getJSONObject("documents"); store.write("lastFinished", docs.optJSONObject("lastFinished")); store.write("rest", docs.optJSONObject("rest"));
        if (journalBaseline == null) journal.edit().remove("journal").commit(); else journal.edit().putString("journal", journalBaseline).commit();
        shell("cmd statusbar collapse");
    }
    JSONObject session(String mode) throws Exception {
        return new JSONObject().put("id", "notification-lifecycle-" + System.nanoTime()).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "Notification lifecycle fixture").put("themeName", "Free focus").put("color", "#222222")
            .put("mode", mode).put("targetMs", 120000).put("timeZone", "UTC");
    }
    void start(String mode) throws Exception { control.startFocus(session(mode)); }
    StatusBarNotification hold() throws Exception {
        sender("post", id, 1, "normal");
        waitFor(() -> find(id, true) != null, 5000, "Original was not held"); return find(id, true);
    }
    void verifyIdentity(StatusBarNotification original, int revision) throws Exception {
        waitFor(() -> find(id, false) != null, 5000, "Original did not return after release request");
        StatusBarNotification restored = find(id, false);
        assertEquals(original.getKey(), restored.getKey()); assertEquals(original.getUid(), restored.getUid());
        assertEquals(SENDER, restored.getPackageName()); assertEquals(original.getNotification().contentIntent, restored.getNotification().contentIntent);
        assertEquals(SENDER, restored.getNotification().contentIntent.getCreatorPackage());
        assertEquals(revision, restored.getNotification().extras.getInt("probe_revision")); assertNull(find(id, true));
        waitFor(() -> { control.synchronizeNotifications(); return control.getNotificationStatus().getInt("restoredCount") == 1; }, 3000, "Original active identity was not verified");
    }
    void evidence(String event, long since) throws Exception {
        android.util.Log.i("FocusNotificationLifecycleDeviceTest", event + " elapsedMs=" + (SystemClock.elapsedRealtime() - since) + " " + control.getNotificationStatus());
    }
    @Test public void earlyFinishRestoresUpdatedOriginalAndRealShadeClick() throws Exception {
        start("countdown"); StatusBarNotification original = hold(); sender("update", id, 2, "normal");
        long released = SystemClock.elapsedRealtime(); control.focusAction("finish"); verifyIdentity(original, 2); evidence("early_updated_original_verified", released);
        shell("input keyevent WAKEUP"); shell("wm dismiss-keyguard"); shell("cmd statusbar expand-notifications"); SystemClock.sleep(1800);
        String tap = InstrumentationRegistry.getArguments().getString("notificationObservedTap", "");
        assertEquals("Only an inspected synthetic card may use this fallback", "200,420", tap);
        assertTrue(shell("wm size").contains("540x960")); assertNotNull(find(id, false)); shell("input tap 200 420");
        waitFor(() -> clickObserved(id, 2, released), 5000, "Independent sender did not receive actual shade click");
        evidence("early_original_real_shade_click_verified", released);
    }
    @Test public void stopwatchRenewsAcrossPauseThenFinishEntersRestAndReleases() throws Exception {
        start("stopwatch"); StatusBarNotification original = hold(); control.focusAction("pause");
        SystemClock.sleep(65000);
        assertNotNull("Connected paused listener must renew beyond its initial finite lease", find(id, true)); assertNull(find(id, false));
        long released = SystemClock.elapsedRealtime(); control.focusAction("finish"); verifyIdentity(original, 1);
        assertEquals("rest", control.observeControl().getString("owner")); evidence("stopwatch_pause_renew_rest_release_verified", released);
    }
    @Test public void ordinaryLockCancellationReleasesOriginalWithoutFocusRecord() throws Exception {
        waitFor(() -> FocusAccessibilityService.connected(), 15000, "QA accessibility did not reconnect for actual lock");
        int records = control.loadData().getJSONArray("records").length(); control.startLock("notification-lock");
        StatusBarNotification original = hold(); long released = SystemClock.elapsedRealtime(); control.lockAction("finish", true); verifyIdentity(original, 1);
        assertEquals(records, control.loadData().getJSONArray("records").length()); assertTrue(control.observeControl().isNull("owner")); evidence("ordinary_lock_cancel_release_verified", released);
    }
    @Test public void explicitRecoveryReleasesAndDoesNotRestartOnReconnect() throws Exception {
        start("stopwatch"); StatusBarNotification original = hold(); long released = SystemClock.elapsedRealtime();
        JSONObject preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision")); verifyIdentity(original, 1);
        reconnect(); sender("update", id, 2, "normal"); SystemClock.sleep(1000);
        assertNotNull(find(id, false)); assertNull(find(id, true)); assertNotNull(control.observeControl().getJSONObject("focus").optJSONObject("session")); evidence("recovery_withdrawal_reconnect_verified", released);
    }
    @Test public void listenerDisconnectLetsFiniteLeaseExpireThenRestoresWithOriginalIdentity() throws Exception {
        start("stopwatch"); StatusBarNotification original = hold(); long disconnected = SystemClock.elapsedRealtime();
        FocusNotificationListener.require().requestUnbind(); waitFor(() -> !FocusNotificationListener.connected(), 5000, "Listener did not disconnect");
        waitFor(() -> senderActive(id), 70000, "Disconnected original remained held beyond its finite lease");
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending")); control.focusAction("finish"); reconnect(); verifyIdentity(original, 1); evidence("disconnected_lease_original_expiry_verified", disconnected);
    }
    @Test public void permissionLossLetsFiniteLeaseExpireAndRegrantVerifiesOriginal() throws Exception {
        start("stopwatch"); StatusBarNotification original = hold(); long revoked = SystemClock.elapsedRealtime();
        shell("cmd notification disallow_listener " + component()); waitFor(() -> !new AndroidNotificationSystem(context).authorized(), 5000, "Permission remained granted");
        waitFor(() -> senderActive(id), 70000, "Unauthorized controller left an indefinite original hold");
        assertTrue(control.getNotificationStatus().getBoolean("recoveryPending")); control.focusAction("finish"); shell("cmd notification allow_listener " + component()); reconnect(); verifyIdentity(original, 1); evidence("permission_loss_lease_original_expiry_verified", revoked);
    }
    @Test public void withdrawnOriginalStaysAbsentAndOngoingNoticeIsNeverHeld() throws Exception {
        start("stopwatch"); hold(); sender("withdraw", id, 1, "normal");
        control.synchronizeNotifications(); control.focusAction("finish");
        waitFor(() -> { control.synchronizeNotifications(); return !control.getNotificationStatus().getBoolean("recoveryPending"); }, 5000, "Withdrawn original responsibility did not settle");
        assertEquals(0, control.getNotificationStatus().getInt("restoredCount")); assertEquals(1, control.getNotificationStatus().getInt("absentCount"));
        control.restAction("exit"); start("stopwatch"); sender("post", id, 1, "ongoing");
        waitFor(() -> find(id, false) != null, 4000, "Ongoing synthetic notice disappeared"); assertNull(find(id, true)); assertEquals(0, control.getNotificationStatus().getInt("pendingCount"));
        evidence("withdrawn_absent_and_ongoing_exception_verified", SystemClock.elapsedRealtime());
    }
    String component() { return context.getPackageName() + "/com.xiaomao.focus.FocusNotificationListener"; }
    void reconnect() throws Exception { FocusNotificationListener.rebind(context); waitFor(() -> FocusNotificationListener.connected(), 15000, "Listener did not reconnect"); control.synchronizeNotifications(); }
    static StatusBarNotification find(int id, boolean held) {
        try { for (StatusBarNotification n : held ? FocusNotificationListener.require().getSnoozedNotifications() : FocusNotificationListener.require().getActiveNotifications())
            if (n.getPackageName().equals(SENDER) && n.getId() == id) return n;
        } catch (RuntimeException ignored) { } return null;
    }
    static void sender(String op, int id, int revision, String kind) throws Exception {
        shell("am broadcast -n " + SENDER + "/.CommandReceiver --es op " + op + " --ei id " + id + " --ei revision " + revision + " --es kind " + kind);
    }
    static boolean senderActive(int id) throws Exception {
        long since = SystemClock.elapsedRealtime();
        String observer = "com.xiaomao.focus.probe.controller";
        shell("am broadcast -n " + observer + "/.CommandReceiver --es op snapshot");
        for (String line : shell("run-as " + observer + " cat files/probe-events.jsonl").split("\n")) if (line.startsWith("{")) {
            JSONObject event = new JSONObject(line); if (!event.optString("event").equals("snapshot") || event.optLong("elapsedMs") < since) continue;
            JSONObject detail = event.getJSONObject("details");
            JSONArray held = detail.getJSONArray("snoozed"), active = detail.getJSONArray("active");
            for (int i = 0; i < held.length(); i++) if (held.getJSONObject(i).optInt("id") == id) return false;
            for (int i = 0; i < active.length(); i++) if (active.getJSONObject(i).optInt("id") == id) return true;
        } return false;
    }
    static boolean clickObserved(int id, int revision, long since) throws Exception {
        for (String line : shell("run-as " + SENDER + " cat files/probe-events.jsonl").split("\n")) if (line.startsWith("{")) {
            JSONObject event = new JSONObject(line); JSONObject detail = event.optJSONObject("details");
            if (event.optString("event").equals("content_intent_opened") && event.optLong("elapsedMs") >= since && detail != null && detail.optInt("id") == id && detail.optInt("revision") == revision) return true;
        } return false;
    }
    interface Check { boolean done() throws Exception; }
    static void waitFor(Check check, long timeout, String message) throws Exception {
        long until = SystemClock.elapsedRealtime() + timeout;
        do { if (check.done()) return; SystemClock.sleep(200); } while (SystemClock.elapsedRealtime() < until); fail(message);
    }
    static String shell(String command) throws Exception {
        try (android.os.ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommand(command);
             java.io.InputStream input = new android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor);
             java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] bytes = new byte[4096]; int count; while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
