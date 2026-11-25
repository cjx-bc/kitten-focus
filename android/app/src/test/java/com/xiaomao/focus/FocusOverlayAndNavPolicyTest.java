package com.xiaomao.focus;

import android.media.AudioManager;
import android.view.KeyEvent;
import com.xiaomao.focus.FocusBlockOverlay.Mode;
import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class FocusOverlayAndNavPolicyTest {
    @Test
    public void resolvesOverlayModesAcrossNormalStudyBlockedAndPullback() {
        assertEquals(Mode.NONE, FocusBlockOverlay.resolveOverlayMode(false, false, false, false));
        assertEquals(Mode.NORMAL_FOCUS, FocusBlockOverlay.resolveOverlayMode(true, false, false, false));
        assertEquals(Mode.STUDY_LOCKED, FocusBlockOverlay.resolveOverlayMode(true, true, false, false));
        assertEquals(Mode.BLOCKED_APP, FocusBlockOverlay.resolveOverlayMode(true, true, true, false));
        assertEquals(Mode.GUARD_PULLBACK, FocusBlockOverlay.resolveOverlayMode(true, true, true, true));

        assertTrue(FocusBlockOverlay.shouldUseNotFocusable(Mode.NORMAL_FOCUS));
        assertFalse(FocusBlockOverlay.shouldUseNotFocusable(Mode.STUDY_LOCKED));
        assertFalse(FocusBlockOverlay.shouldUseNotFocusable(Mode.BLOCKED_APP));
        assertFalse(FocusBlockOverlay.shouldUseNotFocusable(Mode.GUARD_PULLBACK));
    }

    @Test
    public void filtersNavigationKeysOnlyInLockedModeNeverPowerOrVolume() {
        assertFalse(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_BACK, false));
        assertFalse(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_APP_SWITCH, false));

        assertTrue(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_BACK, true));
        assertTrue(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_HOME, true));
        assertTrue(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_APP_SWITCH, true));
        assertTrue(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_MENU, true));
        assertTrue(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_ASSIST, true));
        assertTrue(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_VOICE_ASSIST, true));
        assertTrue(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_SEARCH, true));
        assertTrue(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_SETTINGS, true));

        assertFalse(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_POWER, true));
        assertFalse(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_VOLUME_UP, true));
        assertFalse(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_VOLUME_DOWN, true));
        assertFalse(FocusBlockOverlay.shouldConsumeKeyCode(KeyEvent.KEYCODE_VOLUME_MUTE, true));
    }

    @Test
    public void matchesAospAndOemRecentsWhileIgnoringImeAndNormalApps() {
        Set<String> launchers = new HashSet<>(Arrays.asList("com.miui.home", "com.oplus.launcher", "com.android.launcher3"));
        assertEquals("recents", FocusNavigation.matchNavigationTarget("com.android.systemui", "com.android.systemui.recents.RecentsActivity", launchers, Collections.emptyList()));
        assertEquals("recents", FocusNavigation.matchNavigationTarget("com.miui.home", "com.miui.home.recents.RecentsActivity", launchers, Collections.emptyList()));
        assertEquals("recents", FocusNavigation.matchNavigationTarget("com.oplus.launcher", "com.android.quickstep.OverviewActivity", launchers, Collections.emptyList()));
        assertEquals("", FocusNavigation.matchNavigationTarget("com.google.android.inputmethod.latin", "com.android.inputmethod.latin.LatinIME", launchers, Collections.emptyList()));
        assertEquals("", FocusNavigation.matchNavigationTarget("com.tencent.mm", "com.tencent.mm.ui.LauncherUI", launchers, Collections.emptyList()));

        Set<String> androidLaunchers = new HashSet<>(Arrays.asList("com.android.launcher", "com.oplus.launcher"));
        assertEquals("launcher", FocusNavigation.matchNavigationTarget("com.android.launcher", "android.widget.FrameLayout", androidLaunchers, Collections.emptyList()));
        assertEquals("recents", FocusNavigation.matchNavigationTarget("com.oplus.launcher", "com.android.quickstep.OverviewActivity", androidLaunchers, Collections.emptyList()));
    }

    @Test
    public void validatesRebootResumeAndElapsedCalculation() {
        assertTrue(FocusEngine.canResumeAfterReboot(true, true, "countdown", 1, 1_900_000L, 2, 1_000_000L));
        assertEquals(600_000L, FocusEngine.resumedElapsedAfterReboot(1_500_000L, 300_000L, 1_900_000L, 1_000_000L));

        assertFalse(FocusEngine.canResumeAfterReboot(true, false, "countdown", 1, 1_900_000L, 2, 1_000_000L));
        assertFalse(FocusEngine.canResumeAfterReboot(true, true, "stopwatch", 1, 1_900_000L, 2, 1_000_000L));
        assertFalse(FocusEngine.canResumeAfterReboot(true, true, "countdown", 2, 1_900_000L, 2, 1_000_000L));
        assertFalse(FocusEngine.canResumeAfterReboot(true, true, "countdown", 1, 999_000L, 2, 1_000_000L));
    }

    @Test
    public void recognizesOnlyCellularCallOrRingtoneAsBlockingAudioMode() {
        assertTrue(FocusProtection.isActiveCallAudioMode(AudioManager.MODE_IN_CALL));
        assertTrue(FocusProtection.isActiveCallAudioMode(AudioManager.MODE_RINGTONE));
        assertFalse(FocusProtection.isActiveCallAudioMode(AudioManager.MODE_NORMAL));
        assertFalse(FocusProtection.isActiveCallAudioMode(AudioManager.MODE_IN_COMMUNICATION));
    }

    @Test
    public void skipsLauncherHidingOnColorOsWhenAccessibilityIsActive() {
        assertTrue(AndroidLauncherSystem.shouldSkipLauncherHidingOnOem(OemKeepAliveRouter.BRAND_OPPO, true));
        assertFalse(AndroidLauncherSystem.shouldSkipLauncherHidingOnOem(OemKeepAliveRouter.BRAND_OPPO, false));
        assertFalse(AndroidLauncherSystem.shouldSkipLauncherHidingOnOem(OemKeepAliveRouter.BRAND_XIAOMI, true));
        assertFalse(AndroidLauncherSystem.shouldSkipLauncherHidingOnOem(OemKeepAliveRouter.BRAND_GENERIC, true));
    }

    @Test
    public void resetsOverlayStateSafelyWhenAccessibilityDisconnects() {
        FocusBlockOverlay.onAccessibilityDisconnected(null);
        assertFalse(FocusBlockOverlay.isShowing());
        assertFalse(FocusBlockOverlay.shouldInterceptKeyFast(KeyEvent.KEYCODE_BACK));
    }

    @Test
    public void matchesWhitelistedShellAppsToTheirRuntimeHostPackage() {
        assertTrue(FocusProtection.matchesWhitelistEntry("com.google.android.apps.bard", "com.google.android.apps.bard"));
        assertTrue(FocusProtection.matchesWhitelistEntry("com.google.android.apps.bard", "com.google.android.googlequicksearchbox"));
        assertTrue(FocusProtection.matchesWhitelistEntry("com.google.android.apps.googleassistant", "com.google.android.googlequicksearchbox"));
        assertTrue(FocusProtection.matchesWhitelistEntry("com.google.ar.lens", "com.google.android.googlequicksearchbox"));

        assertFalse(FocusProtection.matchesWhitelistEntry("com.google.android.apps.bard", "com.coloros.calendar"));
        assertFalse(FocusProtection.matchesWhitelistEntry("com.tencent.mm", "com.google.android.googlequicksearchbox"));
        assertFalse(FocusProtection.matchesWhitelistEntry("", "com.google.android.googlequicksearchbox"));
    }

    @Test
    public void suppressesOverlayOnlyWhenYieldedToWhitelistNeverOnForcedOrNormalStrictPullback() {
        // During launch grace window, suppress unforced overlay even before MainActivity.onPause finishes.
        assertTrue(FocusBlockOverlay.shouldSuppressForWhitelist(true, false, false, "com.google.android.apps.bard", 1000L, 3500L));
        // After grace expires, keep suppressing while external whitelisted app stays in foreground.
        assertTrue(FocusBlockOverlay.shouldSuppressForWhitelist(false, false, false, "com.google.android.googlequicksearchbox", 4000L, 3500L));
        // Returning to MainActivity clears suppression once grace is over.
        assertFalse(FocusBlockOverlay.shouldSuppressForWhitelist(true, false, false, "", 4000L, 0L));
        // Pressing Home in Strict Study Mode (NOT yielded to whitelist) must NEVER dismiss STUDY_LOCKED.
        assertFalse(FocusBlockOverlay.shouldSuppressForWhitelist(false, false, false, "", 4000L, 0L));
        // Blocked app and guard pullback ALWAYS override whitelist suppression, even inside grace window.
        assertFalse(FocusBlockOverlay.shouldSuppressForWhitelist(false, true, false, "com.google.android.apps.bard", 1000L, 3500L));
        assertFalse(FocusBlockOverlay.shouldSuppressForWhitelist(false, false, true, "com.google.android.apps.bard", 1000L, 3500L));
    }

    @Test
    public void validatesAccessibilitySettingsAuthorizationOnlyWhenGloballyEnabled() {
        String pkg = "com.xiaomao.focus";
        String cls = "com.xiaomao.focus.FocusAccessibilityService";
        String matching = "com.example.other/com.example.OtherService:" + pkg + "/" + cls;
        assertTrue(FocusProtection.isAccessibilityEnabledInSettings(true, matching, pkg, cls));
        assertTrue(FocusProtection.isAccessibilityEnabledInSettings(true, "com.xiaomao.focus/.FocusAccessibilityService", pkg, cls));
        assertFalse(FocusProtection.isAccessibilityEnabledInSettings(false, matching, pkg, cls));
        assertFalse(FocusProtection.isAccessibilityEnabledInSettings(true, "com.example.other/.Service", pkg, cls));
        assertFalse(FocusProtection.isAccessibilityEnabledInSettings(true, null, pkg, cls));
    }
}
