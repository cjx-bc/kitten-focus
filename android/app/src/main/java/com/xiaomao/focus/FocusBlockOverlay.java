package com.xiaomao.focus;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Unified native full-screen overlay covering active focus and lock sessions.
 * Uses TYPE_ACCESSIBILITY_OVERLAY when AccessibilityService is connected (no SYSTEM_ALERT_WINDOW needed),
 * falling back to TYPE_APPLICATION_OVERLAY otherwise.
 */
final class FocusBlockOverlay {
    enum Mode {
        NONE,
        NORMAL_FOCUS,
        STUDY_LOCKED,
        BLOCKED_APP,
        GUARD_PULLBACK
    }

    enum SubPanel {
        NONE,
        CONFIRM_FINISH,
        WHITELIST,
        SAFETY,
        WHITE_NOISE
    }

    static final class AnimalPalette {
        final int body;
        final int belly;
        final int accent;

        AnimalPalette(int body, int belly, int accent) {
            this.body = body;
            this.belly = belly;
            this.accent = accent;
        }

        int[] toArray() {
            return new int[] { body, belly, accent };
        }
    }

    private static final String[][] WHITE_NOISE_OPTIONS = {
        { "off", "关闭" },
        { "rain", "雨声" },
        { "birds", "鸟鸣" },
        { "stream", "溪流" },
        { "fire", "篝火" },
        { "waves", "海浪" },
    };

    private static final Map<String, AnimalPalette> ANIMAL_PALETTES = buildAnimalPalettes();

    private static Map<String, AnimalPalette> buildAnimalPalettes() {
        Map<String, AnimalPalette> map = new HashMap<>();
        map.put("black-cat", new AnimalPalette(0xFF222222, 0xFF3A3A3F, 0xFFEF4E36));
        map.put("black-cat:cow", new AnimalPalette(0xFFFFFFFF, 0xFF222222, 0xFFEF4E36));
        map.put("black-cat:siamese", new AnimalPalette(0xFFE7D8C3, 0xFF4A3C31, 0xFF698CAA));
        map.put("yellow-chick", new AnimalPalette(0xFFF2C94C, 0xFFFFF3C4, 0xFFEF4E36));
        map.put("yellow-chick:chestnut", new AnimalPalette(0xFF9C6B43, 0xFFE6C9A8, 0xFFEF4E36));
        map.put("yellow-chick:snow", new AnimalPalette(0xFFFFFFFF, 0xFFF5F5F5, 0xFFE7A54A));
        map.put("white-goose", new AnimalPalette(0xFFFFFFFF, 0xFFF5F5F5, 0xFFEF4E36));
        map.put("orange-cat", new AnimalPalette(0xFFE7A54A, 0xFFFFF6E8, 0xFFEF4E36));
        map.put("pixel-bird", new AnimalPalette(0xFFA08BB0, 0xFFF5F5F5, 0xFFEF4E36));
        map.put("patch-bear", new AnimalPalette(0xFF222222, 0xFF85858B, 0xFFEF4E36));
        map.put("green-parrot", new AnimalPalette(0xFF7B9A80, 0xFFE7A54A, 0xFFEF4E36));
        map.put("flying-pig", new AnimalPalette(0xFF222222, 0xFF85858B, 0xFFEF4E36));
        map.put("balloon-dog", new AnimalPalette(0xFFEF4E36, 0xFFE7A54A, 0xFFFFFFFF));
        map.put("light-deer", new AnimalPalette(0xFF698CAA, 0xFFF5F5F5, 0xFFEF4E36));
        map.put("angel-cat", new AnimalPalette(0xFF222222, 0xFFA08BB0, 0xFFE7A54A));
        map.put("black-dragon", new AnimalPalette(0xFF222222, 0xFFE7A54A, 0xFFEF4E36));
        return Collections.unmodifiableMap(map);
    }

    static final String COLOR_BG = "#FFFFFF";
    static final String COLOR_SURFACE = "#F5F5F5";
    static final String COLOR_INK = "#222222";
    static final String COLOR_MUTED = "#737378";
    static final String COLOR_MUTED_SURFACE = "#66666B";
    static final String COLOR_LINE = "#EAEAEA";
    static final String COLOR_ACCENT = "#EF4E36";

    private static final long TICK_INTERVAL_MS = 1000L;
    private static final long WHITELIST_LAUNCH_GRACE_MS = 2500L;
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();

    private static volatile Handler cachedMainHandler;
    private static volatile Typeface cachedNunitoTypeface;
    private static volatile boolean nunitoLoadAttempted = false;
    private static WindowManager windowManager;
    private static View overlayView;
    private static Context appContext;
    private static Context attachedWindowContext;
    private static Mode currentMode = Mode.NONE;
    private static String blockedPackage = "";
    private static String guardReasonLabel = "";
    private static volatile boolean mainForeground = false;
    private static volatile String currentRoute = "/focus";
    private static volatile boolean safeRouteSuppressed = false;
    private static volatile String yieldedWhitelistPackage = "";
    private static volatile long whitelistLaunchGraceUntilMs = 0L;
    private static volatile SubPanel subPanel = SubPanel.NONE;
    private static volatile boolean tickScheduled = false;

    private static volatile String lastRenderedSignature = "";
    private static volatile boolean lastAttachedLocked = false;
    private static volatile boolean lastAttachedKeepScreenOn = false;

    private FocusBlockOverlay() {
    }

    private static Handler mainHandler() {
        Handler existing = cachedMainHandler;
        if (existing != null) return existing;
        try {
            Looper looper = Looper.getMainLooper();
            if (looper == null) return null;
            cachedMainHandler = new Handler(looper);
            return cachedMainHandler;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    static Mode resolveOverlayMode(boolean activeSession, boolean isStudyOrLock, boolean blockedApp, boolean guardPullback) {
        if (!activeSession) return Mode.NONE;
        if (guardPullback) return Mode.GUARD_PULLBACK;
        if (blockedApp) return Mode.BLOCKED_APP;
        if (isStudyOrLock) return Mode.STUDY_LOCKED;
        return Mode.NORMAL_FOCUS;
    }

    static boolean shouldConsumeKeyCode(int keyCode, boolean lockedMode) {
        if (!lockedMode) return false;
        return keyCode == KeyEvent.KEYCODE_BACK
            || keyCode == KeyEvent.KEYCODE_APP_SWITCH
            || keyCode == KeyEvent.KEYCODE_MENU
            || keyCode == KeyEvent.KEYCODE_HOME
            || keyCode == KeyEvent.KEYCODE_ASSIST
            || keyCode == KeyEvent.KEYCODE_VOICE_ASSIST
            || keyCode == KeyEvent.KEYCODE_SEARCH
            || keyCode == KeyEvent.KEYCODE_SETTINGS;
    }

    static boolean isLockedMode(Mode mode) {
        return mode == Mode.STUDY_LOCKED || mode == Mode.BLOCKED_APP || mode == Mode.GUARD_PULLBACK;
    }

    static boolean shouldUseNotFocusable(Mode mode) {
        return mode == Mode.NORMAL_FOCUS;
    }

    static boolean shouldUseCompactHeader(SubPanel panel) {
        return panel == SubPanel.WHITE_NOISE || panel == SubPanel.WHITELIST;
    }

    private static long safeUptimeMs() {
        try {
            return SystemClock.uptimeMillis();
        } catch (Throwable ignored) {
            return 0L;
        }
    }

    static boolean shouldSuppressForWhitelist(
        boolean mainForeground,
        boolean blockedApp,
        boolean guardPullback,
        String yieldedWhitelistPkg,
        long nowUptimeMs,
        long graceUntilMs
    ) {
        if (blockedApp || guardPullback) return false;
        if (graceUntilMs > 0L && nowUptimeMs < graceUntilMs) return true;
        return !mainForeground && yieldedWhitelistPkg != null && !yieldedWhitelistPkg.isEmpty();
    }

    static boolean isMainForeground() {
        return mainForeground;
    }

    static boolean canAttachOverlay(Context context) {
        if (context == null) return false;
        return FocusAccessibilityService.serviceContext() != null
            || AppUsageGuard.hasOverlayPermission(context.getApplicationContext());
    }

    static boolean isShowing() {
        return overlayView != null;
    }

    static boolean isYieldedWhitelist(String pkg) {
        return !TextUtils.isEmpty(pkg) && pkg.equals(yieldedWhitelistPackage);
    }

    static boolean isYieldedWhitelistFast() {
        return !TextUtils.isEmpty(yieldedWhitelistPackage);
    }

    static boolean isSafeRouteSuppressed() {
        return safeRouteSuppressed;
    }

    static boolean shouldInterceptKeyFast(int keyCode) {
        return overlayView != null && isLockedMode(currentMode) && shouldConsumeKeyCode(keyCode, true);
    }

    static void setSafeRouteSuppressed(boolean suppressed) {
        safeRouteSuppressed = suppressed;
        if (suppressed && currentMode != Mode.BLOCKED_APP && currentMode != Mode.GUARD_PULLBACK) {
            dismiss();
        }
    }

    static boolean isSafeRoute(String routePath) {
        if (routePath == null || routePath.isEmpty()) routePath = "/";
        return routePath.startsWith("/recovery")
            || routePath.startsWith("/emergency")
            || routePath.startsWith("/help")
            || routePath.startsWith("/permissions")
            || routePath.startsWith("/rest")
            || routePath.startsWith("/tasks")
            || routePath.startsWith("/cat")
            || routePath.startsWith("/calendar")
            || routePath.startsWith("/statistics")
            || routePath.startsWith("/settings")
            || routePath.equals("/");
    }

    static boolean isInRegretWindow(boolean strictMode, boolean countdown, long elapsedMs) {
        return !strictMode && countdown && elapsedMs < FocusEngine.REGRET_WINDOW_MS;
    }

    static int resolvePetStage(boolean countdown, long elapsedMs, long targetMs) {
        long clampedElapsed = Math.max(0L, elapsedMs);
        if (countdown) {
            double progress = targetMs > 0L ? ((double) clampedElapsed) / targetMs : 0.0;
            if (progress < 0.33) return 1;
            if (progress < 0.75) return 2;
            return 3;
        }
        if (clampedElapsed < 8L * 60_000L) return 1;
        if (clampedElapsed < 20L * 60_000L) return 2;
        return 3;
    }

    static String buildRenderSignature(
        Mode mode,
        SubPanel panel,
        boolean paused,
        boolean strictMode,
        boolean countdown,
        boolean keepScreenOn,
        String blockedPkg,
        String reasonLabel,
        int temporaryRemaining,
        int whitelistSize,
        String title,
        String animalId,
        String skinId,
        int petStage,
        boolean regretWindow,
        String whiteNoiseTrack
    ) {
        return mode.name() + "|" + panel.name() + "|" + paused + "|" + strictMode
            + "|" + countdown + "|" + keepScreenOn + "|" + blockedPkg + "|" + reasonLabel
            + "|" + temporaryRemaining + "|" + whitelistSize + "|" + title
            + "|" + animalId + "|" + skinId + "|" + petStage + "|" + regretWindow + "|" + whiteNoiseTrack;
    }

    static boolean shouldSuppressOverlay(boolean activeSession, String routePath) {
        return !activeSession || isSafeRoute(routePath);
    }

    static void updateRouteState(Context context, String routePath) {
        if (routePath == null || routePath.isEmpty()) routePath = "/";
        currentRoute = routePath;
        boolean safe = isSafeRoute(routePath);
        safeRouteSuppressed = safe;
        if (safe) {
            if (currentMode != Mode.BLOCKED_APP && currentMode != Mode.GUARD_PULLBACK) {
                dismiss();
            }
            return;
        }
        if (mainForeground && (routePath.startsWith("/focus") || routePath.startsWith("/lock"))) {
            refreshFromControlAsync(context);
        }
    }

    static void onMainActivityFocused(Context context) {
        whitelistLaunchGraceUntilMs = 0L;
        mainForeground = true;
        yieldedWhitelistPackage = "";
        guardReasonLabel = "";
        blockedPackage = "";
        if (safeRouteSuppressed) {
            dismiss();
        } else {
            refreshFromControlAsync(context);
        }
    }

    static void onMainActivityWindowFocused(Context context) {
        if (whitelistLaunchGraceUntilMs > 0L && safeUptimeMs() < whitelistLaunchGraceUntilMs) {
            return;
        }
        onMainActivityFocused(context);
    }

    static void onMainActivityLeftForeground(Context context) {
        mainForeground = false;
        // Normal non-study focus yields immediately on Home / Recents / app-switch swipes.
        if (currentMode == Mode.NORMAL_FOCUS) {
            dismiss();
        }
    }

    static void show(Context context, JSONObject observation, String targetPackage) {
        if (context == null || observation == null) return;
        final Context app = context.getApplicationContext();
        final String pkg = targetPackage == null ? "" : targetPackage;
        whitelistLaunchGraceUntilMs = 0L;
        yieldedWhitelistPackage = "";
        guardReasonLabel = "";
        blockedPackage = pkg;
        subPanel = SubPanel.NONE;
        renderAsync(app, observation, !pkg.isEmpty(), false, "");
    }

    static void showGuardPullback(Context context, JSONObject observation, String reasonLabel) {
        if (context == null || observation == null) return;
        final Context app = context.getApplicationContext();
        final String label = TextUtils.isEmpty(reasonLabel) ? "离开专注界面" : reasonLabel;
        whitelistLaunchGraceUntilMs = 0L;
        yieldedWhitelistPackage = "";
        blockedPackage = "";
        guardReasonLabel = label;
        subPanel = SubPanel.NONE;
        renderAsync(app, observation, false, true, label);
    }

    static void showForSession(Context context, JSONObject observation) {
        if (context == null || observation == null) return;
        final Context app = context.getApplicationContext();
        if (safeRouteSuppressed) return;
        if (shouldSuppressForWhitelist(mainForeground, false, false, yieldedWhitelistPackage, safeUptimeMs(), whitelistLaunchGraceUntilMs)) {
            return;
        }
        if (overlayView != null && (currentMode == Mode.BLOCKED_APP || currentMode == Mode.GUARD_PULLBACK) && !mainForeground) {
            return;
        }
        yieldedWhitelistPackage = "";
        blockedPackage = "";
        guardReasonLabel = "";
        renderAsync(app, observation, false, false, "");
    }

    static void onAllowedExternalForeground(String targetPackage) {
        if (TextUtils.isEmpty(targetPackage)) return;
        mainForeground = false;
        yieldedWhitelistPackage = targetPackage;
        dismiss();
    }

    static void onNormalFocusExternalWindow(String targetPackage) {
        if (currentMode == Mode.NORMAL_FOCUS && !TextUtils.isEmpty(targetPackage)) {
            dismiss();
        }
    }

    static void dismiss() {
        tickScheduled = false;
        Handler handler = mainHandler();
        if (handler == null) {
            windowManager = null;
            overlayView = null;
            currentMode = Mode.NONE;
            blockedPackage = "";
            guardReasonLabel = "";
            subPanel = SubPanel.NONE;
            return;
        }
        Runnable task = () -> {
            if (windowManager != null && overlayView != null) {
                try {
                    windowManager.removeViewImmediate(overlayView);
                } catch (Exception ignored) {
                }
            }
            overlayView = null;
            windowManager = null;
            attachedWindowContext = null;
            currentMode = Mode.NONE;
            blockedPackage = "";
            guardReasonLabel = "";
            subPanel = SubPanel.NONE;
            lastRenderedSignature = "";
        };
        if (Looper.myLooper() == Looper.getMainLooper()) {
            task.run();
        } else {
            handler.post(task);
        }
    }

    /** Clears stale accessibility overlay references after system unbind and falls back to SYSTEM_ALERT_WINDOW if granted. */
    static void onAccessibilityDisconnected(Context context) {
        tickScheduled = false;
        Handler handler = mainHandler();
        final Context app = context == null ? null : context.getApplicationContext();
        Runnable task = () -> {
            if (windowManager != null && overlayView != null
                && attachedWindowContext != null
                && !(attachedWindowContext instanceof android.accessibilityservice.AccessibilityService)) {
                try {
                    windowManager.removeViewImmediate(overlayView);
                } catch (Exception ignored) {
                }
            }
            overlayView = null;
            windowManager = null;
            attachedWindowContext = null;
            currentMode = Mode.NONE;
            blockedPackage = "";
            guardReasonLabel = "";
            subPanel = SubPanel.NONE;
            lastAttachedLocked = false;
            lastRenderedSignature = "";
            if (app != null && AppUsageGuard.hasOverlayPermission(app)) {
                refreshFromControlAsync(app);
            }
        };
        if (handler == null || Looper.myLooper() == Looper.getMainLooper()) {
            task.run();
        } else {
            handler.post(task);
        }
    }

    private static void refreshFromControlAsync(Context context) {
        if (context == null) return;
        final Context app = context.getApplicationContext();
        WORKER.execute(() -> {
            try {
                JSONObject observation = new FocusControl(app).observeSessionState();
                showForSession(app, observation);
            } catch (Exception ignored) {
            }
        });
    }

    private static void refreshCurrentOverlayAsync(Context context) {
        if (context == null) return;
        final Context app = context.getApplicationContext();
        final Mode modeSnapshot = currentMode;
        final String reasonSnapshot = guardReasonLabel;
        WORKER.execute(() -> {
            try {
                JSONObject observation = new FocusControl(app).observeSessionState();
                boolean isBlocked = modeSnapshot == Mode.BLOCKED_APP;
                boolean isGuard = modeSnapshot == Mode.GUARD_PULLBACK;
                if (isBlocked || isGuard) {
                    renderAsync(app, observation, isBlocked, isGuard, reasonSnapshot);
                } else {
                    showForSession(app, observation);
                }
            } catch (Exception ignored) {
            }
        });
    }

    static void refreshKeepScreenOn(Context context) {
        if (context != null && overlayView != null) {
            refreshCurrentOverlayAsync(context);
        }
    }

    static void syncForActiveSession(Context context) {
        if (context == null) return;
        if (overlayView != null) {
            refreshCurrentOverlayAsync(context);
            return;
        }
        if (mainForeground && !safeRouteSuppressed && canAttachOverlay(context)) {
            refreshFromControlAsync(context);
        }
    }

    static void dismissIfLockedOrBlocked() {
        if (isLockedMode(currentMode)) {
            dismiss();
        }
    }

    private static void renderAsync(
        Context app,
        JSONObject observation,
        boolean blockedApp,
        boolean guardPullback,
        String reasonLabel
    ) {
        Handler handler = mainHandler();
        if (handler == null) return;
        if (Looper.myLooper() == Looper.getMainLooper()) {
            WORKER.execute(() -> {
                SessionSnapshot snap = extractSnapshot(app, observation);
                Handler main = mainHandler();
                if (main != null) {
                    main.post(() -> applySnapshotOnMain(app, snap, blockedApp, guardPullback, reasonLabel));
                }
            });
            return;
        }
        SessionSnapshot snap = extractSnapshot(app, observation);
        handler.post(() -> applySnapshotOnMain(app, snap, blockedApp, guardPullback, reasonLabel));
    }

    private static void applySnapshotOnMain(
        Context app,
        SessionSnapshot snap,
        boolean blockedApp,
        boolean guardPullback,
        String reasonLabel
    ) {
        appContext = app;
        if (!snap.active) {
            dismiss();
            return;
        }
        if (FocusProtection.isInActiveCall(app)) {
            dismiss();
            return;
        }
        KeyguardManager km = app.getSystemService(KeyguardManager.class);
        if (km != null && km.isKeyguardLocked()) {
            dismiss();
            return;
        }
        if ((safeRouteSuppressed || shouldSuppressOverlay(snap.active, currentRoute)) && !blockedApp && !guardPullback) {
            dismiss();
            return;
        }
        if (shouldSuppressForWhitelist(mainForeground, blockedApp, guardPullback, yieldedWhitelistPackage, safeUptimeMs(), whitelistLaunchGraceUntilMs)) {
            dismiss();
            return;
        }
        Mode resolved = resolveOverlayMode(true, snap.studyOrLock, blockedApp, guardPullback);
        if (resolved == Mode.NORMAL_FOCUS && !mainForeground) {
            dismiss();
            return;
        }
        if (!canAttachOverlay(app)) {
            return;
        }
        currentMode = resolved;
        guardReasonLabel = reasonLabel == null ? "" : reasonLabel;
        attachOrUpdateWindow(app, snap, resolved);
        scheduleTick(app);
    }

    private static void scheduleTick(Context app) {
        if (tickScheduled) return;
        Handler handler = mainHandler();
        if (handler == null) return;
        tickScheduled = true;
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (overlayView == null || currentMode == Mode.NONE) {
                    tickScheduled = false;
                    return;
                }
                PowerManager pm = app.getSystemService(PowerManager.class);
                KeyguardManager km = app.getSystemService(KeyguardManager.class);
                if ((pm != null && !pm.isInteractive()) || (km != null && km.isKeyguardLocked())) {
                    Handler main = mainHandler();
                    if (main != null && overlayView != null) {
                        main.postDelayed(this, TICK_INTERVAL_MS);
                    } else {
                        tickScheduled = false;
                    }
                    return;
                }
                WORKER.execute(() -> {
                    try {
                        JSONObject obs = new FocusControl(app).observeSessionState();
                        SessionSnapshot snap = extractSnapshot(app, obs);
                        if (snap.active && snap.countdown && snap.remainingMs <= 0L) {
                            obs = new FocusControl(app).reconcile();
                            snap = extractSnapshot(app, obs);
                        }
                        final JSONObject finalObs = obs;
                        final SessionSnapshot finalSnap = snap;
                        Handler main = mainHandler();
                        if (main != null) {
                            main.post(() -> {
                                if (overlayView == null || currentMode == Mode.NONE) {
                                    tickScheduled = false;
                                    return;
                                }
                                if (!finalSnap.active || FocusProtection.isInActiveCall(app)) {
                                    dismiss();
                                    CatFocusPlugin.emitJsEvent("sessionChanged", "");
                                    MainActivity.refreshWindowState(app);
                                    return;
                                }
                                Mode activeMode = currentMode;
                                boolean isBlocked = activeMode == Mode.BLOCKED_APP;
                                boolean isGuard = activeMode == Mode.GUARD_PULLBACK;
                                if ((safeRouteSuppressed || shouldSuppressOverlay(finalSnap.active, currentRoute)) && !isBlocked && !isGuard) {
                                    dismiss();
                                    return;
                                }
                                if (shouldSuppressForWhitelist(mainForeground, isBlocked, isGuard, yieldedWhitelistPackage, safeUptimeMs(), whitelistLaunchGraceUntilMs)) {
                                    dismiss();
                                    return;
                                }
                                if (activeMode == Mode.NORMAL_FOCUS && !mainForeground) {
                                    dismiss();
                                    return;
                                }
                                attachOrUpdateWindow(app, finalSnap, activeMode);
                                if (overlayView != null) {
                                    main.postDelayed(this, TICK_INTERVAL_MS);
                                } else {
                                    tickScheduled = false;
                                }
                            });
                        }
                    } catch (Exception ignored) {
                        Handler main = mainHandler();
                        if (main != null && overlayView != null) {
                            main.postDelayed(this, TICK_INTERVAL_MS);
                        } else {
                            tickScheduled = false;
                        }
                    }
                });
            }
        }, TICK_INTERVAL_MS);
    }

    private static void attachOrUpdateWindow(Context app, SessionSnapshot snap, Mode mode) {
        if (snap == null || !snap.active || mode == Mode.NONE) {
            dismiss();
            return;
        }
        Context a11yCtx = FocusAccessibilityService.serviceContext();
        boolean hasAppOverlay = AppUsageGuard.hasOverlayPermission(app);
        Context hostCtx;
        int windowType;
        if (hasAppOverlay) {
            hostCtx = app;
            windowType = Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        } else if (a11yCtx != null) {
            hostCtx = a11yCtx;
            windowType = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
        } else {
            return;
        }

        WindowManager wm = (WindowManager) hostCtx.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;

        final boolean locked = isLockedMode(mode);
        final boolean keepScreenOn = snap.keepScreenOn && !snap.paused && !snap.isLock;
        final int petStage = resolvePetStage(snap.countdown, snap.elapsedMs, snap.targetMs);
        final boolean regretWindow = isInRegretWindow(snap.strictMode, snap.countdown, snap.elapsedMs);
        String signature = buildRenderSignature(
            mode,
            subPanel,
            snap.paused,
            snap.strictMode,
            snap.countdown,
            keepScreenOn,
            blockedPackage,
            guardReasonLabel,
            snap.temporaryRemaining,
            snap.whitelistApps.size(),
            snap.title,
            snap.animalId,
            snap.skinId,
            petStage,
            regretWindow,
            snap.whiteNoiseTrack
        );

        if (overlayView != null && windowManager != null && attachedWindowContext == hostCtx && lastAttachedLocked == locked) {
            if (keepScreenOn != lastAttachedKeepScreenOn) {
                try {
                    wm.updateViewLayout(overlayView, createWindowParams(windowType, locked, keepScreenOn));
                    lastAttachedKeepScreenOn = keepScreenOn;
                } catch (Exception ignored) {
                }
            }
            if (signature.equals(lastRenderedSignature)) {
                View clockView = overlayView.findViewWithTag("focus_clock");
                if (clockView instanceof TextView) {
                    ((TextView) clockView).setText(formatClock(snap.countdown ? Math.max(0L, snap.remainingMs) : Math.max(0L, snap.elapsedMs)));
                    return;
                }
            }
            if (overlayView instanceof ViewGroup) {
                View rebuilt = buildOverlayView(app, snap, mode);
                ViewGroup root = (ViewGroup) overlayView;
                root.removeAllViews();
                root.addView(rebuilt);
                lastRenderedSignature = signature;
                return;
            }
        }

        View rebuilt = buildOverlayView(app, snap, mode);

        if (overlayView != null && windowManager != null) {
            try {
                windowManager.removeViewImmediate(overlayView);
            } catch (Exception ignored) {
            }
            overlayView = null;
        }

        FrameLayout wrapper = wrapOverlay(hostCtx, app, rebuilt, locked);
        WindowManager.LayoutParams params = createWindowParams(windowType, locked, keepScreenOn);

        try {
            wm.addView(wrapper, params);
            if (locked) wrapper.requestFocus();
            windowManager = wm;
            overlayView = wrapper;
            attachedWindowContext = hostCtx;
            lastAttachedLocked = locked;
            lastAttachedKeepScreenOn = keepScreenOn;
            lastRenderedSignature = signature;
        } catch (Exception error) {
            android.util.Log.w("FocusBlockOverlay", "addView failed (type=" + windowType + ")", error);
            Context fallbackCtx = null;
            int fallbackType = 0;
            if (windowType == WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY && hasAppOverlay) {
                fallbackCtx = app;
                fallbackType = Build.VERSION.SDK_INT >= 26
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;
            } else if (windowType != WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY && a11yCtx != null) {
                fallbackCtx = a11yCtx;
                fallbackType = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
            }
            if (fallbackCtx != null) {
                try {
                    wrapper.removeAllViews();
                    WindowManager fallbackWm = (WindowManager) fallbackCtx.getSystemService(Context.WINDOW_SERVICE);
                    if (fallbackWm != null) {
                        FrameLayout fallbackWrapper = wrapOverlay(fallbackCtx, app, rebuilt, locked);
                        WindowManager.LayoutParams fallbackParams = createWindowParams(fallbackType, locked, keepScreenOn);
                        fallbackWm.addView(fallbackWrapper, fallbackParams);
                        if (locked) fallbackWrapper.requestFocus();
                        windowManager = fallbackWm;
                        overlayView = fallbackWrapper;
                        attachedWindowContext = fallbackCtx;
                        lastAttachedLocked = locked;
                        lastAttachedKeepScreenOn = keepScreenOn;
                        lastRenderedSignature = signature;
                        return;
                    }
                } catch (Exception fallbackError) {
                    android.util.Log.w("FocusBlockOverlay", "fallback addView failed (type=" + fallbackType + ")", fallbackError);
                }
            }
            windowManager = null;
            overlayView = null;
            attachedWindowContext = null;
            lastAttachedLocked = false;
            lastAttachedKeepScreenOn = false;
        }
    }

    private static FrameLayout wrapOverlay(Context hostCtx, Context app, View content, boolean locked) {
        FrameLayout wrapper = new FrameLayout(hostCtx) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent event) {
                int code = event.getKeyCode();
                if (locked) {
                    if (shouldConsumeKeyCode(code, true)) {
                        return true;
                    }
                    return super.dispatchKeyEvent(event);
                }
                if (code == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                    if (subPanel != SubPanel.NONE) {
                        subPanel = SubPanel.NONE;
                        refreshCurrentOverlayAsync(app);
                        return true;
                    }
                    openRoute(app, "/tasks");
                    return true;
                }
                return super.dispatchKeyEvent(event);
            }
        };
        if (locked) {
            wrapper.setFocusableInTouchMode(true);
        }
        wrapper.addView(content);
        return wrapper;
    }

    private static WindowManager.LayoutParams createWindowParams(int windowType, boolean locked, boolean keepScreenOn) {
        int flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
        if (!locked) {
            flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        }
        if (keepScreenOn) {
            flags |= WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
        }
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            windowType,
            flags,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.CENTER;
        if (Build.VERSION.SDK_INT >= 28) {
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        return params;
    }

    private static View buildOverlayView(Context app, SessionSnapshot snap, Mode mode) {
        LinearLayout root = new LinearLayout(app);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor(COLOR_BG));
        root.setPadding(dp(app, 24), dp(app, 52), dp(app, 24), dp(app, 36));
        root.setClickable(true);

        // Top row
        LinearLayout topRow = new LinearLayout(app);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);
        topRow.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        if (mode == Mode.NORMAL_FOCUS) {
            TextView backTasks = buildPillButton(app, "← 返回", false, v -> openRoute(app, "/tasks"));
            topRow.addView(backTasks);

            View spacer = new View(app);
            spacer.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
            topRow.addView(spacer);

            String noiseLabel = "off".equals(snap.whiteNoiseTrack)
                ? "白噪音"
                : "白噪音 · " + resolveWhiteNoiseLabel(snap.whiteNoiseTrack);
            TextView noiseBtn = buildPillButton(app, noiseLabel, false, v -> {
                subPanel = subPanel == SubPanel.WHITE_NOISE ? SubPanel.NONE : SubPanel.WHITE_NOISE;
                refreshCurrentOverlayAsync(app);
            });
            LinearLayout.LayoutParams noiseLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            noiseLp.rightMargin = dp(app, 8);
            noiseBtn.setLayoutParams(noiseLp);
            topRow.addView(noiseBtn);

            TextView helpBtn = buildPillButton(app, "帮助与恢复", false, v -> {
                subPanel = subPanel == SubPanel.SAFETY ? SubPanel.NONE : SubPanel.SAFETY;
                refreshCurrentOverlayAsync(app);
            });
            topRow.addView(helpBtn);
        } else {
            String badgeText;
            boolean alertBadge = mode == Mode.GUARD_PULLBACK || mode == Mode.BLOCKED_APP;
            if (mode == Mode.GUARD_PULLBACK) {
                badgeText = "已拦回专注 · " + (TextUtils.isEmpty(guardReasonLabel) ? "保护中" : guardReasonLabel);
            } else if (mode == Mode.BLOCKED_APP) {
                badgeText = "专注拦截 · " + resolveAppLabel(app, blockedPackage);
            } else if (snap.isLock) {
                badgeText = snap.strictMode ? "严格锁机进行中" : "专注锁机进行中";
            } else {
                badgeText = snap.strictMode ? "严格学霸专注中" : "学霸专注中";
            }
            LinearLayout badgePill = new LinearLayout(app);
            badgePill.setOrientation(LinearLayout.HORIZONTAL);
            badgePill.setGravity(Gravity.CENTER_VERTICAL);
            badgePill.setBackground(pillBg(
                Color.parseColor(COLOR_SURFACE),
                dp(app, 20),
                dp(app, 1),
                Color.parseColor(COLOR_LINE)
            ));
            badgePill.setPadding(dp(app, 14), dp(app, 8), dp(app, 14), dp(app, 8));

            if (alertBadge) {
                View dot = new View(app);
                dot.setBackground(pillBg(Color.parseColor(COLOR_ACCENT), dp(app, 4), 0, 0));
                LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(app, 8), dp(app, 8));
                dotLp.rightMargin = dp(app, 8);
                dot.setLayoutParams(dotLp);
                badgePill.addView(dot);
            }

            TextView badge = new TextView(app);
            badge.setText(badgeText);
            badge.setTextColor(Color.parseColor(COLOR_INK));
            badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
            badge.setSingleLine(true);
            badge.setEllipsize(TextUtils.TruncateAt.END);
            badgePill.addView(badge);

            if (!snap.isLock) {
                LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
                badgeLp.rightMargin = dp(app, 8);
                badgePill.setLayoutParams(badgeLp);
                topRow.addView(badgePill);

                String noiseLabel = "off".equals(snap.whiteNoiseTrack)
                    ? "白噪音"
                    : "白噪音 · " + resolveWhiteNoiseLabel(snap.whiteNoiseTrack);
                TextView noiseBtn = buildPillButton(app, noiseLabel, false, v -> {
                    subPanel = subPanel == SubPanel.WHITE_NOISE ? SubPanel.NONE : SubPanel.WHITE_NOISE;
                    refreshCurrentOverlayAsync(app);
                });
                topRow.addView(noiseBtn);
            } else {
                topRow.addView(badgePill);
            }
        }
        root.addView(topRow);

        // Flexible middle container wrapped in a ScrollView so tall subpanels never clip on smaller screens
        ScrollView centerScroll = new ScrollView(app);
        centerScroll.setFillViewport(true);
        centerScroll.setVerticalScrollBarEnabled(false);
        LinearLayout.LayoutParams centerScrollLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        );
        centerScroll.setLayoutParams(centerScrollLp);

        LinearLayout center = new LinearLayout(app);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER);
        center.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        final boolean compactHeader = shouldUseCompactHeader(subPanel);
        boolean guardDoor = mode == Mode.BLOCKED_APP || mode == Mode.GUARD_PULLBACK;
        if (!compactHeader) {
            PetGuardView petView = new PetGuardView(
                app,
                snap.animalId,
                snap.skinId,
                guardDoor,
                snap.elapsedMs,
                snap.targetMs,
                snap.countdown
            );
            LinearLayout.LayoutParams petLp = new LinearLayout.LayoutParams(dp(app, 108), dp(app, 108));
            petLp.bottomMargin = dp(app, 10);
            petView.setLayoutParams(petLp);
            center.addView(petView);
        }

        TextView modeHint = new TextView(app);
        modeHint.setGravity(Gravity.CENTER);
        modeHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        modeHint.setTextColor(Color.parseColor(COLOR_MUTED));
        if (mode == Mode.NORMAL_FOCUS) {
            modeHint.setText(snap.paused ? "已暂停" : (snap.countdown ? "倒计时专注" : "自由正计时"));
        } else if (mode == Mode.BLOCKED_APP) {
            modeHint.setText("专注中禁止使用，非白名单应用已暂时限制");
        } else if (mode == Mode.GUARD_PULLBACK) {
            modeHint.setText("专注进行中，离开操作已被稳稳拦回");
        } else {
            modeHint.setText(snap.strictMode ? "严格锁机中 · 到期自动解锁" : "保持当下节奏");
        }
        center.addView(modeHint);

        TextView titleView = new TextView(app);
        titleView.setGravity(Gravity.CENTER);
        titleView.setText(snap.title);
        titleView.setTextColor(Color.parseColor(COLOR_INK));
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, compactHeader ? 17f : 20f);
        titleView.setPadding(0, dp(app, compactHeader ? 4 : 10), 0, dp(app, compactHeader ? 4 : 12));
        center.addView(titleView);

        TextView clockView = new TextView(app);
        clockView.setTag("focus_clock");
        clockView.setGravity(Gravity.CENTER);
        clockView.setText(formatClock(snap.countdown ? Math.max(0L, snap.remainingMs) : Math.max(0L, snap.elapsedMs)));
        clockView.setTextColor(Color.parseColor(COLOR_INK));
        clockView.setTextSize(TypedValue.COMPLEX_UNIT_SP, compactHeader ? 40f : 62f);
        Typeface nunito = resolveNunitoTypeface(app);
        if (nunito != null) {
            clockView.setTypeface(nunito);
        }
        clockView.setFontFeatureSettings("tnum");
        center.addView(clockView);

        final boolean inRegretWindow = isInRegretWindow(snap.strictMode, snap.countdown, snap.elapsedMs);

        if (subPanel == SubPanel.CONFIRM_FINISH) {
            LinearLayout confirmCard = buildCard(app);
            TextView ask = new TextView(app);
            ask.setText(snap.isLock
                ? "确认提前结束本次锁机吗？"
                : (snap.countdown ? "确认提前结束本轮专注吗？" : "确认结束本次正计时专注吗？"));
            ask.setTextColor(Color.parseColor(COLOR_INK));
            ask.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f);
            ask.setPadding(0, 0, 0, dp(app, 14));
            confirmCard.addView(ask);

            LinearLayout row = new LinearLayout(app);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            TextView cancelBtn = buildPillButton(app, "继续专注", false, v -> {
                subPanel = SubPanel.NONE;
                refreshCurrentOverlayAsync(app);
            });
            LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(0, dp(app, 48), 1f);
            btnLp.rightMargin = dp(app, 10);
            cancelBtn.setLayoutParams(btnLp);
            row.addView(cancelBtn);

            TextView finishBtn = buildPillButton(app, "确认结束", true, v ->
                executeAction(
                    app,
                    snap.isLock ? "lock_finish" : (inRegretWindow ? "focus_cancel" : "focus_finish")
                )
            );
            LinearLayout.LayoutParams btnLp2 = new LinearLayout.LayoutParams(0, dp(app, 48), 1f);
            finishBtn.setLayoutParams(btnLp2);
            row.addView(finishBtn);

            confirmCard.addView(row);
            center.addView(confirmCard);
        } else if (subPanel == SubPanel.WHITE_NOISE) {
            LinearLayout noiseCard = buildCard(app);
            noiseCard.setPadding(dp(app, 14), dp(app, 14), dp(app, 14), dp(app, 14));
            LinearLayout.LayoutParams noiseCardLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            noiseCardLp.topMargin = dp(app, 10);
            noiseCard.setLayoutParams(noiseCardLp);

            TextView noiseTitle = new TextView(app);
            noiseTitle.setText("白噪音");
            noiseTitle.setTextColor(Color.parseColor(COLOR_INK));
            noiseTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
            noiseTitle.setPadding(0, 0, 0, dp(app, 8));
            noiseCard.addView(noiseTitle);

            for (int rowIdx = 0; rowIdx < WHITE_NOISE_OPTIONS.length; rowIdx += 2) {
                LinearLayout row = new LinearLayout(app);
                row.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                );
                rowLp.bottomMargin = dp(app, 6);
                row.setLayoutParams(rowLp);

                for (int colIdx = 0; colIdx < 2 && rowIdx + colIdx < WHITE_NOISE_OPTIONS.length; colIdx++) {
                    final String trackId = WHITE_NOISE_OPTIONS[rowIdx + colIdx][0];
                    final String trackLabel = WHITE_NOISE_OPTIONS[rowIdx + colIdx][1];
                    final boolean selected = trackId.equals(snap.whiteNoiseTrack);
                    TextView chip = buildRadioPillButton(app, trackLabel, selected, v -> selectWhiteNoiseTrack(app, trackId));
                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(app, 48), 1f);
                    if (colIdx == 0) lp.rightMargin = dp(app, 8);
                    chip.setLayoutParams(lp);
                    row.addView(chip);
                }
                noiseCard.addView(row);
            }

            int volPct = (int) Math.round(WhiteNoisePolicy.clampVolume(snap.whiteNoiseVolume) * 100.0);
            LinearLayout volHead = new LinearLayout(app);
            volHead.setOrientation(LinearLayout.HORIZONTAL);
            volHead.setGravity(Gravity.CENTER_VERTICAL);
            volHead.setPadding(0, dp(app, 4), 0, dp(app, 2));
            TextView volLabel = new TextView(app);
            volLabel.setText("音量");
            volLabel.setTextColor(Color.parseColor(COLOR_INK));
            volLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
            volLabel.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            volHead.addView(volLabel);

            TextView volValue = new TextView(app);
            volValue.setText(volPct + "%");
            volValue.setTextColor(Color.parseColor(COLOR_MUTED_SURFACE));
            volValue.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
            volHead.addView(volValue);
            noiseCard.addView(volHead);

            SeekBar seekBar = new SeekBar(app);
            seekBar.setMax(100);
            seekBar.setProgress(volPct);
            seekBar.setMinimumHeight(dp(app, 48));
            seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                    if (fromUser) {
                        volValue.setText(progress + "%");
                    }
                }

                @Override
                public void onStartTrackingTouch(SeekBar bar) {}

                @Override
                public void onStopTrackingTouch(SeekBar bar) {
                    updateWhiteNoiseVolume(app, bar.getProgress() / 100.0);
                }
            });
            noiseCard.addView(seekBar);

            TextView closeNoise = buildPillButton(app, "返回专注计时", false, v -> {
                subPanel = SubPanel.NONE;
                refreshCurrentOverlayAsync(app);
            });
            LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(app, 48));
            closeLp.topMargin = dp(app, 4);
            closeNoise.setLayoutParams(closeLp);
            noiseCard.addView(closeNoise);
            center.addView(noiseCard);
        } else if (subPanel == SubPanel.WHITELIST) {
            LinearLayout wlCard = buildCard(app);
            wlCard.setPadding(dp(app, 14), dp(app, 14), dp(app, 14), dp(app, 14));
            LinearLayout.LayoutParams wlCardLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            wlCardLp.topMargin = dp(app, 10);
            wlCard.setLayoutParams(wlCardLp);

            TextView wlTitle = new TextView(app);
            wlTitle.setText("学习白名单应用（点击可直接打开）");
            wlTitle.setTextColor(Color.parseColor(COLOR_INK));
            wlTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
            wlTitle.setPadding(0, 0, 0, dp(app, 8));
            wlCard.addView(wlTitle);

            ScrollView scroll = new ScrollView(app);
            scroll.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(app, 210)));
            LinearLayout listBox = new LinearLayout(app);
            listBox.setOrientation(LinearLayout.VERTICAL);
            List<String[]> entries = snap.whitelistApps;
            if (entries.isEmpty()) {
                TextView empty = new TextView(app);
                empty.setText("暂未添加学习白名单应用");
                empty.setTextColor(Color.parseColor(COLOR_MUTED));
                empty.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
                listBox.addView(empty);
            } else {
                for (String[] pair : entries) {
                    String pkg = pair[0];
                    String label = pair[1];
                    TextView item = buildPillButton(app, "打开 " + label, false, v -> launchWhitelistedApp(app, pkg));
                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(app, 48));
                    lp.bottomMargin = dp(app, 8);
                    item.setLayoutParams(lp);
                    listBox.addView(item);
                }
            }
            scroll.addView(listBox);
            wlCard.addView(scroll);

            TextView closeWl = buildPillButton(app, "返回专注计时", false, v -> {
                subPanel = SubPanel.NONE;
                refreshCurrentOverlayAsync(app);
            });
            LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(app, 48));
            closeLp.topMargin = dp(app, 8);
            closeWl.setLayoutParams(closeLp);
            wlCard.addView(closeWl);
            center.addView(wlCard);
        } else if (subPanel == SubPanel.SAFETY) {
            LinearLayout safetyCard = buildCard(app);
            TextView safetyTitle = new TextView(app);
            safetyTitle.setText("需要退出或修复权限状态？");
            safetyTitle.setTextColor(Color.parseColor(COLOR_INK));
            safetyTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
            safetyTitle.setPadding(0, 0, 0, dp(app, 8));
            safetyCard.addView(safetyTitle);

            TextView safetyBody = new TextView(app);
            safetyBody.setText("如果遇到异常遮挡或需要撤回系统授权，可安全进入故障恢复，不影响已有学习记录。");
            safetyBody.setTextColor(Color.parseColor(COLOR_MUTED));
            safetyBody.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
            safetyBody.setPadding(0, 0, 0, dp(app, 12));
            safetyCard.addView(safetyBody);

            LinearLayout row = new LinearLayout(app);
            row.setOrientation(LinearLayout.HORIZONTAL);
            TextView backBtn = buildPillButton(app, "返回专注", false, v -> {
                subPanel = SubPanel.NONE;
                refreshCurrentOverlayAsync(app);
            });
            LinearLayout.LayoutParams b1 = new LinearLayout.LayoutParams(0, dp(app, 48), 1f);
            b1.rightMargin = dp(app, 10);
            backBtn.setLayoutParams(b1);
            row.addView(backBtn);

            TextView goRecovery = buildPillButton(app, "进入故障恢复", true, v -> openRoute(app, "/recovery"));
            LinearLayout.LayoutParams b2 = new LinearLayout.LayoutParams(0, dp(app, 48), 1f);
            goRecovery.setLayoutParams(b2);
            row.addView(goRecovery);
            safetyCard.addView(row);
            center.addView(safetyCard);
        }

        centerScroll.addView(center);
        root.addView(centerScroll);

        // Bottom controls (max 1 primary action + calm secondary links)
        LinearLayout bottom = new LinearLayout(app);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setGravity(Gravity.CENTER_HORIZONTAL);
        bottom.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        if (mode == Mode.NORMAL_FOCUS) {
            LinearLayout actionRow = new LinearLayout(app);
            actionRow.setOrientation(LinearLayout.HORIZONTAL);
            actionRow.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ));

            TextView pauseResume = buildPillButton(
                app,
                snap.paused ? "继续专注" : "暂停",
                true,
                v -> executeAction(app, snap.paused ? "focus_resume" : "focus_pause")
            );
            LinearLayout.LayoutParams p1 = new LinearLayout.LayoutParams(0, dp(app, 50), 1f);
            p1.rightMargin = dp(app, 10);
            pauseResume.setLayoutParams(p1);
            actionRow.addView(pauseResume);

            TextView endBtn;
            if (inRegretWindow) {
                endBtn = buildPillButton(app, "取消", false, v -> executeAction(app, "focus_cancel"));
            } else {
                endBtn = buildPillButton(app, "结束", false, v -> {
                    subPanel = SubPanel.CONFIRM_FINISH;
                    refreshCurrentOverlayAsync(app);
                });
            }
            LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(0, dp(app, 50), 1f);
            endBtn.setLayoutParams(p2);
            actionRow.addView(endBtn);
            bottom.addView(actionRow);

            TextView hint = new TextView(app);
            hint.setText(snap.leaveAppFail
                ? "轻看护已开启 · 亮屏离开超 10 秒将导致本轮养成失败（锁屏与通话不受影响）"
                : "轻看护已关闭 · 可切换其他应用，计时在后台继续");
            hint.setTextColor(Color.parseColor(COLOR_MUTED));
            hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
            hint.setGravity(Gravity.CENTER);
            hint.setPadding(0, dp(app, 12), 0, 0);
            bottom.addView(hint);
        } else {
            if (mode == Mode.BLOCKED_APP && snap.temporaryAccessAllowed && snap.temporaryRemaining > 0 && !snap.strictMode && !snap.isLock && !TextUtils.isEmpty(blockedPackage)) {
                TextView tempBtn = buildPillButton(
                    app,
                    app.getString(R.string.focus_block_temporary_access, resolveAppLabel(app, blockedPackage), snap.temporaryRemaining),
                    true,
                    v -> openTemporaryChoice(app, blockedPackage)
                );
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(app, 50));
                lp.bottomMargin = dp(app, 10);
                tempBtn.setLayoutParams(lp);
                bottom.addView(tempBtn);
            }

            if (!snap.whitelistApps.isEmpty() && subPanel != SubPanel.WHITELIST) {
                TextView wlBtn = buildPillButton(
                    app,
                    "白名单应用（" + snap.whitelistApps.size() + "）",
                    mode != Mode.BLOCKED_APP || !snap.temporaryAccessAllowed || snap.temporaryRemaining <= 0,
                    v -> {
                        subPanel = SubPanel.WHITELIST;
                        refreshCurrentOverlayAsync(app);
                    }
                );
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(app, 48));
                lp.bottomMargin = dp(app, 10);
                wlBtn.setLayoutParams(lp);
                bottom.addView(wlBtn);
            }

            if (!snap.strictMode && subPanel != SubPanel.CONFIRM_FINISH) {
                LinearLayout row = new LinearLayout(app);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
                if (!snap.isLock) {
                    TextView pauseResume = buildPillButton(
                        app,
                        snap.paused ? "继续专注" : "暂停",
                        false,
                        v -> executeAction(app, snap.paused ? "focus_resume" : "focus_pause")
                    );
                    LinearLayout.LayoutParams p1 = new LinearLayout.LayoutParams(0, dp(app, 48), 1f);
                    p1.rightMargin = dp(app, 10);
                    pauseResume.setLayoutParams(p1);
                    row.addView(pauseResume);
                }
                TextView endBtn;
                if (!snap.isLock && inRegretWindow) {
                    endBtn = buildPillButton(app, "取消", false, v -> executeAction(app, "focus_cancel"));
                } else {
                    endBtn = buildPillButton(app, "结束", false, v -> {
                        subPanel = SubPanel.CONFIRM_FINISH;
                        refreshCurrentOverlayAsync(app);
                    });
                }
                LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(0, dp(app, 48), 1f);
                endBtn.setLayoutParams(p2);
                row.addView(endBtn);
                LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                rowLp.bottomMargin = dp(app, 10);
                row.setLayoutParams(rowLp);
                bottom.addView(row);
            }

            TextView safetyLink = new TextView(app);
            safetyLink.setText("遇到问题？紧急与故障恢复");
            safetyLink.setTextColor(Color.parseColor(COLOR_MUTED));
            safetyLink.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
            safetyLink.setGravity(Gravity.CENTER);
            safetyLink.setMinimumHeight(dp(app, 48));
            safetyLink.setPadding(dp(app, 12), dp(app, 10), dp(app, 12), dp(app, 10));
            safetyLink.setOnClickListener(v -> {
                subPanel = subPanel == SubPanel.SAFETY ? SubPanel.NONE : SubPanel.SAFETY;
                refreshCurrentOverlayAsync(app);
            });
            bottom.addView(safetyLink);
        }

        root.addView(bottom);
        return root;
    }

    private static void executeAction(Context app, String actionKind) {
        WORKER.execute(() -> {
            try {
                FocusControl control = new FocusControl(app);
                if ("focus_pause".equals(actionKind)) {
                    control.focusAction("pause");
                } else if ("focus_resume".equals(actionKind)) {
                    control.focusAction("resume");
                } else if ("focus_cancel".equals(actionKind)) {
                    control.focusAction("cancel");
                } else if ("focus_finish".equals(actionKind)) {
                    JSONObject preObs = control.observeSessionState();
                    SessionSnapshot preSnap = extractSnapshot(app, preObs);
                    if (preSnap.active && !preSnap.isLock
                        && isInRegretWindow(preSnap.strictMode, preSnap.countdown, preSnap.elapsedMs)) {
                        control.focusAction("cancel");
                    } else {
                        control.focusAction("finish");
                    }
                } else if ("lock_finish".equals(actionKind)) {
                    control.lockAction("finish", true);
                }
                subPanel = SubPanel.NONE;
                JSONObject obs = control.observeSessionState();
                SessionSnapshot snap = extractSnapshot(app, obs);
                if (!snap.active) {
                    dismiss();
                } else {
                    renderAsync(app, obs, currentMode == Mode.BLOCKED_APP, currentMode == Mode.GUARD_PULLBACK, guardReasonLabel);
                }
                CatFocusPlugin.emitJsEvent("sessionChanged", "");
                MainActivity.refreshWindowState(app);
            } catch (Exception ignored) {
            }
        });
    }

    private static void selectWhiteNoiseTrack(Context app, String trackId) {
        WORKER.execute(() -> {
            try {
                String normalized = WhiteNoisePolicy.normalizeTrack(trackId);
                LocalStore store = LocalStore.get(app);
                synchronized (store) {
                    JSONObject data = store.read("data");
                    if (data == null) data = new JSONObject();
                    JSONObject prefs = data.optJSONObject("preferences");
                    if (prefs == null) {
                        prefs = new JSONObject();
                        data.put("preferences", prefs);
                    }
                    prefs.put("whiteNoise", normalized);
                    store.saveData(data, false);
                }
                WhiteNoisePlayer.getInstance(app).syncFromUserAction(app);
                subPanel = SubPanel.NONE;
                JSONObject obs = new FocusControl(app).observeSessionState();
                renderAsync(app, obs, currentMode == Mode.BLOCKED_APP, currentMode == Mode.GUARD_PULLBACK, guardReasonLabel);
                CatFocusPlugin.emitJsEvent("whiteNoiseResumed", "");
                CatFocusPlugin.emitJsEvent("sessionChanged", "");
            } catch (Exception ignored) {
            }
        });
    }

    private static void updateWhiteNoiseVolume(Context app, double rawVolume) {
        final double clamped = Math.round(WhiteNoisePolicy.clampVolume(rawVolume) * 100.0) / 100.0;
        WORKER.execute(() -> {
            try {
                LocalStore store = LocalStore.get(app);
                synchronized (store) {
                    JSONObject data = store.read("data");
                    if (data == null) data = new JSONObject();
                    JSONObject prefs = data.optJSONObject("preferences");
                    if (prefs == null) {
                        prefs = new JSONObject();
                        data.put("preferences", prefs);
                    }
                    prefs.put("whiteNoiseVolume", clamped);
                    store.saveData(data, false);
                }
                WhiteNoisePlayer.getInstance(app).syncFromStore(app);
                CatFocusPlugin.emitJsEvent("sessionChanged", "");
            } catch (Exception ignored) {
            }
        });
    }

    private static void openRoute(Context app, String route) {
        subPanel = SubPanel.NONE;
        safeRouteSuppressed = !route.startsWith("/focus") && !route.startsWith("/lock");
        dismiss();
        Intent intent = new Intent(app, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        if ("/recovery".equals(route) || "/emergency".equals(route)) {
            intent.putExtra("openRecovery", true);
        } else if ("/focus".equals(route)) {
            intent.putExtra("returnToFocus", true);
        } else if ("/lock".equals(route)) {
            intent.putExtra("returnToLock", true);
        }
        try {
            app.startActivity(intent);
        } catch (Exception ignored) {
        }
        CatFocusPlugin.emitJsEvent("overlayNavigate", route);
    }

    private static void launchWhitelistedApp(Context app, String pkg) {
        if (TextUtils.isEmpty(pkg)) return;
        try {
            Intent launch = app.getPackageManager().getLaunchIntentForPackage(pkg);
            if (launch == null) return;
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            yieldedWhitelistPackage = pkg;
            whitelistLaunchGraceUntilMs = safeUptimeMs() + WHITELIST_LAUNCH_GRACE_MS;
            mainForeground = false;
            subPanel = SubPanel.NONE;
            dismiss();
            app.startActivity(launch);
        } catch (Exception ignored) {
            whitelistLaunchGraceUntilMs = 0L;
            yieldedWhitelistPackage = "";
        }
    }

    private static void openTemporaryChoice(Context app, String targetPkg) {
        if (TextUtils.isEmpty(targetPkg)) return;
        subPanel = SubPanel.NONE;
        Intent intent = new Intent(app, FocusBlockActivity.class)
            .putExtra(FocusBlockActivity.TARGET_PACKAGE, targetPkg)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            dismiss();
            app.startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    private static SessionSnapshot extractSnapshot(Context app, JSONObject observation) {
        SessionSnapshot s = new SessionSnapshot();
        if (observation == null) return s;
        JSONObject lockObj = observation.optJSONObject("lock");
        JSONObject lockSession = lockObj == null ? null : lockObj.optJSONObject("session");
        JSONObject focusObj = observation.optJSONObject("focus");
        JSONObject focusSession = focusObj == null ? null : focusObj.optJSONObject("session");

        JSONObject session = lockSession != null ? lockSession : focusSession;
        if (session == null) return s;

        String state = session.optString("state", "");
        if ("finished".equals(state) || "cancelled".equals(state)) return s;

        s.active = true;
        s.isLock = lockSession != null || LockEngine.owns(session);
        s.title = session.optString("title", s.isLock ? "自主锁机" : "专注中");
        if (TextUtils.isEmpty(s.title)) s.title = s.isLock ? "自主锁机" : "专注中";
        String rawAnimal = session.isNull("animalId") ? "" : session.optString("animalId", "black-cat");
        s.animalId = (rawAnimal == null || rawAnimal.isEmpty() || "null".equals(rawAnimal)) ? "black-cat" : rawAnimal;
        String rawSkin = session.isNull("skinId") ? "" : session.optString("skinId", "default");
        s.skinId = (rawSkin == null || rawSkin.isEmpty() || "null".equals(rawSkin)) ? "default" : rawSkin;
        s.paused = "paused".equals(state);
        s.strictMode = session.optBoolean("strictMode", false);
        s.countdown = s.isLock || "countdown".equals(session.optString("mode", "countdown"));
        s.targetMs = session.optLong("targetMs", 0L);
        if (s.isLock) {
            s.remainingMs = lockObj != null && lockObj.has("remainingMs")
                ? Math.max(0L, lockObj.optLong("remainingMs"))
                : Math.max(0L, s.targetMs - session.optLong("elapsedMs", 0L));
            s.elapsedMs = Math.max(0L, s.targetMs - s.remainingMs);
        } else {
            s.elapsedMs = focusObj != null && focusObj.has("elapsedMs")
                ? Math.max(0L, focusObj.optLong("elapsedMs"))
                : session.optLong("elapsedMs", 0L);
            s.remainingMs = Math.max(0L, s.targetMs - s.elapsedMs);
        }

        JSONObject protection = session.optJSONObject("protection");
        boolean study = protection != null && Boolean.TRUE.equals(protection.opt("study"));
        boolean studyLocked = protection != null && Boolean.TRUE.equals(protection.opt("studyLocked"));
        s.studyOrLock = s.isLock || study || studyLocked;
        s.temporaryAccessAllowed = protection == null || protection.optBoolean("temporaryAccessAllowed", true);
        s.whitelistPackages = protection == null ? null : protection.optJSONArray("whitelist");
        s.whitelistApps = FocusProtection.resolveWhitelistApps(app, s.whitelistPackages);

        JSONObject tempAccess = session.optJSONObject("temporaryAccess");
        if (tempAccess != null) {
            s.temporaryRemaining = Math.max(0, 3 - tempAccess.optInt("used", 0));
        }
        boolean keepScreenOn = true;
        boolean leaveAppFail = true;
        String whiteNoiseTrack = "off";
        double whiteNoiseVolume = WhiteNoisePolicy.DEFAULT_VOLUME;
        try {
            JSONObject data = LocalStore.get(app).read("data");
            JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
            if (prefs != null) {
                keepScreenOn = prefs.optBoolean("keepScreenOn", true);
                leaveAppFail = prefs.optBoolean("leaveAppFail", true);
                whiteNoiseTrack = WhiteNoisePolicy.normalizeTrack(prefs.optString("whiteNoise", "off"));
                whiteNoiseVolume = WhiteNoisePolicy.clampVolume(
                    prefs.optDouble("whiteNoiseVolume", WhiteNoisePolicy.DEFAULT_VOLUME)
                );
            }
        } catch (Exception ignored) {
        }
        s.keepScreenOn = keepScreenOn;
        s.leaveAppFail = leaveAppFail;
        s.whiteNoiseTrack = whiteNoiseTrack;
        s.whiteNoiseVolume = whiteNoiseVolume;
        return s;
    }

    private static String resolveWhiteNoiseLabel(String trackId) {
        for (String[] pair : WHITE_NOISE_OPTIONS) {
            if (pair[0].equals(trackId)) return pair[1];
        }
        return "关闭";
    }

    private static String resolveAppLabel(Context context, String pkg) {
        if (TextUtils.isEmpty(pkg)) return "当前应用";
        try {
            PackageManager pm = context.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception ignored) {
            return pkg;
        }
    }

    private static String formatClock(long ms) {
        long totalSec = ms <= 0L ? 0L : (ms + 999L) / 1000L;
        long hours = totalSec / 3600L;
        long mins = (totalSec % 3600L) / 60L;
        long secs = totalSec % 60L;
        if (hours > 0) {
            return String.format(Locale.US, "%02d:%02d:%02d", hours, mins, secs);
        }
        return String.format(Locale.US, "%02d:%02d", mins, secs);
    }

    private static LinearLayout buildCard(Context app) {
        LinearLayout card = new LinearLayout(app);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(pillBg(Color.parseColor(COLOR_BG), dp(app, 20), dp(app, 1), Color.parseColor(COLOR_LINE)));
        card.setPadding(dp(app, 18), dp(app, 18), dp(app, 18), dp(app, 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(app, 20);
        card.setLayoutParams(lp);
        return card;
    }

    private static TextView buildPillButton(Context app, String label, boolean primary, View.OnClickListener click) {
        TextView btn = new TextView(app);
        btn.setText(label);
        btn.setGravity(Gravity.CENTER);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        btn.setSingleLine(true);
        btn.setEllipsize(TextUtils.TruncateAt.END);
        btn.setMinimumHeight(dp(app, 48));
        btn.setPadding(dp(app, 12), dp(app, 10), dp(app, 12), dp(app, 10));
        if (primary) {
            btn.setTextColor(Color.parseColor(COLOR_BG));
            btn.setBackground(pillBg(Color.parseColor(COLOR_INK), dp(app, 100), 0, 0));
        } else {
            btn.setTextColor(Color.parseColor(COLOR_INK));
            btn.setBackground(pillBg(Color.parseColor(COLOR_SURFACE), dp(app, 100), dp(app, 1), Color.parseColor(COLOR_LINE)));
        }
        btn.setOnClickListener(click);
        return btn;
    }

    private static TextView buildRadioPillButton(Context app, String label, boolean selected, View.OnClickListener click) {
        TextView btn = buildPillButton(app, label, selected, click);
        if (selected) {
            btn.setTextColor(Color.parseColor(COLOR_BG));
            btn.setBackground(pillBg(Color.parseColor(COLOR_INK), dp(app, 100), 0, 0));
        }
        return btn;
    }

    static Typeface resolveNunitoTypeface(Context context) {
        if (cachedNunitoTypeface != null) return cachedNunitoTypeface;
        if (nunitoLoadAttempted || context == null) return null;
        nunitoLoadAttempted = true;
        try {
            android.content.res.AssetManager assets = context.getApplicationContext().getAssets();
            if (assets != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    cachedNunitoTypeface = new Typeface.Builder(assets, "public/fonts/Nunito.ttf")
                        .setFontVariationSettings("'wght' 850")
                        .build();
                } else {
                    cachedNunitoTypeface = Typeface.createFromAsset(assets, "public/fonts/Nunito.ttf");
                }
            }
        } catch (Throwable ignored) {
            // Safe fallback in JVM unit tests or environments without bundled assets.
        }
        return cachedNunitoTypeface;
    }

    static int[] resolveAnimalPalette(String animalId, String skinId) {
        String id = animalId == null ? "black-cat" : animalId;
        String skin = skinId == null ? "default" : skinId;
        AnimalPalette palette = !"default".equals(skin) ? ANIMAL_PALETTES.get(id + ":" + skin) : null;
        if (palette == null) {
            palette = ANIMAL_PALETTES.get(id);
        }
        if (palette == null) {
            palette = ANIMAL_PALETTES.get("black-cat");
        }
        return palette.toArray();
    }

    private static final class PetGuardView extends View {
        private final String animalId;
        private final String skinId;
        private final boolean guardDoor;
        private final int stage;
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final RectF rect = new RectF();

        PetGuardView(
            Context context,
            String animalId,
            String skinId,
            boolean guardDoor,
            long elapsedMs,
            long targetMs,
            boolean countdown
        ) {
            super(context);
            this.animalId = animalId == null ? "black-cat" : animalId;
            this.skinId = skinId == null ? "default" : skinId;
            this.guardDoor = guardDoor;
            this.stage = resolvePetStage(countdown, elapsedMs, targetMs);
            fill.setStyle(Paint.Style.FILL);
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeCap(Paint.Cap.ROUND);
            stroke.setStrokeJoin(Paint.Join.ROUND);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float w = getWidth();
            float h = getHeight();
            if (w <= 0f || h <= 0f) return;

            float size = Math.min(w, h);
            canvas.save();
            canvas.translate((w - size) / 2f, (h - size) / 2f);
            float s = size / 120f;
            canvas.scale(s, s);

            int[] palette = resolveAnimalPalette(animalId, skinId);
            int bodyColor = palette[0];
            int bellyColor = palette[1];
            int accentColor = palette[2];
            int inkColor = 0xFF222222;
            boolean lightBody = bodyColor == 0xFFFFFFFF;

            if (guardDoor) {
                // Minimal doorway arch behind the guarding animal
                rect.set(16f, 8f, 104f, 108f);
                fill.setColor(0xFFF5F5F5);
                canvas.drawRoundRect(rect, 44f, 44f, fill);
                stroke.setColor(0xFFEAEAEA);
                stroke.setStrokeWidth(2f);
                canvas.drawRoundRect(rect, 44f, 44f, stroke);

                fill.setColor(0xFFEF4E36);
                rect.set(30f, 106f, 90f, 110f);
                canvas.drawRoundRect(rect, 2f, 2f, fill);
            }

            // Ground shadow scales with growth stage
            fill.setColor(0x14000000);
            float shadowHalfW = stage == 1 ? 22f : stage == 2 ? 28f : 32f;
            rect.set(60f - shadowHalfW, 100f, 60f + shadowHalfW, 111f);
            canvas.drawOval(rect, fill);

            // Progressive growth scaling anchored at feet (60, 104)
            float stageScale = stage == 1 ? 0.80f : stage == 2 ? 0.91f : 1.0f;
            canvas.scale(stageScale, stageScale, 60f, 104f);

            // Back accessories grow in stages 2 and 3
            if (stage >= 2 && ("black-cat".equals(animalId) || "orange-cat".equals(animalId)
                || "angel-cat".equals(animalId) || "black-dragon".equals(animalId))) {
                stroke.setColor(inkColor);
                stroke.setStrokeWidth(7.5f);
                path.reset();
                path.moveTo(82f, 90f);
                if (stage == 2) {
                    path.quadTo(96f, 84f, 94f, 70f);
                } else {
                    path.quadTo(103f, 82f, 97f, 54f);
                    path.quadTo(94f, 44f, 88f, 49f);
                }
                canvas.drawPath(path, stroke);
            }
            if (stage >= 2 && ("angel-cat".equals(animalId) || "flying-pig".equals(animalId) || "black-dragon".equals(animalId))) {
                fill.setColor("angel-cat".equals(animalId) ? bellyColor : 0xFF85858B);
                float wingSpread = stage == 2 ? 4f : 0f;
                rect.set(18f + wingSpread, 58f, 38f, 80f);
                canvas.drawOval(rect, fill);
                rect.set(82f, 58f, 102f - wingSpread, 80f);
                canvas.drawOval(rect, fill);
                stroke.setColor(inkColor);
                stroke.setStrokeWidth(2f);
                rect.set(18f + wingSpread, 58f, 38f, 80f);
                canvas.drawOval(rect, stroke);
                rect.set(82f, 58f, 102f - wingSpread, 80f);
                canvas.drawOval(rect, stroke);
            }
            if (stage == 3 && "angel-cat".equals(animalId)) {
                stroke.setColor(accentColor);
                stroke.setStrokeWidth(3f);
                rect.set(42f, 10f, 78f, 20f);
                canvas.drawOval(rect, stroke);
            }
            if (stage >= 2 && "light-deer".equals(animalId)) {
                stroke.setColor(inkColor);
                stroke.setStrokeWidth(3f);
                canvas.drawLine(42f, 30f, 32f, 14f, stroke);
                canvas.drawLine(78f, 30f, 88f, 14f, stroke);
                if (stage == 3) {
                    canvas.drawLine(36f, 22f, 44f, 16f, stroke);
                    canvas.drawLine(84f, 22f, 76f, 16f, stroke);
                    fill.setColor(accentColor);
                    canvas.drawCircle(32f, 14f, 3.2f, fill);
                    canvas.drawCircle(88f, 14f, 3.2f, fill);
                }
            }

            // Ears / horns / crest
            fill.setColor(bodyColor);
            stroke.setColor(inkColor);
            stroke.setStrokeWidth(2.4f);
            if ("black-cat".equals(animalId) || "orange-cat".equals(animalId)
                || "angel-cat".equals(animalId) || "black-dragon".equals(animalId)) {
                path.reset();
                path.moveTo(32f, 46f);
                path.lineTo(31f, 19f);
                path.lineTo(52f, 34f);
                path.close();
                canvas.drawPath(path, fill);
                canvas.drawPath(path, stroke);

                path.reset();
                path.moveTo(88f, 46f);
                path.lineTo(89f, 19f);
                path.lineTo(68f, 34f);
                path.close();
                canvas.drawPath(path, fill);
                canvas.drawPath(path, stroke);
                if ("black-dragon".equals(animalId)) {
                    fill.setColor(accentColor);
                    canvas.drawCircle(34f, 22f, 3f, fill);
                    canvas.drawCircle(86f, 22f, 3f, fill);
                }
            } else if ("patch-bear".equals(animalId) || "flying-pig".equals(animalId)) {
                canvas.drawCircle(37f, 32f, 9f, fill);
                canvas.drawCircle(37f, 32f, 9f, stroke);
                canvas.drawCircle(83f, 32f, 9f, fill);
                canvas.drawCircle(83f, 32f, 9f, stroke);
            } else if ("balloon-dog".equals(animalId) || "light-deer".equals(animalId)) {
                rect.set(24f, 36f, 38f, 62f);
                canvas.drawOval(rect, fill);
                canvas.drawOval(rect, stroke);
                rect.set(82f, 36f, 96f, 62f);
                canvas.drawOval(rect, fill);
                canvas.drawOval(rect, stroke);
            } else if ("yellow-chick".equals(animalId) || "green-parrot".equals(animalId)) {
                fill.setColor(accentColor);
                canvas.drawCircle(57f, 22f, 5.5f, fill);
                canvas.drawCircle(64f, 24f, 4.5f, fill);
            }

            // Body
            fill.setColor(bodyColor);
            rect.set(36f, 62f, 84f, 103f);
            canvas.drawRoundRect(rect, 22f, 20f, fill);
            if (lightBody) {
                stroke.setColor(inkColor);
                stroke.setStrokeWidth(2.4f);
                canvas.drawRoundRect(rect, 22f, 20f, stroke);
            }
            fill.setColor(bellyColor);
            rect.set(47f, 73f, 73f, 98f);
            canvas.drawOval(rect, fill);

            // Head
            fill.setColor(bodyColor);
            if ("pixel-bird".equals(animalId)) {
                rect.set(33f, 26f, 87f, 74f);
                canvas.drawRoundRect(rect, 10f, 10f, fill);
                if (lightBody) {
                    canvas.drawRoundRect(rect, 10f, 10f, stroke);
                }
            } else {
                rect.set(33f, 26f, 87f, 74f);
                canvas.drawOval(rect, fill);
                if (lightBody) {
                    stroke.setColor(inkColor);
                    stroke.setStrokeWidth(2.4f);
                    canvas.drawOval(rect, stroke);
                }
            }

            // Collar / Scarf accent (stage 2+) & Guard badge bell on collar (stage 3)
            if (stage >= 2) {
                fill.setColor(accentColor);
                rect.set(44f, 68f, 76f, 73f);
                canvas.drawRoundRect(rect, 2.5f, 2.5f, fill);
            }

            // Big white round eyes + dark pupils (signature AppMark / PetGraphic look)
            fill.setColor(0xFFFFFFFF);
            canvas.drawCircle(48f, 49f, 8f, fill);
            canvas.drawCircle(72f, 49f, 8f, fill);
            stroke.setColor(inkColor);
            stroke.setStrokeWidth(1.6f);
            canvas.drawCircle(48f, 49f, 8f, stroke);
            canvas.drawCircle(72f, 49f, 8f, stroke);

            fill.setColor(inkColor);
            canvas.drawCircle(50f, 49f, 3.8f, fill);
            canvas.drawCircle(70f, 49f, 3.8f, fill);

            if ("patch-bear".equals(animalId)) {
                fill.setColor(accentColor);
                canvas.drawCircle(72f, 49f, 9f, fill);
            }

            // Beak / Snout / Nose accent
            if ("yellow-chick".equals(animalId) || "white-goose".equals(animalId)
                || "pixel-bird".equals(animalId) || "green-parrot".equals(animalId)) {
                fill.setColor(accentColor);
                path.reset();
                path.moveTo(55f, 55f);
                path.lineTo(65f, 55f);
                path.lineTo(60f, 62f);
                path.close();
                canvas.drawPath(path, fill);
            } else if ("flying-pig".equals(animalId)) {
                fill.setColor(accentColor);
                rect.set(52f, 54f, 68f, 63f);
                canvas.drawOval(rect, fill);
            } else if ("light-deer".equals(animalId)) {
                fill.setColor(accentColor);
                canvas.drawCircle(60f, 58f, 4f, fill);
            }

            if (stage == 3) {
                // Guard badge bell on collar
                fill.setColor(0xFFFFFFFF);
                canvas.drawCircle(60f, 74f, 3.5f, fill);
                stroke.setColor(inkColor);
                stroke.setStrokeWidth(1.4f);
                canvas.drawCircle(60f, 74f, 3.5f, stroke);

                // Front paws
                fill.setColor(bodyColor);
                rect.set(43f, 96f, 55f, 104f);
                canvas.drawOval(rect, fill);
                rect.set(65f, 96f, 77f, 104f);
                canvas.drawOval(rect, fill);
            }

            canvas.restore();
        }
    }

    private static GradientDrawable pillBg(int fillColor, int radiusPx, int strokePx, int strokeColor) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fillColor);
        d.setCornerRadius(radiusPx);
        if (strokePx > 0) {
            d.setStroke(strokePx, strokeColor);
        }
        return d;
    }

    private static int dp(Context context, int dp) {
        return Math.round(dp * context.getResources().getDisplayMetrics().density);
    }

    private static final class SessionSnapshot {
        boolean active;
        boolean isLock;
        boolean studyOrLock;
        boolean strictMode;
        boolean paused;
        boolean countdown;
        boolean keepScreenOn = true;
        boolean leaveAppFail = true;
        boolean temporaryAccessAllowed = true;
        long targetMs;
        long elapsedMs;
        long remainingMs;
        int temporaryRemaining;
        String title = "";
        String animalId = "black-cat";
        String skinId = "default";
        String whiteNoiseTrack = "off";
        double whiteNoiseVolume = WhiteNoisePolicy.DEFAULT_VOLUME;
        JSONArray whitelistPackages;
        List<String[]> whitelistApps = new java.util.ArrayList<>();
    }
}
