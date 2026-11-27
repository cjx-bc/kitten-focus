package com.xiaomao.focus;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Brand-aware keep-alive router & 4-step checklist builder. Never fabricates unobservable OEM switch state. */
final class OemKeepAliveRouter {
    static final String BRAND_OPPO = "oppo";
    static final String BRAND_XIAOMI = "xiaomi";
    static final String BRAND_VIVO = "vivo";
    static final String BRAND_HUAWEI = "huawei";
    static final String BRAND_SAMSUNG = "samsung";
    static final String BRAND_GENERIC = "generic";

    private OemKeepAliveRouter() {}

    static String detectBrand(String manufacturer, String brand) {
        String combined = ((manufacturer == null ? "" : manufacturer) + " " + (brand == null ? "" : brand))
            .toLowerCase(Locale.ROOT);
        if (combined.contains("oppo") || combined.contains("oneplus") || combined.contains("realme")) {
            return BRAND_OPPO;
        }
        if (combined.contains("xiaomi") || combined.contains("redmi") || combined.contains("poco")
            || combined.contains("blackshark")) {
            return BRAND_XIAOMI;
        }
        if (combined.contains("vivo") || combined.contains("iqoo")) {
            return BRAND_VIVO;
        }
        if (combined.contains("huawei") || combined.contains("honor")) {
            return BRAND_HUAWEI;
        }
        if (combined.contains("samsung")) {
            return BRAND_SAMSUNG;
        }
        return BRAND_GENERIC;
    }

    static String brandLabel(String brandKey) {
        switch (brandKey) {
            case BRAND_OPPO:
                return "OPPO / 一加 / realme（ColorOS）";
            case BRAND_XIAOMI:
                return "小米 / Redmi（澎湃 / MIUI）";
            case BRAND_VIVO:
                return "vivo / iQOO（OriginOS）";
            case BRAND_HUAWEI:
                return "华为 / 荣耀（HarmonyOS / MagicOS）";
            case BRAND_SAMSUNG:
                return "三星（One UI）";
            default:
                return "标准 Android";
        }
    }

    static String autoStartHint(String brandKey) {
        switch (brandKey) {
            case BRAND_OPPO:
                return "在「设置 → 应用 → 自启动」（或手机管家 / 电池的自启动设置）开启小猫专注，避免系统拦截通知监听与后台服务绑定；"
                    + "在「应用信息 → 耗电管理」开启「完全允许后台行为」；侧载版若专注期间无障碍被自动关闭，请在「手机管家 / 安全中心」将小猫专注设为信任或白名单。";
            case BRAND_XIAOMI:
                return "在「安全中心 → 自启动管理」允许小猫专注自启动、省电策略设为「无限制」并允许「后台弹出界面」；"
                    + "侧载版建议在安全中心将小猫专注加入信任或忽略风险。";
            case BRAND_VIVO:
                return "在「i 管家 → 权限管理 → 自启动」开启小猫专注并将后台耗电设为「允许后台高耗电」；"
                    + "侧载版建议在 i 管家安全检测中将小猫专注加入信任或忽略风险。";
            case BRAND_HUAWEI:
                return "在「手机管家 → 应用启动管理」关闭自动管理，手动开启「允许自启动、关联启动、后台活动」；"
                    + "侧载版若被风险管控，请在手机管家「病毒查杀 / 风险管控」中解除管控并加入信任。";
            case BRAND_SAMSUNG:
                return "在「电池 → 后台使用限制」将小猫专注移出休眠应用并设为「不受限制」；"
                    + "侧载安装首次开启无障碍前，需在「应用信息 → 右上角 ⋮」点击「允许受限设置」。";
            default:
                return "在系统应用详情中允许后台运行与电池不受限制（如设备提供自启动或手机管家白名单请一并开启；"
                    + "Android 13+ 侧载版需在应用信息右上角「⋮」点击「允许受限设置」）。";
        }
    }

    static String recentLockHint(String brandKey) {
        switch (brandKey) {
            case BRAND_OPPO:
                return "上滑悬停进入最近任务 → 点击小猫专注卡片右上角「⋮」→ 选择「锁定」（防底部一键清除；日常退出请按 Home 或返回键，勿手动单独上滑划掉卡片）。";
            case BRAND_XIAOMI:
                return "上滑悬停进入最近任务 → 长按小猫专注卡片 → 点击「锁图标」。";
            case BRAND_VIVO:
                return "上滑悬停进入最近任务 → 向下轻拉小猫专注卡片或点右上角图标 → 选择「锁定」。";
            case BRAND_HUAWEI:
                return "上滑悬停进入最近任务 → 向下滑动小猫专注卡片，出现小锁图标即已加锁。";
            case BRAND_SAMSUNG:
                return "打开最近任务 → 点击小猫专注卡片顶部图标 → 选择「保持打开」。";
            default:
                return "打开最近任务 → 长按或点击小猫专注卡片菜单，选择「锁定 / 保持打开」（若系统支持）。";
        }
    }

    static List<String[]> candidateAutoStartComponents(String brandKey) {
        List<String[]> list = new ArrayList<>();
        if (BRAND_OPPO.equals(brandKey)) {
            list.add(new String[] { "com.oplus.battery", "com.oplus.startupapp.view.StartupAppListActivity" });
            list.add(new String[] { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" });
            list.add(new String[] { "com.oplus.safecenter", "com.oplus.safecenter.startupapp.StartupAppListActivity" });
            list.add(new String[] { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" });
            list.add(new String[] { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" });
        } else if (BRAND_XIAOMI.equals(brandKey)) {
            list.add(new String[] { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" });
            list.add(new String[] { "com.miui.securitycenter", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity" });
        } else if (BRAND_VIVO.equals(brandKey)) {
            list.add(new String[] { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" });
            list.add(new String[] { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity" });
            list.add(new String[] { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" });
        } else if (BRAND_HUAWEI.equals(brandKey)) {
            list.add(new String[] { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" });
            list.add(new String[] { "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity" });
            list.add(new String[] { "com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity" });
        } else if (BRAND_SAMSUNG.equals(brandKey)) {
            list.add(new String[] { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" });
            list.add(new String[] { "com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity" });
        }
        return Collections.unmodifiableList(list);
    }

    static boolean hasAutoStartSurface(Context context) {
        if (context == null) return false;
        String brandKey = detectBrand(Build.MANUFACTURER, Build.BRAND);
        for (String[] pair : candidateAutoStartComponents(brandKey)) {
            Intent intent = new Intent().setComponent(new ComponentName(pair[0], pair[1]));
            if (context.getPackageManager().resolveActivity(intent, 0) != null) {
                return true;
            }
        }
        return false;
    }

    static void openAutoStartSettings(Context context) {
        if (context == null) return;
        String brandKey = detectBrand(Build.MANUFACTURER, Build.BRAND);
        for (String[] pair : candidateAutoStartComponents(brandKey)) {
            Intent intent = new Intent().setComponent(new ComponentName(pair[0], pair[1]));
            if (context.getPackageManager().resolveActivity(intent, 0) == null) continue;
            try {
                FocusProtection.openAuthorizationSettings(context, intent);
                return;
            } catch (RuntimeException ignored) {
                // Fall through to the next OEM activity or App Details.
            }
        }
        openAppDetailsSettings(context);
    }

    static void openAppDetailsSettings(Context context) {
        if (context == null) return;
        Intent details = new Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + context.getPackageName())
        );
        FocusProtection.openAuthorizationSettings(context, details);
    }

    static JSONObject buildGuide(Context context, LocalStore store) throws JSONException {
        String brandKey = detectBrand(Build.MANUFACTURER, Build.BRAND);
        boolean hideRecentsConflict = false;
        if (store != null) {
            JSONObject effective = FocusProtection.resolveEffective(FocusProtection.preferences(store));
            JSONArray enhancements = effective.optJSONArray("enhancements");
            if (enhancements != null) {
                for (int i = 0; i < enhancements.length(); i++) {
                    if (RecentTasksProtection.KEY.equals(enhancements.optString(i))) {
                        hideRecentsConflict = true;
                        break;
                    }
                }
            }
        }
        return new JSONObject()
            .put("brand", brandKey)
            .put("brandLabel", brandLabel(brandKey))
            .put("foregroundServiceActive", FocusKeepAliveService.isRunning())
            .put("batteryOptimizationIgnored", BackgroundKeepAlive.isIgnoringBatteryOptimizations(context))
            .put("hasAutoStartSurface", hasAutoStartSurface(context))
            .put("autoStartHint", autoStartHint(brandKey))
            .put("recentLockHint", recentLockHint(brandKey))
            .put("hideRecentsConflict", hideRecentsConflict);
    }
}
