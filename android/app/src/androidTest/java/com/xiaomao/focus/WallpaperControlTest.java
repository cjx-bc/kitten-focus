package com.xiaomao.focus;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Approved public native seam. Actual picker/service effects are separately measured. */
@RunWith(AndroidJUnit4.class)
public class WallpaperControlTest {
    Context context; LocalStore store; FocusControl control; String database;
    @Before public void setup() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        database = "wallpaper-control-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database);
        control = new FocusControl(context, store, SessionClock.system(context));
    }
    @After public void cleanup() {
        Reminders.cancelFocus(context); Reminders.cancelRest(context);
        store.close(); context.deleteDatabase(database);
        context.getSharedPreferences("catfocus-wallpaper-" + database, 0).edit().clear().commit();
    }
    @Test public void defaultOffObservationExposesActualSelectionWithoutPreparingOrChangingWallpaper() throws Exception {
        JSONObject first = control.observeControl().getJSONObject("wallpaper");
        assertFalse(first.getBoolean("requested"));
        assertFalse(first.getBoolean("active"));
        assertFalse(first.getBoolean("recoveryPending"));
        assertEquals(first.toString(), control.observeControl().getJSONObject("wallpaper").toString());
    }
    static class Clock implements SessionClock {
        long time = 1000000; int boot = 1;
        public long epoch() { return 1794729600000L + time; }
        public long mono() { return time; }
        public int boot() { return boot; }
    }
    static class Wallpapers implements WallpaperSystem {
        String component = "original/.Live", lockComponent = "", picker = "", pickerToken = ""; int home = 10, lock = -1;
        boolean sourceExists = true, failRestore, partialFailureAfterHome;
        public boolean supported() { return true; }
        public String ownComponent() { return "qa/com.xiaomao.focus.FocusWallpaperService"; }
        public JSONObject current() throws Exception { return new JSONObject().put("homeId", home).put("lockId", lock)
            .put("component", component).put("lockComponent", lockComponent); }
        public void openPicker(String target) { picker = target; }
        public void openPicker(String target, String token) { picker = target; pickerToken = token; }
        public String importOriginal(String uri, boolean lock) { return "provided-original.png"; }
        public boolean sourceAvailable(String name) { return sourceExists && !name.isEmpty(); }
        public void restoreStatic(JSONObject original, String homeSource, String lockSource, boolean restoreHome, boolean restoreLock) throws Exception {
            if (failRestore) throw new IllegalStateException("restore unavailable");
            if (restoreHome) { component = ""; home = 20; }
            if (restoreHome && partialFailureAfterHome) throw new IllegalStateException("platform write interrupted after home changed");
            if (restoreLock) { lockComponent = ""; lock = original.optInt("lockId", -1) < 0 ? -1 : 21; }
        }
    }
    @Test public void confirmedRoundKeepsAssistanceThroughPauseAndRestoresLiveOriginalThroughSystemConfirmation() throws Exception {
        Clock clock = new Clock(); Wallpapers wallpapers = new Wallpapers();
        control = new FocusControl(context, store, clock, wallpapers);
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false,\"protection\":{\"enhancements\":[\"wallpaperProtection\"]}}}"));
        control.prepareWallpaper(true, true);
        JSONObject session = new JSONObject().put("id", "wallpaper-round").put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("themeName", "自由专注").put("color", "#222222").put("title", "Wallpaper fixture").put("mode", "stopwatch")
            .put("targetMs", 60000).put("startedAt", clock.epoch()).put("timeZone", "UTC").put("segments", new JSONArray());
        control.startFocus(session);
        assertEquals(wallpapers.ownComponent(), wallpapers.picker);
        assertEquals("requested", control.getWallpaperStatus().getString("phase"));
        assertFalse(control.getWallpaperStatus().getBoolean("active"));
        wallpapers.component = wallpapers.ownComponent(); wallpapers.home = 11;
        control.wallpaperPickerReturned(wallpapers.pickerToken);
        assertTrue(control.getWallpaperStatus().getBoolean("active"));
        clock.time += 1000; control.focusAction("pause");
        control = new FocusControl(context, store, clock, wallpapers); control.reconcile();
        assertTrue(control.getWallpaperStatus().getBoolean("active"));
        assertEquals("wallpaper-round", control.observeControl().getJSONObject("focus").getJSONObject("session").getString("id"));
        control.focusAction("resume"); clock.time += 1000; control.focusAction("finish");
        assertEquals("rest", control.observeControl().getString("owner"));
        assertTrue(control.getWallpaperStatus().getBoolean("recoveryPending"));
        assertEquals("recovery_pending", control.getWallpaperStatus().getString("phase"));
        control.requestWallpaperPicker(true);
        assertEquals("original/.Live", wallpapers.picker);
        wallpapers.component = "original/.Live"; wallpapers.home = 12;
        control.wallpaperPickerReturned(wallpapers.pickerToken);
        assertEquals("restored", control.getWallpaperStatus().getString("phase"));
        assertFalse(control.getWallpaperStatus().getBoolean("recoveryPending"));
        assertEquals(1, control.loadData().getJSONArray("records").length());
    }
    @Test public void suppliedStaticOriginalAndSelectedEngineReconcileSameRoundThenRestoreHomePreservingLaterLock() throws Exception {
        Clock clock = new Clock(); Wallpapers wallpapers = new Wallpapers(); wallpapers.component = "";
        control = new FocusControl(context, store, clock, wallpapers);
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false,\"protection\":{\"enhancements\":[\"wallpaperProtection\"]}}}"));
        try { control.prepareWallpaper(true, true); fail("No arbitrary static-original backup"); } catch (IllegalStateException expected) { }
        assertTrue(control.observeControl().isNull("owner"));
        control.importWallpaperOriginal("content://supplied-original", false);
        control.prepareWallpaper(true, true);
        JSONObject session = new JSONObject().put("id", "static-wallpaper-round").put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("themeName", "自由专注").put("color", "#222222").put("title", "Supplied static original").put("mode", "stopwatch")
            .put("targetMs", 60000).put("startedAt", clock.epoch()).put("timeZone", "UTC").put("segments", new JSONArray());
        control.startFocus(session);
        control.wallpaperEngineCreated(true);
        assertFalse(control.getWallpaperStatus().getBoolean("active"));
        wallpapers.component = wallpapers.ownComponent(); wallpapers.home = 11;
        control.wallpaperPickerReturned(wallpapers.pickerToken); clock.time += 5000;
        control = new FocusControl(context, store, clock, wallpapers);
        control.wallpaperEngineCreated(false);
        JSONObject resumed = control.observeControl();
        assertEquals("static-wallpaper-round", resumed.getJSONObject("focus").getJSONObject("session").getString("id"));
        assertEquals(5000, resumed.getJSONObject("focus").getLong("elapsedMs"));
        assertTrue(control.loadData().getJSONArray("records").length() == 0);
        wallpapers.lock = 99; wallpapers.lockComponent = "later/.Lock";
        control.focusAction("finish");
        assertEquals("", wallpapers.component); assertEquals(99, wallpapers.lock); assertEquals("later/.Lock", wallpapers.lockComponent);
        assertEquals("restored", control.getWallpaperStatus().getString("phase"));
        assertFalse(control.getWallpaperStatus().getBoolean("recoveryPending"));
        assertFalse(control.getWallpaperStatus().getBoolean("cropVerified"));
    }
    @Test public void laterStaticHomeChoiceIsPreservedAndNeverReportedAsOriginalRestoration() throws Exception {
        Clock clock = new Clock(); Wallpapers wallpapers = new Wallpapers(); wallpapers.component = "";
        control = new FocusControl(context, store, clock, wallpapers);
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false,\"protection\":{\"enhancements\":[\"wallpaperProtection\"]}}}"));
        control.importWallpaperOriginal("content://original", false); control.prepareWallpaper(true, true);
        JSONObject session = new JSONObject().put("id", "later-choice-round").put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("themeName", "自由专注").put("color", "#222222").put("title", "Later home choice").put("mode", "stopwatch")
            .put("targetMs", 60000).put("startedAt", clock.epoch()).put("timeZone", "UTC").put("segments", new JSONArray());
        control.startFocus(session); wallpapers.component = wallpapers.ownComponent(); wallpapers.home = 11; control.wallpaperPickerReturned(wallpapers.pickerToken);
        wallpapers.component = ""; wallpapers.home = 99; clock.time += 1000; control.focusAction("finish");
        assertEquals(99, wallpapers.home);
        assertEquals("user_choice_preserved", control.getWallpaperStatus().getString("phase"));
        assertFalse(control.getWallpaperStatus().getBoolean("recoveryPending"));
    }
    JSONObject fixtureSession(String id, String mode, Clock clock) throws Exception {
        return new JSONObject().put("id", id).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("themeName", "自由专注").put("color", "#222222").put("title", id).put("mode", mode)
            .put("targetMs", 60000).put("startedAt", clock.epoch()).put("timeZone", "UTC").put("segments", new JSONArray());
    }
    void fixturePreferences(boolean enabled, boolean strict) throws Exception {
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").put("protection", new JSONObject().put("strict", strict)
            .put("enhancements", new JSONArray(enabled ? "[\"wallpaperProtection\"]" : "[]")));
        store.saveData(data, false);
    }
    void suppliedOriginal() throws Exception { control.importWallpaperOriginal("content://provided-original", false); control.prepareWallpaper(true, true); }
    JSONObject record(String id) throws Exception {
        JSONArray records = control.loadData().getJSONArray("records");
        for (int i = 0; i < records.length(); i++) if (records.getJSONObject(i).optString("id").equals(id)) return records.getJSONObject(i);
        fail("Missing public record " + id); return null;
    }
    @Test public void staleDeclinedAndLatePickerEffectsKeepTheirOwnRoundThroughFailureManualRetryAndReboot() throws Exception {
        Clock clock = new Clock(); Wallpapers wallpapers = new Wallpapers(); wallpapers.component = "";
        control = new FocusControl(context, store, clock, wallpapers);
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false}}"));
        fixturePreferences(true, false);
        try { control.prepareWallpaper(false, true); fail("Consent is required"); } catch (IllegalStateException expected) { }
        suppliedOriginal(); wallpapers.home = 12;
        try { control.startFocus(fixtureSession("stale", "stopwatch", clock)); fail("Stale original must refuse before picker"); } catch (IllegalStateException expected) { }
        assertEquals("", wallpapers.picker); assertTrue(control.observeControl().isNull("owner"));
        suppliedOriginal(); control.startFocus(fixtureSession("declined", "stopwatch", clock));
        control.wallpaperEngineCreated(true); control.wallpaperPickerReturned(wallpapers.pickerToken);
        assertEquals("declined", control.getWallpaperStatus().getString("phase")); assertEquals(12, wallpapers.home);
        assertFalse(control.getWallpaperStatus().getBoolean("recoveryPending"));
        clock.time += 1000; control.focusAction("pause"); control.focusAction("resume"); control.focusAction("finish"); control.restAction("exit");

        // End while Android still displays its picker; a late selection belongs to this old round.
        suppliedOriginal(); control.startFocus(fixtureSession("late-old", "stopwatch", clock));
        String oldPickerToken = wallpapers.pickerToken;
        clock.time += 1000; control.focusAction("finish"); control.restAction("exit");
        assertTrue(control.getWallpaperStatus().getBoolean("recoveryPending"));
        fixturePreferences(false, false); control.startFocus(fixtureSession("new-unprotected", "stopwatch", clock));
        wallpapers.component = wallpapers.ownComponent(); wallpapers.lockComponent = wallpapers.ownComponent(); wallpapers.home = 13; wallpapers.lock = 13;
        // Framework binding can arrive before the original Activity result or after its process was lost.
        control = new FocusControl(context, store, clock, wallpapers); control.wallpaperEngineCreated(false);
        assertFalse("A late own selection must be restored, not mislabeled as a later user choice", control.getWallpaperStatus().getBoolean("selected"));
        assertFalse("Home+lock restoration must leave no owned live lock", control.getWallpaperStatus().getBoolean("lockSelected"));
        assertTrue("An open picker can still cause a late selection", control.getWallpaperStatus().getBoolean("recoveryPending"));
        assertEquals("new-unprotected", control.observeControl().getJSONObject("focus").getJSONObject("session").getString("id"));
        control.wallpaperPickerReturned(oldPickerToken);
        assertFalse(control.getWallpaperStatus().getBoolean("recoveryPending"));
        assertEquals("new-unprotected", control.observeControl().getJSONObject("focus").getJSONObject("session").getString("id"));
        clock.time += 1000; control.focusAction("finish"); control.restAction("exit");

        // Failed cleanup withdraws only assistance. A strict timer and its preferences remain authoritative.
        fixturePreferences(true, true); suppliedOriginal();
        control.startFocus(fixtureSession("strict-failure", "countdown", clock), true);
        assertFalse(oldPickerToken.equals(wallpapers.pickerToken));
        String currentPickerToken = wallpapers.pickerToken;
        control.wallpaperPickerReturned(oldPickerToken);
        assertTrue("Stale result must not close the current round's picker", control.getWallpaperStatus().getBoolean("pickerOpen"));
        wallpapers.component = wallpapers.ownComponent(); wallpapers.home = 14; control.wallpaperPickerReturned(currentPickerToken); wallpapers.failRestore = true;
        JSONObject preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertEquals("restoration_failed", control.getWallpaperStatus().getString("phase"));
        assertTrue(control.getWallpaperStatus().getBoolean("recoveryPending"));
        try { control.focusAction("pause"); fail("Wallpaper recovery must not bypass strict timing"); } catch (IllegalStateException expected) { }
        String observed = control.getWallpaperStatus().toString(), recovery = control.previewRecovery().toString();
        assertEquals(observed, control.getWallpaperStatus().toString()); assertEquals(recovery, control.previewRecovery().toString());
        control = new FocusControl(context, store, clock, wallpapers); clock.time += 60000; control.reconcile(); control.restAction("exit");
        try { control.startFocus(fixtureSession("conflicting", "stopwatch", clock)); fail("Old duty must block conflicting wallpaper"); } catch (IllegalStateException expected) { }
        try { control.replaceData(control.loadData()); fail("Old duty must block backup replacement"); } catch (IllegalStateException expected) { }
        wallpapers.failRestore = false; preview = control.previewRecovery(); control.confirmRecovery(preview.getString("revision"));
        assertFalse(control.getWallpaperStatus().getBoolean("recoveryPending"));
        assertTrue(control.loadData().getJSONObject("preferences").getJSONObject("protection").getBoolean("strict"));

        // A write that changed Home before failing cannot be reinterpreted as an unrelated later selection.
        fixturePreferences(true, false); suppliedOriginal(); control.startFocus(fixtureSession("partial", "stopwatch", clock));
        wallpapers.component = wallpapers.ownComponent(); wallpapers.home = 15; control.wallpaperPickerReturned(wallpapers.pickerToken);
        wallpapers.partialFailureAfterHome = true; clock.time += 1000; control.focusAction("finish");
        assertTrue(control.getWallpaperStatus().getBoolean("manualConfirmationRequired"));
        assertTrue(control.getWallpaperStatus().getBoolean("recoveryPending"));
        control = new FocusControl(context, store, clock, wallpapers); wallpapers.partialFailureAfterHome = false; control.reconcile();
        assertTrue(control.getWallpaperStatus().getBoolean("recoveryPending"));
        try { control.confirmWallpaperManualRecovery(false); fail("Manual recovery requires explicit acknowledgement"); } catch (IllegalStateException expected) { }
        control.confirmWallpaperManualRecovery(true); assertFalse(control.getWallpaperStatus().getBoolean("recoveryPending")); control.restAction("exit");

        // Reboot settles one existing round as interrupted and restores its supplied original.
        suppliedOriginal(); control.startFocus(fixtureSession("reboot", "stopwatch", clock));
        wallpapers.component = wallpapers.ownComponent(); wallpapers.home = 16; control.wallpaperPickerReturned(wallpapers.pickerToken);
        clock.time += 5000; control.focusAction("read"); clock.boot++; clock.time = 20;
        control = new FocusControl(context, store, clock, wallpapers); control.wallpaperEngineCreated(false);
        assertTrue(control.observeControl().isNull("owner")); assertFalse(control.getWallpaperStatus().getBoolean("selected"));
        assertFalse(control.getWallpaperStatus().getBoolean("recoveryPending"));
        assertEquals("interrupted", record("reboot").getString("status")); assertEquals(5000, record("reboot").getLong("durationMs"));
    }
}
