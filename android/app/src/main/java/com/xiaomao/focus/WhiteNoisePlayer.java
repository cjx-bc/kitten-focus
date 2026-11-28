package com.xiaomao.focus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import org.json.JSONObject;

/**
 * Native offline white-noise loop player tied to active focus sessions.
 * Uses AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK to mix politely with online lectures/videos,
 * and ACTION_AUDIO_BECOMING_NOISY to pause immediately when headphones/Bluetooth disconnect.
 */
final class WhiteNoisePlayer {
    private static volatile WhiteNoisePlayer instance;

    private final Context appContext;
    private final Object lock = new Object();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final WhiteNoisePolicy policy = new WhiteNoisePolicy();

    private MediaPlayer mediaPlayer;
    private String loadedTrack = null;
    private AudioFocusRequest focusRequest;
    private boolean audioFocusGranted = false;
    private boolean noisyReceiverRegistered = false;

    private String lastTrack = "off";
    private double lastVolume = WhiteNoisePolicy.DEFAULT_VOLUME;
    private boolean lastActiveFocus = false;
    private boolean lastFocusRunning = false;

    private final AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
        synchronized (lock) {
            if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.GAINED);
            } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.DUCKED);
            } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.PAUSED_TRANSIENT);
            } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                audioFocusGranted = false;
                policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.LOST);
            } else {
                return;
            }
            applyDecisionLocked(policy.evaluate(lastTrack, lastVolume, lastActiveFocus, lastFocusRunning));
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                return;
            }
            pauseForBecomingNoisy();
        }
    };

    private WhiteNoisePlayer(Context context) {
        this.appContext = context.getApplicationContext();
    }

    static WhiteNoisePlayer getInstance(Context context) {
        WhiteNoisePlayer existing = instance;
        if (existing != null) return existing;
        synchronized (WhiteNoisePlayer.class) {
            if (instance == null) {
                instance = new WhiteNoisePlayer(context);
            }
            return instance;
        }
    }

    void syncFromStore(Context context) {
        if (context == null) return;
        try {
            LocalStore store = LocalStore.get(context);
            JSONObject active = store.read("active");
            JSONObject data = store.read("data");
            JSONObject preferences = data == null ? null : data.optJSONObject("preferences");
            sync(active, preferences);
        } catch (Throwable ignored) {
        }
    }

    void syncFromUserAction(Context context) {
        synchronized (lock) {
            policy.clearPausedByNoisy();
        }
        syncFromStore(context);
    }

    void sync(JSONObject activeSession, JSONObject preferences) {
        boolean hasActiveFocus = activeSession != null && !LockEngine.owns(activeSession);
        boolean focusRunning = hasActiveFocus && "running".equals(activeSession.optString("state"));
        String track = preferences != null ? preferences.optString("whiteNoise", "off") : "off";
        double volume = preferences != null
            ? preferences.optDouble("whiteNoiseVolume", WhiteNoisePolicy.DEFAULT_VOLUME)
            : WhiteNoisePolicy.DEFAULT_VOLUME;

        synchronized (lock) {
            lastActiveFocus = hasActiveFocus;
            lastFocusRunning = focusRunning;
            lastTrack = track;
            lastVolume = volume;
            WhiteNoisePolicy.Decision decision = policy.evaluate(track, volume, hasActiveFocus, focusRunning);
            applyDecisionLocked(decision);
        }
    }

    void stop() {
        synchronized (lock) {
            lastActiveFocus = false;
            lastFocusRunning = false;
            WhiteNoisePolicy.Decision decision = policy.evaluate("off", lastVolume, false, false);
            applyDecisionLocked(decision);
        }
    }

    private void pauseForBecomingNoisy() {
        final String pausedTrack;
        final boolean didPause;
        synchronized (lock) {
            pausedTrack = policy.getCurrentTrack();
            if (mediaPlayer != null) {
                try {
                    if (mediaPlayer.isPlaying()) {
                        mediaPlayer.pause();
                    }
                } catch (IllegalStateException ignored) {
                }
            }
            didPause = policy.onBecomingNoisy();
            unregisterNoisyReceiverLocked();
            abandonAudioFocusLocked();
        }
        if (didPause) {
            notifyNoisyPaused(pausedTrack);
        }
    }

    private void notifyNoisyPaused(String pausedTrack) {
        JSObject payload = new JSObject();
        payload.put("reason", "becoming_noisy");
        if (pausedTrack != null && !pausedTrack.isEmpty()) {
            payload.put("track", pausedTrack);
        }
        CatFocusPlugin.emitJsEvent("whiteNoisePaused", payload);
    }

    private void applyDecisionLocked(WhiteNoisePolicy.Decision decision) {
        try {
            if (decision.action == WhiteNoisePolicy.Action.STOP) {
                unregisterNoisyReceiverLocked();
                abandonAudioFocusLocked();
                releasePlayerLocked();
                return;
            }
            if (decision.action == WhiteNoisePolicy.Action.PAUSE) {
                unregisterNoisyReceiverLocked();
                if (decision.abandonAudioFocus) {
                    abandonAudioFocusLocked();
                }
                if (mediaPlayer != null) {
                    try {
                        if (mediaPlayer.isPlaying()) {
                            mediaPlayer.pause();
                        }
                    } catch (IllegalStateException ignored) {
                    }
                }
                return;
            }

            // Action.PLAY
            float volume = decision.effectiveVolume;
            if (decision.requestAudioFocus) {
                if (!requestAudioFocusLocked()) {
                    policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.LOST);
                    return;
                }
                policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.GAINED);
                volume = WhiteNoisePolicy.clampVolume(lastVolume);
            }

            if (decision.registerNoisyReceiver) {
                registerNoisyReceiverLocked();
            }

            if (mediaPlayer == null || !decision.track.equals(loadedTrack)) {
                releasePlayerLocked();
                if (!preparePlayerLocked(decision.track)) {
                    unregisterNoisyReceiverLocked();
                    abandonAudioFocusLocked();
                    return;
                }
            }

            mediaPlayer.setVolume(volume, volume);
            if (!mediaPlayer.isPlaying()) {
                mediaPlayer.start();
            }
            if (FocusKeepAliveService.isRunning()) {
                FocusKeepAliveService.refreshForegroundType(appContext);
            }
        } catch (Throwable ignored) {
            // Never allow audio subsystem errors to interrupt focus timer lifecycle.
        }
    }

    private boolean preparePlayerLocked(String track) {
        String assetPath = WhiteNoisePolicy.assetPathForTrack(track);
        if (assetPath == null) return false;
        MediaPlayer player = new MediaPlayer();
        try {
            player.setAudioAttributes(buildAudioAttributes());
            try (AssetFileDescriptor afd = appContext.getAssets().openFd(assetPath)) {
                player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            }
            player.setLooping(true);
            player.prepare();
            player.setOnErrorListener((mp, what, extra) -> {
                synchronized (lock) {
                    releasePlayerLocked();
                }
                return true;
            });
            mediaPlayer = player;
            loadedTrack = track;
            return true;
        } catch (Throwable error) {
            try {
                player.release();
            } catch (Throwable ignored) {
            }
            mediaPlayer = null;
            loadedTrack = null;
            return false;
        }
    }

    private void releasePlayerLocked() {
        MediaPlayer player = mediaPlayer;
        mediaPlayer = null;
        loadedTrack = null;
        if (player == null) return;
        try {
            if (player.isPlaying()) {
                player.stop();
            }
        } catch (Throwable ignored) {
        }
        try {
            player.reset();
        } catch (Throwable ignored) {
        }
        try {
            player.release();
        } catch (Throwable ignored) {
        }
    }

    private AudioAttributes buildAudioAttributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build();
    }

    private AudioManager audioManager() {
        return (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
    }

    private boolean requestAudioFocusLocked() {
        AudioManager am = audioManager();
        if (am == null) return false;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(buildAudioAttributes())
                    .setAcceptsDelayedFocusGain(false)
                    .setWillPauseWhenDucked(false)
                    .setOnAudioFocusChangeListener(focusChangeListener, mainHandler)
                    .build();
            }
            result = am.requestAudioFocus(focusRequest);
        } else {
            result = am.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            );
        }
        audioFocusGranted = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        return audioFocusGranted;
    }

    private void abandonAudioFocusLocked() {
        if (!audioFocusGranted) return;
        audioFocusGranted = false;
        AudioManager am = audioManager();
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest != null) {
                    am.abandonAudioFocusRequest(focusRequest);
                }
            } else {
                am.abandonAudioFocus(focusChangeListener);
            }
        } catch (Throwable ignored) {
        }
    }

    private void registerNoisyReceiverLocked() {
        if (noisyReceiverRegistered) return;
        try {
            IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            ContextCompat.registerReceiver(appContext, noisyReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
            noisyReceiverRegistered = true;
        } catch (Throwable ignored) {
        }
    }

    private void unregisterNoisyReceiverLocked() {
        if (!noisyReceiverRegistered) return;
        noisyReceiverRegistered = false;
        try {
            appContext.unregisterReceiver(noisyReceiver);
        } catch (IllegalArgumentException ignored) {
        }
    }
}
