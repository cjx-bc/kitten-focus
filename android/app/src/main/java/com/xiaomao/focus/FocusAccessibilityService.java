package com.xiaomao.focus;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.Build;
import android.view.accessibility.AccessibilityEvent;
import org.json.JSONObject;

public class FocusAccessibilityService extends AccessibilityService {
    private static volatile boolean running;
    static boolean connected() { return running; }
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
    @Override protected void onServiceConnected() { running = true; FocusProtection.executionSucceeded(); FocusProtection.invalidateNecessary(); }
    @Override public boolean onUnbind(Intent intent) { running = false; return super.onUnbind(intent); }
    @Override public void onDestroy() { running = false; unregisterReceiver(changes); super.onDestroy(); }
    @Override public void onInterrupt() { }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            || event.getPackageName() == null) return;
        try {
            JSONObject observation = new FocusControl(this).observeControl();
            if (!FocusProtection.shouldBlock(this, observation, event.getPackageName().toString(),
                event.getClassName() == null ? "" : event.getClassName().toString())) return;
            startActivity(new Intent(this, FocusBlockActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            FocusProtection.executionSucceeded();
        } catch (Exception error) {
            FocusProtection.executionFailed(error);
            // A failed observation never traps the user with a stale cached session.
        }
    }
}
