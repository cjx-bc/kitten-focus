package com.xiaomao.focus;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.util.Base64;
import android.view.accessibility.AccessibilityManager;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Set;

/** Original implementation using Android APIs; no copied third-party control engine. */
final class FocusProtection {
    interface AccessibilityState { boolean authorized(); boolean connected(); }
    private static final Object SETTINGS_LOCK = new Object();
    private static volatile long settingsUntil;
    private static volatile String settingsPackage = "";
    private static volatile String executionFailure = "";
    private static long exceptionsChecked;
    private static Set<String> cachedNecessary = new HashSet<>();
    static void executionFailed(Exception error) { executionFailure = "无法显示应用阻挡页：" + error.getClass().getSimpleName(); }
    static void executionSucceeded() { executionFailure = ""; }
    static synchronized void invalidateNecessary() { exceptionsChecked = 0; }

    static JSONObject preferences(LocalStore store) throws JSONException {
        JSONObject data = store.read("data");
        JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
        JSONObject protection = prefs == null ? null : prefs.optJSONObject("protection");
        return protection == null ? new JSONObject() : protection;
    }

    static boolean isAccessibilityEnabledInSettings(boolean globalEnabled, String enabledServices, String packageName, String serviceClassName) {
        if (!globalEnabled || enabledServices == null || packageName == null || serviceClassName == null) return false;
        String fullFlat = packageName + "/" + serviceClassName;
        String shortFlat = serviceClassName.startsWith(packageName + ".")
            ? packageName + "/" + serviceClassName.substring(packageName.length())
            : fullFlat;
        for (String component : enabledServices.split(":")) {
            String trimmed = component.trim();
            if (fullFlat.equals(trimmed) || shortFlat.equals(trimmed)) return true;
        }
        return false;
    }

    static boolean authorized(Context context) {
        ComponentName own = new ComponentName(context, FocusAccessibilityService.class);

        // The AccessibilityManager list is populated from currently bound services.
        // During an application/process restart it can be temporarily empty even
        // though Android has retained the user's grant in its secure settings.
        // Verify both the global accessibility switch and ENABLED_ACCESSIBILITY_SERVICES
        // so stale entries never cause a false positive when accessibility is globally off.
        android.content.ContentResolver cr = context.getContentResolver();
        boolean globalEnabled = Settings.Secure.getInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1;
        String enabled = Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (isAccessibilityEnabledInSettings(globalEnabled, enabled, own.getPackageName(), own.getClassName())) return true;

        AccessibilityManager manager = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null) return false;
        for (AccessibilityServiceInfo service : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            if (own.equals(ComponentName.unflattenFromString(service.getId()))) return true;
        }
        return false;
    }

    private static AccessibilityState appRestrictionState(Context context) {
        boolean usageReady = AppUsageGuard.isReady(context);
        boolean a11yAuth = authorized(context);
        boolean a11yConn = FocusAccessibilityService.connected();
        return new AccessibilityState() {
            public boolean authorized() { return usageReady || a11yAuth; }
            public boolean connected() { return usageReady || a11yConn; }
        };
    }

    static boolean isAppRestrictionReady(Context context) {
        AccessibilityState state = appRestrictionState(context);
        return state.authorized() && state.connected();
    }

    static boolean isActiveCallAudioMode(int mode) {
        return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_RINGTONE;
    }

    static boolean isInActiveCall(Context context) {
        if (context == null) return false;
        try {
            AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return false;
            return isActiveCallAudioMode(audio.getMode());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static java.util.List<String[]> resolveWhitelistApps(Context context, JSONArray whitelistPackages) {
        java.util.List<String[]> result = new java.util.ArrayList<>();
        if (context == null || whitelistPackages == null) return result;
        PackageManager pm = context.getPackageManager();
        String ownPkg = context.getPackageName();
        java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
        for (int i = 0; i < whitelistPackages.length(); i++) {
            String pkg = whitelistPackages.optString(i, "");
            if (pkg.isEmpty() || pkg.equals(ownPkg) || !seen.add(pkg)) continue;
            if (pm.getLaunchIntentForPackage(pkg) == null) continue;
            String label = pkg;
            try {
                label = pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
            } catch (PackageManager.NameNotFoundException ignored) { }
            result.add(new String[] { pkg, label });
        }
        return result;
    }

    static JSONObject capture(Context context, LocalStore store, JSONObject session) throws JSONException {
        return capture(context, store, session, appRestrictionState(context));
    }
    static JSONObject captureLock(Context context, LocalStore store, JSONObject configuration) throws JSONException {
        return captureLock(context, store, configuration, appRestrictionState(context));
    }
    static JSONObject captureLock(Context context, LocalStore store, JSONObject configuration, AccessibilityState accessibility) throws JSONException {
        if (!accessibility.authorized() || !accessibility.connected())
            throw new IllegalStateException("锁机待授权：请开启「使用情况访问」与「悬浮窗」权限（或启用无障碍服务）");
        JSONObject whitelist = configuration.optJSONObject("whitelist");
        boolean custom = whitelist != null && "custom".equals(whitelist.optString("source"));
        LinkedHashSet<String> selected = new LinkedHashSet<>();
        addPackages(selected, custom ? whitelist.optJSONArray("packages") : preferences(store).optJSONArray("globalWhitelist"));
        selected.add(context.getPackageName());
        return new JSONObject().put("study", true).put("source", custom ? "custom" : "global").put("whitelist", new JSONArray(selected))
            .put("enhancements", lockEnhancements(store, configuration));
    }
    static JSONArray lockEnhancements(LocalStore store, JSONObject configuration) throws JSONException {
        JSONObject source = configuration.has("enhancements") ? configuration : preferences(store);
        if (source.has("enhancements")) source.getJSONArray("enhancements");
        return selectedEnhancements(source);
    }
    static JSONObject capture(Context context, LocalStore store, JSONObject session, AccessibilityState accessibility) throws JSONException {
        JSONObject prefs = resolveEffective(preferences(store));
        boolean study = prefs.optBoolean("study", false);
        if (study && (!accessibility.authorized() || !accessibility.connected()))
            throw new IllegalStateException("学霸模式待授权：请开启「使用情况访问」与「悬浮窗」权限（或启用无障碍服务）");
        LinkedHashSet<String> packages = new LinkedHashSet<>();
        JSONArray selected = prefs.optJSONArray("globalWhitelist");
        String source = "global";
        JSONObject data = store.read("data");
        JSONArray items = data == null ? null : data.optJSONArray("items");
        String itemId = session.optString("itemId", "");
        if (items != null && !itemId.isEmpty()) for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || item.optBoolean("deleted") || !itemId.equals(item.optString("id"))) continue;
            JSONObject configuration = item.optJSONObject("whitelist");
            if (configuration != null && "custom".equals(configuration.optString("source"))) {
                source = "custom";
                selected = configuration.optJSONArray("packages");
            }
            break;
        }
        if (selected != null) for (int i = 0; i < selected.length(); i++) {
            Object value = selected.opt(i);
            if (value instanceof String && !((String) value).isEmpty()) packages.add((String) value);
        }
        packages.add(context.getPackageName());
        JSONObject captured = new JSONObject().put("study", study).put("source", source)
            .put("whitelist", new JSONArray(packages)).put("enhancements", selectedEnhancements(prefs));
        if (!temporaryAccessAllowed(prefs)) captured.put("temporaryAccessAllowed", false);
        if (!study && masterStudyLocked(prefs)) captured.put("studyLocked", true);
        return captured;
    }
    static JSONObject resolveEffective(JSONObject prefs) throws JSONException {
        if (prefs == null) return new JSONObject();
        JSONObject modules = prefs.optJSONObject("modules");
        if (modules == null) return prefs;
        JSONObject resolved = new JSONObject(prefs.toString());
        boolean master = modules.optBoolean("master", false);
        JSONObject apps = modules.optJSONObject("apps");
        JSONObject strict = modules.optJSONObject("strict");
        JSONObject quiet = modules.optJSONObject("quiet");
        boolean appsOn = master && apps != null && apps.optBoolean("enabled", false);
        boolean strictOn = master && strict != null && strict.optBoolean("enabled", false);
        boolean quietOn = master && quiet != null && quiet.optBoolean("enabled", false);
        resolved.put("study", appsOn && moduleSubBool(apps, "restrictApps", true));
        resolved.put("strict", strictOn && moduleSubBool(strict, "noPauseEnd", true));
        resolved.put("dnd", quietOn && moduleSubBool(quiet, "sound", true));
        resolved.put("interceptNotifications", quietOn && moduleSubBool(quiet, "intercept", true));
        JSONArray enhancements = new JSONArray();
        if (strictOn) {
            if (moduleSubBool(strict, "navigation", true)) enhancements.put("navigationHomeRecents");
            if (moduleSubBool(strict, "antiClose", true)) enhancements.put(FocusAntiClose.OPTION);
            if (moduleSubBool(strict, "hideRecents", false)) enhancements.put(RecentTasksProtection.KEY);
            if (moduleSubBool(strict, "hideLauncher", false)) enhancements.put(LauncherProtection.KEY);
            if (moduleSubBool(strict, "wallpaper", false)) enhancements.put(WallpaperProtection.KEY);
            if (moduleSubBool(strict, "strictSettings", false)) enhancements.put(FocusAntiClose.STRICT_SETTINGS_OPTION);
            if (moduleSubBool(strict, "deviceAdmin", false)) enhancements.put(DeviceAdminProtection.KEY);
            if (moduleSubBool(strict, "rebootResume", false)) enhancements.put("rebootResumeLock");
        }
        JSONArray existing = prefs.optJSONArray("enhancements");
        if (existing != null) for (int i = 0; i < existing.length(); i++) {
            if (FocusRecovery.MAIN_ENTRY.equals(existing.optString(i))) {
                enhancements.put(FocusRecovery.MAIN_ENTRY);
                break;
            }
        }
        resolved.put("enhancements", enhancements);
        return resolved;
    }
    private static boolean moduleSubBool(JSONObject module, String key, boolean fallback) {
        if (module == null) return fallback;
        JSONObject custom = module.optJSONObject("custom");
        return custom != null && custom.has(key) ? custom.optBoolean(key, fallback) : fallback;
    }
    static boolean masterStudyLocked(JSONObject prefs) {
        if (prefs == null) return false;
        if (prefs.optBoolean("study", false)) return true;
        JSONObject modules = prefs.optJSONObject("modules");
        return modules != null && modules.optBoolean("master", false) && modules.optBoolean("focusLock", true);
    }
    static boolean temporaryAccessAllowed(JSONObject prefs) {
        JSONObject modules = prefs == null ? null : prefs.optJSONObject("modules");
        JSONObject apps = modules == null ? null : modules.optJSONObject("apps");
        JSONObject custom = apps == null ? null : apps.optJSONObject("custom");
        return custom == null || !custom.has("temporaryAccess") || custom.optBoolean("temporaryAccess", true);
    }
    static boolean notificationWhitelistPass(JSONObject prefs) {
        JSONObject modules = prefs == null ? null : prefs.optJSONObject("modules");
        JSONObject quiet = modules == null ? null : modules.optJSONObject("quiet");
        JSONObject custom = quiet == null ? null : quiet.optJSONObject("custom");
        return custom == null || !custom.has("whitelistPass") || custom.optBoolean("whitelistPass", true);
    }
    private static JSONArray selectedEnhancements(JSONObject prefs) {
        JSONArray enhancements = prefs.optJSONArray("enhancements"), selected = new JSONArray();
        if (enhancements != null) for (int i = 0; i < enhancements.length(); i++) {
            String value = enhancements.optString(i);
            if ("navigationHomeRecents".equals(value) || RecentTasksProtection.KEY.equals(value)
                || LauncherProtection.KEY.equals(value) || FocusAntiClose.OPTION.equals(value) || WallpaperProtection.KEY.equals(value)
                || FocusRecovery.MAIN_ENTRY.equals(value) || FocusAntiClose.STRICT_SETTINGS_OPTION.equals(value)
                || DeviceAdminProtection.KEY.equals(value) || "rebootResumeLock".equals(value)) selected.put(value);
        }
        return selected;
    }

    static boolean strictSettingsRequested(JSONObject protection) {
        return enhancementRequested(protection, FocusAntiClose.STRICT_SETTINGS_OPTION);
    }

    static boolean rebootResumeRequested(JSONObject protection) {
        return enhancementRequested(protection, "rebootResumeLock");
    }

    static JSONObject status(Context context, LocalStore store, JSONObject observation) throws JSONException {
        boolean usageStatsGranted = AppUsageGuard.hasUsageStatsPermission(context);
        boolean overlayGranted = AppUsageGuard.hasOverlayPermission(context);
        boolean a11yAuth = authorized(context);
        boolean a11yConn = FocusAccessibilityService.connected();
        String engine = AppUsageGuard.resolveEngine(usageStatsGranted, overlayGranted, a11yAuth, a11yConn);
        boolean usageOverlayReady = usageStatsGranted && overlayGranted;
        boolean granted = usageOverlayReady || a11yAuth;
        boolean connected = usageOverlayReady || (a11yAuth && a11yConn);
        boolean preferred = resolveEffective(preferences(store)).optBoolean("study", false);
        JSONObject session = ControlSession.from(observation);
        JSONObject protection = session == null ? null : session.optJSONObject("protection");
        boolean requested = protection != null && protection.optBoolean("study");
        boolean withdrawn = protection != null && protection.optBoolean("applicationsWithdrawn");
        boolean current = requested && !withdrawn && !observation.optBoolean("needsReconcile");
        boolean effective = !AppUsageGuard.ENGINE_NONE.equals(engine) && executionFailure.isEmpty();
        String state = requested && withdrawn ? "recovered" : current ? effective ? "protecting" : "failed"
            : !preferred ? "off" : effective ? "ready" : "authorization";
        String reason = requested && withdrawn ? "本轮应用限制已主动撤销；计时仍继续"
            : current && !executionFailure.isEmpty() ? executionFailure
            : current && !effective ? "本轮应用限制已失效，请检查使用情况访问、悬浮窗或无障碍权限"
            : !granted ? "尚未授予使用情况访问或悬浮窗权限"
            : !connected ? (a11yAuth && !a11yConn && !usageOverlayReady
                ? "无障碍开关仍保留，但后台清理断开了服务连接：请进入系统无障碍将「小猫专注」关闭再重开，或改开「使用情况访问 + 悬浮窗」免掉权"
                : "已开启部分权限，请确认使用情况访问与悬浮窗权限已就绪")
            : current ? "lock".equals(observation.optString("owner")) ? "本轮锁机保护中；有效白名单已固定" : "本轮有效白名单已固定；暂停计时仍限制应用"
            : preferred ? (AppUsageGuard.ENGINE_ACCESSIBILITY.equals(engine)
                ? "无障碍服务已就绪，开始专注后执行应用限制"
                : "使用情况访问与悬浮窗已就绪，开始专注后执行应用限制")
            : "应用限制未开启";
        return new JSONObject().put("supported", true).put("authorized", granted).put("connected", connected)
            .put("active", current && effective).put("preferenceEnabled", preferred)
            .put("state", state).put("reason", reason)
            .put("engine", engine)
            .put("usageStatsGranted", usageStatsGranted)
            .put("overlayGranted", overlayGranted)
            .put("accessibilityAuthorized", a11yAuth)
            .put("accessibilityConnected", a11yConn)
            .put("effectiveWhitelist", protection == null ? new JSONArray() : protection.optJSONArray("whitelist"))
            .put("navigation", observation.optJSONObject("navigation")).put("antiClose", observation.optJSONObject("antiClose"));
    }

    static boolean navigationRequested(JSONObject protection) {
        return enhancementRequested(protection, "navigationHomeRecents");
    }
    static boolean enhancementRequested(JSONObject protection, String option) {
        JSONArray enhancements = protection == null ? null : protection.optJSONArray("enhancements");
        if (enhancements == null) return false;
        for (int i = 0; i < enhancements.length(); i++) if (option.equals(enhancements.optString(i))) return true;
        return false;
    }

    static void openSettings(Context context) {
        openSettings(context, "accessibility");
    }
    static void openSettings(Context context, String target) {
        if ("usageStats".equals(target)) {
            AppUsageGuard.openUsageStatsSettings(context);
            return;
        }
        if ("overlay".equals(target)) {
            AppUsageGuard.openOverlaySettings(context);
            return;
        }
        openAuthorizationSettings(context, new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }
    static void openAuthorizationSettings(Context context, Intent intent) {
        ResolveInfo target = context.getPackageManager().resolveActivity(intent, 0);
        if (target == null) throw new IllegalStateException("系统没有此授权设置入口，请从系统设置进入");
        intent.setComponent(new ComponentName(target.activityInfo.packageName, target.activityInfo.name));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        allowSettingsForAuthorization(context, target.activityInfo.packageName);
        try {
            context.startActivity(intent);
        } catch (RuntimeException error) {
            clearSettingsAuthorization();
            throw error;
        }
    }
    static void allowSettingsForAuthorization(Context context, String pkg) {
        synchronized (SETTINGS_LOCK) {
            settingsPackage = pkg == null ? "" : pkg;
            settingsUntil = SystemClock.elapsedRealtime() + 5 * 60_000;
        }
    }
    static void clearSettingsAuthorization() {
        synchronized (SETTINGS_LOCK) {
            settingsPackage = "";
            settingsUntil = 0;
        }
    }
    static boolean settingsAuthorizationAllowed(String pkg) {
        synchronized (SETTINGS_LOCK) {
            return pkg != null && pkg.equals(settingsPackage) && SystemClock.elapsedRealtime() < settingsUntil;
        }
    }
    static boolean isSettingsAuthorizationInFlight() {
        synchronized (SETTINGS_LOCK) {
            return !settingsPackage.isEmpty() && SystemClock.elapsedRealtime() < settingsUntil;
        }
    }

    /** Uses only observeControl(), never the lifecycle read/settlement command. */
    static boolean shouldBlock(Context context, JSONObject observation, String packageName, String className) {
        if (packageName == null || packageName.isEmpty() || observation.optBoolean("needsReconcile")
            || !("focus".equals(observation.optString("owner")) || "lock".equals(observation.optString("owner")))) return false;
        JSONObject session = ControlSession.from(observation);
        JSONObject protection = session == null ? null : session.optJSONObject("protection");
        if (protection == null || context.getPackageName().equals(packageName)) return false;
        if (!protection.optBoolean("study") || protection.optBoolean("applicationsWithdrawn")) return false;
        JSONObject temporary = session.optJSONObject("temporaryAccess");
        if (temporary != null && temporary.optLong("remainingMs") > 0 && packageName.equals(temporary.optString("targetPackage"))) return false;
        JSONArray whitelist = protection.optJSONArray("whitelist");
        if (isPackageInWhitelist(whitelist, packageName)) return false;
        if (necessaryPackages(context).contains(packageName)) return false;
        if (settingsAuthorizationAllowed(packageName)) return false;
        // FORCE-05 applies its own exact target guard; unrelated system Settings/installers stay usable.
        if (FocusAntiClose.requested(protection) && new AndroidAntiCloseSystem(context, null).systemSurface(packageName)) return false;
        // The system UI owns emergency actions, keyguard, notification shade and permission surfaces.
        if (packageName.equals("com.android.systemui") || packageName.equals("android")) return false;
        return true;
    }

    private static synchronized Set<String> necessaryPackages(Context context) {
        long now = SystemClock.elapsedRealtime();
        if (exceptionsChecked > 0 && now - exceptionsChecked < 5000) return cachedNecessary;
        Set<String> result = new HashSet<>();
        result.add("com.android.phone");
        result.add("com.android.server.telecom");
        PackageManager pm = context.getPackageManager();
        TelecomManager telecom = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
        if (telecom != null && telecom.getDefaultDialerPackage() != null) result.add(telecom.getDefaultDialerPackage());
        for (String action : new String[]{Intent.ACTION_DIAL, "android.intent.action.EMERGENCY_DIAL"}) {
            Intent intent = new Intent(action, Uri.parse("tel:"));
            for (ResolveInfo info : pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY))
                result.add(info.activityInfo.packageName);
        }
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo launcher = pm.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        if (launcher != null) result.add(launcher.activityInfo.packageName);
        String keyboardPackage = currentInputMethodPackage(context);
        if (!keyboardPackage.isEmpty()) result.add(keyboardPackage);
        for (String permissionPackage : new String[]{"com.android.permissioncontroller", "com.google.android.permissioncontroller"}) {
            try { if ((pm.getApplicationInfo(permissionPackage, 0).flags & ApplicationInfo.FLAG_SYSTEM) != 0) result.add(permissionPackage); }
            catch (PackageManager.NameNotFoundException ignored) { }
        }
        cachedNecessary = result;
        exceptionsChecked = now;
        return result;
    }

    static String currentInputMethodPackage(Context context) {
        String input = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        ComponentName keyboard = input == null ? null : ComponentName.unflattenFromString(input);
        return keyboard == null ? "" : keyboard.getPackageName();
    }

    static boolean isTransientOverlayPackage(Context context, String packageName) {
        if (packageName == null || packageName.isEmpty()) return false;
        if ("com.android.systemui".equals(packageName) || "android".equals(packageName)) return true;
        String ime = currentInputMethodPackage(context);
        return !ime.isEmpty() && ime.equals(packageName);
    }

    static boolean matchesWhitelistEntry(String whitelistedPackage, String targetPackage) {
        if (whitelistedPackage == null || targetPackage == null || whitelistedPackage.isEmpty() || targetPackage.isEmpty()) {
            return false;
        }
        if (whitelistedPackage.equals(targetPackage)) return true;
        if (("com.google.android.apps.bard".equals(whitelistedPackage)
            || "com.google.android.apps.googleassistant".equals(whitelistedPackage)
            || "com.google.ar.lens".equals(whitelistedPackage))
            && "com.google.android.googlequicksearchbox".equals(targetPackage)) {
            return true;
        }
        return false;
    }

    static boolean isPackageInWhitelist(JSONArray whitelist, String targetPackage) {
        if (whitelist == null || targetPackage == null || targetPackage.isEmpty()) return false;
        for (int i = 0; i < whitelist.length(); i++) {
            if (matchesWhitelistEntry(whitelist.optString(i), targetPackage)) return true;
        }
        return false;
    }

    static boolean isWhitelistedExternalApp(Context context, JSONObject observation, String packageName) {
        if (context == null || observation == null || packageName == null || packageName.isEmpty()) return false;
        if (context.getPackageName().equals(packageName)) return false;
        JSONObject session = ControlSession.from(observation);
        if (session == null) return false;
        JSONObject temporary = session.optJSONObject("temporaryAccess");
        if (temporary != null && temporary.optLong("remainingMs") > 0 && packageName.equals(temporary.optString("targetPackage"))) {
            return true;
        }
        JSONObject protection = session.optJSONObject("protection");
        JSONArray whitelist = protection == null ? null : protection.optJSONArray("whitelist");
        return isPackageInWhitelist(whitelist, packageName);
    }

    static JSONArray apps(Context context, LocalStore store) throws JSONException {
        PackageManager pm = context.getPackageManager();
        LinkedHashMap<String, JSONObject> rows = new LinkedHashMap<>();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo info : pm.queryIntentActivities(launcher, 0)) {
            ApplicationInfo app = info.activityInfo.applicationInfo;
            rows.put(app.packageName, appRow(context, app));
        }
        try { rows.put(context.getPackageName(), appRow(context, pm.getApplicationInfo(context.getPackageName(), 0))); }
        catch (PackageManager.NameNotFoundException ignored) { }
        LinkedHashSet<String> selected = new LinkedHashSet<>();
        addPackages(selected, preferences(store).optJSONArray("globalWhitelist"));
        JSONObject data = store.read("data");
        JSONArray items = data == null ? null : data.optJSONArray("items");
        if (items != null) for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || item.optBoolean("deleted")) continue;
            JSONObject configuration = item.optJSONObject("whitelist");
            if (configuration != null && "custom".equals(configuration.optString("source")))
                addPackages(selected, configuration.optJSONArray("packages"));
        }
        JSONArray locks = data == null ? null : data.optJSONArray("lockConfigurations");
        if (locks != null) for (int i = 0; i < locks.length(); i++) {
            JSONObject row = locks.optJSONObject(i);
            JSONObject configuration = row == null ? null : row.optJSONObject("whitelist");
            if (configuration != null && "custom".equals(configuration.optString("source")))
                addPackages(selected, configuration.optJSONArray("packages"));
        }
        for (String name : selected) {
            if (rows.containsKey(name)) continue;
            try { rows.put(name, appRow(context, pm.getApplicationInfo(name, 0))); }
            catch (PackageManager.NameNotFoundException missing) {
                rows.put(name, new JSONObject().put("packageName", name).put("name", name).put("icon", JSONObject.NULL)
                    .put("system", false).put("installed", false).put("fixed", false));
            }
        }
        ArrayList<JSONObject> sorted = new ArrayList<>(rows.values());
        sorted.sort(Comparator.comparing(row -> row.optString("name"), String.CASE_INSENSITIVE_ORDER));
        return new JSONArray(sorted);
    }

    private static void addPackages(Set<String> packages, JSONArray selected) {
        if (selected != null) for (int i = 0; i < selected.length(); i++) {
            Object value = selected.opt(i);
            if (value instanceof String && !((String) value).trim().isEmpty()) packages.add((String) value);
        }
    }

    private static JSONObject appRow(Context context, ApplicationInfo app) throws JSONException {
        PackageManager pm = context.getPackageManager();
        String icon = null;
        try {
            Drawable drawable = pm.getApplicationIcon(app);
            Bitmap bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888);
            drawable.setBounds(0, 0, 64, 64);
            drawable.draw(new Canvas(bitmap));
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes);
            icon = "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
            bitmap.recycle();
        } catch (RuntimeException ignored) { }
        return new JSONObject().put("packageName", app.packageName).put("name", pm.getApplicationLabel(app))
            .put("icon", icon == null ? JSONObject.NULL : icon)
            .put("system", (app.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0)
            .put("installed", true).put("fixed", app.packageName.equals(context.getPackageName()));
    }
}
