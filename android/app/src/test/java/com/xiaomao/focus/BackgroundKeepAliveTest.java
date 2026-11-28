package com.xiaomao.focus;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import android.content.pm.ServiceInfo;
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

    @Test
    public void resolvesForegroundServiceTypeSafelyAcrossBootAndWhiteNoise() {
        assertEquals(0, FocusKeepAliveService.resolveForegroundServiceType(33, true, false));
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            FocusKeepAliveService.resolveForegroundServiceType(36, false, false)
        );
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            FocusKeepAliveService.resolveForegroundServiceType(36, true, true)
        );
        assertEquals(
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            FocusKeepAliveService.resolveForegroundServiceType(36, true, false)
        );
    }
}
