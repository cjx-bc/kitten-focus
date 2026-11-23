package com.xiaomao.focus;

import android.content.Context;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class UpdateProtectionTest {
    private Context context;
    private LocalStore store;
    private Map<String, byte[]> retained;
    private File directory;
    private QaBusinessBaseline baseline;
    private Map<String, ?> upgradePreferences;

    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        baseline = QaBusinessBaseline.captureIdle(context);
        store = LocalStore.get(context);
        upgradePreferences = new HashMap<>(context.getSharedPreferences("upgrade-protection", Context.MODE_PRIVATE).getAll());
        directory = new File(context.getFilesDir(), "upgrade-backups");
        directory.mkdirs();
        retained = new HashMap<>();
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) {
            retained.put(file.getName(), java.nio.file.Files.readAllBytes(file.toPath()));
            assertTrue(file.delete());
        }
    }

    @After public void cleanup() throws Exception {
        if (baseline == null) return;
        // The paused-focus test intentionally writes an incomplete synthetic active document.
        // Raw baseline restoration does not attempt to settle that malformed fixture as a real focus.
        store.write("active", null);
        baseline.restore();
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) file.delete();
        for (Map.Entry<String, byte[]> item : retained.entrySet())
            java.nio.file.Files.write(new File(directory, item.getKey()).toPath(), item.getValue());
        android.content.SharedPreferences.Editor editor = context.getSharedPreferences("upgrade-protection", Context.MODE_PRIVATE).edit().clear();
        for (Map.Entry<String, ?> item : upgradePreferences.entrySet()) {
            Object value = item.getValue();
            if (value instanceof String) editor.putString(item.getKey(), (String)value);
            else if (value instanceof Integer) editor.putInt(item.getKey(), (Integer)value);
            else if (value instanceof Long) editor.putLong(item.getKey(), (Long)value);
            else if (value instanceof Boolean) editor.putBoolean(item.getKey(), (Boolean)value);
            else if (value instanceof Float) editor.putFloat(item.getKey(), (Float)value);
        }
        assertTrue(editor.commit());
    }

    private JSONObject release() throws Exception {
        return new JSONObject().put("applicationId", context.getPackageName()).put("versionCode", 100)
            .put("versionName", "9.0.0").put("minSdk", 24).put("size", 12345)
            .put("url", "https://47.251.9.162/releases/kitten-focus-9.0.0.apk")
            .put("sha256", new String(new char[64]).replace('\0', 'a')).put("notes", "测试更新");
    }

    private void rejected(JSONObject value) throws Exception {
        try { new UpdateRelease(value); fail("Invalid release should be rejected"); }
        catch (IllegalArgumentException expected) { }
    }

    @Test public void releaseRejectsForeignHostsHttpBadHashAndInvalidPackage() throws Exception {
        assertEquals(100, new UpdateRelease(release()).code);
        rejected(release().put("url", "http://47.251.9.162/releases/update.apk"));
        rejected(release().put("url", "https://example.org/releases/update.apk"));
        rejected(release().put("url", "https://47.251.9.162@evil.example/releases/update.apk"));
        rejected(release().put("url", "https://47.251.9.162/releases/../update.apk"));
        rejected(release().put("applicationId", "another.app"));
        rejected(release().put("sha256", "abc"));
        rejected(release().put("size", -1));
    }

    @Test public void domainUpdateAllowsOnlyApprovedHostsAndNetworkFallbackOnce() throws Exception {
        UpdateRelease domain = new UpdateRelease(release().put("url", "https://download-focus.linma.asia/releases/update.apk"));
        assertEquals("https://47.251.9.162/releases/update.apk", domain.fallbackUrl());
        assertTrue(AppUpdateManager.shouldFallback(domain, android.app.DownloadManager.ERROR_HTTP_DATA_ERROR, false));
        assertTrue(AppUpdateManager.shouldFallback(domain, 503, false));
        assertFalse(AppUpdateManager.shouldFallback(domain, 503, true));
        assertFalse(AppUpdateManager.shouldFallback(new UpdateRelease(release()), 503, false));
        assertFalse(AppUpdateManager.shouldFallback(domain, android.app.DownloadManager.ERROR_INSUFFICIENT_SPACE, false));
        rejected(release().put("url", "https://download-focus.linma.asia.evil.org/releases/update.apk"));
        rejected(release().put("url", "https://download-focus.linma.asia:8443/releases/update.apk"));
        rejected(release().put("url", "https://focus.linma.asia/releases/update.apk"));
    }

    @Test public void publicReleaseRoutesAreBoundToRepositoryVersionAndExhaustedOnce() throws Exception {
        String github = UpdateRelease.GITHUB + "v9.0.0/xiaomao-focus-9.0.0-debug.apk";
        JSONObject value = release().put("url", github).put("downloadUrls", new JSONArray()
            .put(UpdateRelease.MIRROR + github).put("https://download-focus.linma.asia/releases/update.apk")
            .put(github).put("https://47.251.9.162/releases/update.apk"));
        UpdateRelease configured = new UpdateRelease(value);
        assertEquals(4, configured.downloadUrls.size());
        assertEquals(4, new UpdateRelease(configured.json()).downloadUrls.size());
        assertTrue(AppUpdateManager.canTryNext(configured, 0, android.app.DownloadManager.STATUS_FAILED, 503, false));
        assertTrue(AppUpdateManager.canTryNext(configured, 1, android.app.DownloadManager.STATUS_PAUSED, 1, true));
        assertFalse(AppUpdateManager.canTryNext(configured, 3, android.app.DownloadManager.STATUS_FAILED, 503, false));
        assertFalse(AppUpdateManager.canTryNext(configured, 0, android.app.DownloadManager.STATUS_FAILED, android.app.DownloadManager.ERROR_INSUFFICIENT_SPACE, false));
        assertFalse(AppUpdateManager.canTryNext(configured, 0, android.app.DownloadManager.STATUS_SUCCESSFUL, 0, false));
        rejected(release().put("url", UpdateRelease.MIRROR + "https://github.com/another/repo/releases/download/v9.0.0/a.apk"));
        rejected(release().put("url", UpdateRelease.MIRROR + github + "?token=anything"));
        rejected(release().put("url", github.replace("v9.0.0", "v8.0.0")));
        rejected(release().put("downloadUrls", new JSONArray().put(github).put(github)));
    }

    @Test public void snapshotsRestoreRecordsAndPreferencesAndKeepOnlyThree() throws Exception {
        JSONObject data = new JSONObject().put("schemaVersion", 1).put("themes", new JSONArray().put(new JSONObject().put("id", "theme")))
            .put("items", new JSONArray()).put("events", new JSONArray()).put("courses", new JSONArray())
            .put("semesters", new JSONArray()).put("deletedRecordIds", new JSONArray())
            .put("preferences", new JSONObject().put("defaultMinutes", 45));
        JSONArray records = new JSONArray().put(new JSONObject().put("id", "record").put("durationMs", 7000));
        data.put("records", records);
        store.saveData(data, true);
        UpgradeBackups backups = new UpgradeBackups(context);
        String saved = backups.create(4, 5);
        store.saveData(new JSONObject(data.toString()).put("preferences", new JSONObject().put("defaultMinutes", 60)).put("records", new JSONArray()), true);
        backups.restore(saved);
        assertEquals(45, store.loadData().getJSONObject("preferences").getInt("defaultMinutes"));
        assertEquals("record", store.loadData().getJSONArray("records").getJSONObject(0).getString("id"));
        backups.create(10, 11); Thread.sleep(10);
        backups.create(11, 12); Thread.sleep(10);
        backups.create(12, 13); Thread.sleep(10);
        assertEquals(3, backups.list().length());
    }

    @Test public void malformedMigrationLeavesOriginalDataAndRecoveryCopy() throws Exception {
        JSONObject before = new JSONObject().put("schemaVersion", 2).put("notes", "do not lose");
        store.write("data", before);
        context.getSharedPreferences("upgrade-protection", Context.MODE_PRIVATE).edit().putInt("preparedVersion", 0).commit();
        try { new UpgradeBackups(context).prepareStartup(); fail("Future schema should not become empty data"); }
        catch (IllegalStateException expected) { }
        assertEquals("do not lose", store.read("data").getString("notes"));
        assertEquals(1, new UpgradeBackups(context).list().length());
    }

    @Test public void startupWaitingForTheDatabaseDoesNotBlockBackupFiles() throws Exception {
        store.write("data", new JSONObject().put("schemaVersion", 1));
        assertTrue(context.getSharedPreferences("upgrade-protection", Context.MODE_PRIVATE)
            .edit().putInt("preparedVersion", BuildConfig.VERSION_CODE).commit());
        UpgradeBackups backups = new UpgradeBackups(context);
        backups.create(1, 2);
        FutureTask<Void> startup = new FutureTask<>(() -> {
            backups.prepareStartup();
            return null;
        });
        FutureTask<Integer> listing = new FutureTask<>(() -> backups.list().length());
        Thread startupThread = new Thread(startup, "qa-upgrade-startup");
        Thread listingThread = new Thread(listing, "qa-upgrade-listing");
        boolean listedWhileStoreLocked = false;
        synchronized (store) {
            startupThread.start();
            long deadline = SystemClock.elapsedRealtime() + 5000;
            while (startupThread.getState() != Thread.State.BLOCKED && !startup.isDone()
                && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(10);
            if (startupThread.getState() == Thread.State.BLOCKED) {
                listingThread.start();
                try {
                    listedWhileStoreLocked = listing.get(3, TimeUnit.SECONDS) == 1;
                } catch (TimeoutException expectedOnRegression) {
                    // Release the store below so even a regression leaves no threads blocked.
                }
            }
        }
        startup.get(5, TimeUnit.SECONDS);
        if (listingThread.getState() != Thread.State.NEW) listing.get(5, TimeUnit.SECONDS);
        assertTrue("Startup must wait for the database without holding the backup file lock", listedWhileStoreLocked);
    }

    @Test public void pausedFocusBlocksRecoveryRestore() throws Exception {
        store.write("active", new JSONObject().put("state", "paused"));
        try { new UpgradeBackups(context).restore("upgrade-1-2.json"); fail("Paused focus must block restore"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("专注")); }
    }

    @Test public void corruptSnapshotCannotReplaceCurrentData() throws Exception {
        store.write("data", new JSONObject().put("schemaVersion", 1).put("marker", "retained"));
        try {
            store.restoreSnapshot(new JSONObject().put("documents", new JSONObject().put("data",new JSONObject().put("schemaVersion",2))).put("records",new JSONArray()));
            fail("Unsupported snapshot must be rejected");
        } catch (IllegalArgumentException expected) { }
        assertEquals("retained", store.read("data").getString("marker"));
    }

    @Test public void networkFailureKeepsLocalDataAndAutoCheckRunsEachLaunchWithCooldown() throws Exception {
        android.content.SharedPreferences prefs = context.getSharedPreferences("app-updates", Context.MODE_PRIVATE);
        Map<String, ?> previous = new HashMap<>(prefs.getAll());
        try {
            prefs.edit().clear().commit();
            store.write("data", new JSONObject().put("schemaVersion", 1).put("marker", "offline retained"));
            final int[] attempts = {0};
            final long[] nowMs = {1000L};
            AppUpdateManager.ManifestSource failingSource = () -> {
                attempts[0]++;
                throw new java.io.IOException("test network unavailable");
            };
            AppUpdateManager manager = new AppUpdateManager(context, failingSource, () -> nowMs[0]);
            JSONObject state = manager.check(false);
            assertFalse(state.getString("checkError").isEmpty());
            manager.check(false);
            assertEquals(1, attempts[0]);
            try { manager.check(true); fail("Manual checks must report unavailable network"); }
            catch (IllegalStateException expected) { }
            assertEquals(2, attempts[0]);
            AppUpdateManager nextLaunch = new AppUpdateManager(context, failingSource, () -> nowMs[0]);
            nextLaunch.check(false);
            assertEquals(3, attempts[0]);
            assertEquals("offline retained", store.read("data").getString("marker"));
        } finally {
            android.content.SharedPreferences.Editor editor = prefs.edit().clear();
            for (Map.Entry<String, ?> item : previous.entrySet()) {
                Object value = item.getValue();
                if (value instanceof String) editor.putString(item.getKey(), (String)value);
                else if (value instanceof Long) editor.putLong(item.getKey(), (Long)value);
                else if (value instanceof Integer) editor.putInt(item.getKey(), (Integer)value);
                else if (value instanceof Boolean) editor.putBoolean(item.getKey(), (Boolean)value);
            }
            editor.commit();
        }
    }
}
