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
    private static long settingsUntil;
    private static String settingsPackage = "";

    static JSONObject preferences(LocalStore store) throws JSONException {
        JSONObject data = store.read("data");
        JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
        JSONObject protection = prefs == null ? null : prefs.optJSONObject("protection");
        return protection == null ? new JSONObject() : protection;
    }

    static boolean authorized(Context context) {
        AccessibilityManager manager = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null) return false;
        ComponentName own = new ComponentName(context, FocusAccessibilityService.class);
        for (AccessibilityServiceInfo service : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            if (own.equals(ComponentName.unflattenFromString(service.getId()))) return true;
        }
        return false;
    }

    static JSONObject capture(Context context, LocalStore store) throws JSONException {
        JSONObject prefs = preferences(store);
        boolean study = prefs.optBoolean("study", false);
        if (study && (!authorized(context) || !FocusAccessibilityService.connected()))
            throw new IllegalStateException("学霸模式待授权：请启用小猫专注无障碍服务，并返回确认服务已连接");
        LinkedHashSet<String> packages = new LinkedHashSet<>();
        JSONArray selected = prefs.optJSONArray("globalWhitelist");
        if (selected != null) for (int i = 0; i < selected.length(); i++) {
            Object value = selected.opt(i);
            if (value instanceof String && !((String) value).isEmpty()) packages.add((String) value);
        }
        packages.add(context.getPackageName());
        return new JSONObject().put("study", study).put("source", "global")
            .put("whitelist", new JSONArray(packages));
    }

    static JSONObject status(Context context, LocalStore store, JSONObject observation) throws JSONException {
        boolean granted = authorized(context), connected = FocusAccessibilityService.connected();
        boolean preferred = preferences(store).optBoolean("study", false);
        JSONObject session = observation.getJSONObject("focus").optJSONObject("session");
        JSONObject protection = session == null ? null : session.optJSONObject("protection");
        boolean requested = protection != null && protection.optBoolean("study");
        boolean current = requested && !observation.optBoolean("needsReconcile");
        String state = current ? granted && connected ? "protecting" : "failed"
            : !preferred ? "off" : granted && connected ? "ready" : "authorization";
        String reason = current && (!granted || !connected) ? "本轮应用限制已失效，请检查无障碍授权与服务连接"
            : !granted ? "尚未启用无障碍服务" : !connected ? "已授权，等待无障碍服务连接"
            : current ? "本轮有效白名单已固定；暂停计时仍限制应用"
            : preferred ? "开始专注后执行应用限制" : "应用限制未开启";
        return new JSONObject().put("supported", true).put("authorized", granted).put("connected", connected)
            .put("active", current && granted && connected).put("preferenceEnabled", preferred)
            .put("state", state).put("reason", reason)
            .put("effectiveWhitelist", protection == null ? new JSONArray() : protection.optJSONArray("whitelist"));
    }

    static void openSettings(Context context) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ResolveInfo target = context.getPackageManager().resolveActivity(intent, 0);
        settingsPackage = target == null ? "" : target.activityInfo.packageName;
        settingsUntil = SystemClock.elapsedRealtime() + 5 * 60_000;
        context.startActivity(intent);
    }

    /** Uses only observeControl(), never the lifecycle read/settlement command. */
    static boolean shouldBlock(Context context, JSONObject observation, String packageName, String className) {
        if (packageName == null || packageName.isEmpty() || observation.optBoolean("needsReconcile")
            || !"focus".equals(observation.optString("owner"))) return false;
        JSONObject focus = observation.optJSONObject("focus");
        JSONObject session = focus == null ? null : focus.optJSONObject("session");
        JSONObject protection = session == null ? null : session.optJSONObject("protection");
        if (protection == null || !protection.optBoolean("study") || context.getPackageName().equals(packageName)) return false;
        JSONArray whitelist = protection.optJSONArray("whitelist");
        if (whitelist != null) for (int i = 0; i < whitelist.length(); i++)
            if (packageName.equals(whitelist.optString(i))) return false;
        if (necessaryPackages(context).contains(packageName)) return false;
        if (packageName.equals(settingsPackage) && SystemClock.elapsedRealtime() < settingsUntil) return false;
        // The system UI owns emergency actions, keyguard, notification shade and permission surfaces.
        if (packageName.equals("com.android.systemui") || packageName.equals("android")) return false;
        return true;
    }

    private static Set<String> necessaryPackages(Context context) {
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
        String input = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        ComponentName keyboard = input == null ? null : ComponentName.unflattenFromString(input);
        if (keyboard != null) result.add(keyboard.getPackageName());
        for (String permissionPackage : new String[]{"com.android.permissioncontroller", "com.google.android.permissioncontroller"}) {
            try { if ((pm.getApplicationInfo(permissionPackage, 0).flags & ApplicationInfo.FLAG_SYSTEM) != 0) result.add(permissionPackage); }
            catch (PackageManager.NameNotFoundException ignored) { }
        }
        return result;
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
        JSONArray selected = preferences(store).optJSONArray("globalWhitelist");
        if (selected != null) for (int i = 0; i < selected.length(); i++) {
            String name = selected.optString(i);
            if (name.isEmpty() || rows.containsKey(name)) continue;
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
