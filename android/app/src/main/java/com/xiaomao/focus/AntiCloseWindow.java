package com.xiaomao.focus;

import java.util.ArrayDeque;
import java.util.Locale;

/** Original conservative recognizer. Ephemeral system Settings metadata, never app bodies. */
final class AntiCloseWindow {
    static final int MAX_NODES = 160, MAX_DEPTH = 12;
    static final class Node {
        final String pkg, id, text, role;
        final Node[] children;
        Node(String pkg, String id, String text, Node... children) {
            this(pkg, id, text, "", children);
        }
        Node(String pkg, String id, String text, String role, Node... children) {
            this.pkg = pkg == null ? "" : pkg; this.id = id == null ? "" : id;
            this.text = text == null ? "" : text; this.role = role == null ? "" : role; this.children = children;
        }
    }
    static boolean candidateClass(String cls) {
        if (cls == null) return false;
        return cls.equals("com.android.settings.SubSettings")
            || cls.equals("com.android.settings.spa.SpaActivity")
            || cls.contains("AppInfoDashboard") || cls.contains("InstalledAppDetails")
            || cls.contains("AccessibilityDetails") || cls.contains("AccessibilityService")
            || cls.contains("ToggleAccessibilityService") || cls.contains("DeviceAdminAdd")
            || cls.contains("UninstallerActivity") || cls.contains("UninstallAppProgress")
            || cls.contains("UninstallAlertDialog");
    }
    private static boolean equalsAny(String text, String... choices) {
        for (String choice : choices) if (text.equalsIgnoreCase(choice)) return true;
        return false;
    }
    static String target(String pkg, String cls, Node root, String ownPackage, String ownLabel) {
        if (!candidateClass(cls) || root == null || !pkg.equals(root.pkg)) return "";
        boolean identity = false, forceStop = false, uninstall = false, accessibility = false, admin = false;
        boolean spa = "com.android.settings".equals(pkg) && "com.android.settings.spa.SpaActivity".equals(cls);
        boolean servicePage = "com.android.settings".equals(pkg) && (cls.contains("Accessibility") || cls.equals("com.android.settings.SubSettings"));
        boolean spaHeader = false, appInfoTitle = false;
        boolean uninstallQuestion = false, confirmUninstall = false;
        Node spaHeaderTitle = null;
        ArrayDeque<Node> queue = new ArrayDeque<>(); ArrayDeque<Integer> depths = new ArrayDeque<>();
        queue.add(root); depths.add(0); int visited = 0;
        while (!queue.isEmpty() && visited++ < MAX_NODES) {
            Node node = queue.remove(); int depth = depths.remove(); if (!pkg.equals(node.pkg)) continue;
            String text = node.text.trim(), id = node.id.toLowerCase(Locale.ROOT);
            // API36 Compose app-info has no header view IDs. Accept only the observed
            // first ScrollView content group (one installed-label TextView), together
            // with the page title and both app-management actions below. Names in
            // arbitrary list rows/body text cannot become an app header.
            if (spa && !ownLabel.isEmpty() && "android.widget.ScrollView".equals(node.role) && node.children.length >= 4) {
                Node header = node.children[0];
                if (header != null && pkg.equals(header.pkg) && "android.view.View".equals(header.role) && header.children.length == 1) {
                    spaHeaderTitle = header.children[0];
                }
            }
            // Match the header only when reached within the same traversal budget.
            spaHeader |= node == spaHeaderTitle && "android.widget.TextView".equals(node.role)
                && node.id.isEmpty() && ownLabel.equals(node.text);
            appInfoTitle |= spa && "android.widget.TextView".equals(node.role) && equalsAny(text, "App info", "应用信息");
            // Exact package/component evidence wins. AOSP app headers use the installed label.
            // Names in a list or arbitrary explanatory paragraphs never identify the target.
            identity |= text.equals(ownPackage) || text.equals(ownPackage + "/com.xiaomao.focus.FocusAccessibilityService")
                || (id.endsWith("/entity_header_title") || id.equals("entity_header_title")
                    || id.endsWith("/app_name") || cls.contains("DeviceAdminAdd") && id.endsWith("/admin_name")
                    || servicePage && id.equals("com.android.settings:id/collapsing_toolbar")
                    || cls.contains("Uninstall") && id.equals("android:id/alerttitle")) && !ownLabel.isEmpty() && text.equals(ownLabel);
            forceStop |= equalsAny(text, "Force stop", "强行停止", "强制停止", "强制结束") || id.endsWith("/force_stop_button");
            uninstall |= equalsAny(text, "Uninstall", "卸载") || id.endsWith("/uninstall_button");
            // API36's installer labels its destructive button "OK". The known
            // question ID/text and positive-action ID are both required; OK alone
            // (or a label mentioned in explanatory text) never identifies uninstall.
            uninstallQuestion |= cls.contains("Uninstall") && id.equals("android:id/message")
                && text.equals("Do you want to uninstall this app?");
            confirmUninstall |= cls.contains("Uninstall") && id.equals("android:id/button1") && text.equalsIgnoreCase("OK");
            accessibility |= equalsAny(text, "Use " + ownLabel, "使用" + ownLabel, "使用 " + ownLabel,
                "Stop", "停止", "关闭", "Use service", "使用服务")
                || servicePage && id.equals("com.android.settings:id/main_switch_bar");
            admin |= equalsAny(text, "Deactivate this device admin app", "Deactivate", "停用此设备管理应用", "停用", "取消激活");
            if (depth < MAX_DEPTH) for (int i = 0; i < node.children.length && i < MAX_NODES && queue.size() < MAX_NODES; i++)
                if (node.children[i] != null) { queue.add(node.children[i]); depths.add(depth + 1); }
        }
        if (spa) return spaHeader && appInfoTitle && forceStop && uninstall ? "own-app-info" : "";
        if (!identity) return "";
        if ((cls.contains("AppInfoDashboard") || cls.contains("InstalledAppDetails") || cls.equals("com.android.settings.SubSettings"))
            && (forceStop || uninstall)) return "own-app-info";
        if ((cls.contains("Accessibility") || cls.equals("com.android.settings.SubSettings")) && accessibility) return "own-accessibility";
        if (cls.contains("DeviceAdminAdd") && admin) return "own-admin";
        if (cls.contains("Uninstall") && (uninstall || uninstallQuestion && confirmUninstall)) return "own-uninstall";
        return "";
    }
}
