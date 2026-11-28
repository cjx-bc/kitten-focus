package com.xiaomao.focus;

import org.junit.Test;
import static org.junit.Assert.*;

public class WhiteNoisePolicyTest {
    @Test
    public void normalizesTracksAndClampsVolumeBounds() {
        assertEquals("off", WhiteNoisePolicy.normalizeTrack(null));
        assertEquals("off", WhiteNoisePolicy.normalizeTrack(""));
        assertEquals("off", WhiteNoisePolicy.normalizeTrack("thunder"));
        assertEquals("rain", WhiteNoisePolicy.normalizeTrack("rain"));
        assertEquals("birds", WhiteNoisePolicy.normalizeTrack("birds"));
        assertEquals("stream", WhiteNoisePolicy.normalizeTrack("stream"));
        assertEquals("fire", WhiteNoisePolicy.normalizeTrack("fire"));
        assertEquals("waves", WhiteNoisePolicy.normalizeTrack("waves"));

        assertEquals(0.6f, WhiteNoisePolicy.clampVolume(Double.NaN), 0.0001f);
        assertEquals(0.6f, WhiteNoisePolicy.clampVolume(Double.POSITIVE_INFINITY), 0.0001f);
        assertEquals(0.0f, WhiteNoisePolicy.clampVolume(-0.25), 0.0001f);
        assertEquals(1.0f, WhiteNoisePolicy.clampVolume(1.5), 0.0001f);
        assertEquals(0.45f, WhiteNoisePolicy.clampVolume(0.45), 0.0001f);
        assertEquals("public/audio/rain.wav", WhiteNoisePolicy.assetPathForTrack("rain"));
        assertNull(WhiteNoisePolicy.assetPathForTrack("off"));
    }

    @Test
    public void playsDuringRunningFocusAndPausesOrStopsWithSessionLifecycle() {
        WhiteNoisePolicy policy = new WhiteNoisePolicy();

        WhiteNoisePolicy.Decision standby = policy.evaluate("rain", 0.6, false, false);
        assertEquals(WhiteNoisePolicy.Action.STOP, standby.action);

        WhiteNoisePolicy.Decision running = policy.evaluate("rain", 0.6, true, true);
        assertEquals(WhiteNoisePolicy.Action.PLAY, running.action);
        assertEquals("rain", running.track);
        assertEquals(0.6f, running.effectiveVolume, 0.0001f);
        assertTrue(running.requestAudioFocus);
        assertTrue(running.registerNoisyReceiver);

        WhiteNoisePolicy.Decision paused = policy.evaluate("rain", 0.6, true, false);
        assertEquals(WhiteNoisePolicy.Action.PAUSE, paused.action);
        assertTrue(paused.abandonAudioFocus);
        assertFalse(paused.registerNoisyReceiver);

        WhiteNoisePolicy.Decision resumed = policy.evaluate("rain", 0.8, true, true);
        assertEquals(WhiteNoisePolicy.Action.PLAY, resumed.action);
        assertEquals(0.8f, resumed.effectiveVolume, 0.0001f);

        WhiteNoisePolicy.Decision ended = policy.evaluate("rain", 0.8, false, false);
        assertEquals(WhiteNoisePolicy.Action.STOP, ended.action);
        assertTrue(ended.abandonAudioFocus);
    }

    @Test
    public void becomingNoisyImmediatelyPausesAndBlocksSpeakerReplayUntilReselected() {
        WhiteNoisePolicy policy = new WhiteNoisePolicy();
        assertFalse(policy.onBecomingNoisy());

        policy.evaluate("waves", 0.7, true, true);
        assertTrue(policy.onBecomingNoisy());
        assertTrue(policy.isPausedByNoisy());

        // Even if focus is running with stale "waves" preference, stay paused (no speaker leak)
        WhiteNoisePolicy.Decision staleSync = policy.evaluate("waves", 0.7, true, true);
        assertEquals(WhiteNoisePolicy.Action.PAUSE, staleSync.action);
        assertTrue(staleSync.abandonAudioFocus);
        assertFalse(staleSync.registerNoisyReceiver);

        // Turning off clears pausedByNoisy; re-selecting a track resumes playback
        WhiteNoisePolicy.Decision turnedOff = policy.evaluate("off", 0.7, true, true);
        assertEquals(WhiteNoisePolicy.Action.STOP, turnedOff.action);
        assertFalse(policy.isPausedByNoisy());

        WhiteNoisePolicy.Decision reselected = policy.evaluate("waves", 0.7, true, true);
        assertEquals(WhiteNoisePolicy.Action.PLAY, reselected.action);

        // Becoming noisy preserves track in preferences; explicit user resume or new focus session resumes without wiping track
        assertTrue(policy.onBecomingNoisy());
        assertEquals("waves", policy.getCurrentTrack());
        assertTrue(policy.isPausedByNoisy());
        policy.clearPausedByNoisy();
        assertFalse(policy.isPausedByNoisy());
        assertEquals(WhiteNoisePolicy.Action.PLAY, policy.evaluate("waves", 0.7, true, true).action);

        assertTrue(policy.onBecomingNoisy());
        assertEquals(WhiteNoisePolicy.Action.STOP, policy.evaluate("waves", 0.7, false, false).action);
        assertFalse(policy.isPausedByNoisy());
        assertEquals(WhiteNoisePolicy.Action.PLAY, policy.evaluate("waves", 0.7, true, true).action);
    }

    @Test
    public void ducksOnTransientCanDuckAndResumesAfterTransientFocusLoss() {
        WhiteNoisePolicy policy = new WhiteNoisePolicy();
        assertEquals(3, WhiteNoisePolicy.AUDIO_FOCUS_GAIN_TRANSIENT_MAY_DUCK);

        policy.evaluate("stream", 0.8, true, true);
        policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.GAINED);

        policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.DUCKED);
        WhiteNoisePolicy.Decision ducked = policy.evaluate("stream", 0.8, true, true);
        assertEquals(WhiteNoisePolicy.Action.PLAY, ducked.action);
        assertEquals(0.2f, ducked.effectiveVolume, 0.0001f);
        assertFalse(ducked.requestAudioFocus);

        policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.PAUSED_TRANSIENT);
        WhiteNoisePolicy.Decision transientPaused = policy.evaluate("stream", 0.8, true, true);
        assertEquals(WhiteNoisePolicy.Action.PAUSE, transientPaused.action);
        // Must NOT abandon focus on transient loss so OS delivers AUDIOFOCUS_GAIN later
        assertFalse(transientPaused.abandonAudioFocus);

        policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.GAINED);
        WhiteNoisePolicy.Decision recovered = policy.evaluate("stream", 0.8, true, true);
        assertEquals(WhiteNoisePolicy.Action.PLAY, recovered.action);
        assertEquals(0.8f, recovered.effectiveVolume, 0.0001f);

        policy.onAudioFocusChange(WhiteNoisePolicy.AudioFocusState.LOST);
        WhiteNoisePolicy.Decision lost = policy.evaluate("stream", 0.8, true, true);
        assertEquals(WhiteNoisePolicy.Action.PAUSE, lost.action);
        assertTrue(lost.abandonAudioFocus);
        assertFalse(lost.requestAudioFocus);

        // Subsequent 750ms poll evaluations MUST stay PAUSE without re-requesting audio focus
        for (int i = 0; i < 5; i++) {
            WhiteNoisePolicy.Decision poll = policy.evaluate("stream", 0.8, true, true);
            assertEquals(WhiteNoisePolicy.Action.PAUSE, poll.action);
            assertFalse(poll.requestAudioFocus);
        }

        // Explicit user resume or track switch clears LOST (even when pausedByNoisy is false) and plays again
        assertFalse(policy.isPausedByNoisy());
        policy.clearPausedByNoisy();
        WhiteNoisePolicy.Decision userResumed = policy.evaluate("stream", 0.8, true, true);
        assertEquals(WhiteNoisePolicy.Action.PLAY, userResumed.action);
        assertTrue(userResumed.requestAudioFocus);
    }
}
