package com.xiaomao.focus;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.Intent;
import android.view.View;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CatFocusPlugin.class);
        registerPlugin(AppUpdatesPlugin.class);
        super.onCreate(savedInstanceState);
        // Android stretches the entire WebView at scroll edges, including fixed navigation.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getBooleanExtra("returnToFocus", false) && getBridge() != null)
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('focus-return-request'))", null));
        if (intent.getBooleanExtra("openRecovery", false) && getBridge() != null)
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('recovery-return-request'))", null));
        if (intent.getBooleanExtra("returnToLock", false) && getBridge() != null)
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('lock-return-request'))", null));
    }
}
