package com.xiaomao.focus;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

/** Resolves and opens system battery optimization exemption safely via FocusProtection settings allowance. */
final class BackgroundKeepAlive {
    static final String ACTION_REQUEST_IGNORE = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS;
    static final String ACTION_SETTINGS_LIST = Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS;
    static final String ACTION_APP_DETAILS = Settings.ACTION_APPLICATION_DETAILS_SETTINGS;

    private BackgroundKeepAlive() {}

    static boolean isIgnoringBatteryOptimizations(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager power = context.getSystemService(PowerManager.class);
        return power != null && power.isIgnoringBatteryOptimizations(context.getPackageName());
    }

    static String[] candidateIntentActions(int sdkInt, boolean alreadyIgnored) {
        if (sdkInt < Build.VERSION_CODES.M) {
            return new String[] { ACTION_APP_DETAILS };
        }
        if (alreadyIgnored) {
            return new String[] { ACTION_SETTINGS_LIST, ACTION_APP_DETAILS };
        }
        return new String[] { ACTION_REQUEST_IGNORE, ACTION_SETTINGS_LIST, ACTION_APP_DETAILS };
    }

    static void openBatteryOptimizationSettings(Context context) {
        boolean ignored = isIgnoringBatteryOptimizations(context);
        Uri packageUri = Uri.parse("package:" + context.getPackageName());
        for (String action : candidateIntentActions(Build.VERSION.SDK_INT, ignored)) {
            Intent intent = ACTION_SETTINGS_LIST.equals(action)
                ? new Intent(action)
                : new Intent(action, packageUri);
            try {
                FocusProtection.openAuthorizationSettings(context, intent);
                return;
            } catch (RuntimeException ignoredFailure) {
                // Try the next less-specific system battery setting surface.
            }
        }
        throw new IllegalStateException("无法打开系统电池优化设置，请在系统设置中查找应用耗电管理");
    }
}
