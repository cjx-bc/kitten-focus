package com.xiaomao.focus;

import android.content.Context;
import android.app.NotificationManager;
import android.app.AutomaticZenRule;
import android.os.ParcelFileDescriptor;
import android.service.notification.ZenPolicy;
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
    private long now = 1000000L;
    private int bootId = 1;
    private final SessionClock clock = new SessionClock() {
        public long epoch() { return 1794729600000L; }
        public long mono() { return now; }
        public int boot() { return bootId; }
    };

    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        QaBusinessBaseline.assertIdle(context);
        assertTrue("Use the isolated QA application", context.getPackageName().endsWith(".qa"));
        database = "focus-dnd-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database);
        control = new FocusControl(context, store, clock, system);
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"deletedRecordIds\":[],\"preferences\":{\"sound\":false,\"vibration\":false,\"protection\":{\"dnd\":true}}}"));
    }

    @After public void cleanup() {
        if (store == null) return;
        Reminders.cancelFocus(context);
        Reminders.cancelRest(context);
        store.close();
        context.deleteDatabase(database);
        android.content.SharedPreferences journal = context.getSharedPreferences("catfocus-dnd-" + database, Context.MODE_PRIVATE);
        try {
            if (!new JSONObject(journal.getString("journal", "{}")).has("condition")) journal.edit().clear().commit();
        } catch (Exception error) { throw new AssertionError("Keep unreadable recovery responsibility for inspection", error); }
    }

    private JSONObject session() throws Exception {
        return new JSONObject().put("id", "sound-focus").put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL).put("title", "声音辅助验证").put("themeName", "自由专注")
            .put("color", "#222222").put("mode", "countdown").put("targetMs", 60000)
            .put("startedAt", clock.epoch()).put("timeZone", "UTC").put("state", "running")
            .put("elapsedMs", 0).put("pausedMs", 0).put("segments", new JSONArray());
    }

    private FocusControl lockControl() {
        return new FocusControl(context, store, clock, new FocusRecovery(context, store), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; }
            public boolean connected() { return true; }
        }, system);
    }
    @Test public void ordinaryAndStrictLocksFreezeSoundChoiceReleaseRulesAndRejectConflictingDuty() throws Exception {
        for (boolean strict : new boolean[]{false, true}) {
            JSONObject data = control.loadData();
            data.getJSONObject("preferences").getJSONObject("protection")
                .put("study", false).put("strict", true).put("interceptNotifications", false).put("dnd", true);
            data.put("lockConfigurations", new JSONArray().put(new JSONObject().put("id", "sound-lock")
                .put("name", "锁机声音保护").put("minutes", 1).put("strict", strict)
                .put("whitelist", new JSONObject().put("source", "global"))));
            store.saveData(data, false); control = lockControl();
            control.startLock("sound-lock", strict);
            assertEquals("Shared sound protection applies at ordinary and strict lock start", "active", control.getDndStatus().getString("phase"));
            assertTrue(control.getDndStatus().getBoolean("requested"));
            assertEquals(1, system.rules.size());
            data.getJSONObject("preferences").getJSONObject("protection").put("dnd", false);
            store.saveData(data, false); control = lockControl(); control.lockAction("read", false);
            assertTrue("Preference edits affect the next round", control.getDndStatus().getBoolean("requested"));
            assertEquals("active", control.getDndStatus().getString("phase"));
            if (strict) {
                try { control.lockAction("finish", true); fail("Strict timing remains independent of sound"); }
                catch (IllegalStateException expected) { }
                now += 60000; control.reconcile();
            } else control.lockAction("finish", true);
            assertTrue(system.rules.isEmpty());
            assertTrue(control.observeControl().isNull("owner"));
            assertEquals(0, control.loadData().getJSONArray("records").length());
            assertTrue(control.observeControl().getJSONObject("rest").isNull("session"));
        }
        JSONObject data = control.loadData();
        data.getJSONObject("preferences").getJSONObject("protection").put("strict", false).put("dnd", true);
        store.saveData(data, false); control = lockControl(); control.startFocus(session());
        system.permission = false; control.focusAction("finish");
        assertTrue(control.getDndStatus().getBoolean("recoveryPending"));
        try { control.startLock("sound-lock", true); fail("Old sound duty must block ownership of a conflicting requested lock"); }
        catch (IllegalStateException expected) { }
        assertTrue(control.observeControl().isNull("owner"));
        assertEquals("sound-focus", control.getDndStatus().getString("sessionId"));
        data = control.loadData(); data.getJSONObject("preferences").getJSONObject("protection").put("dnd", false);
        store.saveData(data, false); control.startLock("sound-lock", true);
        assertFalse("A lock without sound remains available", control.getDndStatus().getBoolean("requested"));
        assertTrue(control.getDndStatus().getBoolean("recoveryPending"));
        system.permission = true; control.restoreDnd();
        now += 60000; control.reconcile();
        assertTrue(system.rules.isEmpty());
        assertFalse(control.getDndStatus().getBoolean("recoveryPending"));
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

    @Test public void unavailableSelectedSoundRejectsFocusAndBothLocksBeforeOwnership() throws Exception {
        for (String unavailable : new String[]{"unsupported", "permission"}) {
            for (String kind : new String[]{"focus", "lock", "strictLock"}) {
                system.supported = !unavailable.equals("unsupported"); system.permission = !unavailable.equals("permission");
                JSONObject data = control.loadData();
                data.put("lockConfigurations", new JSONArray().put(new JSONObject().put("id", "readiness-lock")
                    .put("name", "Readiness").put("minutes", 1).put("strict", kind.equals("strictLock"))));
                store.saveData(data, false); control = lockControl();
                try {
                    if (kind.equals("focus")) control.startFocus(session()); else control.startLock("readiness-lock", kind.equals("strictLock"));
                    fail("Selected unavailable sound must reject " + kind + ": " + unavailable);
                } catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("声音")); }
                assertTrue(control.observeControl().isNull("owner"));
                assertTrue(control.loadData().getJSONObject("preferences").getJSONObject("protection").getBoolean("dnd"));
                assertTrue(system.rules.isEmpty()); assertFalse(control.getDndStatus().getBoolean("recoveryPending"));
            }
        }
        JSONObject data = control.loadData(); data.getJSONObject("preferences").getJSONObject("protection").put("dnd", false);
        store.saveData(data, false); control.startFocus(session());
        assertEquals("focus", control.observeControl().getString("owner")); control.focusAction("finish");
    }

    @Test public void permissionLostAfterStartAndReadOnlyReconstructionKeepTimingAvailable() throws Exception {
        control.startFocus(session());
        system.permission = false;
        control.reconcile();
        assertEquals("permission_required", control.getDndStatus().getString("phase"));
        assertTrue(system.rules.isEmpty());
        FocusControl rebuilt = new FocusControl(context, store, clock, system);
        system.permission = true;
        rebuilt.observeControl();
        rebuilt.getDndStatus();
        assertTrue("Observation must not apply protection", system.rules.isEmpty());
        rebuilt.reconcile();
        assertEquals("active", rebuilt.getDndStatus().getString("phase"));
        assertNotNull(rebuilt.observeControl().getJSONObject("focus").optJSONObject("session"));
        rebuilt.focusAction("finish");
        assertTrue(system.rules.isEmpty());
    }

    @Test public void explicitWithdrawalSurvivesReconstructionAndDoesNotChangePreference() throws Exception {
        control.startFocus(session());
        assertEquals("withdrawn", control.restoreDnd().getString("phase"));
        FocusControl rebuilt = new FocusControl(context, store, clock, system);
        rebuilt.reconcile();
        assertEquals("withdrawn", rebuilt.getDndStatus().getString("phase"));
        assertTrue(system.rules.isEmpty());
        assertTrue(rebuilt.loadData().getJSONObject("preferences").getJSONObject("protection").getBoolean("dnd"));
        rebuilt.focusAction("finish");
    }

    @Test public void editedOrDisabledRulesArePreservedAndRecoveryCanBeRetried() throws Exception {
        control.startFocus(session());
        DndSystem.Rule own = system.rules.values().iterator().next();
        system.rules.put(own.id, new DndSystem.Rule(own.id, own.condition, "user-edit", false, false, false));
        assertEquals("user_disabled", control.getDndStatus().getString("phase"));
        new FocusControl(context, store, clock, system).reconcile();
        assertFalse(system.rules.get(own.id).enabled);
        control.focusAction("finish");
        assertTrue(system.rules.containsKey(own.id));
        assertTrue(control.getDndStatus().getBoolean("recoveryPending"));
        assertEquals("restoration_failed", control.getDndStatus().getString("phase"));
        system.rules.remove(own.id); // The user removes their edited system rule.
        assertFalse(control.restoreDnd().getBoolean("recoveryPending"));
    }

    @Test public void expiryReleasesSoundBeforeTheExistingRestAndBootDoesNotReapply() throws Exception {
        control.startFocus(session());
        now += 60000;
        JSONObject ended = control.reconcile();
        assertEquals("rest", ended.getString("owner"));
        assertEquals("restored", ended.getJSONObject("dnd").getString("phase"));
        assertTrue(system.rules.isEmpty());
        control.restAction("exit");
        control.startFocus(session().put("id", "another-round"));
        bootId++;
        JSONObject interrupted = new FocusControl(context, store, clock, system).reconcile();
        assertTrue(interrupted.getJSONObject("focus").isNull("session"));
        assertTrue(system.rules.isEmpty());
    }

    @Test public void androidRuleKeepsCallsAlarmsAndMediaAndIsRemovedWithoutChangingOtherRules() throws Exception {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        boolean granted = manager.isNotificationPolicyAccessGranted();
        if (!granted) shell("cmd notification allow_dnd " + context.getPackageName());
        // Optional cleanup for an exact rule left by an interrupted earlier QA run.
        String cleanupId = InstrumentationRegistry.getArguments().getString("cleanupDndFixtureRule", "");
        if (!cleanupId.isEmpty()) {
            AutomaticZenRule fixture = manager.getAutomaticZenRule(cleanupId);
            assertNotNull(fixture);
            assertEquals(InstrumentationRegistry.getArguments().getString("cleanupDndFixtureCondition"), fixture.getConditionId().toString());
            assertTrue(fixture.getConditionId().toString().startsWith("condition://" + context.getPackageName() + "/focus-sound/"));
            assertTrue(manager.removeAutomaticZenRule(cleanupId));
        }
        FocusControl real = new FocusControl(context, store, clock);
        Map<String, AutomaticZenRule> baseline = manager.getAutomaticZenRules();
        String createdId = null;
        try {
            real.startFocus(session());
            for (String id : manager.getAutomaticZenRules().keySet()) if (!baseline.containsKey(id)) createdId = id;
            JSONObject status = real.getDndStatus();
            for (int i = 0; i < 20 && status.getString("phase").equals("inactive"); i++) {
                android.os.SystemClock.sleep(100);
                status = real.getDndStatus();
            }
            android.util.Log.i("FocusDndTest", "API36 started " + status);
            assertTrue(status.toString(), status.getString("phase").equals("active") || status.getString("phase").equals("requested"));
            assertTrue(status.getBoolean("ruleEnabled"));
            Map<String, AutomaticZenRule> running = manager.getAutomaticZenRules();
            assertEquals(baseline.size() + 1, running.size());
            for (Map.Entry<String, AutomaticZenRule> entry : running.entrySet()) {
                if (baseline.containsKey(entry.getKey())) continue;
                ZenPolicy policy = entry.getValue().getZenPolicy();
                assertEquals(ZenPolicy.STATE_ALLOW, policy.getPriorityCategoryCalls());
                assertEquals(ZenPolicy.PEOPLE_TYPE_ANYONE, policy.getPriorityCallSenders());
                assertEquals(ZenPolicy.STATE_ALLOW, policy.getPriorityCategoryAlarms());
                assertEquals(ZenPolicy.STATE_ALLOW, policy.getPriorityCategoryMedia());
                assertEquals(ZenPolicy.STATE_DISALLOW, policy.getPriorityCategoryMessages());
            }
            real.focusAction("pause");
            assertEquals(running.keySet(), manager.getAutomaticZenRules().keySet());
            JSONObject restored = real.restoreDnd();
            android.util.Log.i("FocusDndTest", "API36 restored " + restored);
            assertFalse(restored.toString(), restored.getBoolean("recoveryPending"));
            assertEquals("withdrawn", restored.getString("phase"));
            real.focusAction("resume");
            assertEquals("withdrawn", real.getDndStatus().getString("phase"));
            assertEquals(baseline.keySet(), manager.getAutomaticZenRules().keySet());
            for (String id : baseline.keySet()) assertEquals(baseline.get(id), manager.getAutomaticZenRule(id));
        } finally {
            real.restoreDnd();
            real.focusAction("finish");
            // Fixture cleanup must remain possible even when the restoration assertion fails.
            if (createdId != null && manager.getAutomaticZenRule(createdId) != null) manager.removeAutomaticZenRule(createdId);
            if (!granted) shell("cmd notification disallow_dnd " + context.getPackageName());
        }
    }

    private void shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommand(command);
             java.io.InputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
            byte[] bytes = new byte[1024];
            while (stream.read(bytes) != -1) { }
        }
    }

    static final class FakeDndSystem implements DndSystem {
        boolean permission = true, supported = true;
        final Map<String, Rule> rules = new LinkedHashMap<>();
        public boolean supported() { return supported; }
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
