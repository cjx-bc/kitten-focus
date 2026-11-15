package com.xiaomao.focus.probe.common;

/** Decision returned by the probe's hold command before any Android mutation. */
public final class HoldRequest {
    private HoldRequest() { }

    public static Decision evaluate(int sdk, boolean connected, boolean necessaryException,
                                    Long deadlineElapsedMs, long nowElapsedMs) {
        if (sdk < 26) return new Decision("unsupported_api", false, 0);
        if (!connected) return new Decision("listener_disconnected", false, 0);
        if (necessaryException) return new Decision("necessary_exception", false, 0);
        if (deadlineElapsedMs == null) return new Decision("unsupported_no_deadline", false, 0);
        if (deadlineElapsedMs <= nowElapsedMs) return new Decision("deadline_elapsed", false, 0);
        return new Decision("ready", true, deadlineElapsedMs - nowElapsedMs);
    }

    public static final class Decision {
        public final String code;
        public final boolean maySnooze;
        public final long durationMs;

        private Decision(String code, boolean maySnooze, long durationMs) {
            this.code = code;
            this.maySnooze = maySnooze;
            this.durationMs = durationMs;
        }
    }
}
