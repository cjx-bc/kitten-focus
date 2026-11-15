package com.xiaomao.focus;
import java.util.*;
public final class NotificationPolicyTest {
    public static void main(String[] args) {
        NotificationSystem.Notice ordinary = new NotificationSystem.Notice("key", "blocked.app", 9, "", false);
        Set<String> allowed = new HashSet<>(Arrays.asList("allowed.app", "own.app"));
        if (NotificationPolicy.duration(ordinary, allowed, 160000, 100000, true) != 60000) throw new AssertionError("Fixed remaining duration");
        if (NotificationPolicy.duration(ordinary, allowed, 160000, 160000, true) != 0) throw new AssertionError("No re-hold at cutoff");
        if (NotificationPolicy.duration(ordinary, allowed, 160000, 100000, false) != 0) throw new AssertionError("No work without connected authorization");
        if (NotificationPolicy.duration(new NotificationSystem.Notice("a", "allowed.app", 9, "", false), allowed, 160000, 100000, true) != 0) throw new AssertionError("Effective whitelist");
        if (NotificationPolicy.duration(new NotificationSystem.Notice("n", "blocked.app", 9, "", true), allowed, 160000, 100000, true) != 0) throw new AssertionError("Necessary exception");
        System.out.println("Notification policy: 5 public boundary examples passed");
    }
}
