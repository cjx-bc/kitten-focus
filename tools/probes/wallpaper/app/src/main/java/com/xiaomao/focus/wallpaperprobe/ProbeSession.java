package com.xiaomao.focus.wallpaperprobe;

import java.util.Properties;

/** Durable, public command API of the isolated probe; Android is the only external seam. */
public final class ProbeSession {
    public interface Store {
        Properties load();
        void save(Properties state);
    }

    public interface Platform {
        Baseline capture() throws Exception;
        Identity current() throws Exception;
        String ownComponent();
        void restoreStatic(Baseline baseline, boolean restoreLock) throws Exception;
    }

    public static final class Identity {
        public final int homeId, lockId;
        public final String component, limitation, lockComponent;
        public Identity(int homeId, int lockId, String component, String limitation) {
            this(homeId, lockId, component, limitation, "");
        }
        public Identity(int homeId, int lockId, String component, String limitation, String lockComponent) {
            this.homeId = homeId;
            this.lockId = lockId;
            this.component = component;
            this.limitation = limitation;
            this.lockComponent = lockComponent;
        }
        public boolean sameHome(Identity other) {
            return homeId >= 0 && other.homeId == homeId && component.equals(other.component);
        }
    }

    public static final class Baseline {
        public final Identity identity;
        public final String homeFile, lockFile, note;
        public Baseline(Identity identity, String homeFile, String lockFile, String note) {
            this.identity = identity;
            this.homeFile = homeFile;
            this.lockFile = lockFile;
            this.note = note;
        }
        public boolean automaticImageRestoreAvailable() {
            return identity.component.isEmpty() && !homeFile.isEmpty()
                && identity.lockComponent.isEmpty() && (identity.lockId < 0 || !lockFile.isEmpty());
        }
    }

    public static final class Snapshot {
        public final String status, detail;
        public final Baseline baseline;
        public final Identity owned;
        public final boolean unresolved;
        Snapshot(String status, String detail, Baseline baseline, Identity owned, boolean unresolved) {
            this.status = status;
            this.detail = detail;
            this.baseline = baseline;
            this.owned = owned;
            this.unresolved = unresolved;
        }
    }

    private final Store store;
    private final Platform platform;

    public ProbeSession(Store store, Platform platform) {
        this.store = store;
        this.platform = platform;
    }

    public synchronized Snapshot captureBaseline() {
        Properties p = store.load();
        if (Boolean.parseBoolean(p.getProperty("unresolved", "false")))
            return result(p, "RECOVERY_REQUIRED", "Existing restoration responsibility retained; restore first.");
        try {
            Baseline baseline = platform.capture();
            if (baseline.identity.homeId < 0)
                return result(p, "IDENTITY_UNAVAILABLE", "Cannot track wallpaper identity; experiment refused.");
            p.clear();
            putIdentity(p, "baseline", baseline.identity);
            p.setProperty("baseline.homeFile", baseline.homeFile);
            p.setProperty("baseline.lockFile", baseline.lockFile);
            p.setProperty("baseline.note", baseline.note);
            return result(p, "BASELINE_SAVED", baseline.note);
        } catch (Exception e) {
            return result(p, "BASELINE_FAILED", message(e));
        }
    }

    /** Does not set wallpaper. Caller may open Android's picker only for the awaiting result. */
    public synchronized Snapshot enable(boolean acknowledgeIncompleteRecovery) {
        Properties p = store.load();
        Baseline b = baseline(p);
        if (b == null) return result(p, "BASELINE_REQUIRED", "Capture the original state first.");
        if (Boolean.parseBoolean(p.getProperty("unresolved", "false")))
            return result(p, "RECOVERY_REQUIRED", "Finish the previous experiment first.");
        if (!b.automaticImageRestoreAvailable() && !acknowledgeIncompleteRecovery)
            return result(p, "LIMITATION_ACK_REQUIRED", "Original pixels or live-wallpaper settings cannot be restored automatically. Save an external original and acknowledge this limit.");
        try {
            Identity now = platform.current();
            if (!b.identity.sameHome(now) || b.identity.lockId != now.lockId)
                return result(p, "BASELINE_STALE", "Wallpaper changed after capture; capture a new baseline.");
            p.setProperty("unresolved", "true");
            return result(p, "AWAITING_SYSTEM_CONFIRMATION", "Only Android's live-wallpaper picker can apply the probe. Cancel keeps the original.");
        } catch (Exception e) { return result(p, "STATE_FAILED", message(e)); }
    }

    public synchronized Snapshot pickerUnavailable(String reason) {
        Properties p = store.load();
        p.setProperty("unresolved", "false");
        return result(p, "PICKER_UNAVAILABLE", reason);
    }

    public synchronized Snapshot pickerReturned() { return refresh(); }

    /** Public observation command, including after process reconstruction or device reboot. */
    public synchronized Snapshot refresh() {
        Properties p = store.load();
        String status = p.getProperty("status", "IDLE");
        if (!Boolean.parseBoolean(p.getProperty("unresolved", "false"))) return snapshot(p);
        try {
            Identity now = platform.current();
            if (status.equals("AWAITING_SYSTEM_CONFIRMATION")) {
                if (platform.ownComponent().equals(now.component) && now.homeId >= 0) {
                    putIdentity(p, "owned", now);
                    return result(p, "ACTIVE", "System selection observed. Lifecycle events must independently prove any reconnect effect.");
                }
                p.setProperty("unresolved", "false");
                return result(p, "DECLINED", "Probe not selected; no automatic wallpaper write occurred.");
            }
            Baseline b = baseline(p);
            Identity owned = identity(p, "owned");
            if (status.equals("AWAITING_ORIGINAL_CONFIRMATION") && b != null
                    && !b.identity.component.isEmpty() && b.identity.component.equals(now.component)) {
                p.setProperty("unresolved", "false");
                return result(p, "LIVE_COMPONENT_RESTORED_SETTINGS_UNVERIFIED", "Original live component selected by user; provider-specific settings and crop are not backed up by public Android APIs.");
            }
            if (owned != null && !owned.sameHome(now)) {
                if (Boolean.parseBoolean(p.getProperty("restoreAttempted", "false")))
                    return result(p, "RESTORE_UNCERTAIN", "A restoration write may have partially succeeded. Current wallpaper preserved; acknowledge manual recovery to resolve this responsibility.");
                p.setProperty("unresolved", "false");
                return result(p, "USER_CHOICE_PRESERVED", "Current wallpaper is no longer this experiment's selection. No restoration write will override it.");
            }
            return snapshot(p);
        } catch (Exception e) { return result(p, "STATE_FAILED", message(e)); }
    }

    /** Stop auxiliary activity and request restoration; never overwrites a later user choice. */
    public synchronized Snapshot restore() {
        refresh();
        Properties p = store.load();
        if (!Boolean.parseBoolean(p.getProperty("unresolved", "false"))) return snapshot(p);
        Baseline b = baseline(p);
        Identity owned = identity(p, "owned");
        if (b == null || owned == null) return result(p, "RESTORE_PENDING", "Waiting for system selection result; refresh after leaving the picker.");
        try {
            Identity now = platform.current();
            if (!owned.sameHome(now)) {
                if (Boolean.parseBoolean(p.getProperty("restoreAttempted", "false")))
                    return result(p, "RESTORE_UNCERTAIN", "A prior write may have partially succeeded; no further automatic write can safely infer ownership. Restore manually and confirm.");
                p.setProperty("unresolved", "false");
                return result(p, "USER_CHOICE_PRESERVED", "Later home wallpaper choice preserved; no write.");
            }
            if (!b.identity.component.isEmpty())
                return result(p, "AWAITING_ORIGINAL_CONFIRMATION", "Choose the original live component in Android's picker. Its private settings cannot be guaranteed.");
            if (b.homeFile.isEmpty())
                return result(p, "MANUAL_RESTORE_REQUIRED", "Original static image unreadable to this app. Open system wallpaper settings and select your saved original; responsibility and retry remain visible.");
            boolean lockUnchanged = now.lockId == owned.lockId;
            if (lockUnchanged && !b.identity.lockComponent.isEmpty())
                return result(p, "MANUAL_RESTORE_REQUIRED", "Original separate lock live wallpaper cannot be restored by a home-only picker. Restore both via system settings.");
            if (lockUnchanged && b.identity.lockId >= 0 && b.lockFile.isEmpty())
                return result(p, "MANUAL_RESTORE_REQUIRED", "Original separate lock image is unavailable; automatic home write could change lock state. Restore manually.");
            p.setProperty("restoreAttempted", "true");
            result(p, "RESTORING", "Restoration in progress; interrupted writes retain responsibility.");
            platform.restoreStatic(b, lockUnchanged);
            Identity after = platform.current();
            if (!after.component.isEmpty() || after.homeId == owned.homeId)
                return result(p, "RESTORE_FAILED", "Static restore did not change the observed home identity; retry remains available.");
            p.setProperty("unresolved", "false");
            return result(p, lockUnchanged ? "STATIC_RESTORED_CROP_UNVERIFIED" : "HOME_RESTORED_USER_LOCK_PRESERVED",
                lockUnchanged ? "Saved image restored. Android does not expose the original crop/offset; verify visually."
                    : "Saved home image restored; later lock wallpaper choice was preserved. Verify visually.");
        } catch (Exception e) { return result(p, "RESTORE_FAILED", message(e)); }
    }

    /** Explicit manual recovery observation; selected originals are not inferred from a write call. */
    public synchronized Snapshot confirmManualRestore() {
        refresh();
        Properties p = store.load();
        if (!Boolean.parseBoolean(p.getProperty("unresolved", "false"))) return snapshot(p);
        if (p.getProperty("status", "").equals("RESTORE_UNCERTAIN")) {
            p.setProperty("unresolved", "false");
            return result(p, "MANUAL_RECOVERY_ACKNOWLEDGED", "User explicitly acknowledged manual recovery. Original crop/settings were not automatically verified.");
        }
        return result(p, "MANUAL_RESTORE_REQUIRED", "Still the probe wallpaper. Select your original in system settings; refresh to observe the change.");
    }

    public synchronized Snapshot snapshot() { return snapshot(store.load()); }

    private Snapshot result(Properties p, String status, String detail) {
        p.setProperty("status", status);
        p.setProperty("detail", detail);
        store.save(p);
        return snapshot(p);
    }
    private static Snapshot snapshot(Properties p) {
        return new Snapshot(p.getProperty("status", "IDLE"), p.getProperty("detail", "No experiment started."),
            baseline(p), identity(p, "owned"), Boolean.parseBoolean(p.getProperty("unresolved", "false")));
    }
    private static Baseline baseline(Properties p) {
        Identity i = identity(p, "baseline");
        return i == null ? null : new Baseline(i, p.getProperty("baseline.homeFile", ""),
            p.getProperty("baseline.lockFile", ""), p.getProperty("baseline.note", ""));
    }
    private static Identity identity(Properties p, String prefix) {
        if (!p.containsKey(prefix + ".homeId")) return null;
        return new Identity(Integer.parseInt(p.getProperty(prefix + ".homeId")),
            Integer.parseInt(p.getProperty(prefix + ".lockId", "-1")),
            p.getProperty(prefix + ".component", ""), p.getProperty(prefix + ".limitation", ""), p.getProperty(prefix + ".lockComponent", ""));
    }
    private static void putIdentity(Properties p, String prefix, Identity i) {
        p.setProperty(prefix + ".homeId", Integer.toString(i.homeId));
        p.setProperty(prefix + ".lockId", Integer.toString(i.lockId));
        p.setProperty(prefix + ".component", i.component);
        p.setProperty(prefix + ".limitation", i.limitation);
        p.setProperty(prefix + ".lockComponent", i.lockComponent);
    }
    private static String message(Exception e) { return e.getClass().getSimpleName() + ": " + e.getMessage(); }
}
