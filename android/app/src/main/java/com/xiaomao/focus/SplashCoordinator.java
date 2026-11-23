package com.xiaomao.focus;

/** Decides when the single-stage native splash screen can dismiss. */
final class SplashCoordinator {
    static final long MIN_ANIMATION_MS = 1000L;
    static final long MAX_WAIT_MS = 2000L;
    static final long EXIT_FADE_MS = 180L;

    private final long startElapsedMs;
    private final boolean fastEntry;
    private final boolean reducedMotion;
    private volatile boolean webReady;

    SplashCoordinator(long startElapsedMs, boolean fastEntry, boolean reducedMotion) {
        this.startElapsedMs = startElapsedMs;
        this.fastEntry = fastEntry;
        this.reducedMotion = reducedMotion;
    }

    void markWebReady() {
        webReady = true;
    }

    boolean shouldKeepOnScreen(long nowElapsedMs) {
        long elapsed = Math.max(0L, nowElapsedMs - startElapsedMs);
        if (elapsed >= MAX_WAIT_MS) {
            return false;
        }
        if (!webReady) {
            return true;
        }
        if (fastEntry || reducedMotion) {
            return false;
        }
        return elapsed < MIN_ANIMATION_MS;
    }

    boolean shouldAnimateExit() {
        return !reducedMotion;
    }
}
