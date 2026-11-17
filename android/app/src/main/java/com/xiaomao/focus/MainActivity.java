package com.xiaomao.focus;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.Intent;
import android.view.View;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        WallpaperLifecycle.record(this, "activity_create", false, null);
        restrictOrdinaryEntry(getIntent());
        registerPlugin(CatFocusPlugin.class);
        registerPlugin(AppUpdatesPlugin.class);
        super.onCreate(savedInstanceState);
        // Android stretches the entire WebView at scroll edges, including fixed navigation.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);
    }
    @Override protected void onNewIntent(Intent intent) {
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
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;
        FocusProtection.clearSettingsAuthorization();
        observeNavigationFocus();
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
}
