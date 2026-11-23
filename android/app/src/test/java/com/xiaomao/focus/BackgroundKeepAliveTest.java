package com.xiaomao.focus;

import static org.junit.Assert.assertArrayEquals;

import org.junit.Test;

public class BackgroundKeepAliveTest {
    @Test
    public void requestsDirectBatteryExemptionBeforeFallbacksWhenNotYetIgnored() {
        assertArrayEquals(
            new String[] {
                BackgroundKeepAlive.ACTION_REQUEST_IGNORE,
                BackgroundKeepAlive.ACTION_SETTINGS_LIST,
                BackgroundKeepAlive.ACTION_APP_DETAILS,
            },
            BackgroundKeepAlive.candidateIntentActions(34, false)
        );
    }

    @Test
    public void skipsDirectDialogAndOpensSystemListWhenAlreadyIgnored() {
        assertArrayEquals(
            new String[] {
                BackgroundKeepAlive.ACTION_SETTINGS_LIST,
                BackgroundKeepAlive.ACTION_APP_DETAILS,
            },
            BackgroundKeepAlive.candidateIntentActions(34, true)
        );
    }

    @Test
    public void fallsBackToAppDetailsBeforeAndroidMarshmallow() {
        assertArrayEquals(
            new String[] { BackgroundKeepAlive.ACTION_APP_DETAILS },
            BackgroundKeepAlive.candidateIntentActions(22, false)
        );
    }
}
