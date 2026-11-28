package com.xiaomao.focus;

import com.xiaomao.focus.AntiCloseWindow.Node;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class AntiCloseWindowOemTest {
    @Test
    public void recognizesOemAppInfoUninstallAndAdminWithExactIdentity() {
        assertTrue(AntiCloseWindow.candidateClass("com.miui.appstore.InstalledAppDetailsActivity"));
        assertTrue(AntiCloseWindow.candidateClass("com.oplus.appmanager.ApplicationsDetailsActivity"));
        assertTrue(AntiCloseWindow.candidateClass("com.android.settings.DeviceAdminAdd"));

        Node colorOsAppInfo = new Node(
            "com.android.settings", "", "",
            new Node("com.android.settings", "com.android.settings:id/toolbar_title", "小猫专注"),
            new Node("com.android.settings", "com.android.settings:id/force_stop_button", "结束运行"),
            new Node("com.android.settings", "com.android.settings:id/uninstall_button", "卸载")
        );
        assertEquals(
            "own-app-info",
            AntiCloseWindow.target(
                "com.android.settings",
                "com.oplus.appmanager.ApplicationsDetailsActivity",
                colorOsAppInfo,
                "com.xiaomao.focus",
                "小猫专注"
            )
        );

        Node deviceAdminScreen = new Node(
            "com.android.settings", "", "",
            new Node("com.android.settings", "com.android.settings:id/admin_name", "小猫专注"),
            new Node("com.android.settings", "", "取消激活")
        );
        assertEquals(
            "own-admin",
            AntiCloseWindow.target(
                "com.android.settings",
                "com.android.settings.DeviceAdminAdd",
                deviceAdminScreen,
                "com.xiaomao.focus",
                "小猫专注"
            )
        );
    }

    @Test
    public void strictGuardBlocksPermissionDirectoriesWithoutBlockingWifiOrBluetooth() {
        assertFalse(AntiCloseWindow.candidateClass("com.android.settings.wifi.WifiSettings"));
        assertEquals("", AntiCloseWindow.strictGuardTarget("com.android.settings", "com.android.settings.wifi.WifiSettings", null));
        assertEquals("", AntiCloseWindow.strictGuardTarget("com.android.settings", "com.android.settings.bluetooth.BluetoothSettings", null));
        assertEquals("", AntiCloseWindow.strictGuardTarget("com.android.settings", "com.android.settings.DisplaySettings", null));

        assertEquals(
            "strict-settings-directory",
            AntiCloseWindow.strictGuardTarget("com.android.settings", "com.android.settings.accessibility.AccessibilitySettings", null)
        );
        assertEquals(
            "strict-settings-directory",
            AntiCloseWindow.strictGuardTarget("com.android.settings", "com.android.settings.applications.UsageAccessDetails", null)
        );

        Node headingTree = new Node(
            "com.android.settings", "", "",
            new Node("com.android.settings", "com.android.settings:id/action_bar_title", "设备管理器", "android.widget.TextView")
        );
        assertEquals(
            "strict-settings-directory",
            AntiCloseWindow.strictGuardTarget("com.android.settings", "com.android.settings.SubSettings", headingTree)
        );
    }

    @Test
    public void expiresAndInvalidatesAppLabelCacheCorrectly() {
        assertTrue(AndroidAntiCloseSystem.isAppLabelCacheFresh(
            "com.xiaomao.focus", "小猫专注",
            "com.xiaomao.focus", "小猫专注",
            10_000L, 39_999L, 30_000L
        ));
        assertFalse(AndroidAntiCloseSystem.isAppLabelCacheFresh(
            "com.xiaomao.focus", "小猫专注",
            "com.xiaomao.focus", "小猫专注",
            10_000L, 40_000L, 30_000L
        ));
        assertFalse(AndroidAntiCloseSystem.isAppLabelCacheFresh(
            "com.xiaomao.focus", "小猫专注",
            "com.xiaomao.focus", "小猫专注",
            -1L, 1_000L, 30_000L
        ));
        assertFalse(AndroidAntiCloseSystem.isAppLabelCacheFresh(
            "com.xiaomao.focus", "小猫专注",
            "com.xiaomao.focus", "小猫专注",
            10_000L, 9_999L, 30_000L
        ));
        assertFalse(AndroidAntiCloseSystem.isAppLabelCacheFresh(
            "com.xiaomao.focus.qa", "小猫专注 QA",
            "com.xiaomao.focus", "小猫专注",
            10_000L, 12_000L, 30_000L
        ));
        assertFalse(AndroidAntiCloseSystem.isAppLabelCacheFresh(
            "com.xiaomao.focus", "小猫专注 QA",
            "com.xiaomao.focus", "小猫专注",
            10_000L, 12_000L, 30_000L
        ));
    }
}
