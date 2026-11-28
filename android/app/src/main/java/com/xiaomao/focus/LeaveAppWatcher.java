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
import java.util.concurrent.atomic.AtomicLong;

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
        default boolean isAppRestrictionReady() {
            return canAttachOverlay();
        }
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
    private final AtomicLong lifecycleSeq = new AtomicLong(0L);
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

    long markStopped() {
        return lifecycleSeq.incrementAndGet();
    }

    static void onActivityStopped(Context context) {
        if (context == null) return;
        final Context app = context.getApplicationContext();
        LeaveAppWatcher watcher = shared(app);
        final long stopSeq = watcher.markStopped();
        WORKER.execute(() -> watcher.onStop(stopSeq));
    }

    static void onActivityForegrounded(Context context) {
        if (context == null) return;
        shared(context).onForeground();
    }

    void onStop() {
        onStop(markStopped());
    }

    void onStop(long expectedSeq) {
        synchronized (lock) {
            if (lifecycleSeq.get() != expectedSeq) {
                return;
            }
            scheduler.cancel();
            pending = false;
            pendingSessionId = "";
        }
        JSONObject active = readActiveIfNotExempt(null);
        if (active == null) {
            return;
        }
        final long currentGen;
        synchronized (lock) {
            if (lifecycleSeq.get() != expectedSeq) {
                return;
            }
            currentGen = ++generation;
            pending = true;
            pendingSessionId = active.optString("id", "");
            scheduler.schedule(LEAVE_FAIL_DELAY_MS, () -> onTimeout(currentGen));
        }
        env.showLeaveWarning();
        boolean stillPending;
        synchronized (lock) {
            stillPending = pending && generation == currentGen;
        }
        if (!stillPending) {
            env.cancelLeaveWarning();
        }
    }

    void onForeground() {
        lifecycleSeq.incrementAndGet();
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
        return readActiveIfNotExempt(expectedSessionId) == null;
    }

    private JSONObject readActiveIfNotExempt(String expectedSessionId) {
        JSONObject active;
        JSONObject data;
        try {
            active = env.readActiveSession();
            data = env.readData();
        } catch (Exception ignored) {
            return null;
        }
        // 1. No active session or independent lock session
        if (active == null || LockEngine.owns(active)) return null;
        if (expectedSessionId != null && !expectedSessionId.isEmpty()
            && !expectedSessionId.equals(active.optString("id", ""))) {
            return null;
        }
        // 2. Active focus not running (e.g. paused)
        if (!"running".equals(active.optString("state"))) return null;
        // 2b. Strict countdown must never be ended early by leaving the app (even without overlay)
        if (active.optBoolean("strictMode") && "countdown".equals(active.optString("mode"))) return null;
        // 3. preferences.leaveAppFail === false (default when missing is true)
        JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
        if (prefs != null && !prefs.optBoolean("leaveAppFail", true)) return null;
        // 4. Screen off
        if (!env.isInteractive()) return null;
        // 5. Lockscreen showing
        if (env.isKeyguardLocked()) return null;
        // 6. Cellular call or ringing
        if (env.isInActiveCall()) return null;
        // 7. Yielded to active round's whitelisted / temporary-access app
        if (env.isYieldedWhitelist() || hasActiveTemporaryAccess(active, env.monotonicNowMs())) return null;
        // 8. In-app authorization jump to system settings
        if (env.isSettingsAuthorizationInFlight()) return null;
        // 9. Study mode app restriction active and ready to pull back
        JSONObject protection = active.optJSONObject("protection");
        boolean withdrawn = protection != null && protection.optBoolean("applicationsWithdrawn");
        boolean study = protection != null && Boolean.TRUE.equals(protection.opt("study")) && !withdrawn;
        if (study && env.isAppRestrictionReady()) return null;

        return active;
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
        public boolean isAppRestrictionReady() {
            return FocusProtection.isAppRestrictionReady(app);
        }

        @Override
        public JSONObject readActiveSession() throws JSONException {
            LocalStore store = LocalStore.get(app);
            JSONObject active = store.read("active");
            if (active != null && active.optJSONObject("protection") != null) {
                boolean withdrawn = new FocusRecovery(app, store).withdrawn(
                    active.optString("id"),
                    FocusRecovery.APPLICATIONS
                );
                active.getJSONObject("protection").put("applicationsWithdrawn", withdrawn);
            }
            return active;
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
