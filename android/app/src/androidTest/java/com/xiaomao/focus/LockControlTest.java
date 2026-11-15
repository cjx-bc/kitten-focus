package com.xiaomao.focus;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LockControlTest {
    private Context context; private LocalStore store; private FocusControl control; private Clock clock;
    private String database;
    private static final class Clock implements SessionClock {
        long mono = 1000000, epoch = 1794729600000L; int boot = 1;
        public long mono() { return mono; } public long epoch() { return epoch; } public int boot() { return boot; }
        void advance(long ms) { mono += ms; epoch += ms; }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "lock-control-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database); clock = new Clock(); recreate();
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"protection\":{\"globalWhitelist\":[\"global.tool\"]}},\"lockConfigurations\":[{\"id\":\"reading\",\"name\":\"阅读\",\"minutes\":1,\"whitelist\":{\"source\":\"custom\",\"packages\":[]}}]}"));
    }
    private void recreate() {
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; } public boolean connected() { return true; }
        });
    }
    @After public void cleanup() {
        Reminders.cancelFocus(context); Reminders.cancelRest(context); store.close(); context.deleteDatabase(database);
    }
    @Test public void ordinaryLockUsesTrustedFrozenConfigurationAndFinishesWithoutFocusOrRest() throws Exception {
        JSONObject started = control.startLock("reading");
        assertEquals("lock", control.observeControl().getString("owner"));
        assertEquals("custom", started.getJSONObject("session").getJSONObject("protection").getString("source"));
        assertEquals(new JSONArray().put(context.getPackageName()).toString(), started.getJSONObject("session").getJSONObject("protection").getJSONArray("whitelist").toString());
        JSONObject edited = control.loadData(); edited.getJSONArray("lockConfigurations").getJSONObject(0).put("name", "更改名称").put("minutes", 2).put("whitelist", new JSONObject().put("source", "global"));
        store.saveData(edited, false); clock.advance(10000); recreate();
        assertEquals("阅读", control.lockAction("read", false).getJSONObject("session").getString("title"));
        assertEquals(50000, control.observeControl().getJSONObject("lock").getLong("remainingMs"));
        try { control.lockAction("finish", false); fail("Early unlock requires confirmation"); } catch (IllegalStateException expected) { }
        assertEquals("lock", control.observeControl().getString("owner"));
        assertTrue(control.lockAction("finish", true).isNull("session"));
        assertEquals("early", control.lockAction("read", false).getJSONArray("records").getJSONObject(0).getString("status"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
        assertTrue(control.observeControl().getJSONObject("rest").isNull("session"));
    }
    @Test public void dueAndRebootUseIndependentIdempotentSettlementAndCleanup() throws Exception {
        control.startLock("reading"); clock.advance(60000);
        assertTrue(control.observeControl().getBoolean("needsReconcile"));
        assertEquals(0, control.observeControl().getJSONObject("lock").getJSONArray("records").length());
        control.reconcile(); control.reconcile();
        JSONObject completed = control.lockAction("read", false).getJSONArray("records").getJSONObject(0);
        assertEquals("completed", completed.getString("status")); assertEquals(60000, completed.getLong("durationMs"));
        assertTrue(control.observeControl().isNull("owner")); assertFalse(control.previewRecovery().getBoolean("pending"));
        control.startLock("reading"); clock.advance(12000); control.lockAction("read", false);
        clock.boot++; clock.mono = 1; clock.epoch += 3600000; recreate();
        assertTrue(control.observeControl().getBoolean("needsReconcile"));
        control.reconcile();
        JSONObject interrupted = control.lockAction("read", false).getJSONArray("records").getJSONObject(0);
        assertEquals("interrupted", interrupted.getString("status")); assertEquals(12000, interrupted.getLong("durationMs"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
        assertTrue(control.observeControl().getJSONObject("rest").isNull("session"));
        assertEquals(1, control.loadData().getJSONArray("lockConfigurations").length());
    }
    @Test public void lockOwnerCannotBeReplacedByFocusRestBackupOrFocusFinishAndRecoveryKeepsCountdown() throws Exception {
        control.startLock("reading");
        try { control.startLock("reading"); fail(); } catch (IllegalStateException expected) { }
        try { control.startFocus(new JSONObject()); fail(); } catch (IllegalStateException expected) { }
        try { control.startRest("unknown"); fail(); } catch (IllegalStateException expected) { }
        try { control.replaceData(control.loadData()); fail(); } catch (IllegalStateException expected) { }
        try { control.focusAction("finish"); fail(); } catch (IllegalStateException expected) { }
        JSONObject before = control.previewRecovery();
        assertTrue(before.getBoolean("pending"));
        assertFalse(control.confirmRecovery(before.getString("revision")).getBoolean("pending"));
        JSONObject observation = control.observeControl();
        assertEquals("lock", observation.getString("owner"));
        assertTrue(observation.getJSONObject("lock").getJSONObject("session").getJSONObject("protection").getBoolean("applicationsWithdrawn"));
        assertFalse(FocusProtection.shouldBlock(context, observation, "blocked.tool", "Blocked"));
        clock.advance(60000); control.reconcile();
        assertEquals(1, control.lockAction("read", false).getJSONArray("records").length());
    }
    @Test public void globalWhitelistIsResolvedAgainOnlyOnTheNextRoundAndLockBlocksOtherApps() throws Exception {
        JSONObject data = control.loadData(); data.getJSONArray("lockConfigurations").getJSONObject(0).put("whitelist", new JSONObject().put("source", "global"));
        store.saveData(data, false); control.startLock("reading");
        JSONObject observation = control.observeControl();
        assertFalse(FocusProtection.shouldBlock(context, observation, "global.tool", "Tool"));
        assertTrue(FocusProtection.shouldBlock(context, observation, "blocked.tool", "Blocked"));
        data.getJSONObject("preferences").getJSONObject("protection").put("globalWhitelist", new JSONArray().put("new.tool")); store.saveData(data, false);
        assertFalse(FocusProtection.shouldBlock(context, control.observeControl(), "global.tool", "Tool"));
        control.lockAction("finish", true); control.startLock("reading");
        assertTrue(FocusProtection.shouldBlock(context, control.observeControl(), "global.tool", "Tool"));
        assertFalse(FocusProtection.shouldBlock(context, control.observeControl(), "new.tool", "Tool"));
    }
    @Test public void lockRequiresActualAccessibilityConnectionEvenWithStudyPreferenceOff() throws Exception {
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; } public boolean connected() { return false; }
        });
        try { control.startLock("reading"); fail(); } catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("授权")); }
        assertTrue(control.observeControl().isNull("owner"));
        assertFalse(control.previewRecovery().getBoolean("pending"));
    }
    @Test public void focusAdmissionCannotForgeIndependentLockOwnership() throws Exception {
        JSONObject session = new JSONObject().put("id", "forged-kind").put("kind", "lock")
            .put("configurationId", "reading").put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "Focus").put("themeName", "Focus").put("color", "#222222")
            .put("mode", "countdown").put("targetMs", 60000).put("timeZone", "UTC");
        control.startFocus(session);
        assertEquals("focus", control.observeControl().getString("owner"));
        clock.advance(10000); control.focusAction("finish");
        assertEquals(1, control.loadData().getJSONArray("records").length());
        assertEquals(0, control.lockAction("read", false).getJSONArray("records").length());
    }
    @Test public void savedStrictLockRequiresExplicitStartAcknowledgementBeforeAnyProtection() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONArray("lockConfigurations").getJSONObject(0).put("strict", true);
        store.saveData(data, false);
        try { control.startLock("reading"); fail("Strict lock must require acknowledgement"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("严格锁机")); }
        assertTrue(control.observeControl().isNull("owner"));
        assertFalse(control.previewRecovery().getBoolean("pending"));
    }
    @Test public void strictLockRejectsEveryEarlyControlAfterRecreationConfigurationEditsAndRecovery() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONArray("lockConfigurations").getJSONObject(0).put("strict", true);
        store.saveData(data, false);
        JSONObject started = control.startLock("reading", true).getJSONObject("session");
        assertTrue("Saved strict configuration is the native rule", started.getBoolean("strictMode"));
        String id = started.getString("id");
        data.getJSONArray("lockConfigurations").getJSONObject(0).put("strict", false).put("minutes", 2);
        data.getJSONObject("preferences").getJSONObject("protection").put("strict", true);
        store.saveData(data, false); clock.advance(12000); control.lockAction("read", false); recreate();
        for (int phase = 0; phase < 2; phase++) {
            for (String action : new String[]{"pause", "resume", "cancel", "finish"}) {
                try { control.lockAction(action, true); fail("Strict lock cannot " + action); }
                catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("严格锁机")); }
                try { control.focusAction(action); fail("Focus entry cannot change a lock"); }
                catch (IllegalStateException expected) { }
            }
            try { control.lockAction("finish", false); fail(); } catch (IllegalStateException expected) { }
            try { control.startLock("reading", true); fail(); } catch (IllegalStateException expected) { }
            try { control.startFocus(new JSONObject()); fail(); } catch (IllegalStateException expected) { }
            try { control.startRest("unknown"); fail(); } catch (IllegalStateException expected) { }
            try { control.replaceData(data); fail(); } catch (IllegalStateException expected) { }
            assertEquals("denied", control.grantTemporaryAccess(new JSONObject().put("sessionId", id)
                .put("targetPackage", "blocked.tool").put("durationMinutes", 1).put("requestId", "strict-lock")).getString("status"));
            JSONObject observed = control.observeControl();
            assertEquals(id, observed.getJSONObject("lock").getJSONObject("session").getString("id"));
            assertTrue(observed.getJSONObject("lock").getJSONObject("session").getBoolean("strictMode"));
            assertEquals(48000, observed.getJSONObject("lock").getLong("remainingMs"));
            assertEquals(0, control.lockAction("read", false).getJSONArray("records").length());
            if (phase == 0) {
                assertTrue(FocusProtection.shouldBlock(context, observed, "blocked.tool", "Blocked"));
                assertFalse(FocusProtection.shouldBlock(context, observed, "com.android.systemui", "Emergency"));
                JSONObject recovery = control.previewRecovery();
                assertFalse(control.confirmRecovery(recovery.getString("revision")).getBoolean("pending"));
                recreate();
            } else assertFalse(FocusProtection.shouldBlock(context, observed, "blocked.tool", "Blocked"));
        }
        clock.advance(47999); control.reconcile();
        assertEquals(1, control.observeControl().getJSONObject("lock").getLong("remainingMs"));
        try { control.lockAction("finish", true); fail("Cannot finish even one millisecond early"); }
        catch (IllegalStateException expected) { }
        clock.advance(1); control.reconcile(); control.reconcile();
        JSONObject completed = control.lockAction("read", false).getJSONArray("records").getJSONObject(0);
        assertEquals("completed", completed.getString("status")); assertEquals(60000, completed.getLong("durationMs"));
        assertEquals(id, completed.getString("id"));
        assertTrue(control.observeControl().isNull("owner")); assertTrue(control.observeControl().getJSONObject("rest").isNull("session"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
        assertFalse("Acknowledgement cannot impose strict policy on an ordinary configuration",
            control.startLock("reading", true).getJSONObject("session").getBoolean("strictMode"));
        control.lockAction("finish", true);
    }
    @Test public void strictLockRebootKeepsOnlySavedTimeAndDoesNotRestartOrCreateFocusOrRest() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONArray("lockConfigurations").getJSONObject(0).put("strict", true);
        store.saveData(data, false);
        String id = control.startLock("reading", true).getJSONObject("session").getString("id");
        clock.advance(12000); control.lockAction("read", false);
        clock.advance(3000); clock.boot++; clock.mono = 1; clock.epoch += 3600000; recreate();
        assertTrue(control.observeControl().getBoolean("needsReconcile"));
        assertEquals(48000, control.observeControl().getJSONObject("lock").getLong("remainingMs"));
        control.reconcile(); control.reconcile(); recreate(); control.reconcile();
        JSONObject snapshot = control.lockAction("read", false);
        assertTrue(snapshot.isNull("session")); assertEquals(1, snapshot.getJSONArray("records").length());
        JSONObject interrupted = snapshot.getJSONArray("records").getJSONObject(0);
        assertEquals(id, interrupted.getString("id")); assertEquals("interrupted", interrupted.getString("status"));
        assertEquals(12000, interrupted.getLong("durationMs"));
        assertEquals(interrupted.getLong("startedAt") + 12000, interrupted.getLong("endedAt"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
        assertTrue(control.observeControl().getJSONObject("rest").isNull("session"));
        assertFalse(control.previewRecovery().getBoolean("pending"));
        assertTrue(control.loadData().getJSONArray("lockConfigurations").getJSONObject(0).getBoolean("strict"));
    }
}
