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

/** Real native control boundary; only the OS effect/clock seams are substituted for failure/expiry. */
@RunWith(AndroidJUnit4.class)
public class RecoveryControlTest {
    private Context context;
    private LocalStore store;
    private FocusControl control;
    private TestClock clock;
    private String databaseName;
    private final FocusProtection.AccessibilityState accessibility = new FocusProtection.AccessibilityState() {
        public boolean authorized() { return true; }
        public boolean connected() { return true; }
    };
    private FocusControl createControl() { return new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility); }
    private static final class TestClock implements SessionClock {
        long mono = 1000000, epoch = 1794729600000L;
        public long mono() { return mono; }
        public long epoch() { return epoch; }
        public int boot() { return 1; }
        void advance(long ms) { mono += ms; epoch += ms; }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        QaBusinessBaseline.assertIdle(context);
        assertTrue("Requires isolated QA application", context.getPackageName().endsWith(".qa"));
        databaseName = "recovery-test-" + System.nanoTime() + ".db";
        store = new LocalStore(context, databaseName); clock = new TestClock();
        control = createControl();
        control.replaceData(new JSONObject().put("schemaVersion", 1).put("records", new JSONArray())
            .put("deletedRecordIds", new JSONArray()).put("preferences", new JSONObject().put("sound", false)
                .put("vibration", false).put("protection", new JSONObject().put("study", true).put("strict", true)
                    .put("globalWhitelist", new JSONArray().put("example.learning")))));
    }
    @After public void cleanup() {
        if (store == null) return;
        Reminders.cancelFocus(context); Reminders.cancelRest(context);
        store.close(); context.deleteDatabase(databaseName);
        context.getSharedPreferences("catfocus-recovery-" + databaseName, 0).edit().clear().commit();
        android.content.SharedPreferences dndJournal = context.getSharedPreferences("catfocus-dnd-" + databaseName, 0);
        try {
            if (!new JSONObject(dndJournal.getString("journal", "{}")).has("condition"))
                dndJournal.edit().clear().commit();
        } catch (Exception error) { throw new AssertionError("Keep unreadable DND responsibility for inspection", error); }
    }
    private JSONObject session(String id) throws Exception {
        return new JSONObject().put("id", id).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "阅读").put("themeName", "学习").put("color", "#222222").put("mode", "countdown")
            .put("targetMs", 60000).put("timeZone", "UTC");
    }
    @Test public void confirmationWithdrawsThisRoundButKeepsStrictTimingAndPreferencesAfterRecreation() throws Exception {
        control.startFocus(session("recovery-strict"), true);
        JSONObject preview = control.previewRecovery();
        assertEquals("active", preview.getJSONArray("steps").getJSONObject(0).getString("status"));
        // Opening/cancelling is observation: no withdrawal or timer mutation.
        assertEquals(preview.toString(), control.previewRecovery().toString());
        assertFalse(control.observeControl().getJSONObject("focus").getJSONObject("session")
            .getJSONObject("protection").getBoolean("applicationsWithdrawn"));
        JSONObject result = control.confirmRecovery(preview.getString("revision"));
        assertEquals("restored", result.getJSONArray("steps").getJSONObject(0).getString("status"));
        assertFalse(result.getBoolean("pending"));
        control = createControl();
        JSONObject active = control.observeControl().getJSONObject("focus").getJSONObject("session");
        assertEquals("running", active.getString("state")); assertTrue(active.getBoolean("strictMode"));
        assertTrue(active.getJSONObject("protection").getBoolean("applicationsWithdrawn"));
        for (String action : new String[]{"pause", "finish", "cancel"}) {
            try { control.focusAction(action); fail("Recovery must not bypass strict " + action); }
            catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("严格")); }
        }
        assertEquals(0, control.loadData().getJSONArray("records").length());
        assertTrue(control.loadData().getJSONObject("preferences").getJSONObject("protection").getBoolean("study"));
        assertEquals(result.toString(), control.confirmRecovery(preview.getString("revision")).toString());
        clock.advance(60000); control.focusAction("read");
        assertEquals("rest", control.observeControl().getString("owner"));
    }
    @Test public void failedReleaseSurvivesRecreationBlocksConflictingProtectionAndRetries() throws Exception {
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store,
            () -> { throw new SecurityException("injected OS denial"); }), accessibility);
        control.startFocus(session("failed-release"), true);
        JSONObject preview = control.previewRecovery();
        JSONObject failed = control.confirmRecovery(preview.getString("revision"));
        assertEquals("failed", failed.getJSONArray("steps").getJSONObject(0).getString("status"));
        assertTrue(failed.getBoolean("pending"));
        clock.advance(60000); control.focusAction("read"); control.restAction("exit");
        control = createControl();
        try { control.startFocus(session("next-round"), true); fail("Old recovery responsibility must not be overwritten"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("恢复")); }
        JSONObject retained = control.previewRecovery();
        assertEquals("failed-release", retained.getJSONArray("steps").getJSONObject(0).getString("sessionId"));
        assertEquals("restored", control.confirmRecovery(retained.getString("revision"))
            .getJSONArray("steps").getJSONObject(0).getString("status"));
        control.startFocus(session("next-round"), true);
        assertFalse(control.observeControl().getJSONObject("focus").getJSONObject("session")
            .getJSONObject("protection").getBoolean("applicationsWithdrawn"));
    }

    @Test public void sharedRecoveryWithdrawsApplicationAndSoundEffectsWithoutEndingStrictTiming() throws Exception {
        FocusDndTest.FakeDndSystem sound = enableSound();
        control.startFocus(session("combined-recovery"), true);
        JSONObject before = control.previewRecovery();
        assertEquals(2, before.getJSONArray("steps").length());
        assertEquals(before.toString(), control.previewRecovery().toString());
        assertEquals(1, sound.rules.size());
        JSONObject restored = control.confirmRecovery(before.getString("revision"));
        assertFalse(restored.getBoolean("pending"));
        for (int i = 0; i < 2; i++)
            assertEquals("restored", restored.getJSONArray("steps").getJSONObject(i).getString("status"));
        assertTrue(sound.rules.isEmpty());
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility, sound);
        control.reconcile();
        assertTrue(sound.rules.isEmpty());
        JSONObject active = control.observeControl().getJSONObject("focus").getJSONObject("session");
        assertTrue(active.getBoolean("strictMode"));
        assertTrue(active.getJSONObject("protection").getBoolean("applicationsWithdrawn"));
        assertEquals("withdrawn", control.getDndStatus().getString("phase"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
        JSONObject prefs = control.loadData().getJSONObject("preferences").getJSONObject("protection");
        assertTrue(prefs.getBoolean("study")); assertTrue(prefs.getBoolean("strict")); assertTrue(prefs.getBoolean("dnd"));
        assertEquals(restored.toString(), control.confirmRecovery(before.getString("revision")).toString());
        try { control.focusAction("finish"); fail("Recovery must preserve strict countdown"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("严格")); }
        clock.advance(60000); control.reconcile();
    }

    @Test public void changedSoundDutyNeedsFreshConfirmationAndFailedSoundRecoveryRetainsResponsibility() throws Exception {
        FocusDndTest.FakeDndSystem sound = enableSound();
        control.startFocus(session("combined-failure"), true);
        JSONObject before = control.previewRecovery();
        DndSystem.Rule own = sound.rules.values().iterator().next();
        sound.rules.put(own.id, new DndSystem.Rule(own.id, own.condition, "user-edit", false, false, false));
        control.restoreDnd();
        try { control.confirmRecovery(before.getString("revision")); fail("Changed impact needs fresh confirmation"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("变化")); }
        assertFalse(control.observeControl().getJSONObject("focus").getJSONObject("session")
            .getJSONObject("protection").getBoolean("applicationsWithdrawn"));
        JSONObject failed = control.confirmRecovery(control.previewRecovery().getString("revision"));
        assertTrue(failed.getBoolean("pending"));
        assertEquals("restored", failed.getJSONArray("steps").getJSONObject(0).getString("status"));
        assertEquals("failed", failed.getJSONArray("steps").getJSONObject(1).getString("status"));
        clock.advance(60000); control.reconcile(); control.restAction("exit");
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility, sound);
        try { control.startFocus(session("blocked-sound"), true); fail("Old sound recovery must block a conflicting start"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("恢复")); }
        assertTrue(control.observeControl().getJSONObject("focus").isNull("session"));
        sound.rules.remove(own.id); // User removes their edited rule in system settings.
        JSONObject retried = control.confirmRecovery(control.previewRecovery().getString("revision"));
        assertFalse(retried.getBoolean("pending"));
        control.startFocus(session("next-sound"), true);
        assertEquals(1, sound.rules.size());
        control.confirmRecovery(control.previewRecovery().getString("revision"));
        clock.advance(60000); control.reconcile();
    }

    private FocusDndTest.FakeDndSystem enableSound() throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").getJSONObject("protection").put("dnd", true);
        control.replaceData(data);
        FocusDndTest.FakeDndSystem sound = new FocusDndTest.FakeDndSystem();
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), accessibility, sound);
        return sound;
    }
}
