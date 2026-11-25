package com.xiaomao.focus;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

final class AndroidAntiCloseSystem implements AntiCloseSystem {
    private final Context context;
    private final FocusProtection.AccessibilityState state;
    AndroidAntiCloseSystem(Context context, FocusProtection.AccessibilityState state) { this.context = context; this.state = state; }
    public boolean authorized() { return state == null ? FocusProtection.authorized(context) : state.authorized(); }
    public boolean connected() { return state == null ? FocusAccessibilityService.connected() : state.connected(); }
    public boolean systemSurface(String pkg) {
        if (!("com.android.settings".equals(pkg)
            || "com.android.packageinstaller".equals(pkg)
            || "com.google.android.packageinstaller".equals(pkg)
            || "com.android.permissioncontroller".equals(pkg)
            || "com.google.android.permissioncontroller".equals(pkg)
            || "com.oplus.appdetail".equals(pkg)
            || "com.coloros.safecenter".equals(pkg)
            || "com.oplus.safecenter".equals(pkg)
            || "com.oplus.securitypermission".equals(pkg)
            || "com.miui.securitycenter".equals(pkg)
            || "com.miui.packageinstaller".equals(pkg)
            || "com.lbe.security.miui".equals(pkg)
            || "com.iqoo.secure".equals(pkg)
            || "com.vivo.permissionmanager".equals(pkg)
            || "com.huawei.systemmanager".equals(pkg)
            || "com.hihonor.systemmanager".equals(pkg)
            || "com.samsung.android.lool".equals(pkg)
            || "com.samsung.android.packageinstaller".equals(pkg))) return false;
        try { return (context.getPackageManager().getApplicationInfo(pkg, 0).flags & ApplicationInfo.FLAG_SYSTEM) != 0; }
        catch (Exception ignored) { return false; }
    }
    public String appLabel() {
        String label = context.getApplicationInfo().loadLabel(context.getPackageManager()).toString();
        // A name is only a fallback for a known app header. A colliding visible installed
        // label must never identify another package as ours (including production vs QA).
        List<ApplicationInfo> visible = context.getPackageManager().getInstalledApplications(0);
        if (visible.size() > 512) return "";
        for (ApplicationInfo app : visible)
            if (!context.getPackageName().equals(app.packageName) && label.contentEquals(app.loadLabel(context.getPackageManager()))) return "";
        return label;
    }
    public AntiCloseWindow.Node root(String pkg) {
        AccessibilityNodeInfo root = FocusAccessibilityService.activeSystemRoot(pkg);
        return root == null ? null : read(root, pkg, 0, new int[]{0});
    }
    private AntiCloseWindow.Node read(AccessibilityNodeInfo node, String pkg, int depth, int[] count) {
        try {
            if (++count[0] > AntiCloseWindow.MAX_NODES || depth > AntiCloseWindow.MAX_DEPTH
                || node.getPackageName() == null || !pkg.contentEquals(node.getPackageName())) return null;
            List<AntiCloseWindow.Node> children = new ArrayList<>();
            for (int i = 0; i < Math.min(node.getChildCount(), AntiCloseWindow.MAX_NODES) && count[0] < AntiCloseWindow.MAX_NODES; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) { AntiCloseWindow.Node read = read(child, pkg, depth + 1, count); if (read != null) children.add(read); }
            }
            String viewId = node.getViewIdResourceName();
            CharSequence text = node.getText();
            // API36 exposes the accessibility page heading only as this exact system
            // toolbar's title metadata. Also allow known OEM toolbar title nodes while
            // never reading arbitrary content descriptions.
            if ((text == null || text.length() == 0) && viewId != null
                && ("com.android.settings:id/collapsing_toolbar".equals(viewId)
                    || viewId.endsWith("/action_bar_title")
                    || viewId.endsWith("/toolbar_title"))) {
                text = node.getContentDescription();
            }
            // No arbitrary descriptions/extras, screenshots or persistent node payloads.
            CharSequence role = node.getClassName();
            return new AntiCloseWindow.Node(pkg, viewId, text == null || text.length() > 256 ? "" : text.toString(),
                role == null ? "" : role.toString(), children.toArray(new AntiCloseWindow.Node[0]));
        } finally { node.recycle(); }
    }
    public void returnToFocus() {
        if (!FocusAccessibilityService.returnToFocus(context, "anti-close")) throw new IllegalStateException("无障碍执行器未连接");
    }
    public JSONObject identity() throws Exception {
        DevicePolicyManager manager = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
        boolean admin = false;
        if (manager != null) {
            List<ComponentName> admins = manager.getActiveAdmins();
            if (admins != null) for (ComponentName item : admins) if (context.getPackageName().equals(item.getPackageName())) admin = true;
        }
        return new JSONObject().put("accessibility", authorized()).put("ordinaryAdmin", admin)
            .put("deviceOwner", manager != null && manager.isDeviceOwnerApp(context.getPackageName()))
            .put("profileOwner", manager != null && manager.isProfileOwnerApp(context.getPackageName()));
    }
}
