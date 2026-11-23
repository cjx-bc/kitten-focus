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
}
