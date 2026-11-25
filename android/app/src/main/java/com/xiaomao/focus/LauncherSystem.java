package com.xiaomao.focus;

/** OS boundary scoped exclusively to our launcher alias and explicit recovery activity. */
interface LauncherSystem {
    boolean recoveryAvailable();
    boolean recoveryReachable();
    int componentState();
    void componentState(int state);
    boolean launcherVisible();
    default boolean conflictsWithAccessibilitySecurity() { return false; }
    default long installedVersion() { return BuildConfig.VERSION_CODE; }
}
