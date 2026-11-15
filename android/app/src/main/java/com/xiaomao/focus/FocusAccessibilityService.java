package com.xiaomao.focus;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;
import org.json.JSONObject;

public class FocusAccessibilityService extends AccessibilityService {
    private static volatile boolean running;
    static boolean connected() { return running; }
    @Override protected void onServiceConnected() { running = true; }
    @Override public boolean onUnbind(Intent intent) { running = false; return super.onUnbind(intent); }
    @Override public void onDestroy() { running = false; super.onDestroy(); }
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
        } catch (Exception ignored) {
            // A failed observation never traps the user with a stale cached session.
        }
    }
}
