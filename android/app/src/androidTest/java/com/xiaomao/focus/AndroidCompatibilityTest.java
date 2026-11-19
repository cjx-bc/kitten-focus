package com.xiaomao.focus;

import android.app.Notification;
import android.content.Context;
import android.os.Build;
import android.os.Process;
import android.service.notification.StatusBarNotification;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class AndroidCompatibilityTest {
    @Test public void coldLaunchResolvesTheManifestAlias() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                assertNotNull(activity.getBridge().getWebView());
                assertTrue(new AndroidLauncherSystem(activity).launcherVisible());
            });
        }
    }

    @Test public void notificationIdentityUsesAnApiAvailableOnThisDevice() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String packageName = context.getPackageName();
        StatusBarNotification posted = new StatusBarNotification(packageName, packageName,
            1, "qa-source", Process.myUid(), Process.myPid(), 0, new Notification(),
            Process.myUserHandle(), System.currentTimeMillis());

        NotificationSystem.Notice notice = FocusNotificationListener.metadata(posted);
        assertEquals(posted.getKey(), notice.key);
        assertEquals(packageName, notice.packageName);
        int expected = Build.VERSION.SDK_INT >= 29 ? Process.myUid() : ~posted.getUserId();
        assertEquals(expected, notice.uid);
    }
}
