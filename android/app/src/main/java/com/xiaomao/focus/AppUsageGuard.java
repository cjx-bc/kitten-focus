package com.xiaomao.focus;

import android.Manifest;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;

/** Persistent usage-stats + overlay guard so everyday app restriction survives OEM task removal. */
final class AppUsageGuard {
    static final String ENGINE_ACCESSIBILITY = "accessibility";
    static final String ENGINE_USAGE_OVERLAY = "usage_overlay";
    static final String ENGINE_NONE = "none";

    private AppUsageGuard() {}

    static String resolveEngine(
        boolean usageStatsGranted,
        boolean overlayGranted,
        boolean accessibilityAuthorized,
        boolean accessibilityConnected
    ) {
        if (accessibilityAuthorized && accessibilityConnected) return ENGINE_ACCESSIBILITY;
        if (usageStatsGranted && overlayGranted) return ENGINE_USAGE_OVERLAY;
        return ENGINE_NONE;
    }

    static boolean canRestrictApps(
        boolean usageStatsGranted,
        boolean overlayGranted,
        boolean accessibilityAuthorized,
        boolean accessibilityConnected
    ) {
        return !ENGINE_NONE.equals(
            resolveEngine(usageStatsGranted, overlayGranted, accessibilityAuthorized, accessibilityConnected)
        );
    }

    static boolean hasUsageStatsPermission(Context context) {
        if (context == null) return false;
        try {
            AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
            if (ops == null) return false;
            int uid = Process.myUid();
            String pkg = context.getPackageName();
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, uid, pkg)
                : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, uid, pkg);
            if (mode == AppOpsManager.MODE_ALLOWED) return true;
            if (mode == AppOpsManager.MODE_DEFAULT) {
                return context.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS)
                    == PackageManager.PERMISSION_GRANTED;
            }
            return false;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static boolean hasOverlayPermission(Context context) {
        if (context == null) return false;
        try {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static boolean isReady(Context context) {
        return hasUsageStatsPermission(context) && hasOverlayPermission(context);
    }

    static void openUsageStatsSettings(Context context) {
        String pkg = context.getPackageName();
        openWithFallback(context, new Intent[] {
            new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + pkg)),
            new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS),
            new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)),
        });
    }

    static void openOverlaySettings(Context context) {
        String pkg = context.getPackageName();
        openWithFallback(context, new Intent[] {
            new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + pkg)),
            new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION),
            new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)),
        });
    }

    private static void openWithFallback(Context context, Intent[] candidates) {
        RuntimeException lastError = null;
        for (Intent intent : candidates) {
            if (context.getPackageManager().resolveActivity(intent, 0) == null) continue;
            try {
                FocusProtection.openAuthorizationSettings(context, intent);
                return;
            } catch (RuntimeException error) {
                lastError = error;
            }
        }
        if (lastError != null) throw lastError;
        throw new IllegalStateException("系统没有此授权设置入口，请从系统设置进入");
    }
}
