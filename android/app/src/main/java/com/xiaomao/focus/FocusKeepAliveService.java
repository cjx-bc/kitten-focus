package com.xiaomao.focus;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground keep-alive service active strictly while a focus or independent lock session is open.
 * Reuses Reminders.FOCUS_ID (40) on channel "focus-status" and hosts UsageAppMonitor during sessions.
 */
public final class FocusKeepAliveService extends Service {
    private static final long WATCHDOG_INTERVAL_MS = 2_000L;
    static final String EXTRA_FROM_BOOT = "from_boot";
    private static volatile boolean running;
    private static volatile boolean mediaPlaybackAttached;

    private final Handler watchdogHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService watchdogExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean watchdogActive;

    private final Runnable watchdogTick = new Runnable() {
        @Override
        public void run() {
            if (!running || !watchdogActive) return;
            final Context app = getApplicationContext();
            try {
                watchdogExecutor.execute(() -> {
                    boolean shouldContinue = running && watchdogActive;
                    try {
                        if (!running) return;
                        FocusControl control = new FocusControl(app);
                        JSONObject obs = control.observeSessionState();
                        if (obs.isNull("owner") || LocalStore.get(app).read("active") == null) {
                            shouldContinue = false;
                            stop(app);
                            return;
                        }
                        if (obs.optBoolean("needsReconcile")) {
                            obs = control.reconcile();
                            if (obs.isNull("owner") || LocalStore.get(app).read("active") == null) {
                                CatFocusPlugin.emitJsEvent("sessionChanged", "");
                                shouldContinue = false;
                                stop(app);
                                return;
                            }
                        }
                        if (!FocusProtection.authorized(app) && !new AndroidLauncherSystem(app).launcherVisible()) {
                            control.restoreLauncher();
                        }
                    } catch (Exception ignored) {
                    } finally {
                        if (shouldContinue && running && watchdogActive) {
                            watchdogHandler.removeCallbacks(watchdogTick);
                            watchdogHandler.postDelayed(watchdogTick, WATCHDOG_INTERVAL_MS);
                        }
                    }
                });
            } catch (RuntimeException ignored) {
            }
        }
    };

    static boolean isRunning() {
        return running;
    }

    static int resolveForegroundServiceType(int sdkInt, boolean wantMediaPlayback, boolean fromBoot) {
        if (sdkInt < 34) {
            return 0;
        }
        int fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
        if (wantMediaPlayback && !fromBoot) {
            fgsType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        }
        return fgsType;
    }

    private static boolean wantsMediaPlayback(Context context, JSONObject active) {
        if (active == null || LockEngine.owns(active) || !"running".equals(active.optString("state"))) {
            return false;
        }
        try {
            JSONObject data = LocalStore.get(context).read("data");
            JSONObject prefs = data == null ? null : data.optJSONObject("preferences");
            String track = prefs == null ? "off" : prefs.optString("whiteNoise", "off");
            return WhiteNoisePolicy.isPlayableTrack(track);
        } catch (Exception ignored) {
            return false;
        }
    }

    static void ensureStarted(Context context) {
        ensureStarted(context, false);
    }

    static void ensureStarted(Context context, boolean fromBoot) {
        if (context == null || running) return;
        Context app = context.getApplicationContext();
        try {
            Intent intent = new Intent(app, FocusKeepAliveService.class);
            if (fromBoot) {
                intent.putExtra(EXTRA_FROM_BOOT, true);
            }
            ContextCompat.startForegroundService(app, intent);
        } catch (IllegalStateException | SecurityException ignored) {
            // Android 12+ may restrict background FGS starts in edge transitions; Reminders notification remains intact.
        }
    }

    static void refreshForegroundType(Context context) {
        if (context == null || !running || mediaPlaybackAttached) return;
        Context app = context.getApplicationContext();
        try {
            ContextCompat.startForegroundService(app, new Intent(app, FocusKeepAliveService.class));
        } catch (IllegalStateException | SecurityException ignored) {
        }
    }

    static void stop(Context context) {
        running = false;
        mediaPlaybackAttached = false;
        UsageAppMonitor.stop();
        FocusBlockOverlay.dismiss();
        if (context == null) return;
        Context app = context.getApplicationContext();
        WhiteNoisePlayer.getInstance(app).stop();
        try {
            app.stopService(new Intent(app, FocusKeepAliveService.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        boolean fromBoot = intent != null && intent.getBooleanExtra(EXTRA_FROM_BOOT, false);
        JSONObject active = null;
        try {
            active = LocalStore.get(this).read("active");
        } catch (Exception ignored) {
        }

        Notification notification = active != null
            ? Reminders.buildFocusNotification(this, active, currentElapsed(active))
            : Reminders.buildFallbackKeepAliveNotification(this);

        boolean wantMedia = wantsMediaPlayback(this, active);
        int fgsType = resolveForegroundServiceType(Build.VERSION.SDK_INT, wantMedia, fromBoot);
        boolean startedForeground = false;
        try {
            ServiceCompat.startForeground(this, Reminders.FOCUS_ID, notification, fgsType);
            startedForeground = true;
            mediaPlaybackAttached = Build.VERSION.SDK_INT >= 34
                && (fgsType & ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) != 0;
        } catch (RuntimeException failure) {
            if (Build.VERSION.SDK_INT >= 34 && (fgsType & ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) != 0) {
                try {
                    ServiceCompat.startForeground(
                        this,
                        Reminders.FOCUS_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    );
                    startedForeground = true;
                    mediaPlaybackAttached = false;
                } catch (RuntimeException fallbackFailure) {
                    startedForeground = false;
                }
            }
        }
        if (!startedForeground) {
            running = false;
            mediaPlaybackAttached = false;
            UsageAppMonitor.stop();
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (active == null) {
            running = false;
            mediaPlaybackAttached = false;
            UsageAppMonitor.stop();
            FocusBlockOverlay.dismiss();
            WhiteNoisePlayer.getInstance(this).stop();
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        running = true;
        UsageAppMonitor.start(this);
        if (!fromBoot) {
            WhiteNoisePlayer.getInstance(this).syncFromStore(this);
        }
        Reminders.scheduleKeepAliveHeartbeat(this);
        watchdogActive = true;
        watchdogHandler.removeCallbacks(watchdogTick);
        watchdogHandler.postDelayed(watchdogTick, WATCHDOG_INTERVAL_MS);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        try {
            if (LocalStore.get(this).read("active") != null) {
                Reminders.scheduleKeepAliveRevive(this, 500L);
            }
        } catch (Exception ignored) {
        }
    }

    private long currentElapsed(JSONObject session) {
        SessionClock clock = SessionClock.system(this);
        long now = clock.mono();
        boolean interrupted = session.optInt("bootId") != clock.boot() || now < session.optLong("anchorMono");
        if (interrupted) return Math.max(0L, session.optLong("elapsedMs"));
        long ms = session.optLong("elapsedMs")
            + ("running".equals(session.optString("state")) ? Math.max(0L, now - session.optLong("anchorMono")) : 0L);
        return "countdown".equals(session.optString("mode")) ? Math.min(ms, session.optLong("targetMs")) : ms;
    }

    @Override
    public void onDestroy() {
        running = false;
        mediaPlaybackAttached = false;
        watchdogActive = false;
        watchdogHandler.removeCallbacksAndMessages(null);
        watchdogExecutor.shutdownNow();
        UsageAppMonitor.stop();
        FocusBlockOverlay.dismiss();
        WhiteNoisePlayer.getInstance(this).stop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
