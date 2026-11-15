package com.xiaomao.focus;

import java.util.ArrayDeque;
import java.util.Locale;

/** Original conservative recognizer. Ephemeral system Settings metadata, never app bodies. */
final class AntiCloseWindow {
    static final int MAX_NODES = 160, MAX_DEPTH = 12;
    static final class Node {
        final String pkg, id, text;
        final Node[] children;
        Node(String pkg, String id, String text, Node... children) {
            this.pkg = pkg == null ? "" : pkg; this.id = id == null ? "" : id;
            this.text = text == null ? "" : text; this.children = children;
        }
    }
    static boolean candidateClass(String cls) {
        if (cls == null) return false;
        return cls.equals("com.android.settings.SubSettings")
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
        ArrayDeque<Node> queue = new ArrayDeque<>(); ArrayDeque<Integer> depths = new ArrayDeque<>();
        queue.add(root); depths.add(0); int visited = 0;
        while (!queue.isEmpty() && visited++ < MAX_NODES) {
            Node node = queue.remove(); int depth = depths.remove(); if (!pkg.equals(node.pkg)) continue;
            String text = node.text.trim(), id = node.id.toLowerCase(Locale.ROOT);
            // Exact package/component evidence wins. AOSP app headers use the installed label.
            // Names in a list or arbitrary explanatory paragraphs never identify the target.
            identity |= text.equals(ownPackage) || text.equals(ownPackage + "/com.xiaomao.focus.FocusAccessibilityService")
                || (id.endsWith("/entity_header_title") || id.equals("entity_header_title")
                    || id.endsWith("/app_name") || cls.contains("DeviceAdminAdd") && id.endsWith("/admin_name")
                    || cls.contains("Uninstall") && id.equals("android:id/alerttitle")) && !ownLabel.isEmpty() && text.equals(ownLabel);
            forceStop |= equalsAny(text, "Force stop", "强行停止", "强制停止", "强制结束") || id.endsWith("/force_stop_button");
            uninstall |= equalsAny(text, "Uninstall", "卸载") || id.endsWith("/uninstall_button");
            accessibility |= equalsAny(text, "Use " + ownLabel, "使用" + ownLabel, "使用 " + ownLabel,
                "Stop", "停止", "关闭", "Use service", "使用服务");
            admin |= equalsAny(text, "Deactivate this device admin app", "Deactivate", "停用此设备管理应用", "停用", "取消激活");
            if (depth < MAX_DEPTH) for (int i = 0; i < node.children.length && i < MAX_NODES && queue.size() < MAX_NODES; i++)
                if (node.children[i] != null) { queue.add(node.children[i]); depths.add(depth + 1); }
        }
        if (!identity) return "";
        if ((cls.contains("AppInfoDashboard") || cls.contains("InstalledAppDetails") || cls.equals("com.android.settings.SubSettings"))
            && (forceStop || uninstall)) return "own-app-info";
        if ((cls.contains("Accessibility") || cls.equals("com.android.settings.SubSettings")) && accessibility) return "own-accessibility";
        if (cls.contains("DeviceAdminAdd") && admin) return "own-admin";
        if (cls.contains("Uninstall") && uninstall) return "own-uninstall";
        return "";
    }
}
