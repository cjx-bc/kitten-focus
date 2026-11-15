package com.xiaomao.focus;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Public FocusControl seam; only PackageManager/notification effects and clock are substituted. */
@RunWith(AndroidJUnit4.class)
public class LauncherControlTest {
    Context context; LocalStore store; FocusControl control; String database; int sequence;
    final Clock clock = new Clock(); final Launcher launcher = new Launcher();
    static class Clock implements SessionClock {
        long time = 1000000; int boot = 1;
        public long epoch() { return 1794729600000L + time; }
        public long mono() { return time; }
        public int boot() { return boot; }
    }
    static class Launcher implements LauncherSystem {
        int state = 0; boolean reachable = true, failRestore;
        public boolean recoveryAvailable() { return reachable; }
        public boolean recoveryReachable() { return reachable; }
        public int componentState() { return state; }
        public void componentState(int value) {
            if (value != 2 && failRestore) throw new IllegalStateException("restore denied");
            state = value;
        }
        public boolean launcherVisible() { return state != 2; }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "launcher-control-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database); recreate();
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false}}"));
    }
    void recreate() { control = new FocusControl(context, store, clock, launcher); }
    @After public void cleanup() {
        Reminders.cancelFocus(context); Reminders.cancelRest(context); store.close(); context.deleteDatabase(database);
        context.getSharedPreferences("catfocus-launcher-" + database, 0).edit().clear().commit();
    }
    void preference(boolean enabled) throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("enhancements", new JSONArray(enabled ? "[\"launcherIconHidden\"]" : "[]")));
        store.saveData(data, false);
    }
    JSONObject session(String mode) throws Exception {
        return new JSONObject().put("id", "launcher-" + (++sequence)).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("themeName", "????").put("color", "#222222").put("title", "Launcher fixture").put("mode", mode).put("targetMs", 60000).put("startedAt", clock.epoch()).put("timeZone", "UTC").put("segments", new JSONArray());
    }
    JSONObject status() throws Exception { return control.observeControl().getJSONObject("launcher"); }
    @Test public void defaultOffAndOptInFreezesUntilEndRestoresExactDefault() throws Exception {
        control.startFocus(session("stopwatch")); assertEquals(0, launcher.state);
        clock.time += 1000; control.focusAction("finish"); control.restAction("exit");
        preference(true); control.startFocus(session("stopwatch"));
        assertEquals(2, launcher.state); assertTrue(status().getBoolean("verified"));
        preference(false); control.focusAction("pause"); recreate(); control.reconcile(); assertEquals(2, launcher.state);
        control.focusAction("resume"); clock.time += 1000; control.focusAction("finish");
        assertEquals(0, launcher.state); assertEquals("rest", control.observeControl().getString("owner"));
        assertEquals("restored", status().getString("phase"));
    }
}
