package com.xiaomao.focus;

import java.util.List;

/** Android public listener boundary. Notice deliberately cannot carry message content or intents. */
interface NotificationSystem {
    final class Notice {
        final String key, packageName, group;
        final int uid;
        final boolean necessary;
        Notice(String key, String packageName, int uid, String group, boolean necessary) {
            this.key = key; this.packageName = packageName; this.uid = uid;
            this.group = group == null ? "" : group; this.necessary = necessary;
        }
    }
    boolean supported();
    boolean authorized();
    boolean connected();
    default String failure() { return ""; }
    List<Notice> active();
    List<Notice> snoozed();
    /** Also permits T12's experimentally verified re-snooze of an already held original key. */
    void snooze(String key, long durationMs);
}
