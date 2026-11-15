package com.xiaomao.focus;

import java.util.Set;

/** Fixed-deadline decision, shared by Android execution and the host contract checks. */
final class NotificationPolicy {
    static long duration(NotificationSystem.Notice notice, Set<String> whitelist, long deadline, long now, boolean ready) {
        if (!ready || notice.necessary || whitelist.contains(notice.packageName) || deadline <= now) return 0;
        return deadline - now;
    }
}
