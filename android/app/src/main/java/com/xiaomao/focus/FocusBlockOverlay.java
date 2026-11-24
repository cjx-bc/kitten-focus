package com.xiaomao.focus;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;

/**
 * Full-screen SYSTEM_ALERT_WINDOW fallback overlay when an OEM denies background activity start.
 * Always managed on the main looper and cleared as soon as FocusBlockActivity, a whitelisted app,
 * session end, or recovery takes over.
 */
final class FocusBlockOverlay {
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static WindowManager windowManager;
    private static View overlayView;
    private static Context appContext;
    private static TextView titleView;
    private static TextView clockView;
    private static TextView stateView;
    private static Button temporaryButton;
    private static String blockedPackage = "";
    private static boolean lockSession;
    private static final Runnable REFRESH = new Runnable() {
        @Override
        public void run() {
            if (overlayView == null) return;
            renderCurrent();
            if (overlayView != null) {
                MAIN.postDelayed(this, 1000L);
            }
        }
    };

    private FocusBlockOverlay() {}

    static boolean isShowing() {
        return overlayView != null;
    }

    static void show(Context context, JSONObject observation, String targetPackage) {
        if (context == null || targetPackage == null || targetPackage.isEmpty()) return;
        Context app = context.getApplicationContext();
        MAIN.post(() -> showOnMain(app, observation, targetPackage));
    }

    static void dismiss() {
        MAIN.post(FocusBlockOverlay::dismissOnMain);
    }

    private static void showOnMain(Context app, JSONObject initialObservation, String targetPackage) {
        if (FocusBlockActivity.isVisible() || !AppUsageGuard.hasOverlayPermission(app)) {
            dismissOnMain();
            return;
        }
        appContext = app;
        blockedPackage = targetPackage;
        if (overlayView == null) {
            WindowManager wm = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
            if (wm == null) return;
            View created = buildView(app);
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                type,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            );
            params.gravity = Gravity.TOP | Gravity.START;
            try {
                wm.addView(created, params);
                windowManager = wm;
                overlayView = created;
                FocusProtection.executionSucceeded();
            } catch (RuntimeException error) {
                FocusProtection.executionFailed(error);
                dismissOnMain();
                return;
            }
        }
        renderObservation(initialObservation);
        MAIN.removeCallbacks(REFRESH);
        MAIN.postDelayed(REFRESH, 1000L);
    }

    private static void dismissOnMain() {
        MAIN.removeCallbacks(REFRESH);
        View view = overlayView;
        WindowManager wm = windowManager;
        overlayView = null;
        windowManager = null;
        titleView = null;
        clockView = null;
        stateView = null;
        temporaryButton = null;
        blockedPackage = "";
        if (view != null && wm != null) {
            try {
                wm.removeViewImmediate(view);
            } catch (RuntimeException ignored) {
                try {
                    wm.removeView(view);
                } catch (RuntimeException ignored2) {
                    // Window may already be detached during process teardown.
                }
            }
        }
    }

    private static View buildView(Context app) {
        ScrollView scroll = new ScrollView(app) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent event) {
                if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                    returnToFocus();
                    return true;
                }
                return super.dispatchKeyEvent(event);
            }
        };
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.WHITE);
        scroll.setFitsSystemWindows(true);
        scroll.setFocusableInTouchMode(true);
        scroll.requestFocus();

        LinearLayout content = new LinearLayout(app);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(app, 28), dp(app, 48), dp(app, 28), dp(app, 40));

        content.addView(text(app, "现在，把时间留给专注", 22));
        titleView = text(app, "", 18);
        clockView = text(app, "", 52);
        stateView = text(app, "", 14);
        content.addView(titleView);
        content.addView(clockView);
        content.addView(stateView);

        TextView explanation = text(app, "此应用不在本轮白名单中。\n电话、输入法和必要系统交互仍可使用。", 14);
        content.addView(explanation);

        Button back = new Button(app);
        back.setText("返回当前会话");
        back.setTextColor(Color.WHITE);
        back.setBackgroundTintList(ColorStateList.valueOf(Color.rgb(34, 34, 34)));
        back.setOnClickListener(view -> returnToFocus());
        LinearLayout.LayoutParams backParams = new LinearLayout.LayoutParams(-1, dp(app, 56));
        backParams.topMargin = dp(app, 28);
        content.addView(back, backParams);

        temporaryButton = new Button(app);
        temporaryButton.setText("临时打开应用");
        temporaryButton.setOnClickListener(view -> openTemporaryChoice());
        LinearLayout.LayoutParams tempParams = new LinearLayout.LayoutParams(-1, dp(app, 52));
        tempParams.topMargin = dp(app, 12);
        content.addView(temporaryButton, tempParams);

        scroll.addView(content);
        return scroll;
    }

    private static void renderCurrent() {
        Context app = appContext;
        if (app == null || overlayView == null) return;
        try {
            JSONObject observation = new FocusControl(app).observeControl();
            renderObservation(observation);
        } catch (Exception ignored) {
            dismissOnMain();
        }
    }

    private static void renderObservation(JSONObject observation) {
        Context app = appContext;
        if (app == null || overlayView == null || observation == null) {
            dismissOnMain();
            return;
        }
        if (FocusBlockActivity.isVisible() || observation.optBoolean("needsReconcile")) {
            dismissOnMain();
            return;
        }
        String owner = observation.optString("owner");
        if (!"focus".equals(owner) && !"lock".equals(owner)) {
            dismissOnMain();
            return;
        }
        JSONObject snapshot = observation.optJSONObject("lock".equals(owner) ? "lock" : "focus");
        JSONObject session = snapshot == null ? null : snapshot.optJSONObject("session");
        JSONObject protection = session == null ? null : session.optJSONObject("protection");
        if (protection == null || !protection.optBoolean("study") || protection.optBoolean("applicationsWithdrawn")) {
            dismissOnMain();
            return;
        }
        if (!blockedPackage.isEmpty() && !FocusProtection.shouldBlock(app, observation, blockedPackage, "")) {
            dismissOnMain();
            return;
        }

        lockSession = LockEngine.owns(session);
        boolean strict = session.optBoolean("strictMode") && "countdown".equals(session.optString("mode"));
        boolean tempAllowed = protection.optBoolean("temporaryAccessAllowed", true);
        JSONObject grant = session.optJSONObject("temporaryAccess");
        int remaining = grant == null ? 3 : grant.optInt("remainingUses");

        if (temporaryButton != null) {
            temporaryButton.setVisibility(strict || lockSession || !tempAllowed ? View.GONE : View.VISIBLE);
            temporaryButton.setEnabled(remaining > 0 && !blockedPackage.isEmpty());
            temporaryButton.setText(app.getString(R.string.focus_block_temporary_access, appLabel(app, blockedPackage), remaining));
        }

        if (titleView != null) {
            titleView.setText(session.optString("title"));
        }
        if (clockView != null) {
            long elapsed = snapshot.optLong("elapsedMs");
            long ms = lockSession
                ? snapshot.optLong("remainingMs")
                : "countdown".equals(session.optString("mode"))
                    ? Math.max(0L, session.optLong("targetMs") - elapsed)
                    : elapsed;
            String formatted = FocusBlockActivity.formatClock(ms);
            clockView.setTextSize(formatted.length() > 5 ? 40 : 52);
            clockView.setText(formatted);
        }
        if (stateView != null) {
            String description = lockSession
                ? (strict ? "严格锁机保护中 · 到期自动结束" : "普通锁机保护中 · 可返回确认解除")
                : strict
                    ? "严格倒计时 · 不可临时放行"
                    : "paused".equals(session.optString("state"))
                        ? "计时已暂停 · 应用限制继续"
                        : "本轮学霸模式保护中";
            if (!strict && grant != null && grant.optLong("remainingMs") > 0) {
                description += "\n正在放行 " + grant.optString("targetLabel")
                    + " · 剩余 " + (grant.optLong("remainingMs") + 999) / 1000 + " 秒";
            }
            stateView.setText(description);
        }
    }

    private static void returnToFocus() {
        Context app = appContext;
        boolean wasLock = lockSession;
        dismissOnMain();
        if (app == null) return;
        try {
            Intent intent = new Intent(app, MainActivity.class)
                .putExtra(wasLock ? "returnToLock" : "returnToFocus", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            app.startActivity(intent);
        } catch (RuntimeException ignored) {
        }
    }

    private static void openTemporaryChoice() {
        Context app = appContext;
        String pkg = blockedPackage;
        dismissOnMain();
        if (app == null || pkg.isEmpty()) return;
        try {
            app.startActivity(
                new Intent(app, FocusBlockActivity.class)
                    .putExtra(FocusBlockActivity.TARGET_PACKAGE, pkg)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            );
        } catch (RuntimeException ignored) {
        }
    }

    private static String appLabel(Context app, String packageName) {
        try {
            PackageManager pm = app.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString();
        } catch (Exception ignored) {
            return packageName;
        }
    }

    private static int dp(Context app, int value) {
        return Math.round(value * app.getResources().getDisplayMetrics().density);
    }

    private static TextView text(Context app, String value, int size) {
        TextView view = new TextView(app);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(Color.rgb(34, 34, 34));
        view.setGravity(Gravity.CENTER);
        view.setPadding(0, dp(app, 12), 0, dp(app, 12));
        return view;
    }
}
