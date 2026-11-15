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
import java.util.LinkedHashMap;
import java.util.Map;
import static org.junit.Assert.*;

/** Public control seam; only the Android permission/rule boundary is controlled. */
@RunWith(AndroidJUnit4.class)
public class FocusDndTest {
    private Context context;
    private LocalStore store;
    private FocusControl control;
    private final FakeDndSystem system = new FakeDndSystem();
    private String database;
    private final SessionClock clock = new SessionClock() {
        public long epoch() { return 1794729600000L; }
        public long mono() { return 1000000L; }
        public int boot() { return 1; }
    };

    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Use the isolated QA application", context.getPackageName().endsWith(".qa"));
        database = "focus-dnd-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database);
        control = new FocusControl(context, store, clock, system);
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false,\"protection\":{\"dnd\":true}}}"));
    }

    @After public void cleanup() {
        Reminders.cancelFocus(context);
        Reminders.cancelRest(context);
        store.close();
        context.deleteDatabase(database);
        context.getSharedPreferences("catfocus-dnd-" + database, Context.MODE_PRIVATE).edit().clear().commit();
    }

    private JSONObject session() throws Exception {
        return new JSONObject().put("id", "sound-focus").put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL).put("title", "声音辅助验证").put("themeName", "自由专注")
            .put("color", "#222222").put("mode", "countdown").put("targetMs", 60000)
            .put("startedAt", clock.epoch()).put("timeZone", "UTC").put("state", "running")
            .put("elapsedMs", 0).put("pausedMs", 0).put("segments", new JSONArray());
    }

    @Test public void soundProtectionIsIndependentAndPauseKeepsItUntilFocusEnds() throws Exception {
        control.startFocus(session());
        assertEquals("active", control.observeControl().getJSONObject("dnd").getString("phase"));
        assertEquals(1, system.rules.size());
        control.focusAction("pause");
        assertEquals("active", control.observeControl().getJSONObject("dnd").getString("phase"));
        control.focusAction("finish");
        assertTrue(system.rules.isEmpty());
        assertEquals("restored", control.observeControl().getJSONObject("dnd").getString("phase"));
    }

    static final class FakeDndSystem implements DndSystem {
        boolean permission = true;
        final Map<String, Rule> rules = new LinkedHashMap<>();
        public boolean supported() { return true; }
        public boolean permissionGranted() { return permission; }
        public int globalFilter() { return rules.isEmpty() ? 1 : 2; }
        public Rule find(String condition) { return rules.values().stream().filter(r -> r.condition.equals(condition)).findFirst().orElse(null); }
        public Rule read(String id, String condition) { return rules.get(id); }
        public String create(String condition) {
            String id = "owned-" + rules.size();
            rules.put(id, new Rule(id, condition, "unchanged", true, true, false));
            return id;
        }
        public void activate(String id, String condition) {
            Rule old = rules.get(id);
            rules.put(id, new Rule(id, condition, old.fingerprint, old.original, old.enabled, true));
        }
        public boolean remove(String id) { rules.remove(id); return true; }
    }
}
