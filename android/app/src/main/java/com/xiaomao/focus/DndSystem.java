package com.xiaomao.focus;

/** Android permission and app-owned rule boundary. No application policy lives here. */
interface DndSystem {
    final class Rule {
        final String id, condition, fingerprint;
        final boolean original, enabled;
        final Boolean active;
        Rule(String id, String condition, String fingerprint, boolean original, boolean enabled, Boolean active) {
            this.id = id; this.condition = condition; this.fingerprint = fingerprint;
            this.original = original; this.enabled = enabled; this.active = active;
        }
    }
    boolean supported();
    boolean permissionGranted();
    int globalFilter();
    Rule find(String condition);
    Rule read(String id, String condition);
    String create(String condition);
    void activate(String id, String condition);
    boolean remove(String id);
}
