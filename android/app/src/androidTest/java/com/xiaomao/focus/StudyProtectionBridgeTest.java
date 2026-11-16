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
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

/** Public CatFocus bridge tests. Device acceptance additionally observes real external app windows. */
@RunWith(AndroidJUnit4.class)
public class StudyProtectionBridgeTest {
    private CatFocusPlugin plugin;
    private Context context;
    private QaBusinessBaseline baseline;
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
        baseline = QaBusinessBaseline.captureIdle(context);
        plugin = new CatFocusPlugin() { @Override public Context getContext() { return context; } };
        plugin.load(); reset();
    }
    @After public void cleanup() throws Exception {
        if (baseline == null) return;
        if (plugin != null) {
            plugin.focusAction(new Call(new JSObject().put("action", "finish")));
            plugin.restAction(new Call(new JSObject().put("action", "exit")));
        }
        baseline.restore();
    }
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
    private void saveItems(JSONArray global, JSONArray items) throws Exception {
        JSONObject data = new JSONObject().put("schemaVersion", 1).put("records", new JSONArray())
            .put("deletedRecordIds", new JSONArray()).put("items", items)
            .put("preferences", new JSONObject().put("sound", false).put("vibration", false)
                .put("protection", new JSONObject().put("study", false).put("strict", false).put("globalWhitelist", global)));
        Call saved = new Call(new JSObject().put("data", data)); plugin.saveData(saved); assertNull(saved.rejection);
    }
    private JSONObject startItem(String id) throws Exception {
        JSONObject request = session().put("itemId", id == null ? JSONObject.NULL : id)
            .put("whitelist", new JSONObject().put("source", "custom").put("packages", new JSONArray().put("forged.tool")))
            .put("protection", new JSONObject().put("source", "custom").put("whitelist", new JSONArray().put("forged.tool")));
        Call start = new Call(new JSObject().put("session", request)); plugin.startFocus(start); assertNull(start.rejection);
        return start.result.getJSONObject("session").getJSONObject("protection");
    }
    private void endRound() {
        Call finished = new Call(new JSObject().put("action", "finish")); plugin.focusAction(finished); assertNull(finished.rejection);
        Call exited = new Call(new JSObject().put("action", "exit")); plugin.restAction(exited); assertNull(exited.rejection);
    }
    private void assertObservedPolicy(String source, String... packages) throws Exception {
        JSONObject policy = observe().getJSONObject("focus").getJSONObject("session").getJSONObject("protection");
        assertEquals(source, policy.getString("source"));
        assertFalse(policy.getBoolean("study"));
        assertFalse("Ordinary configuration edits do not withdraw this round's protection", policy.getBoolean("applicationsWithdrawn"));
        Set<String> actual = new HashSet<>();
        JSONArray whitelist = policy.getJSONArray("whitelist");
        for (int i = 0; i < whitelist.length(); i++) actual.add(whitelist.getString(i));
        assertEquals(new HashSet<>(Arrays.asList(packages)), actual);
    }
    @Test public void savedCustomItemPolicyOverridesGlobalAndClientThenRemainsFrozen() throws Exception {
        JSONArray items = new JSONArray().put(new JSONObject().put("id", "reading")
            .put("whitelist", new JSONObject().put("source", "custom").put("packages", new JSONArray().put("missing.reader.tool"))));
        saveItems(new JSONArray().put("global.tool"), items);
        startItem("reading");
        assertObservedPolicy("custom", "missing.reader.tool", context.getPackageName());
        items.getJSONObject(0).put("whitelist", new JSONObject().put("source", "global"));
        saveItems(new JSONArray().put("new.global.tool"), items);
        assertObservedPolicy("custom", "missing.reader.tool", context.getPackageName());
        endRound();
        startItem("reading");
        assertObservedPolicy("global", "new.global.tool", context.getPackageName());
        endRound();
        items.getJSONObject(0).put("whitelist", new JSONObject().put("source", "custom").put("packages", new JSONArray()));
        items.put(new JSONObject().put("id", "math"));
        saveItems(new JSONArray().put("new.global.tool"), items);
        startItem("reading");
        assertObservedPolicy("custom", context.getPackageName());
        endRound();
        startItem("math");
        assertObservedPolicy("global", "new.global.tool", context.getPackageName());
        endRound();
        startItem(null);
        assertObservedPolicy("global", "new.global.tool", context.getPackageName());
    }
    @Test public void applicationPickerRetainsUninstalledPackagesFromIndependentItems() throws Exception {
        JSONArray items = new JSONArray().put(new JSONObject().put("id", "reading")
            .put("whitelist", new JSONObject().put("source", "custom").put("packages", new JSONArray().put("missing.reader.tool"))));
        saveItems(new JSONArray().put("global.tool"), items);
        Call apps = call(); plugin.listProtectionApps(apps); assertNull(apps.rejection);
        JSONObject missing = null;
        JSONArray rows = apps.result.getJSONArray("apps");
        for (int i = 0; i < rows.length(); i++) if (rows.getJSONObject(i).optString("packageName").equals("missing.reader.tool")) missing = rows.getJSONObject(i);
        assertNotNull("Saved independent package remains editable after uninstall", missing);
        assertEquals("missing.reader.tool", missing.getString("name"));
        assertFalse(missing.getBoolean("installed"));
    }
}
