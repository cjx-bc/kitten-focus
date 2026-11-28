package com.xiaomao.focus;

import java.util.Set;

/**
 * Pure JVM-testable policy governing offline white-noise playback state,
 * volume clamping, audio focus ducking/loss, and becoming-noisy speaker protection.
 */
final class WhiteNoisePolicy {
    enum Action {
        PLAY,
        PAUSE,
        STOP
    }

    enum AudioFocusState {
        NONE,
        GAINED,
        DUCKED,
        PAUSED_TRANSIENT,
        LOST
    }

    static final float DEFAULT_VOLUME = 0.6f;
    static final float DUCK_FACTOR = 0.25f;
    /** Matches {@link android.media.AudioManager#AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK}. */
    static final int AUDIO_FOCUS_GAIN_TRANSIENT_MAY_DUCK = 3;
    private static final Set<String> PLAYABLE_TRACKS = Set.of("rain", "birds", "stream", "fire", "waves");

    static final class Decision {
        final Action action;
        final String track;
        final float effectiveVolume;
        final boolean requestAudioFocus;
        final boolean registerNoisyReceiver;
        final boolean abandonAudioFocus;

        Decision(
            Action action,
            String track,
            float effectiveVolume,
            boolean requestAudioFocus,
            boolean registerNoisyReceiver,
            boolean abandonAudioFocus
        ) {
            this.action = action;
            this.track = track;
            this.effectiveVolume = effectiveVolume;
            this.requestAudioFocus = requestAudioFocus;
            this.registerNoisyReceiver = registerNoisyReceiver;
            this.abandonAudioFocus = abandonAudioFocus;
        }
    }

    private String currentTrack = "off";
    private float userVolume = DEFAULT_VOLUME;
    private boolean pausedByNoisy = false;
    private AudioFocusState audioFocusState = AudioFocusState.NONE;
    private Action lastAction = Action.STOP;

    static String normalizeTrack(String track) {
        if (track == null) return "off";
        String trimmed = track.trim();
        return PLAYABLE_TRACKS.contains(trimmed) ? trimmed : "off";
    }

    static boolean isPlayableTrack(String track) {
        return !"off".equals(normalizeTrack(track));
    }

    static float clampVolume(double volume) {
        if (!Double.isFinite(volume)) return DEFAULT_VOLUME;
        if (volume < 0.0) return 0.0f;
        if (volume > 1.0) return 1.0f;
        return (float) volume;
    }

    static String assetPathForTrack(String track) {
        String normalized = normalizeTrack(track);
        return "off".equals(normalized) ? null : "public/audio/" + normalized + ".wav";
    }

    synchronized Decision evaluate(
        String rawTrack,
        double rawVolume,
        boolean hasActiveFocusSession,
        boolean focusRunning
    ) {
        String nextTrack = normalizeTrack(rawTrack);
        float nextVolume = clampVolume(rawVolume);

        if (!hasActiveFocusSession || "off".equals(nextTrack)) {
            pausedByNoisy = false;
            audioFocusState = AudioFocusState.NONE;
        } else if (!nextTrack.equals(currentTrack)) {
            // Explicit track change (including "off" -> playable track) clears noisy-pause guard.
            pausedByNoisy = false;
            if (audioFocusState == AudioFocusState.LOST) {
                audioFocusState = AudioFocusState.NONE;
            }
        }

        currentTrack = nextTrack;
        userVolume = nextVolume;

        Action action = resolveAction(hasActiveFocusSession, focusRunning);
        float effectiveVol = effectiveVolumeLocked();
        boolean requestFocus = action == Action.PLAY
            && (audioFocusState == AudioFocusState.NONE || audioFocusState == AudioFocusState.LOST);
        boolean registerNoisy = action == Action.PLAY;
        boolean abandonFocus = action == Action.STOP
            || (action == Action.PAUSE && audioFocusState != AudioFocusState.PAUSED_TRANSIENT);

        if (abandonFocus) {
            audioFocusState = AudioFocusState.NONE;
        }
        lastAction = action;
        return new Decision(action, currentTrack, effectiveVol, requestFocus, registerNoisy, abandonFocus);
    }

    synchronized boolean onBecomingNoisy() {
        if (lastAction != Action.PLAY) {
            return false;
        }
        pausedByNoisy = true;
        audioFocusState = AudioFocusState.NONE;
        lastAction = Action.PAUSE;
        return true;
    }

    synchronized void onAudioFocusChange(AudioFocusState nextFocusState) {
        audioFocusState = nextFocusState == null ? AudioFocusState.NONE : nextFocusState;
    }

    synchronized void clearPausedByNoisy() {
        pausedByNoisy = false;
        if (audioFocusState == AudioFocusState.LOST) {
            audioFocusState = AudioFocusState.NONE;
        }
    }

    synchronized boolean isPausedByNoisy() {
        return pausedByNoisy;
    }

    synchronized String getCurrentTrack() {
        return currentTrack;
    }

    private Action resolveAction(boolean hasActiveFocusSession, boolean focusRunning) {
        if (!hasActiveFocusSession || "off".equals(currentTrack)) {
            return Action.STOP;
        }
        if (!focusRunning || pausedByNoisy
            || audioFocusState == AudioFocusState.PAUSED_TRANSIENT
            || audioFocusState == AudioFocusState.LOST) {
            return Action.PAUSE;
        }
        return Action.PLAY;
    }

    private float effectiveVolumeLocked() {
        if (audioFocusState == AudioFocusState.DUCKED) {
            return userVolume * DUCK_FACTOR;
        }
        if (audioFocusState == AudioFocusState.PAUSED_TRANSIENT || audioFocusState == AudioFocusState.LOST) {
            return 0.0f;
        }
        return userVolume;
    }
}
