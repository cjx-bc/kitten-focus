package com.xiaomao.focus;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.webkit.JavascriptInterface;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private SplashCoordinator splashCoordinator;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        WallpaperLifecycle.record(this, "activity_create", false, null);
        restrictOrdinaryEntry(getIntent());
        splashCoordinator = new SplashCoordinator(
            SystemClock.elapsedRealtime(),
            isFastEntry(getIntent()),
            isReducedMotion()
        );
        splashScreen.setKeepOnScreenCondition(
            () -> splashCoordinator.shouldKeepOnScreen(SystemClock.elapsedRealtime())
        );
        splashScreen.setOnExitAnimationListener(this::animateSplashExit);
        registerPlugin(CatFocusPlugin.class);
        registerPlugin(AppUpdatesPlugin.class);
        super.onCreate(savedInstanceState);
        // Android stretches the entire WebView at scroll edges, including fixed navigation.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
            getBridge().getWebView().setVerticalScrollBarEnabled(false);
            getBridge().getWebView().setHorizontalScrollBarEnabled(false);
            getBridge().getWebView().addJavascriptInterface(new SplashBridge(), "KittenSplash");
        }
        FocusNotificationListener.rebindIfAuthorized(this);
    }

    private static volatile MainActivity activeInstance;
    private static volatile String currentRoutePath = "/";
    private volatile boolean resumed = false;

    static void updateRouteState(android.content.Context context, String routePath) {
        currentRoutePath = routePath == null ? "/" : routePath;
        FocusBlockOverlay.updateRouteState(context, currentRoutePath);
        MainActivity activity = activeInstance;
        if (activity != null) {
            activity.runOnUiThread(activity::applyImmersiveFocusIfNeeded);
        }
    }

    static void refreshWindowState(android.content.Context context) {
        MainActivity activity = activeInstance;
        if (activity != null) {
            activity.runOnUiThread(activity::applyImmersiveFocusIfNeeded);
        }
        if (context != null) {
            FocusBlockOverlay.refreshKeepScreenOn(context);
        }
    }

    static boolean shouldKeepScreenOn(JSONObject data, JSONObject activeSession, JSONObject restSession) {
        JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
        if (prefs != null && !prefs.optBoolean("keepScreenOn", true)) {
            return false;
        }
        boolean focusRunning = activeSession != null
            && !LockEngine.owns(activeSession)
            && "running".equals(activeSession.optString("state"));
        boolean restRunning = restSession != null
            && "running".equals(restSession.optString("state"));
        return focusRunning || restRunning;
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        FocusBlockOverlay.onMainActivityLeftForeground(this);
    }

    @Override
    public void onPause() {
        resumed = false;
        FocusBlockOverlay.onMainActivityLeftForeground(this);
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        resumed = true;
        activeInstance = this;
        FocusAccessibilityService.cancelPullbackPulse();
        FocusBlockOverlay.onMainActivityFocused(this);
        FocusNotificationListener.rebindIfAuthorized(this);
        applyImmersiveFocusIfNeeded();
    }

    private void animateSplashExit(SplashScreenViewProvider splashScreenView) {
        if (splashCoordinator != null && !splashCoordinator.shouldAnimateExit()) {
            splashScreenView.remove();
            return;
        }
        View root = splashScreenView.getView();
        ObjectAnimator fadeOut = ObjectAnimator.ofFloat(root, View.ALPHA, 1f, 0f);
        AnimatorSet set = new AnimatorSet();
        View iconView = null;
        try {
            iconView = splashScreenView.getIconView();
        } catch (Throwable ignored) {
            // Pre-API 31 compat or OEM splash wrappers may not expose an icon view.
        }
        if (iconView != null) {
            float liftPx = -8f * getResources().getDisplayMetrics().density;
            set.playTogether(
                fadeOut,
                ObjectAnimator.ofFloat(iconView, View.SCALE_X, 1f, 1.06f),
                ObjectAnimator.ofFloat(iconView, View.SCALE_Y, 1f, 1.06f),
                ObjectAnimator.ofFloat(iconView, View.TRANSLATION_Y, 0f, liftPx)
            );
        } else {
            set.play(fadeOut);
        }
        set.setDuration(SplashCoordinator.EXIT_FADE_MS);
        set.setInterpolator(new DecelerateInterpolator());
        set.addListener(new AnimatorListenerAdapter() {
            private boolean removed;

            @Override
            public void onAnimationEnd(Animator animation) {
                if (!removed) {
                    removed = true;
                    splashScreenView.remove();
                }
            }

            @Override
            public void onAnimationCancel(Animator animation) {
                if (!removed) {
                    removed = true;
                    splashScreenView.remove();
                }
            }
        });
        set.start();
    }

    private boolean isFastEntry(Intent intent) {
        if (intent != null && (intent.getBooleanExtra("returnToFocus", false)
            || intent.getBooleanExtra("returnToLock", false)
            || intent.getBooleanExtra("openRecovery", false))) {
            return true;
        }
        try {
            Object owner = new FocusControl(this).observeControl().opt("owner");
            return owner != null && owner != JSONObject.NULL && !owner.toString().isEmpty();
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isReducedMotion() {
        try {
            return Settings.Global.getFloat(
                getContentResolver(),
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1.0f
            ) == 0.0f;
        } catch (Exception ignored) {
            return false;
        }
    }

    private final class SplashBridge {
        @JavascriptInterface
        public void notifyReady() {
            if (splashCoordinator != null) {
                splashCoordinator.markWebReady();
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        restrictOrdinaryEntry(intent);
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getBooleanExtra("returnToFocus", false) && getBridge() != null)
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('focus-return-request'))", null));
        if (intent.getBooleanExtra("returnToFocus", false)) {
            // A transient launcher surface can keep this Activity focused throughout
            // onNewIntent. Sample the actual OS focus after its transition settles;
            // raising the task or receiving the intent alone never confirms success.
            View decor = getWindow().getDecorView();
            for (long delay : new long[]{100, 400, 1000}) decor.postDelayed(() -> {
                if (!isFinishing() && !isDestroyed() && decor.hasWindowFocus()) observeNavigationFocus();
            }, delay);
        }
        if (intent.getBooleanExtra("openRecovery", false) && getBridge() != null)
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('recovery-return-request'))", null));
        if (intent.getBooleanExtra("returnToLock", false) && getBridge() != null)
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('lock-return-request'))", null));
    }

    private void restrictOrdinaryEntry(Intent intent) {
        if (intent == null) return;
        try {
            if ("/lock".equals(new FocusControl(this).resolveMainEntry("/tasks").optString("path")))
                intent.putExtra("returnToLock", true);
        } catch (Exception ignored) {
            // The Vue guard retries through the public bridge; do not invent another owner.
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus || !resumed) return;
        activeInstance = this;
        FocusAccessibilityService.cancelPullbackPulse();
        FocusBlockOverlay.onMainActivityWindowFocused(this);
        FocusProtection.clearSettingsAuthorization();
        observeNavigationFocus();
        applyImmersiveFocusIfNeeded();
    }

    private void applyImmersiveFocusIfNeeded() {
        applyKeepScreenOnIfNeeded();
        try {
            androidx.core.view.WindowInsetsControllerCompat controller =
                androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller == null) return;
            boolean focusRoute = currentRoutePath.startsWith("/focus") || currentRoutePath.startsWith("/lock");
            boolean activeSession = LocalStore.get(this).read("active") != null;
            if (focusRoute && activeSession && !FocusBlockOverlay.canAttachOverlay(this)) {
                controller.setSystemBarsBehavior(
                    androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
                controller.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            } else {
                controller.show(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            }
        } catch (Exception ignored) {
        }
    }

    private void applyKeepScreenOnIfNeeded() {
        try {
            LocalStore store = LocalStore.get(this);
            boolean keep = shouldKeepScreenOn(
                store.read("data"),
                store.read("active"),
                store.read("rest")
            );
            if (keep) {
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        } catch (Exception ignored) {
        }
    }

    private void observeNavigationFocus() {
        try {
            // Transient Overview can leave this Activity resumed and omit a second
            // accessibility state event. Actual window focus is independent OS evidence.
            new FocusControl(this).navigationWindow(getPackageName(), getClass().getName());
            new FocusControl(this).antiCloseWindow(getPackageName(), getClass().getName());
        } catch (Exception ignored) {
            // A missing confirmation remains pending/failed; never infer a successful return.
        }
    }

    @Override
    public void onDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        if (splashCoordinator != null) {
            splashCoordinator.markWebReady();
        }
        super.onDestroy();
    }
}
