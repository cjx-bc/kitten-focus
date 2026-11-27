package com.xiaomao.focus;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FocusNotificationListenerRebindTest {
    @Test
    public void requestsRebindWhenAuthorizedAndDisconnectedOnSupportedSdk() {
        assertTrue(FocusNotificationListener.shouldRequestRebind(24, true, false));
        assertTrue(FocusNotificationListener.shouldRequestRebind(35, true, false));
    }

    @Test
    public void skipsRebindBelowNougat() {
        assertFalse(FocusNotificationListener.shouldRequestRebind(23, true, false));
    }

    @Test
    public void skipsRebindWhenNotAuthorized() {
        assertFalse(FocusNotificationListener.shouldRequestRebind(35, false, false));
    }

    @Test
    public void skipsRebindWhenAlreadyConnected() {
        assertFalse(FocusNotificationListener.shouldRequestRebind(35, true, true));
    }

    @Test
    public void throttlesRebindWithinCooldownWindow() {
        long t0 = 5_000L;
        assertTrue(FocusNotificationListener.shouldRequestRebind(35, true, false, t0, 0L));
        assertFalse(FocusNotificationListener.shouldRequestRebind(35, true, false, t0 + 1_000L, t0));
        assertFalse(FocusNotificationListener.shouldRequestRebind(35, true, false, t0 + FocusNotificationListener.REBIND_COOLDOWN_MS - 1L, t0));
        assertTrue(FocusNotificationListener.shouldRequestRebind(35, true, false, t0 + FocusNotificationListener.REBIND_COOLDOWN_MS, t0));
        assertFalse(FocusNotificationListener.shouldRequestRebind(35, true, true, t0 + FocusNotificationListener.REBIND_COOLDOWN_MS, 0L));
        assertFalse(FocusNotificationListener.shouldRequestRebind(35, false, false, t0 + FocusNotificationListener.REBIND_COOLDOWN_MS, 0L));
    }

    @Test
    public void componentToggleRequiresSupportedSdkAuthorizationAndDisconnection() {
        long now = 5_000L;
        assertFalse(FocusNotificationListener.shouldToggleComponentRebind(23, true, false, now, 0L));
        assertFalse(FocusNotificationListener.shouldToggleComponentRebind(24, false, false, now, 0L));
        assertFalse(FocusNotificationListener.shouldToggleComponentRebind(24, true, true, now, 0L));
        assertTrue(FocusNotificationListener.shouldToggleComponentRebind(24, true, false, now, 0L));
        assertTrue(FocusNotificationListener.shouldToggleComponentRebind(37, true, false, now, -1L));
    }

    @Test
    public void componentToggleRequiresThirtySecondsSinceLastAttempt() {
        long lastToggle = 5_000L;
        assertFalse(FocusNotificationListener.shouldToggleComponentRebind(37, true, false, lastToggle, lastToggle));
        assertFalse(FocusNotificationListener.shouldToggleComponentRebind(37, true, false, lastToggle + 29_999L, lastToggle));
        assertTrue(FocusNotificationListener.shouldToggleComponentRebind(37, true, false, lastToggle + 30_000L, lastToggle));
        assertTrue(FocusNotificationListener.shouldToggleComponentRebind(37, true, false, lastToggle + 30_001L, lastToggle));
    }
}
