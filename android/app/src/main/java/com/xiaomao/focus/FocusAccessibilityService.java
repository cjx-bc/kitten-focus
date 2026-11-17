package com.xiaomao.focus;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONObject;

public class FocusAccessibilityService extends AccessibilityService {
    private static volatile boolean running;
    private static volatile FocusAccessibilityService instance;
    private final Handler expiry = new Handler(Looper.getMainLooper());
    private String foregroundPackage = "", foregroundClass = "";
    private final Runnable enforce = () -> enforceForeground();
    static boolean connected() { return running; }
    static AccessibilityNodeInfo activeSystemRoot(String pkg) {
        FocusAccessibilityService service = instance;
        if (service == null || !running || !new AndroidAntiCloseSystem(service, null).systemSurface(pkg)) return null;
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root != null && (root.getPackageName() == null || !pkg.contentEquals(root.getPackageName()))) { root.recycle(); return null; }
        return root;
    }
    static boolean returnToFocus(Context context, String target) {
        FocusAccessibilityService service = instance;
        if (service == null || !running) return false;
        // Overview may be a SystemUI overlay. BACK closes that surface before raising
        // the existing activity; Home is handled by raising our existing task directly.
        if ("recents".equals(target)) service.performGlobalAction(GLOBAL_ACTION_BACK);
        service.startActivity(new Intent(service, MainActivity.class).putExtra("returnToFocus", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        return true;
    }
    private final BroadcastReceiver changes = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { FocusProtection.invalidateNecessary(); }
    };
    @Override public void onCreate() {
        super.onCreate();
        IntentFilter filter = new IntentFilter(Intent.ACTION_INPUT_METHOD_CHANGED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(changes, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(changes, filter);
    }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); FocusProtection.invalidateNecessary(); }
    @Override protected void onServiceConnected() { instance = this; running = true; FocusProtection.executionSucceeded(); FocusProtection.invalidateNecessary(); }
    @Override public boolean onUnbind(Intent intent) { instance = null; running = false; return super.onUnbind(intent); }
    @Override public void onDestroy() { expiry.removeCallbacks(enforce); instance = null; running = false; unregisterReceiver(changes); super.onDestroy(); }
    @Override public void onInterrupt() { }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            if (foregroundPackage.contentEquals(event.getPackageName()) && AntiCloseWindow.candidateClass(foregroundClass)
                && new AndroidAntiCloseSystem(this, null).systemSurface(foregroundPackage)) try {
                new FocusControl(this).antiCloseWindow(foregroundPackage, foregroundClass);
            } catch (Exception ignored) { }
            return;
        }
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        foregroundPackage = event.getPackageName().toString();
        foregroundClass = event.getClassName() == null ? "" : event.getClassName().toString();
        enforceForeground();
    }
    private void enforceForeground() {
        expiry.removeCallbacks(enforce);
        try {
            FocusControl control = new FocusControl(this);
            if (control.antiCloseWindow(foregroundPackage, foregroundClass)) return;
            if (control.navigationWindow(foregroundPackage, foregroundClass)) return;
            JSONObject observation = control.observeControl();
            JSONObject session = ControlSession.from(observation);
            JSONObject grant = session == null ? null : session.optJSONObject("temporaryAccess");
            if (grant != null && grant.optLong("remainingMs") > 0)
                expiry.postDelayed(enforce, Math.min(1000, grant.optLong("remainingMs")) + 20);
            if (!FocusProtection.shouldBlock(this, observation, foregroundPackage, foregroundClass)) return;
            startActivity(new Intent(this, FocusBlockActivity.class).putExtra(FocusBlockActivity.TARGET_PACKAGE, foregroundPackage)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            FocusProtection.executionSucceeded();
        } catch (Exception error) {
            FocusProtection.executionFailed(error);
            // A failed observation never traps the user with a stale cached session.
        }
    }
}
