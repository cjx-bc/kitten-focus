package com.xiaomao.focus;

import android.content.Context;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CatFocusControlBridgeTest {
    private CatFocusPlugin plugin;

    // Capture only the transport reply; all plugin/session/database code is real.
    private static final class Call extends PluginCall {
        JSONObject result;
        Call(JSObject options) { super(null, "CatFocus", "test", "test", options); }
        @Override public void resolve(JSObject result) { this.result = result; }
        @Override public void reject(String message, Exception error) { throw new AssertionError(message, error); }
    }

    @Before public void setup() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Run on the isolated QA application", context.getPackageName().endsWith(".qa"));
        plugin = new CatFocusPlugin() { @Override public Context getContext() { return context; } };
        plugin.load();
        reset();
    }

    private void reset() throws Exception {
        plugin.focusAction(new Call(new JSObject().put("action", "finish")));
        plugin.restAction(new Call(new JSObject().put("action", "exit")));
        plugin.replaceData(new Call(new JSObject().put("data", new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false}}"))));
    }

    @After public void cleanup() throws Exception { if (plugin != null) reset(); }

    @Test public void legacyBridgeCommandsAndObservationShareFocusAndRestOwnership() throws Exception {
        JSONObject session = new JSONObject().put("id", "bridge-focus").put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL).put("title", "自由专注").put("themeName", "自由专注")
            .put("color", "#222222").put("mode", "stopwatch").put("targetMs", 60000)
            .put("startedAt", System.currentTimeMillis()).put("timeZone", "UTC").put("state", "running")
            .put("elapsedMs", 0).put("pausedMs", 0).put("segments", new JSONArray());
        Call started = new Call(new JSObject().put("session", session));
        plugin.startFocus(started);
        assertEquals("bridge-focus", started.result.getJSONObject("session").getString("id"));
        Call observed = new Call(new JSObject());
        plugin.observeControl(observed);
        assertEquals("focus", observed.result.getString("owner"));
        SystemClock.sleep(20);
        Call finished = new Call(new JSObject().put("action", "finish"));
        plugin.focusAction(finished);
        assertEquals("completed", finished.result.getJSONObject("record").getString("status"));
        plugin.observeControl(observed);
        assertEquals("rest", observed.result.getString("owner"));
        plugin.restAction(new Call(new JSObject().put("action", "exit")));
        plugin.observeControl(observed);
        assertTrue(observed.result.isNull("owner"));
    }
}
