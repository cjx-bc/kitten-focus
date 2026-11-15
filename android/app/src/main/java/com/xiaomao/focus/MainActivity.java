package com.xiaomao.focus;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
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
}
