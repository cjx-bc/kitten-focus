package com.xiaomao.focus;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import android.os.ParcelFileDescriptor;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** The actual plugin intent crosses a recording OS launch boundary. */
@RunWith(AndroidJUnit4.class)
public class AuthorizationSettingsTest {
    private Context context;
    private LocalStore store;
    private FocusControl control;
    private String database;
    private Intent launched;
    private CatFocusPlugin plugin;
    private static final class Call extends PluginCall {
        Call() { super(null, "CatFocus", "authorization", "test", new JSObject()); }
        @Override public void resolve() { }
        @Override public void resolve(JSObject value) { }
        @Override public void reject(String message, Exception error) { throw new AssertionError(message, error); }
    }
    @Before public void setup() throws Exception {
        InstrumentationRegistry.getInstrumentation().getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
        Context real = InstrumentationRegistry.getInstrumentation().getTargetContext();
        QaBusinessBaseline.assertIdle(real);
        context = new ContextWrapper(real) {
            @Override public void startActivity(Intent intent) { launched = new Intent(intent); }
        };
        database = "authorization-settings-" + System.nanoTime() + ".db";
        store = new LocalStore(context, database);
        control = new FocusControl(context, store, new SessionClock() {
            public long epoch() { return 1794729600000L; }
            public long mono() { return 1000000L; }
            public int boot() { return 1; }
        }, new FocusRecovery(context, store), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; }
            public boolean connected() { return true; }
        });
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"preferences\":{\"sound\":false,\"vibration\":false,\"protection\":{\"study\":true,\"enhancements\":[]}},\"lockConfigurations\":[{\"id\":\"repair\",\"name\":\"Repair\",\"minutes\":1,\"whitelist\":{\"source\":\"global\"}}]}"));
        plugin = new CatFocusPlugin() { @Override public Context getContext() { return context; } };
    }
    @After public void cleanup() {
        FocusProtection.clearSettingsAuthorization();
        if (store != null) { Reminders.cancelFocus(context); store.close(); context.deleteDatabase(database); }
    }
    private JSONObject focus(String id) throws Exception {
        return new JSONObject().put("id", id).put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL)
            .put("title", "Authorization repair").put("themeName", "Free focus").put("color", "#222222")
            .put("mode", "countdown").put("targetMs", 60000).put("startedAt", 1794729600000L)
            .put("timeZone", "UTC").put("segments", new JSONArray());
    }
    @Test public void notificationDndAndExactAlarmPluginRoutesAllowOnlyTheResolvedTargetDuringStudyAndLock() throws Exception {
        for (boolean lock : new boolean[]{false, true}) {
            if (lock) control.startLock("repair");
            else control.startFocus(focus("repair-focus"));
            for (String action : new String[]{Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS,
                    Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS, Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM}) {
                FocusProtection.clearSettingsAuthorization(); launched = null;
                Intent expected = new Intent(action);
                if (action.equals(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)) expected.setData(android.net.Uri.parse("package:" + context.getPackageName()));
                ResolveInfo target = context.getPackageManager().resolveActivity(expected, 0);
                assertNotNull("The QA OS exposes this authorization route", target);
                String pkg = target.activityInfo.packageName;
                assertTrue("Settings is outside this round's whitelist", FocusProtection.shouldBlock(context, control.observeControl(), pkg, target.activityInfo.name));
                if (action.equals(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) plugin.openNotificationAccessSettings(new Call());
                else if (action.equals(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)) plugin.openDndSettings(new Call());
                else plugin.openAlarmSettings(new Call());
                assertNotNull(launched); assertEquals(action, launched.getAction());
                assertEquals(expected.getData(), launched.getData());
                assertEquals(pkg, context.getPackageManager().resolveActivity(launched, 0).activityInfo.packageName);
                assertFalse("The actual resolved authorization destination remains usable", FocusProtection.shouldBlock(context, control.observeControl(), pkg, target.activityInfo.name));
                assertTrue("Unrelated applications remain restricted", FocusProtection.shouldBlock(context, control.observeControl(), "blocked.other", "Other"));
                assertEquals(lock ? "lock" : "focus", control.observeControl().getString("owner"));
            }
            if (lock) control.lockAction("finish", true); else control.focusAction("finish");
        }
    }
    @Test public void unknownSourcesPluginRouteAllowsAuthorizationButInstallerStillRejectsActiveOwner() throws Exception {
        Context real = InstrumentationRegistry.getInstrumentation().getTargetContext();
        QaBusinessBaseline baseline = QaBusinessBaseline.captureIdle(real);
        String pkg = real.getPackageName();
        String original = shell("appops get " + pkg + " REQUEST_INSTALL_PACKAGES");
        java.util.regex.Matcher mode = java.util.regex.Pattern.compile("REQUEST_INSTALL_PACKAGES: (allow|deny|ignore|default)").matcher(original);
        String originalMode = mode.find() ? mode.group(1) : "default";
        LocalStore shared = LocalStore.get(real);
        FocusControl active = new FocusControl(real, shared, SessionClock.system(real), new FocusRecovery(real, shared), new FocusProtection.AccessibilityState() {
            public boolean authorized() { return true; } public boolean connected() { return true; }
        });
        try {
            shell("appops set " + pkg + " REQUEST_INSTALL_PACKAGES deny");
            active.replaceData(control.loadData());
            AppUpdatesPlugin updates = new AppUpdatesPlugin() { @Override public Context getContext() { return context; } };
            updates.load();
            for (boolean lock : new boolean[]{false, true}) {
                if (lock) active.startLock("repair");
                else active.startFocus(focus("install-focus"));
                FocusProtection.clearSettingsAuthorization(); launched = null;
                updates.installPermission(new Call());
                assertNotNull("Unknown-sources permission must actually launch", launched);
                assertEquals(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, launched.getAction());
                assertEquals("package:" + pkg, launched.getData().toString());
                ResolveInfo target = real.getPackageManager().resolveActivity(launched, 0);
                assertNotNull(target);
                assertFalse(FocusProtection.shouldBlock(real, active.observeControl(), target.activityInfo.packageName, target.activityInfo.name));
                try { new AppUpdateManager(real).installerIntent(); fail("Active ownership must still prohibit APK installation"); }
                catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("专注")); }
                if (lock) active.lockAction("finish", true); else active.focusAction("finish");
            }
        } finally {
            try {
                JSONObject owner = active.observeControl();
                if ("lock".equals(owner.optString("owner"))) active.lockAction("finish", true);
                else if ("focus".equals(owner.optString("owner"))) active.focusAction("finish");
                active.restAction("exit");
            } finally {
                try { shell("appops set " + pkg + " REQUEST_INSTALL_PACKAGES " + originalMode); }
                finally { baseline.restore(); }
            }
        }
    }
    private String shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation()
                .getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommand(command);
             java.io.FileInputStream stream = new java.io.FileInputStream(descriptor.getFileDescriptor())) {
            return new String(stream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }
}
