package com.xiaomao.focus;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

/** Optional minimal-policy ordinary Device Admin receiver used solely to deter accidental uninstallation. */
public final class FocusDeviceAdminReceiver extends DeviceAdminReceiver {
    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        return "停用防卸载保护后即可正常卸载小猫专注。";
    }
}
