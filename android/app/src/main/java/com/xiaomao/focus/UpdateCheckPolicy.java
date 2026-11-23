package com.xiaomao.focus;

/** Throttles automatic foreground resume checks within a single app process while checking every cold launch. */
final class UpdateCheckPolicy {
    static final long AUTO_CHECK_COOLDOWN_MS = 60_000L;

    private long lastAutoAttemptMs = -1L;

    synchronized boolean shouldFetch(boolean force, long nowElapsedMs) {
        if (force) {
            lastAutoAttemptMs = nowElapsedMs;
            return true;
        }
        if (lastAutoAttemptMs < 0L || nowElapsedMs - lastAutoAttemptMs >= AUTO_CHECK_COOLDOWN_MS) {
            lastAutoAttemptMs = nowElapsedMs;
            return true;
        }
        return false;
    }
}
