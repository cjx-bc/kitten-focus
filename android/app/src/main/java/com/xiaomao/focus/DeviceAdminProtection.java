package com.xiaomao.focus;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import org.json.JSONException;
import org.json.JSONObject;

/** Optional minimal-policy ordinary Device Admin helper; distinct from Device Owner and gracefully deactivatable. */
final class DeviceAdminProtection {
    static final String KEY = "deviceAdminAntiUninstall";

    private DeviceAdminProtection() {}

    static ComponentName component(Context context) {
        return new ComponentName(context.getApplicationContext(), FocusDeviceAdminReceiver.class);
    }

    static boolean isSupported(Context context) {
        if (context == null) return false;
        return context.getSystemService(Context.DEVICE_POLICY_SERVICE) != null;
    }

    static boolean isActive(Context context) {
        if (context == null) return false;
        try {
            DevicePolicyManager manager = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            return manager != null && manager.isAdminActive(component(context));
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static Intent activationIntent(Context context) {
        Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
        intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, component(context));
        intent.putExtra(
            DevicePolicyManager.EXTRA_ADD_EXPLANATION,
            "仅用于防止专注或锁机期间误卸载小猫专注，不申请擦除数据或修改密码权限，可在设置或故障恢复随时一键停用。"
        );
        return intent;
    }

    static void requestActivation(Context context) {
        requestActivation(null, context);
    }

    static void requestActivation(android.app.Activity activity, Context context) {
        if (context == null && activity == null) return;
        Context app = (context != null ? context : activity).getApplicationContext();
        Intent intent = activationIntent(app);
        android.content.pm.ResolveInfo target = app.getPackageManager().resolveActivity(intent, 0);
        if (target == null) throw new IllegalStateException("系统没有此设备管理器激活入口，请从系统设置进入");
        intent.setComponent(new ComponentName(target.activityInfo.packageName, target.activityInfo.name));
        FocusProtection.allowSettingsForAuthorization(app, target.activityInfo.packageName);
        if (activity != null && !activity.isFinishing() && !activity.isDestroyed()) {
            Runnable launch = () -> {
                try {
                    activity.startActivityForResult(intent, 0);
                } catch (RuntimeException error) {
                    FocusProtection.clearSettingsAuthorization();
                    FocusProtection.openAuthorizationSettings(app, activationIntent(app));
                }
            };
            if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
                launch.run();
            } else {
                activity.runOnUiThread(launch);
            }
            return;
        }
        FocusProtection.openAuthorizationSettings(app, activationIntent(app));
    }

    static boolean deactivate(Context context) {
        if (context == null) return false;
        try {
            DevicePolicyManager manager = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (manager == null) return false;
            ComponentName admin = component(context);
            if (manager.isAdminActive(admin)) {
                manager.removeActiveAdmin(admin);
            }
            return !manager.isAdminActive(admin);
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static JSONObject status(Context context, boolean preferenceEnabled) throws JSONException {
        boolean supported = isSupported(context);
        boolean active = supported && isActive(context);
        String state = !supported ? "unsupported" : active ? "active" : preferenceEnabled ? "authorization" : "off";
        String reason = !supported
            ? "当前系统不支持设备管理器防卸载"
            : active
                ? "防卸载保护已开启（普通设备管理器，可随时一键停用）"
                : preferenceEnabled
                    ? "尚未激活防卸载保护；开启后可阻止直接长按卸载"
                    : "防卸载保护未开启";
        return new JSONObject()
            .put("supported", supported)
            .put("active", active)
            .put("preferenceEnabled", preferenceEnabled)
            .put("state", state)
            .put("reason", reason);
    }
}
