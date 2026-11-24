package com.xiaomao.focus;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AppUsageGuardTest {
    @Test
    public void resolvesEngineAcrossPersistentAndAccessibilityStates() {
        assertEquals(AppUsageGuard.ENGINE_NONE, AppUsageGuard.resolveEngine(false, false, false, false));
        assertEquals(AppUsageGuard.ENGINE_NONE, AppUsageGuard.resolveEngine(true, false, false, false));
        assertEquals(AppUsageGuard.ENGINE_NONE, AppUsageGuard.resolveEngine(false, true, false, false));
        assertEquals(AppUsageGuard.ENGINE_NONE, AppUsageGuard.resolveEngine(false, false, true, false));
        assertEquals(AppUsageGuard.ENGINE_USAGE_OVERLAY, AppUsageGuard.resolveEngine(true, true, false, false));
        assertEquals(AppUsageGuard.ENGINE_USAGE_OVERLAY, AppUsageGuard.resolveEngine(true, true, true, false));
        assertEquals(AppUsageGuard.ENGINE_ACCESSIBILITY, AppUsageGuard.resolveEngine(false, false, true, true));
        assertEquals(AppUsageGuard.ENGINE_ACCESSIBILITY, AppUsageGuard.resolveEngine(true, true, true, true));

        assertTrue(AppUsageGuard.canRestrictApps(true, true, false, false));
        assertFalse(AppUsageGuard.canRestrictApps(true, false, false, false));
    }

    @Test
    public void foregroundTrackerUpdatesOnNonTransientResumedEventsInTimestampOrder() {
        UsageAppMonitor.ForegroundTracker tracker = new UsageAppMonitor.ForegroundTracker();
        assertEquals("", tracker.currentPackage());

        tracker.seedFallback("com.example.reader", 100L);
        assertEquals("com.example.reader", tracker.currentPackage());

        // Ignores non-foreground events
        tracker.applyEvent(2, "com.example.video", "Main", 200L, false);
        assertEquals("com.example.reader", tracker.currentPackage());

        // Ignores transient overlays such as SystemUI / IME
        tracker.applyEvent(UsageAppMonitor.ForegroundTracker.FOREGROUND_EVENT, "com.android.systemui", "", 250L, true);
        assertEquals("com.example.reader", tracker.currentPackage());

        // Applies real foreground transition
        tracker.applyEvent(UsageAppMonitor.ForegroundTracker.FOREGROUND_EVENT, "com.example.video", "Player", 300L, false);
        assertEquals("com.example.video", tracker.currentPackage());
        assertEquals("Player", tracker.currentClass());

        // Ignores out-of-order older timestamps
        tracker.applyEvent(UsageAppMonitor.ForegroundTracker.FOREGROUND_EVENT, "com.example.stale", "Old", 290L, false);
        assertEquals("com.example.video", tracker.currentPackage());

        tracker.reset();
        assertEquals("", tracker.currentPackage());
        assertEquals(0L, tracker.lastEventTimestampMs());
    }
}
