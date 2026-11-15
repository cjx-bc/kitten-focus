package com.xiaomao.focus.wallpaperprobe;

import java.util.Properties;

/** Public native probe contract. The only fake is the Android/device boundary. */
public final class ProbeSessionContractTest {
    public static void main(String[] args) {
        MemoryStore store = new MemoryStore();
        Device device = new Device();
        ProbeSession probe = new ProbeSession(store, device);
        check("BASELINE_REQUIRED".equals(probe.enable(false).status), "cannot enable without a baseline");
        device.current = new ProbeSession.Identity(22, -1, "", "");
        probe.captureBaseline();
        check("AWAITING_SYSTEM_CONFIRMATION".equals(probe.enable(false).status), "enable only requests system confirmation");
        check(device.staticWrites == 0, "request does not change wallpaper");
        probe.pickerReturned();
        check("DECLINED".equals(probe.snapshot().status), "cancel is not success");
        check(device.staticWrites == 0, "cancel does not write");
        System.out.println("PASS baseline and system refusal contract");

        probe.enable(false);
        device.current = new ProbeSession.Identity(20, -1, "probe/Wallpaper", "");
        probe.pickerReturned();
        probe = new ProbeSession(store, device);
        check("ACTIVE".equals(probe.refresh().status), "process reconstruction retains the selected experiment");
        device.current = new ProbeSession.Identity(21, -1, "later/Wallpaper", "");
        check("USER_CHOICE_PRESERVED".equals(probe.restore().status), "later home choice survives stop");
        check(device.staticWrites == 0, "later user choice is never overwritten");
        System.out.println("PASS durable ownership and user choice contract");

        device.current = new ProbeSession.Identity(23, -1, "", "");
        probe.captureBaseline();
        probe.enable(false);
        device.current = new ProbeSession.Identity(30, -1, "probe/Wallpaper", "");
        probe.pickerReturned();
        device.partialFailure = true;
        check("RESTORE_FAILED".equals(probe.restore().status), "partial restore failure reported");
        probe = new ProbeSession(store, device);
        check(probe.refresh().unresolved, "partial write and process reconstruction retain recovery responsibility");
        check("RESTORE_UNCERTAIN".equals(probe.snapshot().status), "own partial write is not mislabeled as user choice");
        System.out.println("PASS partial restore remains recoverable after process death");
    }

    static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    static final class MemoryStore implements ProbeSession.Store {
        Properties saved = new Properties();
        public Properties load() { Properties p = new Properties(); p.putAll(saved); return p; }
        public void save(Properties p) { saved = new Properties(); saved.putAll(p); }
    }

    static final class Device implements ProbeSession.Platform {
        ProbeSession.Identity current = new ProbeSession.Identity(10, -1, "", "");
        int staticWrites;
        boolean failRestore;
        boolean partialFailure;
        public ProbeSession.Baseline capture() {
            return new ProbeSession.Baseline(current, "home-original.bin", "", "fixture original; independent known state");
        }
        public ProbeSession.Identity current() { return current; }
        public String ownComponent() { return "probe/Wallpaper"; }
        public void restoreStatic(ProbeSession.Baseline baseline, boolean restoreLock) throws Exception {
            if (failRestore) throw new java.io.IOException("fixture storage failure");
            staticWrites++;
            current = new ProbeSession.Identity(90, -1, "", "");
            if (partialFailure) throw new java.io.IOException("fixture lock restore failed after home write");
        }
    }
}
