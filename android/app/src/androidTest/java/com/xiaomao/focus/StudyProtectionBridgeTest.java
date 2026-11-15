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
import static org.junit.Assume.assumeTrue;

/** Public CatFocus bridge tests. Device acceptance additionally observes real external app windows. */
@RunWith(AndroidJUnit4.class)
public class StudyProtectionBridgeTest {
    private CatFocusPlugin plugin;
    private Context context;
    private static final class Call extends PluginCall {
        JSONObject result;
        String rejection;
        Call(JSObject options) { super(null, "CatFocus", "study-test", "study-test", options); }
        @Override public void resolve(JSObject result) { this.result = result; }
        @Override public void reject(String message, Exception error) { rejection = message; }
    }
    private Call call() { return new Call(new JSObject()); }
    private JSONObject status() {
        Call call = call(); plugin.protectionStatus(call); assertNull(call.rejection); return call.result;
    }
    private JSONObject observe() {
        Call call = call(); plugin.observeControl(call); assertNull(call.rejection); return call.result;
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Requires isolated QA application", context.getPackageName().endsWith(".qa"));
        plugin = new CatFocusPlugin() { @Override public Context getContext() { return context; } };
        plugin.load(); reset();
    }
    @After public void cleanup() throws Exception { if (plugin != null) reset(); }
    private void reset() throws Exception {
        plugin.focusAction(new Call(new JSObject().put("action", "finish")));
        plugin.restAction(new Call(new JSObject().put("action", "exit")));
        save(false, new JSONArray());
    }
    private void save(boolean study, JSONArray whitelist) throws Exception {
        JSONObject protection = new JSONObject().put("study", study).put("strict", false).put("globalWhitelist", whitelist);
        JSONObject data = new JSONObject().put("schemaVersion", 1).put("records", new JSONArray())
            .put("deletedRecordIds", new JSONArray()).put("preferences", new JSONObject().put("sound", false)
                .put("vibration", false).put("protection", protection));
        Call saved = new Call(new JSObject().put("data", data)); plugin.saveData(saved); assertNull(saved.rejection);
    }
    private JSONObject session() throws Exception {
        return new JSONObject().put("id", "study-loop").put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "阅读").put("themeName", "学习").put("color", "#222222").put("mode", "stopwatch")
            .put("targetMs", 60000).put("startedAt", System.currentTimeMillis()).put("timeZone", "UTC")
            .put("state", "running").put("elapsedMs", 0).put("pausedMs", 0).put("segments", new JSONArray());
    }
    @Test public void rejectedAuthorizationNeverStartsAnUnprotectedStudySession() throws Exception {
        assumeTrue("Run with QA accessibility disabled for permission rejection coverage", !status().optBoolean("authorized"));
        save(true, new JSONArray().put("missing.study.tool"));
        assertEquals("authorization", status().getString("state"));
        Call start = new Call(new JSObject().put("session", session())); plugin.startFocus(start);
        assertNotNull(start.rejection);
        assertTrue(observe().isNull("owner"));
        assertFalse(status().getBoolean("active"));
    }
    @Test public void storedSettingsOverrideForgedClientPolicyAndOwnAppRemainsFixed() throws Exception {
        JSONObject forged = session().put("protection", new JSONObject().put("study", true).put("whitelist", new JSONArray()));
        Call start = new Call(new JSObject().put("session", forged)); plugin.startFocus(start);
        assertNull(start.rejection);
        JSONObject policy = observe().getJSONObject("focus").getJSONObject("session").getJSONObject("protection");
        assertFalse(policy.getBoolean("study"));
        assertEquals(context.getPackageName(), policy.getJSONArray("whitelist").getString(0));
        Call apps = call(); plugin.listProtectionApps(apps); assertNull(apps.rejection);
        boolean ownFixed = false;
        JSONArray rows = apps.result.getJSONArray("apps");
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            if (row.optString("packageName").equals(context.getPackageName())) ownFixed = row.getBoolean("fixed") && row.getBoolean("installed");
        }
        assertTrue(ownFixed);
    }
    @Test public void globalPolicyStaysFrozenAcrossSettingsChangesAndPauseThenReleasesAtRest() throws Exception {
        long connectDeadline = SystemClock.elapsedRealtime() + 5000;
        JSONObject capability;
        do {
            capability = status();
            if (capability.optBoolean("authorized") && capability.optBoolean("connected")) break;
            SystemClock.sleep(100);
        } while (SystemClock.elapsedRealtime() < connectDeadline);
        assertTrue("Enable QA accessibility service before this acceptance test", capability.optBoolean("authorized"));
        assertTrue("QA accessibility service must reconnect after instrumentation restarts the process", capability.optBoolean("connected"));
        save(true, new JSONArray().put("missing.first.tool"));
        Call start = new Call(new JSObject().put("session", session())); plugin.startFocus(start); assertNull(start.rejection);
        save(false, new JSONArray().put("missing.second.tool"));
        SystemClock.sleep(30);
        Call pause = new Call(new JSObject().put("action", "pause")); plugin.focusAction(pause); assertNull(pause.rejection);
        JSONObject before = observe();
        assertEquals("paused", before.getJSONObject("focus").getJSONObject("session").getString("state"));
        JSONArray whitelist = before.getJSONObject("focus").getJSONObject("session").getJSONObject("protection").getJSONArray("whitelist");
        assertEquals("missing.first.tool", whitelist.getString(0));
        assertEquals("protecting", status().getString("state"));
        for (int i = 0; i < 3; i++) observe();
        assertEquals(before.toString(), observe().toString());
        Call finish = new Call(new JSObject().put("action", "finish")); plugin.focusAction(finish); assertNull(finish.rejection);
        assertEquals("rest", observe().getString("owner"));
        assertFalse(status().getBoolean("active"));
    }
}
