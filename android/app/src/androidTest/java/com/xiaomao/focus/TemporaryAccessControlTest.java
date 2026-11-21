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

/** Public native control seam; substitutes only clock and OS launch/authorization. */
@RunWith(AndroidJUnit4.class)
public class TemporaryAccessControlTest {
    private Context context;
    private LocalStore store;
    private FocusControl control;
    private Clock clock;
    private String database;
    private final FocusProtection.AccessibilityState accessibility = new FocusProtection.AccessibilityState() {
        public boolean authorized() { return true; }
        public boolean connected() { return true; }
    };
    private static final class Clock implements SessionClock {
        long mono = 1000000, epoch = 1794729600000L; int boot = 1;
        public long mono() { return mono; }
        public long epoch() { return epoch; }
        public int boot() { return boot; }
        void advance(long ms) { mono += ms; epoch += ms; }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        QaBusinessBaseline.assertIdle(context);
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "temporary-access-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database); clock = new Clock();
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility,
            packageName -> () -> {});
        control.replaceData(new JSONObject().put("schemaVersion", 1).put("records", new JSONArray())
            .put("deletedRecordIds", new JSONArray()).put("preferences", new JSONObject().put("sound", false)
                .put("vibration", false).put("protection", new JSONObject().put("study", true)
                    .put("globalWhitelist", new JSONArray().put("example.allowed")))));
    }
    @After public void cleanup() {
        if (store == null) return;
        Reminders.cancelFocus(context); Reminders.cancelRest(context);
        store.close(); context.deleteDatabase(database);
        context.getSharedPreferences("catfocus-recovery-" + database, 0).edit().clear().commit();
    }
    private JSONObject session() throws Exception {
        return new JSONObject().put("id", "round").put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "阅读").put("themeName", "学习").put("color", "#222222")
            .put("mode", "countdown").put("targetMs", 900000).put("timeZone", "UTC")
            .put("temporaryAccess", new JSONObject().put("used", -100).put("targetPackage", "example.forged"));
    }
    private JSONObject request(String target, int minutes, String id) throws Exception {
        return new JSONObject().put("sessionId", "round").put("targetPackage", target)
            .put("durationMinutes", minutes).put("requestId", id);
    }
    @Test public void successfulGrantIsSingleTargetIdempotentAndExpiresAcrossPauseAndRecreation() throws Exception {
        control.startFocus(session());
        assertEquals(0, state().getInt("used"));
        assertTrue(FocusProtection.shouldBlock(context, control.observeControl(), "example.blocked", ""));
        JSONObject granted = control.grantTemporaryAccess(request("example.blocked", 1, "first"));
        assertEquals("granted", granted.getString("status"));
        assertEquals(1, granted.getJSONObject("state").getInt("used"));
        assertFalse(FocusProtection.shouldBlock(context, control.observeControl(), "example.blocked", ""));
        assertTrue(FocusProtection.shouldBlock(context, control.observeControl(), "example.other", ""));
        assertTrue(control.grantTemporaryAccess(request("example.blocked", 1, "first")).getBoolean("replayed"));
        assertEquals(1, state().getInt("used"));
        clock.advance(10000); control.focusAction("pause"); clock.advance(20000);
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility, packageName -> () -> {});
        assertEquals(30000, state().getLong("remainingMs"));
        assertEquals("confirmation-required", control.grantTemporaryAccess(request("example.other", 3, "second")).getString("status"));
        assertEquals(1, state().getInt("used"));
        clock.advance(30000);
        assertEquals(0, state().getLong("remainingMs"));
        assertTrue(FocusProtection.shouldBlock(context, control.observeControl(), "example.blocked", ""));
        assertEquals(1, state().getInt("used"));
        assertEquals("example.allowed", control.observeControl().getJSONObject("focus").getJSONObject("session")
            .getJSONObject("protection").getJSONArray("whitelist").getString(0));
    }
    private JSONObject state() throws Exception {
        return control.observeControl().getJSONObject("focus").getJSONObject("session").getJSONObject("temporaryAccess");
    }
    @Test public void failedReplacementAndRevokedPermissionKeepPreviousGrantAndDebitUnchanged() throws Exception {
        control.startFocus(session());
        control.grantTemporaryAccess(request("example.first", 3, "first"));
        clock.advance(10000);
        JSONObject before = state();
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility,
            packageName -> () -> { throw new SecurityException("OS rejected launch"); });
        JSONObject failed = control.grantTemporaryAccess(request("example.second", 5, "second").put("replaceConfirmed", true));
        assertEquals("failed", failed.getString("status"));
        assertEquals(before.toString(), state().toString());
        assertFalse(FocusProtection.shouldBlock(context, control.observeControl(), "example.first", ""));
        assertTrue(FocusProtection.shouldBlock(context, control.observeControl(), "example.second", ""));
        FocusProtection.AccessibilityState revoked = new FocusProtection.AccessibilityState() {
            public boolean authorized() { return false; }
            public boolean connected() { return false; }
        };
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), revoked, packageName -> () -> {});
        assertEquals("failed", control.grantTemporaryAccess(request("example.second", 5, "second").put("replaceConfirmed", true)).getString("status"));
        assertEquals(before.toString(), state().toString());
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility, packageName -> () -> {});
        assertEquals("granted", control.grantTemporaryAccess(request("example.second", 5, "second").put("replaceConfirmed", true)).getString("status"));
        assertEquals(2, state().getInt("used"));
        assertTrue(FocusProtection.shouldBlock(context, control.observeControl(), "example.first", ""));
        assertFalse(FocusProtection.shouldBlock(context, control.observeControl(), "example.second", ""));
        assertEquals(300000, state().getLong("remainingMs"));
    }
    @Test public void parallelRequestsNeverExceedThreeAndIdenticalRetriesNeverReopenOrExtend() throws Exception {
        java.util.concurrent.atomic.AtomicInteger launches = new java.util.concurrent.atomic.AtomicInteger();
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility,
            packageName -> () -> launches.incrementAndGet());
        control.startFocus(session());
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(6);
        try {
            java.util.List<java.util.concurrent.Future<JSONObject>> replies = new java.util.ArrayList<>();
            for (int i = 0; i < 8; i++) {
                final int number = i;
                replies.add(pool.submit(() -> control.grantTemporaryAccess(request("example.app" + number, 1, "request-" + number).put("replaceConfirmed", true))));
            }
            int granted = 0;
            for (java.util.concurrent.Future<JSONObject> reply : replies)
                if (reply.get().optString("status").equals("granted")) granted++;
            assertEquals(3, granted); assertEquals(3, launches.get());
            assertEquals(3, state().getInt("used")); assertEquals(0, state().getInt("remainingUses"));
            assertEquals("denied", control.grantTemporaryAccess(request("example.extra", 1, "extra").put("replaceConfirmed", true)).getString("status"));
        } finally { pool.shutdownNow(); }
        // Complete the round and start a fresh one to test a concurrently repeated request.
        control.focusAction("finish");
        control.startFocus(session().put("id", "retry-round"));
        JSONObject request = request("example.retry", 5, "same").put("sessionId", "retry-round");
        assertEquals("granted", control.grantTemporaryAccess(request).getString("status"));
        clock.advance(7000);
        assertTrue(control.grantTemporaryAccess(request).getBoolean("replayed"));
        assertEquals(4, launches.get()); assertEquals(1, state().getInt("used"));
        assertEquals(293000, state().getLong("remainingMs"));
        assertEquals("denied", control.grantTemporaryAccess(new JSONObject(request.toString()).put("durationMinutes", 3)).getString("status"));
        assertEquals(4, launches.get());
    }
    @Test public void strictRecoveryAndRebootDenyGrantsAndNewRoundsResetClientForgedRuntime() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").getJSONObject("protection").put("strict", true);
        store.saveData(data, false);
        control.startFocus(session(), true);
        assertEquals("denied", control.grantTemporaryAccess(request("example.blocked", 1, "strict").put("replaceConfirmed", true)).getString("status"));
        assertEquals(0, state().getInt("used"));
        clock.advance(900000); control.focusAction("read"); control.restAction("exit");
        data.getJSONObject("preferences").getJSONObject("protection").put("strict", false);
        store.saveData(data, false);
        JSONObject forged = session().put("temporaryAccessRuntime", new JSONObject().put("used", -100)
            .put("grant", new JSONObject().put("targetPackage", "example.forged").put("deadlineMono", Long.MAX_VALUE)));
        control.startFocus(forged);
        assertEquals(0, state().getInt("used")); assertTrue(state().isNull("targetPackage"));
        control.grantTemporaryAccess(request("example.blocked", 5, "ordinary"));
        JSONObject preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertTrue(state().isNull("targetPackage"));
        assertEquals("denied", control.grantTemporaryAccess(request("example.other", 1, "withdrawn")).getString("status"));
        control.focusAction("finish"); control.startFocus(session());
        control.grantTemporaryAccess(request("example.blocked", 5, "before-reboot"));
        clock.boot++;
        assertTrue(control.observeControl().getBoolean("needsReconcile"));
        assertTrue(state().isNull("targetPackage"));
        assertEquals("denied", control.grantTemporaryAccess(request("example.other", 1, "rebooted")).getString("status"));
        control.reconcile(); assertTrue(control.observeControl().getJSONObject("focus").isNull("session"));
        control.startFocus(session()); assertEquals(0, state().getInt("used"));
        control.focusAction("finish");
        assertEquals("denied", control.grantTemporaryAccess(request("example.other", 1, "ended")).getString("status"));
    }

    @Test public void transientOverlayHelpersAndBlockClockFormatMatchUiContract() {
        assertTrue(FocusProtection.isTransientOverlayPackage(context, "com.android.systemui"));
        assertTrue(FocusProtection.isTransientOverlayPackage(context, "android"));
        assertFalse(FocusProtection.isTransientOverlayPackage(context, "example.blocked"));
        assertFalse(FocusProtection.isTransientOverlayPackage(context, ""));
        assertFalse(FocusProtection.isTransientOverlayPackage(context, null));

        // Timer expiry keeps targeting the underlying app when SystemUI/IME left an overlay event last.
        assertEquals("example.blocked", FocusAccessibilityService.resolveTargetPackage(
            "com.android.systemui", "example.blocked", "example.blocked", false, true, false));
        assertEquals("example.blocked", FocusAccessibilityService.resolveTargetPackage(
            "com.android.systemui", "example.blocked", "", false, true, false));
        assertEquals("example.allowed", FocusAccessibilityService.resolveTargetPackage(
            "com.android.systemui", "example.allowed", "example.allowed", false, true, false));
        assertEquals("example.blocked", FocusAccessibilityService.resolveTargetPackage(
            "com.android.systemui", "example.other", "example.blocked", true, true, false));

        assertEquals("00:00", FocusBlockActivity.formatClock(0L));
        assertEquals("00:01", FocusBlockActivity.formatClock(1L));
        assertEquals("00:01", FocusBlockActivity.formatClock(1000L));
        assertEquals("59:59", FocusBlockActivity.formatClock(3599000L));
        assertEquals("01:00:00", FocusBlockActivity.formatClock(3599001L));
        assertEquals("01:30:00", FocusBlockActivity.formatClock(5400000L));
    }

    @Test public void disabledTemporaryAccessSubItemRejectsGrantsWhileKeepingApplicationRestriction() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").getJSONObject("protection").put("modules", new JSONObject()
            .put("master", true)
            .put("initialized", true)
            .put("apps", new JSONObject().put("enabled", true).put("custom", new JSONObject().put("temporaryAccess", false)))
            .put("strict", new JSONObject().put("enabled", false))
            .put("quiet", new JSONObject().put("enabled", false)));
        store.saveData(data, false);
        JSONObject started = control.startFocus(session());
        assertFalse(started.getJSONObject("session").getJSONObject("protection").optBoolean("temporaryAccessAllowed", true));
        assertTrue(FocusProtection.shouldBlock(context, control.observeControl(), "example.blocked", ""));
        JSONObject reply = control.grantTemporaryAccess(request("example.blocked", 1, "disabled-temp"));
        assertEquals("denied", reply.getString("status"));
        assertEquals(0, state().getInt("used"));
    }
}
