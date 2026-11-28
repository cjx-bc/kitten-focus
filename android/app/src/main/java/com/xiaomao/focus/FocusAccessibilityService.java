package com.xiaomao.focus;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONObject;

public class FocusAccessibilityService extends AccessibilityService {
    private static volatile boolean running;
    private static volatile FocusAccessibilityService instance;
    private final Handler expiry = new Handler(Looper.getMainLooper());
    private final Handler pullbackHandler = new Handler(Looper.getMainLooper());
    private Runnable pullbackPulseTask;

    static Context serviceContext() {
        FocusAccessibilityService service = instance;
        return (service != null && running) ? service : null;
    }

    static void cancelPullbackPulse() {
        FocusAccessibilityService service = instance;
        if (service == null) return;
        Runnable task = service.pullbackPulseTask;
        if (task != null) {
            service.pullbackHandler.removeCallbacks(task);
            service.pullbackPulseTask = null;
        }
    }

    @Override
    protected boolean onKeyEvent(android.view.KeyEvent event) {
        if (event == null || !running) return super.onKeyEvent(event);
        int keyCode = event.getKeyCode();
        if (FocusBlockOverlay.shouldInterceptKeyFast(keyCode)) {
            return true;
        }
        return super.onKeyEvent(event);
    }
    private String foregroundPackage = "", foregroundClass = "";
    private String lastAppPackage = "", lastAppClass = "";
    private final Runnable enforce = () -> enforceForeground(false);
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
        String reason = "recents".equals(target) ? "多任务切换"
            : ("anti_close".equals(target) ? "高危设置页" : "离开专注");
        try {
            JSONObject obs = new FocusControl(service).observeSessionState();
            FocusBlockOverlay.showGuardPullback(service, obs, reason);
        } catch (Exception ignored) { }
        cancelPullbackPulse();
        // Overview may be a SystemUI overlay. BACK closes that surface before raising
        // the existing activity; Home is handled by raising our existing task directly.
        if ("recents".equals(target) || "anti_close".equals(target)) {
            service.performGlobalAction(GLOBAL_ACTION_BACK);
        }
        service.startActivity(new Intent(service, MainActivity.class).putExtra("returnToFocus", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        final int[] remaining = { 2 };
        Runnable pulse = new Runnable() {
            @Override
            public void run() {
                if (!running || remaining[0] <= 0) {
                    service.pullbackPulseTask = null;
                    return;
                }
                remaining[0]--;
                try {
                    JSONObject obs = new FocusControl(service).observeSessionState();
                    if (ControlSession.from(obs) == null) {
                        service.pullbackPulseTask = null;
                        return;
                    }
                    FocusBlockOverlay.showGuardPullback(service, obs, reason);
                    service.startActivity(new Intent(service, MainActivity.class).putExtra("returnToFocus", true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
                } catch (Exception ignored) { }
                service.pullbackHandler.postDelayed(this, 250L);
            }
        };
        service.pullbackPulseTask = pulse;
        service.pullbackHandler.postDelayed(pulse, 250L);
        return true;
    }
    private final BroadcastReceiver changes = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (intent != null && Intent.ACTION_USER_PRESENT.equals(intent.getAction())) enforceForeground(false);
            else FocusProtection.invalidateNecessary();
        }
    };
    @Override public void onCreate() {
        super.onCreate();
        IntentFilter filter = new IntentFilter(Intent.ACTION_INPUT_METHOD_CHANGED);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(changes, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(changes, filter);
    }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); FocusProtection.invalidateNecessary(); }
    @Override protected void onServiceConnected() {
        instance = this;
        running = true;
        FocusProtection.executionSucceeded();
        FocusProtection.invalidateNecessary();
        try {
            if (LocalStore.get(this).read("active") != null) {
                FocusKeepAliveService.ensureStarted(this);
                FocusNotificationListener.rebindIfAuthorized(this);
            }
        } catch (Exception ignored) { }
    }
    @Override public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        try {
            if (LocalStore.get(this).read("active") != null) {
                Reminders.scheduleKeepAliveRevive(this, 500L);
            }
        } catch (Exception ignored) { }
    }
    @Override public boolean onUnbind(Intent intent) {
        expiry.removeCallbacks(enforce); cancelPullbackPulse(); instance = null; running = false;
        FocusBlockOverlay.onAccessibilityDisconnected(this);
        handleAccessibilityRevokedOnUnbind(getApplicationContext());
        // Return false so Android invokes onServiceConnected() on subsequent rebinds
        // rather than calling onRebind() and leaving running/instance uninitialized.
        return super.onUnbind(intent);
    }
    @Override public void onDestroy() {
        expiry.removeCallbacks(enforce);
        cancelPullbackPulse();
        instance = null;
        running = false;
        FocusBlockOverlay.onAccessibilityDisconnected(this);
        try { unregisterReceiver(changes); } catch (IllegalArgumentException ignored) { }
        super.onDestroy();
    }

    private static void handleAccessibilityRevokedOnUnbind(Context app) {
        if (app == null) return;
        new Thread(() -> {
            try {
                android.os.SystemClock.sleep(200L);
                if (LocalStore.get(app).read("active") != null && !FocusProtection.authorized(app)) {
                    try {
                        new FocusControl(app).restoreLauncher();
                    } catch (Exception ignored) { }
                    Reminders.showAccessibilityRevoked(app);
                }
            } catch (Exception ignored) { }
        }, "cat-focus-a11y-unbind").start();
    }
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
        if (!FocusProtection.isTransientOverlayPackage(this, foregroundPackage)) {
            lastAppPackage = foregroundPackage;
            lastAppClass = foregroundClass;
        }
        enforceForeground(true);
    }
    static String resolveTargetPackage(String eventPackage, String lastAppPackage, String activeWindowPackage,
            boolean fromEvent, boolean eventTransient, boolean activeTransient) {
        if (fromEvent) {
            if (!eventTransient) return eventPackage;
            if (!activeWindowPackage.isEmpty() && !activeTransient) return activeWindowPackage;
            return eventPackage;
        }
        if (!activeWindowPackage.isEmpty() && !activeTransient) return activeWindowPackage;
        if (!lastAppPackage.isEmpty()) return lastAppPackage;
        return eventPackage;
    }
    private String activeWindowPackage() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "";
        try {
            CharSequence pkg = root.getPackageName();
            return pkg == null ? "" : pkg.toString();
        } finally {
            root.recycle();
        }
    }
    private boolean isInteractiveUnlocked() {
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power != null && !power.isInteractive()) return false;
        KeyguardManager keyguard = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard == null || !keyguard.isKeyguardLocked();
    }
    private void enforceForeground(boolean fromEvent) {
        expiry.removeCallbacks(enforce);
        try {
            FocusControl control = new FocusControl(this);
            if (fromEvent && control.antiCloseWindow(foregroundPackage, foregroundClass)) return;
            if (fromEvent && control.navigationWindow(foregroundPackage, foregroundClass)) return;
            JSONObject observation = control.observeSessionState();
            String owner = observation.optString("owner");
            JSONObject session = ControlSession.from(observation);
            boolean hasActive = ("focus".equals(owner) || "lock".equals(owner)) && !observation.optBoolean("needsReconcile") && session != null;
            if (!hasActive) {
                FocusBlockOverlay.dismiss();
                return;
            }
            JSONObject protection = session.optJSONObject("protection");
            boolean studyActive = protection != null && protection.optBoolean("study") && !protection.optBoolean("applicationsWithdrawn");
            JSONObject grant = session.optJSONObject("temporaryAccess");
            boolean grantActive = grant != null && grant.optLong("remainingMs") > 0;
            if (grantActive)
                expiry.postDelayed(enforce, Math.min(1000, grant.optLong("remainingMs")) + 20);
            String activePkg = activeWindowPackage();
            boolean activeTransient = FocusProtection.isTransientOverlayPackage(this, activePkg);
            if (!activePkg.isEmpty() && !activeTransient) {
                if (!activePkg.equals(lastAppPackage)) lastAppClass = activePkg.equals(foregroundPackage) ? foregroundClass : "";
                lastAppPackage = activePkg;
            }
            boolean eventTransient = FocusProtection.isTransientOverlayPackage(this, foregroundPackage);
            String targetPackage = resolveTargetPackage(foregroundPackage, lastAppPackage, activePkg, fromEvent, eventTransient, activeTransient);
            String targetClass = targetPackage.equals(foregroundPackage) ? foregroundClass
                : targetPackage.equals(lastAppPackage) ? lastAppClass : "";
            if (getPackageName().equals(targetPackage)) {
                FocusBlockOverlay.showForSession(this, observation);
                return;
            }
            // If MainActivity itself is still foreground/resumed, ignore floating widgets (e.g. call bubbles/sidebars)
            // so background bubbles cannot dismiss the active focus overlay or trigger false blocking.
            if (FocusBlockOverlay.isMainForeground()) {
                return;
            }
            if (FocusProtection.isWhitelistedExternalApp(this, observation, targetPackage) || FocusProtection.isInActiveCall(this)) {
                FocusBlockOverlay.onAllowedExternalForeground(targetPackage);
                return;
            }
            if (!studyActive) {
                if (!FocusProtection.isTransientOverlayPackage(this, targetPackage)) {
                    FocusBlockOverlay.onNormalFocusExternalWindow(targetPackage);
                }
                return;
            }
            if (!grantActive && activeTransient && "com.android.systemui".equals(activePkg)) {
                if (isInteractiveUnlocked() && !lastAppPackage.isEmpty()
                    && FocusProtection.shouldBlock(this, observation, lastAppPackage, lastAppClass))
                    expiry.postDelayed(enforce, 500);
                return;
            }
            if (!FocusProtection.shouldBlock(this, observation, targetPackage, targetClass)) return;
            if (FocusBlockOverlay.canAttachOverlay(this)) {
                FocusBlockOverlay.show(this, observation, targetPackage);
                FocusProtection.executionSucceeded();
                return;
            }
            startActivity(new Intent(this, FocusBlockActivity.class).putExtra(FocusBlockActivity.TARGET_PACKAGE, targetPackage)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            FocusProtection.executionSucceeded();
        } catch (Exception error) {
            FocusProtection.executionFailed(error);
            // A failed observation never traps the user with a stale cached session.
        }
    }
}
