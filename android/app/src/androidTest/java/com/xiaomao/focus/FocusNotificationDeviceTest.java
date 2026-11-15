package com.xiaomao.focus;

import android.app.PendingIntent;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.graphics.Rect;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.view.InputDevice;
import android.view.MotionEvent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static org.junit.Assert.*;
import static org.junit.Assume.*;

/** Opt-in real listener + independent probe sender fixture; device authorization is prepared by the runner. */
@RunWith(AndroidJUnit4.class)
public class FocusNotificationDeviceTest {
    private static final String SENDER = "com.xiaomao.focus.probe.sender";
    private static final int ID = 21101;
    @Test public void originalNotificationReturnsAtDeadlineAndActualShadeClickOpensSender() throws Exception {
        assumeTrue("Runner must explicitly prepare isolated sender and listener authorization",
            InstrumentationRegistry.getArguments().getString("runNotificationDeviceFixture", "false").equals("true"));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Only isolated QA identity is permitted", context.getPackageName().endsWith(".qa"));
        NotificationSystem system = new AndroidNotificationSystem(context);
        assertTrue("Prepare notification access before running", system.authorized());
        FocusNotificationListener.rebind(context);
        waitFor(() -> system.connected(), 15000, "Listener did not connect after explicit public requestRebind");
        LocalStore store = LocalStore.get(context);
        FocusControl control = new FocusControl(context);
        assertNull("An existing QA session must be left alone", store.read("active"));
        JSONObject resting = store.read("rest");
        assertFalse("An existing QA rest must be left alone", resting != null && resting.optString("state").equals("running"));
        assertFalse("Existing notification duties must be handled before this fixture", control.getNotificationStatus().getBoolean("recoveryPending"));
        JSONObject baseline = store.snapshot();
        assertNotNull("Initialize the isolated QA app before running this fixture", baseline.getJSONObject("documents").optJSONObject("data"));
        android.content.SharedPreferences journal = context.getSharedPreferences("catfocus-notifications-" + store.getDatabaseName(), 0);
        String journalBaseline = journal.getString("journal", null);
        String sessionId = "notification-device-" + System.nanoTime();
        try {
            JSONObject data = control.loadData();
            if (data == null) data = new JSONObject().put("schemaVersion", 1).put("records", new JSONArray()).put("preferences", new JSONObject());
            JSONObject preferences = data.optJSONObject("preferences");
            if (preferences == null) data.put("preferences", preferences = new JSONObject());
            preferences.put("sound", false).put("vibration", false).put("protection", new JSONObject()
                .put("strict", true).put("study", false).put("dnd", false).put("interceptNotifications", true).put("globalWhitelist", new JSONArray()));
            store.saveData(data, false);
            long epoch = System.currentTimeMillis();
            control.startFocus(new JSONObject().put("id", sessionId).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
                .put("title", "固定截止通知验证").put("themeName", "自由专注").put("color", "#222222")
                .put("mode", "countdown").put("targetMs", 7000).put("startedAt", epoch).put("timeZone", "UTC"), true);
            sender("post", 1);
            waitFor(() -> find(true) != null, 4000, "Original sender notification was not snoozed");
            StatusBarNotification held = find(true);
            assertNotNull(held);
            String originalKey = held.getKey(); int originalUid = held.getUid();
            PendingIntent originalClick = held.getNotification().contentIntent;
            assertEquals(SENDER, originalClick.getCreatorPackage());
            sender("update", 2);
            waitFor(() -> find(false) != null, 10000, "Original notification did not return at the fixed deadline");
            StatusBarNotification restored = find(false);
            assertEquals(originalKey, restored.getKey()); assertEquals(originalUid, restored.getUid());
            assertEquals(SENDER, restored.getPackageName());
            assertEquals(originalClick, restored.getNotification().contentIntent);
            assertEquals(2, restored.getNotification().extras.getInt("probe_revision"));
            assertNull(find(true));
            android.util.Log.i("FocusNotificationDeviceTest", "original_identity_update_and_deadline_verified");
            // This invokes a real notification-shade UI click, not PendingIntent.send().
            shell("input keyevent WAKEUP"); shell("wm dismiss-keyguard");
            shell("cmd statusbar expand-notifications");
            SystemClock.sleep(1800); // Shade animation only; never wait for a constantly updating timer UI to idle.
            waitFor(() -> clickShadeTitle("Synthetic probe #" + ID), 5000, "Could not click synthetic original in notification shade");
            waitFor(() -> senderClickObserved(epoch), 5000, "Sender did not receive its original UI click");
            control.synchronizeNotifications();
            assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
            assertTrue(control.getNotificationStatus().getInt("restoredCount") >= 1);
            android.util.Log.i("FocusNotificationDeviceTest", "original_identity_and_ui_click_verified " + control.getNotificationStatus());
        } finally {
            sender("withdraw", 2); shell("cmd statusbar collapse");
            // Let the normal strict deadline complete before restoring this isolated fixture's data.
            long until = SystemClock.elapsedRealtime() + 10000;
            while (store.read("active") != null && SystemClock.elapsedRealtime() < until) {
                control.reconcile(); SystemClock.sleep(100);
            }
            control.synchronizeNotifications();
            assertFalse("Keep unresolved real duties instead of overwriting them", control.getNotificationStatus().getBoolean("recoveryPending"));
            Reminders.cancelFocus(context); Reminders.cancelRest(context);
            store.restoreSnapshot(baseline);
            JSONObject docs = baseline.getJSONObject("documents");
            store.write("lastFinished", docs.optJSONObject("lastFinished")); store.write("rest", docs.optJSONObject("rest"));
            if (journalBaseline == null) journal.edit().remove("journal").commit();
            else journal.edit().putString("journal", journalBaseline).commit();
        }
    }
    private static StatusBarNotification find(boolean held) {
        try {
            StatusBarNotification[] values = held ? FocusNotificationListener.require().getSnoozedNotifications() : FocusNotificationListener.require().getActiveNotifications();
            if (values != null) for (StatusBarNotification value : values) if (value.getPackageName().equals(SENDER) && value.getId() == ID) return value;
        } catch (RuntimeException ignored) { }
        return null;
    }
    private static void sender(String op, int revision) throws Exception {
        shell("am broadcast -n " + SENDER + "/.CommandReceiver --es op " + op + " --ei id " + ID + " --ei revision " + revision);
    }
    private static boolean senderClickObserved(long sinceEpoch) {
        try {
            for (String line : shell("run-as " + SENDER + " cat files/probe-events.jsonl").split("\n")) {
                if (!line.startsWith("{")) continue;
                JSONObject value = new JSONObject(line); JSONObject details = value.optJSONObject("details");
                if (value.optString("event").equals("content_intent_opened") && value.optLong("wallTimeMs") >= sinceEpoch && details != null && details.optInt("id") == ID && details.optInt("revision") == 2) return true;
            }
        } catch (Exception ignored) { }
        return false;
    }
    private static boolean clickShadeTitle(String text) {
        UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        AccessibilityServiceInfo info = automation.getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        automation.setServiceInfo(info);
        java.util.ArrayList<AccessibilityNodeInfo> roots = new java.util.ArrayList<>();
        AccessibilityNodeInfo active = automation.getRootInActiveWindow();
        if (active != null) roots.add(active);
        for (AccessibilityWindowInfo window : automation.getWindows()) if (window.getRoot() != null) roots.add(window.getRoot());
        for (AccessibilityNodeInfo root : roots) {
            List<AccessibilityNodeInfo> matches = root.findAccessibilityNodeInfosByText(text);
            for (AccessibilityNodeInfo match : matches) {
                if (!match.isVisibleToUser()) continue;
                for (AccessibilityNodeInfo value = match; value != null; value = value.getParent())
                    if (value.isClickable() && value.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                Rect bounds = new Rect(); match.getBoundsInScreen(bounds);
                if (!bounds.isEmpty()) {
                    long time = SystemClock.uptimeMillis();
                    MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, bounds.centerX(), bounds.centerY(), 0);
                    MotionEvent up = MotionEvent.obtain(time, time + 60, MotionEvent.ACTION_UP, bounds.centerX(), bounds.centerY(), 0);
                    down.setSource(InputDevice.SOURCE_TOUCHSCREEN); up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
                    try { return automation.injectInputEvent(down, true) && automation.injectInputEvent(up, true); }
                    finally { down.recycle(); up.recycle(); }
                }
            }
        }
        return false;
    }
    interface Check { boolean done() throws Exception; }
    private static void waitFor(Check check, long timeout, String message) throws Exception {
        long until = SystemClock.elapsedRealtime() + timeout;
        do { if (check.done()) return; SystemClock.sleep(100); } while (SystemClock.elapsedRealtime() < until);
        fail(message);
    }
    private static String shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
             java.io.InputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(descriptor);
             java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
