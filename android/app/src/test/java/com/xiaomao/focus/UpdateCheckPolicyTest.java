package com.xiaomao.focus;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class UpdateCheckPolicyTest {
    @Test
    public void autoCheckRunsOnFirstCallAndRespectsInProcessCooldown() {
        UpdateCheckPolicy policy = new UpdateCheckPolicy();

        assertTrue(policy.shouldFetch(false, 1000L));
        assertFalse(policy.shouldFetch(false, 2000L));
        assertFalse(policy.shouldFetch(false, 60_999L));
        assertTrue(policy.shouldFetch(false, 61_000L));
    }

    @Test
    public void forcedCheckAlwaysRunsAndResetsCooldownWindow() {
        UpdateCheckPolicy policy = new UpdateCheckPolicy();

        assertTrue(policy.shouldFetch(false, 1000L));
        assertTrue(policy.shouldFetch(true, 1500L));
        assertFalse(policy.shouldFetch(false, 61_499L));
        assertTrue(policy.shouldFetch(false, 61_500L));
    }

    @Test
    public void freshLaunchInstanceAlwaysChecksImmediately() {
        UpdateCheckPolicy firstLaunch = new UpdateCheckPolicy();
        assertTrue(firstLaunch.shouldFetch(false, 5000L));

        UpdateCheckPolicy nextLaunch = new UpdateCheckPolicy();
        assertTrue(nextLaunch.shouldFetch(false, 5000L));
    }
}
