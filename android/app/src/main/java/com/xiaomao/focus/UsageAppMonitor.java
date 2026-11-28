package com.xiaomao.focus;

import android.app.KeyguardManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.PowerManager;
import android.os.SystemClock;
import org.json.JSONObject;
import java.util.List;

/**
 * Lightweight foreground-app monitor running only inside FocusKeepAliveService during active
 * study/lock sessions. Yields automatically when Accessibility is connected, and backs up with
 * UsageStatsManager + FocusBlockActivity/FocusBlockOverlay otherwise.
 */
final class UsageAppMonitor {
    private static final long ACTIVE_POLL_MS = 400L;
    private static final long IDLE_POLL_MS = 1000L;
    private static final long LAUNCH_DEBOUNCE_MS = 1200L;
    private static final long OVERLAY_FALLBACK_DELAY_MS = 380L;

    /** Pure event tracker isolated from Android framework dependencies for JVM unit testing. */
    static final class ForegroundTracker {
        static final int FOREGROUND_EVENT = 1; // UsageEvents.Event.MOVE_TO_FOREGROUND / ACTIVITY_RESUMED

        private String lastPackage = "";
        private String lastClass = "";
        private long lastEventTimestampMs;

        void reset() {
            lastPackage = "";
            lastClass = "";
            lastEventTimestampMs = 0L;
        }

        void applyEvent(int eventType, String pkg, String cls, long timestampMs, boolean transientPkg) {
            if (eventType != FOREGROUND_EVENT) return;
            if (pkg == null || pkg.isEmpty() || transientPkg) return;
            if (timestampMs < lastEventTimestampMs) return;
            lastPackage = pkg;
            lastClass = cls == null ? "" : cls;
            lastEventTimestampMs = timestampMs;
        }

        void seedFallback(String pkg, long timestampMs) {
            if (!lastPackage.isEmpty() || pkg == null || pkg.isEmpty()) return;
            lastPackage = pkg;
            lastClass = "";
            lastEventTimestampMs = Math.max(0L, timestampMs);
        }

        String currentPackage() {
            return lastPackage;
        }

        String currentClass() {
            return lastClass;
        }

        long lastEventTimestampMs() {
            return lastEventTimestampMs;
        }
    }

    private static final ForegroundTracker TRACKER = new ForegroundTracker();
    private static HandlerThread thread;
    private static Handler handler;
    private static Context appContext;
    private static volatile boolean started;
    private static String lastBlockedPkg = "";
    private static long lastBlockedMono;

    private static final Runnable TICK = UsageAppMonitor::runTick;

    private UsageAppMonitor() {}

    static synchronized void start(Context context) {
        if (context == null) return;
        appContext = context.getApplicationContext();
        if (thread == null) {
            thread = new HandlerThread("cat-focus-usage-monitor");
            thread.start();
            handler = new Handler(thread.getLooper());
        }
        boolean wasStarted = started;
        started = true;
        if (!wasStarted) {
            TRACKER.reset();
            lastBlockedPkg = "";
            lastBlockedMono = 0L;
        }
        handler.removeCallbacks(TICK);
        handler.post(TICK);
    }

    static synchronized void stop() {
        started = false;
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
        TRACKER.reset();
        lastBlockedPkg = "";
        lastBlockedMono = 0L;
        FocusBlockOverlay.dismiss();
    }

    private static void reschedule(long delayMs) {
        Handler h;
        synchronized (UsageAppMonitor.class) {
            if (!started || handler == null) return;
            h = handler;
        }
        h.removeCallbacks(TICK);
        h.postDelayed(TICK, delayMs);
    }

    static String overlayCleanupAction(boolean interactiveUnlocked, boolean usageReady, boolean hasSession, boolean studyActive) {
        if (!interactiveUnlocked) return "dismiss";
        if (!usageReady) return "keep";
        if (!hasSession) return "dismiss";
        if (!studyActive) return "dismiss_locked";
        return "monitor";
    }

    private static void runTick() {
        if (!started) return;
        Context app = appContext;
        if (app == null) return;

        // Accessibility handles instant blocking + navigation/anti-close + key filtering when connected.
        if (FocusAccessibilityService.connected()) {
            reschedule(IDLE_POLL_MS);
            return;
        }

        boolean unlocked = isInteractiveUnlocked(app);
        boolean usageReady = AppUsageGuard.isReady(app);
        String preCheck = overlayCleanupAction(unlocked, usageReady, true, true);
        if ("dismiss".equals(preCheck)) {
            FocusBlockOverlay.dismiss();
            reschedule(IDLE_POLL_MS);
            return;
        }
        if ("keep".equals(preCheck)) {
            reschedule(IDLE_POLL_MS);
            return;
        }

        try {
            FocusControl control = new FocusControl(app);
            JSONObject observation = control.observeSessionState();
            String owner = observation.optString("owner");
            JSONObject session = ControlSession.from(observation);
            JSONObject protection = session == null ? null : session.optJSONObject("protection");
            boolean hasSession = ("focus".equals(owner) || "lock".equals(owner))
                && !observation.optBoolean("needsReconcile")
                && session != null;
            boolean studyActive = hasSession
                && protection != null
                && protection.optBoolean("study")
                && !protection.optBoolean("applicationsWithdrawn");
            String action = overlayCleanupAction(true, true, hasSession, studyActive);
            if (!"monitor".equals(action)) {
                lastBlockedPkg = "";
                if ("dismiss".equals(action)) {
                    FocusBlockOverlay.dismiss();
                } else {
                    FocusBlockOverlay.dismissIfLockedOrBlocked();
                }
                reschedule(IDLE_POLL_MS);
                return;
            }

            pollForegroundPackage(app);
            String targetPkg = TRACKER.currentPackage();
            String targetCls = TRACKER.currentClass();
            if (app.getPackageName().equals(targetPkg)) {
                lastBlockedPkg = "";
                FocusBlockOverlay.showForSession(app, observation);
                reschedule(ACTIVE_POLL_MS);
                return;
            }
            if (targetPkg.isEmpty() || !FocusProtection.shouldBlock(app, observation, targetPkg, targetCls)) {
                if (!targetPkg.isEmpty() && !FocusProtection.isTransientOverlayPackage(app, targetPkg)) {
                    if (FocusProtection.isWhitelistedExternalApp(app, observation, targetPkg) || FocusProtection.isInActiveCall(app)) {
                        FocusBlockOverlay.onAllowedExternalForeground(targetPkg);
                    } else {
                        FocusBlockOverlay.dismiss();
                    }
                }
                if (!targetPkg.equals(lastBlockedPkg)) {
                    lastBlockedPkg = "";
                }
                reschedule(ACTIVE_POLL_MS);
                return;
            }

            if (FocusBlockActivity.isVisible()) {
                FocusBlockOverlay.dismiss();
                reschedule(ACTIVE_POLL_MS);
                return;
            }

            lastBlockedPkg = targetPkg;
            if (FocusBlockOverlay.canAttachOverlay(app)) {
                FocusBlockOverlay.show(app, observation, targetPkg);
                FocusProtection.executionSucceeded();
                reschedule(ACTIVE_POLL_MS);
                return;
            }

            long nowMono = SystemClock.elapsedRealtime();
            if (nowMono - lastBlockedMono >= LAUNCH_DEBOUNCE_MS) {
                lastBlockedMono = nowMono;
                try {
                    app.startActivity(
                        new Intent(app, FocusBlockActivity.class)
                            .putExtra(FocusBlockActivity.TARGET_PACKAGE, targetPkg)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP
                                | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION)
                    );
                    FocusProtection.executionSucceeded();
                } catch (RuntimeException error) {
                    FocusProtection.executionFailed(error);
                }
            }
            reschedule(ACTIVE_POLL_MS);
        } catch (Exception error) {
            FocusProtection.executionFailed(error);
            reschedule(IDLE_POLL_MS);
        }
    }

    private static void pollForegroundPackage(Context app) {
        UsageStatsManager usm = (UsageStatsManager) app.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return;
        long now = System.currentTimeMillis();
        long prevTs = TRACKER.lastEventTimestampMs();
        long begin = prevTs > 0 ? Math.max(prevTs - 1000L, now - 10_000L) : now - 60_000L;
        UsageEvents events = usm.queryEvents(begin, now);
        if (events != null) {
            UsageEvents.Event event = new UsageEvents.Event();
            while (events.getNextEvent(event)) {
                int type = event.getEventType();
                boolean resumed = type == UsageEvents.Event.MOVE_TO_FOREGROUND
                    || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && type == UsageEvents.Event.ACTIVITY_RESUMED);
                if (!resumed) continue;
                String pkg = event.getPackageName();
                boolean transientPkg = FocusProtection.isTransientOverlayPackage(app, pkg);
                TRACKER.applyEvent(ForegroundTracker.FOREGROUND_EVENT, pkg, event.getClassName(), event.getTimeStamp(), transientPkg);
            }
        }
        if (TRACKER.currentPackage().isEmpty()) {
            List<UsageStats> stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 6L * 3600_000L, now);
            if (stats != null) {
                String latestPkg = "";
                long latestUsed = 0L;
                for (UsageStats stat : stats) {
                    if (stat == null) continue;
                    String pkg = stat.getPackageName();
                    if (pkg == null || pkg.isEmpty() || FocusProtection.isTransientOverlayPackage(app, pkg)) continue;
                    long lastUsed = stat.getLastTimeUsed();
                    if (lastUsed > latestUsed) {
                        latestUsed = lastUsed;
                        latestPkg = pkg;
                    }
                }
                if (!latestPkg.isEmpty()) {
                    TRACKER.seedFallback(latestPkg, latestUsed);
                }
            }
        }
    }

    private static boolean isInteractiveUnlocked(Context context) {
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (power != null && !power.isInteractive()) return false;
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard == null || !keyguard.isKeyguardLocked();
    }
}
