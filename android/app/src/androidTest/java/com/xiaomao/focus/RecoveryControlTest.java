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
}
