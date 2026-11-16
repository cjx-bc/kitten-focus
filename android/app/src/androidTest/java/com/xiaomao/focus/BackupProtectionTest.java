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
import java.io.File;
import static org.junit.Assert.*;

/** Public native control/upgrade commands; only OS release and clock are substituted. */
@RunWith(AndroidJUnit4.class)
public class BackupProtectionTest {
    private Context context;
    private LocalStore store;
    private FocusControl control;
    private UpgradeBackups backups;
    private String database;
    private boolean failRelease;
    private final TestClock clock = new TestClock();
    private static final class TestClock implements SessionClock {
        long elapsed;
        public long epoch() { return 1794787200000L + elapsed; }
        public long mono() { return 100000L + elapsed; }
        public int boot() { return 1; }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        QaBusinessBaseline.assertIdle(context);
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "backup-protection-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database);
        FocusRecovery recovery = new FocusRecovery(context, store, () -> {
            if (failRelease) throw new IllegalStateException("OS release unavailable");
        });
        FocusProtection.AccessibilityState available = new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; }
            public boolean connected() { return true; }
        };
        control = new FocusControl(context, store, clock, recovery, available);
        backups = new UpgradeBackups(context, store, control);
        control.replaceData(data("original"));
    }
    @After public void cleanup() throws Exception {
        if (store == null) return;
        Reminders.cancelFocus(context); Reminders.cancelRest(context);
        store.close(); context.deleteDatabase(database);
        File directory = new File(context.getFilesDir(), "upgrade-backups-" + database);
        File[] files = directory.listFiles(); if (files != null) for (File file : files) assertTrue(file.delete());
        if (directory.exists()) assertTrue(directory.delete());
        context.getSharedPreferences("catfocus-recovery-" + database, Context.MODE_PRIVATE).edit().clear().commit();
    }
    private JSONObject data(String name) throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("themes", new JSONArray())
            .put("items", new JSONArray()).put("events", new JSONArray()).put("eventExceptions", new JSONArray())
            .put("semesters", new JSONArray()).put("courses", new JSONArray()).put("courseExceptions", new JSONArray())
            .put("records", new JSONArray()).put("deletedRecordIds", new JSONArray())
            .put("lockConfigurations", new JSONArray().put(new JSONObject().put("id", name).put("name", name)
                .put("minutes", 5).put("whitelist", new JSONObject().put("source", "custom").put("packages", new JSONArray()))))
            .put("preferences", new JSONObject().put("defaultMinutes", 25).put("sound", false).put("vibration", false)
                .put("protection", new JSONObject().put("study", true).put("strict", false).put("enhancements", new JSONArray())
                    .put("globalWhitelist", new JSONArray())));
    }
    private JSONObject session() throws Exception {
        return new JSONObject().put("id", "backup-focus").put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "备份验证").put("themeName", "自由专注").put("color", "#222")
            .put("mode", "stopwatch").put("targetMs", 60000).put("startedAt", clock.epoch()).put("timeZone", "UTC");
    }
    private void assertOriginal() throws Exception {
        assertEquals("original", control.loadData().getJSONArray("lockConfigurations").getJSONObject(0).getString("id"));
    }
    @Test public void manualReplacementRejectsPausedFocusAndActiveLock() throws Exception {
        control.startFocus(session()); control.focusAction("pause");
        try { control.replaceData(data("replacement")); fail("Paused focus must block replacement"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("专注")); }
        assertOriginal(); control.focusAction("finish"); control.restAction("exit");
        control.startLock("original");
        try { control.replaceData(data("replacement")); fail("Active lock must block replacement"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("锁机")); }
        assertOriginal(); control.lockAction("finish", true);
    }
    @Test public void manualCleanupFailureRetainsBusinessAndDutyUntilSuccessfulRetry() throws Exception {
        control.startFocus(session()); failRelease = true; control.focusAction("finish");
        assertTrue(control.previewRecovery().getBoolean("pending"));
        try { control.replaceData(data("replacement")); fail("Failed restoration must block write"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("原数据")); }
        assertOriginal(); assertTrue(control.previewRecovery().getBoolean("pending"));
        failRelease = false; control.replaceData(data("replacement"));
        assertFalse(control.previewRecovery().getBoolean("pending"));
        assertNull(control.observeControl().getJSONObject("focus").optJSONObject("session"));
    }
    @Test public void upgradeCleanupFailureAlsoRetainsBusinessAndDuty() throws Exception {
        String id = backups.create(101, 102);
        control.startFocus(session()); failRelease = true; control.focusAction("finish");
        try { backups.restore(id); fail("Upgrade restoration must use all cleanup adapters"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("原数据")); }
        assertOriginal(); assertTrue(control.previewRecovery().getBoolean("pending"));
        failRelease = false; backups.restore(id);
        assertFalse(control.previewRecovery().getBoolean("pending"));
        assertNull(control.observeControl().getJSONObject("rest").optJSONObject("session"));
    }
    @Test public void upgradeSnapshotExcludesActiveAndOldMaliciousRuntimeCannotReactivate() throws Exception {
        control.startFocus(session());
        String id = backups.create(201, 202);
        File file = new File(context.getFilesDir(), "upgrade-backups-" + database + "/" + id);
        JSONObject saved = new JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()), java.nio.charset.StandardCharsets.UTF_8));
        JSONObject documents = saved.getJSONObject("snapshot").getJSONObject("documents");
        assertFalse(documents.has("active")); assertFalse(documents.has("rest"));
        documents.put("active", session().put("kind", "lock").put("temporaryAccessRuntime", new JSONObject().put("used", 0)))
            .put("adapter-journal", new JSONObject().put("body", "private-notification"));
        documents.getJSONObject("data").put("active", session());
        java.nio.file.Files.write(file.toPath(), saved.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        try { backups.restore(id); fail("Active focus must block upgrade restore"); }
        catch (IllegalStateException expected) { }
        control.focusAction("finish");
        backups.restore(id);
        JSONObject observation = control.observeControl();
        assertTrue(observation.isNull("owner"));
        assertFalse(control.loadData().has("active"));
        assertFalse(backups.export(id).toString().contains("private-notification"));
    }
    @Test public void manualReplacementIgnoresForgedRuntimeAndPreservesOriginalHistory() throws Exception {
        JSONObject data = data("portable").put("active", session().put("kind", "lock"))
            .put("notificationBody", "private-notification");
        data.getJSONObject("preferences").put("authorized", true);
        control.replaceData(data);
        assertTrue(control.observeControl().isNull("owner"));
        assertFalse(control.loadData().has("active"));
        assertFalse(control.loadData().getJSONObject("preferences").has("authorized"));
    }
    @Test public void upgradeRejectsActiveLockAndMalformedChoicesBeforeWriting() throws Exception {
        String id = backups.create(301, 302);
        control.startLock("original");
        try { backups.restore(id); fail("Active lock must block upgrade restoration"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("锁机")); }
        assertOriginal(); control.lockAction("finish", true);
        JSONObject invalid = data("replacement");
        invalid.getJSONObject("preferences").getJSONObject("protection").put("strict", "true");
        try { control.replaceData(invalid); fail("Damaged reusable preferences must not overwrite"); }
        catch (IllegalArgumentException expected) { }
        assertOriginal();
    }
    @Test public void manualAndUpgradeReplacementClearRestWithoutDeletingSavedFocus() throws Exception {
        control.startFocus(session()); clock.elapsed += 7000; control.focusAction("finish");
        assertNotNull(control.observeControl().getJSONObject("rest").optJSONObject("session"));
        JSONObject original = control.loadData();
        assertEquals(7000, original.getJSONArray("records").getJSONObject(0).getLong("durationMs"));
        String id = backups.create(401, 402);
        control.replaceData(original);
        assertNull(control.observeControl().getJSONObject("rest").optJSONObject("session"));
        assertEquals(1, control.loadData().getJSONArray("records").length());
        control.startFocus(session().put("id", "second-focus")); clock.elapsed += 3000; control.focusAction("finish");
        assertNotNull(control.observeControl().getJSONObject("rest").optJSONObject("session"));
        backups.restore(id);
        assertNull(control.observeControl().getJSONObject("rest").optJSONObject("session"));
        assertEquals(1, control.loadData().getJSONArray("records").length());
        assertEquals(7000, control.loadData().getJSONArray("records").getJSONObject(0).getLong("durationMs"));
    }
}
