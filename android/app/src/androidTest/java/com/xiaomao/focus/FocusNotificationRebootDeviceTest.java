package com.xiaomao.focus;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;
import static org.junit.Assume.*;

/** Two explicit invocations around a real isolated-emulator reboot; runtime backup stays app-private. */
@RunWith(AndroidJUnit4.class)
public class FocusNotificationRebootDeviceTest {
    static final String FILE = "notification-reboot-fixture.json";
    static final int ID = 21209;
    @Test public void originalResponsibilitySurvivesRealRebootAndIsReconciledTruthfully() throws Exception {
        String phase = InstrumentationRegistry.getArguments().getString("runNotificationRebootPhase", "");
        assumeTrue(phase.equals("prepare") || phase.equals("verify"));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext(); assertTrue(context.getPackageName().endsWith(".qa"));
        LocalStore store = LocalStore.get(context); FocusControl control = new FocusControl(context);
        android.content.SharedPreferences journal = context.getSharedPreferences("catfocus-notifications-" + store.getDatabaseName(), 0);
        if (phase.equals("prepare")) {
            assertFalse("An unfinished earlier reboot fixture must be reconciled first", context.getFileStreamPath(FILE).exists());
            assertNull(store.read("active")); JSONObject rest = store.read("rest");
            assertFalse(rest != null && rest.optString("state").equals("running"));
            assertFalse(control.getNotificationStatus().getBoolean("recoveryPending"));
            JSONObject saved = new JSONObject().put("baseline", store.snapshot()).put("journal", journal.getString("journal", null))
                .put("boot", SessionClock.system(context).boot()).put("sessionId", "notification-reboot-" + System.nanoTime());
            try (java.io.FileOutputStream output = context.openFileOutput(FILE, 0)) { output.write(saved.toString().getBytes(StandardCharsets.UTF_8)); }
            JSONObject data = control.loadData(); data.getJSONObject("preferences").put("sound", false).put("vibration", false)
                .put("protection", new JSONObject().put("strict", false).put("study", false).put("dnd", false)
                    .put("interceptNotifications", true).put("globalWhitelist", new JSONArray())); store.saveData(data, false);
            FocusNotificationListener.rebind(context);
            FocusNotificationLifecycleDeviceTest.waitFor(() -> FocusNotificationListener.connected(), 15000, "Listener did not connect");
            control.startFocus(new JSONObject().put("id", saved.getString("sessionId")).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
                .put("title", "Notification reboot fixture").put("themeName", "Free focus").put("color", "#222222").put("mode", "stopwatch").put("targetMs", 120000).put("timeZone", "UTC"));
            FocusNotificationLifecycleDeviceTest.sender("post", ID, 1, "normal");
            FocusNotificationLifecycleDeviceTest.waitFor(() -> FocusNotificationLifecycleDeviceTest.find(ID, true) != null, 5000, "Original not held before reboot");
            assertTrue(control.getNotificationStatus().getBoolean("recoveryPending"));
            android.util.Log.i("FocusNotificationRebootDeviceTest", "reboot_prepare_original_held boot=" + saved.getInt("boot"));
            return;
        }
        JSONObject saved;
        try (java.io.FileInputStream input = context.openFileInput(FILE); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] bytes = new byte[4096]; int count; while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count);
            saved = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
        }
        assertTrue("This phase requires a real boot change", SessionClock.system(context).boot() > saved.getInt("boot"));
        FocusNotificationListener.rebind(context);
        FocusNotificationLifecycleDeviceTest.waitFor(() -> FocusNotificationListener.connected(), 15000, "Listener did not reconnect after reboot");
        control.reconcile(); assertTrue(control.observeControl().isNull("owner"));
        JSONObject record = null; JSONArray records = control.loadData().getJSONArray("records");
        for (int i = 0; i < records.length(); i++) if (records.getJSONObject(i).optString("id").equals(saved.getString("sessionId"))) record = records.getJSONObject(i);
        // A zero-duration interrupted focus legitimately produces no persisted focus record.
        if (record != null) assertEquals("interrupted", record.getString("status"));
        FocusNotificationLifecycleDeviceTest.waitFor(() -> { control.synchronizeNotifications(); return !control.getNotificationStatus().getBoolean("recoveryPending"); }, 70000, "Original responsibility remained unresolved after boot");
        JSONObject status = control.getNotificationStatus();
        if (FocusNotificationLifecycleDeviceTest.find(ID, false) == null) {
            assertEquals(0, status.getInt("restoredCount")); assertEquals(1, status.getInt("absentCount"));
        } else { assertEquals(1, status.getInt("restoredCount")); assertEquals(0, status.getInt("absentCount")); }
        assertNull(FocusNotificationLifecycleDeviceTest.find(ID, true));
        android.util.Log.i("FocusNotificationRebootDeviceTest", "real_reboot_original_outcome_verified " + status);
        FocusNotificationLifecycleDeviceTest.sender("withdraw", ID, 1, "normal"); Reminders.cancelFocus(context); Reminders.cancelRest(context);
        JSONObject baseline = saved.getJSONObject("baseline"); store.restoreSnapshot(baseline);
        JSONObject docs = baseline.getJSONObject("documents"); store.write("lastFinished", docs.optJSONObject("lastFinished")); store.write("rest", docs.optJSONObject("rest"));
        if (saved.isNull("journal")) journal.edit().remove("journal").commit(); else journal.edit().putString("journal", saved.getString("journal")).commit();
        assertTrue(context.deleteFile(FILE));
    }
}
