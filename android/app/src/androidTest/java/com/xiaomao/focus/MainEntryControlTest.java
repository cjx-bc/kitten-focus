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

/** Approved public coordinator seam: only clock and accessibility availability are substituted. */
@RunWith(AndroidJUnit4.class)
public class MainEntryControlTest {
    Context context; LocalStore store; FocusControl control; String database;
    final Clock clock = new Clock();
    static class Clock implements SessionClock {
        long time = 1000000; int boot = 1;
        public long epoch() { return 1794729600000L + time; }
        public long mono() { return time; }
        public int boot() { return boot; }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "main-entry-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database); recreate();
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false},\"lockConfigurations\":[{\"id\":\"one\",\"name\":\"阅读\",\"minutes\":1,\"strict\":true,\"whitelist\":{\"source\":\"global\"}}]}"));
    }
    void recreate() {
        control = new FocusControl(context, store, clock, new FocusRecovery(context, store), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; }
            public boolean connected() { return true; }
        });
    }
    @After public void cleanup() {
        Reminders.cancelFocus(context); Reminders.cancelRest(context); store.close(); context.deleteDatabase(database);
        context.getSharedPreferences("catfocus-recovery-" + database, 0).edit().clear().commit();
    }
    void preference(boolean enabled) throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("enhancements", new JSONArray(enabled ? "[\"lockMainInterfaceRestricted\"]" : "[]")));
        store.saveData(data, false);
    }
    void route(String input, String expected) throws Exception { assertEquals(expected, control.resolveMainEntry(input).getString("path")); }
    @Test public void trustedLockStartFreezesOptInAndAllowsOnlyExplicitSafetyDestinations() throws Exception {
        route("/tasks", "/tasks"); control.startLock("one", true); route("/tasks", "/tasks");
        clock.time += 60000; control.reconcile(); preference(true);
        JSONObject started = control.startLock("one", true).getJSONObject("session");
        assertEquals("lockMainInterfaceRestricted", started.getJSONArray("originalEnhancedProtectionSettings").getString(0));
        preference(false); recreate(); control.reconcile();
        for (String input : new String[]{"/tasks", "/statistics", "/settings", "/calendar", "/cat", "/focus", "/rest", "/settings?help", "/help/../tasks"}) route(input, "/lock");
        for (String input : new String[]{"/lock", "/permissions", "/help", "/emergency", "/recovery"}) route(input, input);
        assertEquals(started.getString("id"), control.observeControl().getJSONObject("lock").getJSONObject("session").getString("id"));
    }
    @Test public void confirmedRecoveryDurablyWithdrawsRoutingWithoutEndingOrRelaxingStrictLock() throws Exception {
        preference(true); JSONObject started = control.startLock("one", true).getJSONObject("session");
        JSONObject preview = control.previewRecovery(); route("/settings", "/lock");
        assertTrue(preview.toString().contains("lockMainInterfaceRestricted"));
        // Read/preview are cancellation: no change until explicit confirmation.
        control.previewRecovery(); route("/tasks", "/lock");
        control.confirmRecovery(preview.getString("revision")); recreate(); control.reconcile(); route("/settings", "/settings");
        JSONObject active = control.observeControl().getJSONObject("lock").getJSONObject("session");
        assertEquals(started.getString("id"), active.getString("id"));
        assertEquals(started.getLong("startedAt"), active.getLong("startedAt"));
        assertEquals(60000, control.observeControl().getJSONObject("lock").getLong("remainingMs"));
        assertTrue(active.getBoolean("strictMode"));
        try { control.lockAction("finish", true); fail("Recovery must retain strict timing"); } catch (IllegalStateException expected) { }
        clock.time += 60000; control.reconcile(); control.startLock("one", true); route("/tasks", "/lock");
    }
    @Test public void expiryOrdinaryEndAndBootInterruptionAllReleaseRoutingWithoutFocusOrRest() throws Exception {
        preference(true); control.startLock("one", true); clock.time += 60000;
        route("/tasks", "/tasks"); control.reconcile(); route("/tasks", "/tasks");
        JSONObject data = control.loadData(); data.getJSONArray("lockConfigurations").getJSONObject(0).put("strict", false); store.saveData(data, false);
        control.startLock("one"); route("/tasks", "/lock"); control.lockAction("finish", true); route("/tasks", "/tasks");
        control.startLock("one"); clock.boot++; clock.time = 50; route("/tasks", "/tasks"); recreate(); control.reconcile(); route("/tasks", "/tasks");
        assertTrue(control.observeControl().isNull("owner")); assertEquals(0, control.loadData().getJSONArray("records").length());
        assertTrue(control.observeControl().getJSONObject("rest").isNull("session"));
    }
    @Test public void selectedPreferenceDoesNotRestrictFocusPauseOrRestAndCannotBeForgedInStartPayload() throws Exception {
        preference(true);
        JSONObject session = new JSONObject().put("id", "focus").put("title", "自由专注").put("mode", "stopwatch").put("targetMs", 60000)
            .put("startedAt", clock.epoch()).put("timeZone", "UTC").put("segments", new JSONArray())
            .put("kind", "lock").put("originalEnhancedProtectionSettings", new JSONArray("[\"lockMainInterfaceRestricted\"]"));
        control.startFocus(session); route("/tasks", "/tasks"); control.focusAction("pause"); route("/statistics", "/statistics");
        control.focusAction("resume"); clock.time += 1000; control.focusAction("finish"); route("/settings", "/settings");
        assertEquals("rest", control.observeControl().getString("owner"));
    }
}
