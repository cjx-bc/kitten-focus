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
}
