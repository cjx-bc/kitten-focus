package com.xiaomao.focus;

import android.content.Context;
import android.content.Intent;
import android.app.UiAutomation;
import android.graphics.Bitmap;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real Android input/window acceptance through the native FocusControl boundary. */
@RunWith(AndroidJUnit4.class)
public class NavigationControlTest {
    private Context context;
    private FocusControl control;
    private LocalStore store;
    private JSONObject before;
    private String navOverlay;
    private String shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommand(command);
             FileInputStream input = new FileInputStream(descriptor.getFileDescriptor())) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Isolated QA package only", context.getPackageName().endsWith(".qa"));
        store = LocalStore.get(context); control = new FocusControl(context);
        assertTrue("Finish prior QA session before navigation acceptance", control.observeControl().isNull("owner"));
        before = store.snapshot();
        JSONObject recovery = control.previewRecovery();
        if (recovery.optBoolean("pending")) control.confirmRecovery(recovery.getString("revision"));
        JSONObject data = control.loadData();
        if (data == null) data = new JSONObject().put("schemaVersion", 1).put("records", new JSONArray()).put("deletedRecordIds", new JSONArray()).put("preferences", new JSONObject());
        data.getJSONObject("preferences").put("sound", false).put("vibration", false)
            .put("protection", new JSONObject().put("study", false).put("strict", false).put("enhancements", new JSONArray().put("navigationHomeRecents")));
        store.saveData(data, false);
        context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        long deadline = SystemClock.elapsedRealtime() + 7000;
        while ((!FocusProtection.authorized(context) || !FocusAccessibilityService.connected()) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100);
        assertTrue("Enable QA accessibility for actual window acceptance", FocusProtection.authorized(context) && FocusAccessibilityService.connected());
    }
    @After public void cleanup() throws Exception {
        if (control == null) return;
        if (navOverlay != null) shell("cmd overlay enable-exclusive --category " + navOverlay);
        control.focusAction("finish"); control.restAction("exit");
        JSONObject recovery = control.previewRecovery();
        if (recovery.optBoolean("pending")) control.confirmRecovery(recovery.getString("revision"));
        if (before != null) store.restoreSnapshot(before);
    }
    private void start() throws Exception {
        JSONObject session = new JSONObject().put("id", "navigation-device-" + System.nanoTime()).put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL).put("title", "导航限制验收").put("themeName", "自由专注").put("color", "#222222")
            .put("mode", "countdown").put("targetMs", 120000).put("startedAt", System.currentTimeMillis()).put("timeZone", "UTC")
            .put("state", "running").put("elapsedMs", 0).put("pausedMs", 0).put("segments", new JSONArray());
        control.startFocus(session);
        assertEquals("armed", control.observeControl().getJSONObject("navigation").getString("state"));
        SystemClock.sleep(1500);
    }
    private void screenshot(String name) throws Exception {
        File folder = new File(context.getExternalFilesDir(null), "t14-navigation"); folder.mkdirs();
        Bitmap screen = InstrumentationRegistry.getInstrumentation().getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).takeScreenshot();
        if (screen != null) try (FileOutputStream output = new FileOutputStream(new File(folder, name + ".png"))) { screen.compress(Bitmap.CompressFormat.PNG, 100, output); }
    }
    private void expectReturn(String command, String label) throws Exception {
        long beforeTime = control.observeControl().getJSONObject("navigation").optLong("lastReturnedAt");
        shell(command);
        long deadline = SystemClock.elapsedRealtime() + 6000;
        JSONObject result;
        do {
            result = control.observeControl().getJSONObject("navigation");
            if (result.optBoolean("active") && result.optLong("lastReturnedAt") > beforeTime) break;
            SystemClock.sleep(100);
        } while (SystemClock.elapsedRealtime() < deadline);
        System.out.println("T14 " + label + " " + result);
        screenshot(label);
        assertTrue(label + " must produce observed actual return: " + result, result.optBoolean("active") && result.optLong("lastReturnedAt") > beforeTime);
        String windows = shell("dumpsys window windows");
        String current = "";
        for (String line : windows.split("\n")) if (line.contains("mCurrentFocus=")) current = line;
        System.out.println("T14 " + label + " focus " + current);
        assertTrue("Own activity must be focused after " + label + ": " + current, current.contains(context.getPackageName()) && current.contains("MainActivity"));
        SystemClock.sleep(1500);
    }
    @Test public void actualButtonHomeAndRecentsReturnAndRecoveryReleases() throws Exception {
        start();
        expectReturn("input keyevent KEYCODE_HOME", "button-home");
        control.focusAction("pause");
        expectReturn("input keyevent KEYCODE_APP_SWITCH", "button-recents-paused");
        JSONObject recovery = control.previewRecovery();
        control.confirmRecovery(recovery.getString("revision"));
        assertEquals("recovered", control.observeControl().getJSONObject("navigation").getString("state"));
        shell("input keyevent KEYCODE_HOME"); SystemClock.sleep(1800);
        screenshot("home-after-recovery");
        String focus = shell("dumpsys window windows");
        String current = "";
        for (String line : focus.split("\n")) if (line.contains("mCurrentFocus=")) current = line;
        assertTrue("Home must remain reachable after withdrawal: " + current, current.contains("com.android.launcher3"));
        assertFalse(control.observeControl().getJSONObject("navigation").getBoolean("active"));
    }
    @Test public void actualGestureHomeAndOverviewReturn() throws Exception {
        String overlays = shell("cmd overlay list");
        for (String line : overlays.split("\n")) if (line.startsWith("[x]") && line.contains("navbar.")) navOverlay = line.substring(4).trim();
        assertNotNull("Remember original navigation mode before acceptance", navOverlay);
        shell("cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural");
        SystemClock.sleep(1800);
        String size = shell("wm size");
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("([0-9]+)x([0-9]+)").matcher(size);
        assertTrue(match.find()); int width = Integer.parseInt(match.group(1)), height = Integer.parseInt(match.group(2));
        start();
        expectReturn("input swipe " + width / 2 + " " + (height - 2) + " " + width / 2 + " " + height / 3 + " 220", "gesture-home");
        expectReturn("input swipe " + width / 2 + " " + (height - 2) + " " + width / 2 + " " + height / 2 + " 1000", "gesture-overview");
    }
}
