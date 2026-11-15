package com.xiaomao.focus;

import java.util.List;

/** Android boundary: implementations must expose and change only this application's main tasks. */
interface RecentTasksSystem {
    final class Task {
        final int id; final String identity; final boolean excluded;
        Task(int id, String identity, boolean excluded) { this.id = id; this.identity = identity; this.excluded = excluded; }
    }
    boolean recoveryReachable();
    List<Task> ownTasks();
    void exclude(Task task, boolean excluded);
}
