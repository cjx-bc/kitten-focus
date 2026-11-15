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
        return new JSONObject().put("id", "round").put("itemId", JSONObject.NULL).put("title", "阅读")
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
}
