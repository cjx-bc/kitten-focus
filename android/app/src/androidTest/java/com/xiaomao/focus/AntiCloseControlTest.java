package com.xiaomao.focus;

import android.content.Context;
import android.util.Xml;
import org.xmlpull.v1.XmlPullParser;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Tests the shared native command/observation seam, replacing only OS identity/windows. */
@RunWith(AndroidJUnit4.class)
public class AntiCloseControlTest {
    Context context; LocalStore store; FocusControl control; TestClock clock; Device device;
    static class TestClock implements SessionClock {
        long mono = 100000; int boot = 1;
        public long mono() { return mono; }
        public long epoch() { return 1794729600000L + mono; }
        public int boot() { return boot; }
    }
    class Device implements AntiCloseSystem {
        boolean connected = true, authorized = true, fail, ambiguousLabel; int returns, scans;
        String label = "小猫专注";
        AntiCloseWindow.Node root;
        public boolean authorized() { return authorized; }
        public boolean connected() { return connected; }
        public boolean systemSurface(String pkg) { return "com.android.settings".equals(pkg) || "com.android.packageinstaller".equals(pkg) || "com.google.android.packageinstaller".equals(pkg); }
        public String appLabel() { return ambiguousLabel ? "" : label; }
        public AntiCloseWindow.Node root(String pkg) { scans++; return root; }
        public void returnToFocus() { if (fail) throw new IllegalStateException("OS failure"); returns++; }
        public JSONObject identity() throws Exception { return new JSONObject().put("ordinaryAdmin", false).put("deviceOwner", false).put("profileOwner", false); }
    }
    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getPackageName().endsWith(".qa"));
        store = new LocalStore(context, "anti-close-" + System.nanoTime() + ".db");
        clock = new TestClock(); device = new Device(); rebuild();
        control.replaceData(new JSONObject("{\"schemaVersion\":1,\"records\":[],\"preferences\":{\"protection\":{\"enhancements\":[\"preciseAntiClose\"]}}}"));
    }
    void rebuild() { control = new FocusControl(context, store, clock, new FocusRecovery(context, store), null,
        new AndroidDndSystem(context), new AndroidNotificationSystem(context), pkg -> () -> {},
        FocusNavigation.android(context, null), device); }
    void start() throws Exception {
        control.startFocus(new JSONObject().put("id", "anti-one").put("title", "防关闭验证").put("themeName", "自由专注")
            .put("itemId", JSONObject.NULL).put("themeId", JSONObject.NULL).put("color", "#222222")
            .put("mode", "countdown").put("targetMs", 60000).put("startedAt", clock.epoch()).put("timeZone", "UTC"));
    }
    AntiCloseWindow.Node page(String identity, String action) {
        return new AntiCloseWindow.Node("com.android.settings", "", "", new AntiCloseWindow.Node("com.android.settings", "entity_header_title", identity),
            new AntiCloseWindow.Node("com.android.settings", "", action));
    }
    // Captured from the real inactive API36 Settings UI. This replaces only the OS metadata adapter.
    AntiCloseWindow.Node captured(String name) throws Exception {
        try (InputStream source = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("anti-close-api36/" + name + ".xml")) {
            XmlPullParser xml = Xml.newPullParser(); xml.setInput(source, "UTF-8");
            while (xml.next() != XmlPullParser.END_DOCUMENT) if (xml.getEventType() == XmlPullParser.START_TAG && "node".equals(xml.getName())) return readNode(xml);
        }
        throw new IllegalStateException("Missing system root");
    }
    AntiCloseWindow.Node readNode(XmlPullParser xml) throws Exception {
        String pkg = xml.getAttributeValue(null, "package"), id = xml.getAttributeValue(null, "resource-id"), text = xml.getAttributeValue(null, "text"), role = xml.getAttributeValue(null, "class");
        if ("com.android.settings:id/collapsing_toolbar".equals(id) && (text == null || text.isEmpty()))
            text = xml.getAttributeValue(null, "content-desc"); // Known system toolbar title metadata only.
        List<AntiCloseWindow.Node> children = new ArrayList<>(); int depth = xml.getDepth();
        while (xml.next() != XmlPullParser.END_DOCUMENT) {
            if (xml.getEventType() == XmlPullParser.END_TAG && xml.getDepth() == depth) break;
            if (xml.getEventType() == XmlPullParser.START_TAG && "node".equals(xml.getName())) children.add(readNode(xml));
        }
        return new AntiCloseWindow.Node(pkg, id, text, role, children.toArray(new AntiCloseWindow.Node[0]));
    }
    @Test public void api36OwnComposeAppInfoReturnsButOtherAppAndLabelCollisionStayAllowed() throws Exception {
        start(); device.label = "Another app"; device.root = captured("own-app-info");
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.spa.SpaActivity"));
        device.label = "小猫专注 QA"; device.ambiguousLabel = true;
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.spa.SpaActivity"));
        device.ambiguousLabel = false;
        assertTrue(control.antiCloseWindow("com.android.settings", "com.android.settings.spa.SpaActivity"));
        assertEquals("own-app-info", control.observeControl().getJSONObject("antiClose").getString("lastTarget"));
        assertFalse(control.observeControl().getJSONObject("antiClose").getBoolean("active"));
        control.antiCloseWindow(context.getPackageName(), "com.xiaomao.focus.MainActivity");
        assertTrue(control.observeControl().getJSONObject("antiClose").getBoolean("active"));
    }
    @Test public void api36OwnUninstallQuestionReturnsButOtherInstallerTargetStaysAllowed() throws Exception {
        start(); device.label = "Another app"; device.root = captured("own-uninstall");
        assertFalse(control.antiCloseWindow("com.google.android.packageinstaller", "com.android.packageinstaller.UninstallerActivity"));
        device.label = "小猫专注 QA"; device.ambiguousLabel = true;
        assertFalse(control.antiCloseWindow("com.google.android.packageinstaller", "com.android.packageinstaller.UninstallerActivity"));
        device.ambiguousLabel = false;
        assertTrue(control.antiCloseWindow("com.google.android.packageinstaller", "com.android.packageinstaller.UninstallerActivity"));
        assertEquals("own-uninstall", control.observeControl().getJSONObject("antiClose").getString("lastTarget"));
        assertFalse(control.observeControl().getJSONObject("antiClose").getBoolean("active"));
        control.antiCloseWindow(context.getPackageName(), "com.xiaomao.focus.MainActivity");
        assertTrue(control.observeControl().getJSONObject("antiClose").getBoolean("active"));
    }
    @Test public void api36OwnAccessibilityToolbarAndMainSwitchReturnWithinBoundedScan() throws Exception {
        start(); device.root = captured("own-accessibility"); device.label = "Another service";
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.SubSettings"));
        device.label = "小猫专注 QA"; device.ambiguousLabel = true;
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.SubSettings"));
        device.ambiguousLabel = false;
        assertTrue(control.antiCloseWindow("com.android.settings", "com.android.settings.SubSettings"));
        assertEquals("own-accessibility", control.observeControl().getJSONObject("antiClose").getString("lastTarget"));
        assertFalse(control.observeControl().getJSONObject("antiClose").getBoolean("active"));
        control.antiCloseWindow(context.getPackageName(), "com.xiaomao.focus.MainActivity");
        assertTrue(control.observeControl().getJSONObject("antiClose").getBoolean("active"));
    }
    @After public void cleanup() { if (store != null) { String name = store.getDatabaseName(); store.close(); context.deleteDatabase(name); } }
    @Test public void blocksOnlyOwnAppActionsAndDeduplicatesRealReturnEvidence() throws Exception {
        start();
        device.root = page("Other app", "Force stop");
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        device.root = page("小猫专注", "Force stop");
        assertTrue(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        assertTrue(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        assertEquals(1, device.returns);
        assertEquals("armed", control.observeControl().getJSONObject("antiClose").getString("state"));
        control.antiCloseWindow(context.getPackageName(), "com.xiaomao.focus.MainActivity");
        assertEquals("protecting", control.observeControl().getJSONObject("antiClose").getString("state"));
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$WifiSettingsActivity"));
        assertFalse(control.antiCloseWindow("com.android.dialer", "DialtactsActivity"));
        JSONObject identity = control.observeControl().getJSONObject("antiClose").getJSONObject("identity");
        assertFalse(identity.getBoolean("ordinaryAdmin")); assertFalse(identity.getBoolean("deviceOwner"));
        assertFalse(control.observeControl().getJSONObject("antiClose").getBoolean("systemUninstallBlocked"));
    }
    @Test public void recoveryWithdrawsThisRoundEvenAfterReconstructionAndServiceReconnect() throws Exception {
        start(); device.root = page("小猫专注", "强行停止");
        control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity");
        JSONObject preview = control.previewRecovery();
        assertEquals("preciseAntiClose", preview.getJSONArray("steps").getJSONObject(0).getString("capability"));
        control.confirmRecovery(preview.getString("revision"));
        rebuild(); device.connected = false; device.connected = true;
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        assertEquals("recovered", control.observeControl().getJSONObject("antiClose").getString("state"));
        assertEquals("focus", control.observeControl().getString("owner"));
        assertEquals(0, control.loadData().getJSONArray("records").length());
    }
    @Test public void failRetryAndExpiryNeverClaimAnUnobservedReturn() throws Exception {
        start(); device.root = page(context.getPackageName(), "Uninstall"); device.fail = true;
        control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity");
        assertEquals("failed", control.observeControl().getJSONObject("antiClose").getString("state"));
        clock.mono += 1600; device.fail = false;
        control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity");
        control.antiCloseWindow(context.getPackageName(), "com.xiaomao.focus.MainActivity");
        assertTrue(control.observeControl().getJSONObject("antiClose").getBoolean("active"));
        clock.mono += 60000;
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        assertFalse(control.observeControl().getJSONObject("antiClose").getBoolean("active"));
        control.reconcile(); assertFalse(control.previewRecovery().getBoolean("pending"));
    }
    @Test public void authorizationAndUnrelatedWindowsNeverReadArbitraryBodies() throws Exception {
        start(); device.root = page("小猫专注", "Uninstall");
        assertFalse(control.antiCloseWindow("chat.app", "Conversation"));
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$WifiSettingsActivity"));
        assertEquals(0, device.scans);
        FocusProtection.allowSettingsForAuthorization(context, "com.android.settings");
        try { assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity")); assertEquals(0, device.scans); }
        finally { FocusProtection.clearSettingsAuthorization(); }
    }
    @Test public void duplicateInstalledLabelsAndGenericSettingsSwitchesDoNotIdentifyOurApp() throws Exception {
        start(); device.ambiguousLabel = true; device.root = page("小猫专注", "Force stop");
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        assertEquals(0, device.returns);
        assertEquals("unsupported", control.observeControl().getJSONObject("antiClose").getString("state"));
        device.ambiguousLabel = false;
        device.root = new AntiCloseWindow.Node("com.android.settings", "", "",
            new AntiCloseWindow.Node("com.android.settings", "entity_header_title", "小猫专注"),
            new AntiCloseWindow.Node("com.android.settings", "com.android.settings:id/switch_widget", ""));
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.SubSettings"));
        assertEquals(0, device.returns);
        // Exact own package still identifies the correct target even with a label collision.
        device.ambiguousLabel = true; device.root = page(context.getPackageName(), "卸载");
        assertTrue(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        assertEquals(1, device.returns);
    }
    @Test public void ownAccessibilityAndUninstallAreRecognizedButAnotherPackageInstallerIsAllowed() throws Exception {
        start(); device.root = page("小猫专注", "使用 小猫专注");
        assertTrue(control.antiCloseWindow("com.android.settings", "com.android.settings.SubSettings"));
        clock.mono += 1600;
        device.root = new AntiCloseWindow.Node("com.android.packageinstaller", "android:id/alertTitle", "Another app",
            new AntiCloseWindow.Node("com.android.packageinstaller", "", "Uninstall"));
        assertFalse(control.antiCloseWindow("com.android.packageinstaller", "com.android.packageinstaller.UninstallerActivity"));
        device.root = new AntiCloseWindow.Node("com.android.packageinstaller", "android:id/alertTitle", "小猫专注",
            new AntiCloseWindow.Node("com.android.packageinstaller", "", "Uninstall"));
        assertTrue(control.antiCloseWindow("com.android.packageinstaller", "com.android.packageinstaller.UninstallerActivity"));
        assertEquals(2, device.returns);
    }
    @Test public void traversalBudgetNeverScansAnUnboundedTreeForAMatch() throws Exception {
        start();
        AntiCloseWindow.Node[] wide = new AntiCloseWindow.Node[300];
        for (int i = 0; i < wide.length; i++) wide[i] = new AntiCloseWindow.Node("com.android.settings", "", "normal setting");
        wide[299] = page(context.getPackageName(), "Force stop");
        device.root = new AntiCloseWindow.Node("com.android.settings", "", "", wide);
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        AntiCloseWindow.Node deep = page(context.getPackageName(), "Force stop");
        for (int i = 0; i < 20; i++) deep = new AntiCloseWindow.Node("com.android.settings", "", "", deep);
        device.root = deep;
        assertFalse(control.antiCloseWindow("com.android.settings", "com.android.settings.Settings$AppInfoDashboardActivity"));
        assertEquals(0, device.returns);
    }
}
