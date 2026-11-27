package com.xiaomao.focus;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Zero-permission light supervision watcher ("轻看护").
 * Armed strictly from MainActivity.onStop() and cancelled in onStart()/onResume(),
 * never from onPause() so notification shade pulldowns and visible split-screen never false-trigger.
 */
final class LeaveAppWatcher {
    static final long LEAVE_FAIL_DELAY_MS = 10_000L;

    interface LeaveEnvironment {
        boolean isInteractive();
        boolean isKeyguardLocked();
        boolean isInActiveCall();
        boolean isYieldedWhitelist();
        boolean isSettingsAuthorizationInFlight();
        boolean canAttachOverlay();
        JSONObject readActiveSession() throws JSONException;
        JSONObject readData() throws JSONException;
        long monotonicNowMs();
        void showLeaveWarning();
        void cancelLeaveWarning();
        void failByLeave();
    }

    interface TimerScheduler {
        void schedule(long delayMs, Runnable task);
        void cancel();
    }

    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private static volatile LeaveAppWatcher sharedInstance;

    private final LeaveEnvironment env;
    private final TimerScheduler scheduler;
    private final Object lock = new Object();
    private long generation = 0L;
    private boolean pending = false;
    private String pendingSessionId = "";

    LeaveAppWatcher(LeaveEnvironment env, TimerScheduler scheduler) {
        this.env = env;
        this.scheduler = scheduler;
    }

    static synchronized LeaveAppWatcher shared(Context context) {
        if (sharedInstance == null) {
            Context app = context.getApplicationContext();
            sharedInstance = new LeaveAppWatcher(
                new AndroidEnvironment(app),
                new MainHandlerScheduler()
            );
        }
        return sharedInstance;
    }

    static void onActivityStopped(Context context) {
        if (context == null) return;
        shared(context).onStop();
    }

    static void onActivityForegrounded(Context context) {
        if (context == null) return;
        shared(context).onForeground();
    }

    void onStop() {
        final long currentGen;
        synchronized (lock) {
            scheduler.cancel();
            pending = false;
            pendingSessionId = "";
            if (isExempt(null)) {
                return;
            }
            JSONObject active;
            try {
                active = env.readActiveSession();
            } catch (Exception ignored) {
                return;
            }
            if (active == null) return;
            currentGen = ++generation;
            pending = true;
            pendingSessionId = active.optString("id", "");
        }
        env.showLeaveWarning();
        scheduler.schedule(LEAVE_FAIL_DELAY_MS, () -> onTimeout(currentGen));
    }

    void onForeground() {
        synchronized (lock) {
            generation++;
            pending = false;
            pendingSessionId = "";
            scheduler.cancel();
        }
        env.cancelLeaveWarning();
    }

    private void onTimeout(long expectedGen) {
        final String sessionId;
        synchronized (lock) {
            if (!pending || generation != expectedGen) {
                return;
            }
            sessionId = pendingSessionId;
            pending = false;
            pendingSessionId = "";
        }
        if (isExempt(sessionId)) {
            env.cancelLeaveWarning();
            return;
        }
        env.failByLeave();
        env.cancelLeaveWarning();
    }

    private boolean isExempt(String expectedSessionId) {
        JSONObject active;
        JSONObject data;
        try {
            active = env.readActiveSession();
            data = env.readData();
        } catch (Exception ignored) {
            return true;
        }
        // 1. No active session or independent lock session
        if (active == null || LockEngine.owns(active)) return true;
        if (expectedSessionId != null && !expectedSessionId.isEmpty()
            && !expectedSessionId.equals(active.optString("id", ""))) {
            return true;
        }
        // 2. Active focus not running (e.g. paused)
        if (!"running".equals(active.optString("state"))) return true;
        // 3. preferences.leaveAppFail === false (default when missing is true)
        JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
        if (prefs != null && !prefs.optBoolean("leaveAppFail", true)) return true;
        // 4. Screen off
        if (!env.isInteractive()) return true;
        // 5. Lockscreen showing
        if (env.isKeyguardLocked()) return true;
        // 6. Cellular call or ringing
        if (env.isInActiveCall()) return true;
        // 7. Yielded to active round's whitelisted / temporary-access app
        if (env.isYieldedWhitelist() || hasActiveTemporaryAccess(active, env.monotonicNowMs())) return true;
        // 8. In-app authorization jump to system settings
        if (env.isSettingsAuthorizationInFlight()) return true;
        // 9. Study mode overlay active and ready to pull back
        JSONObject protection = active.optJSONObject("protection");
        boolean withdrawn = protection != null && protection.optBoolean("applicationsWithdrawn");
        boolean study = protection != null && Boolean.TRUE.equals(protection.opt("study")) && !withdrawn;
        boolean studyLocked = protection != null && Boolean.TRUE.equals(protection.opt("studyLocked")) && !withdrawn;
        boolean studyOrLock = LockEngine.owns(active) || study || studyLocked;
        if (studyOrLock && env.canAttachOverlay()) return true;

        return false;
    }

    private static boolean hasActiveTemporaryAccess(JSONObject active, long monoNowMs) {
        JSONObject runtime = active.optJSONObject("temporaryAccessRuntime");
        JSONObject grant = runtime == null ? null : runtime.optJSONObject("grant");
        if (grant != null && grant.optLong("deadlineMono") > monoNowMs && monoNowMs >= grant.optLong("startedMono")) {
            return true;
        }
        JSONObject projected = active.optJSONObject("temporaryAccess");
        return projected != null && projected.optLong("remainingMs") > 0L;
    }

    private static final class MainHandlerScheduler implements TimerScheduler {
        private final Handler handler = new Handler(Looper.getMainLooper());
        private Runnable currentTask;

        @Override
        public void schedule(long delayMs, Runnable task) {
            cancel();
            currentTask = () -> WORKER.execute(task);
            handler.postDelayed(currentTask, delayMs);
        }

        @Override
        public void cancel() {
            if (currentTask != null) {
                handler.removeCallbacks(currentTask);
                currentTask = null;
            }
        }
    }

    private static final class AndroidEnvironment implements LeaveEnvironment {
        private final Context app;

        AndroidEnvironment(Context app) {
            this.app = app.getApplicationContext();
        }

        @Override
        public boolean isInteractive() {
            PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
            return pm == null || pm.isInteractive();
        }

        @Override
        public boolean isKeyguardLocked() {
            KeyguardManager km = (KeyguardManager) app.getSystemService(Context.KEYGUARD_SERVICE);
            return km != null && km.isKeyguardLocked();
        }

        @Override
        public boolean isInActiveCall() {
            return FocusProtection.isInActiveCall(app);
        }

        @Override
        public boolean isYieldedWhitelist() {
            return FocusBlockOverlay.isYieldedWhitelistFast();
        }

        @Override
        public boolean isSettingsAuthorizationInFlight() {
            return FocusProtection.isSettingsAuthorizationInFlight();
        }

        @Override
        public boolean canAttachOverlay() {
            return FocusBlockOverlay.canAttachOverlay(app);
        }

        @Override
        public JSONObject readActiveSession() throws JSONException {
            return LocalStore.get(app).read("active");
        }

        @Override
        public JSONObject readData() throws JSONException {
            return LocalStore.get(app).read("data");
        }

        @Override
        public long monotonicNowMs() {
            return SystemClock.elapsedRealtime();
        }

        @Override
        public void showLeaveWarning() {
            Reminders.showLeaveWarning(app);
        }

        @Override
        public void cancelLeaveWarning() {
            Reminders.cancelLeaveWarning(app);
        }

        @Override
        public void failByLeave() {
            try {
                JSONObject result = new FocusControl(app).failByLeave();
                Reminders.cancelLeaveWarning(app);
                if (result != null) {
                    CatFocusPlugin.emitJsEvent("sessionChanged", "");
                }
            } catch (Exception ignored) {
            }
        }
    }
}
