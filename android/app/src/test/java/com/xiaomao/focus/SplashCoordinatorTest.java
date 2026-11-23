package com.xiaomao.focus;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SplashCoordinatorTest {
    @Test
    public void normalLaunchHoldsUntilWebReadyAndMinimumAnimationComplete() {
        SplashCoordinator coordinator = new SplashCoordinator(1000L, false, false);

        assertTrue(coordinator.shouldKeepOnScreen(1000L));
        assertTrue(coordinator.shouldKeepOnScreen(1900L));

        coordinator.markWebReady();
        assertTrue(coordinator.shouldKeepOnScreen(1400L));
        assertTrue(coordinator.shouldKeepOnScreen(1779L));
        assertFalse(coordinator.shouldKeepOnScreen(1780L));
        assertTrue(coordinator.shouldAnimateExit());
    }

    @Test
    public void fastEntrySkipsMinimumAnimationOnceWebIsReady() {
        SplashCoordinator coordinator = new SplashCoordinator(1000L, true, false);

        assertTrue(coordinator.shouldKeepOnScreen(1040L));
        coordinator.markWebReady();
        assertFalse(coordinator.shouldKeepOnScreen(1050L));
        assertTrue(coordinator.shouldAnimateExit());
    }

    @Test
    public void reducedMotionSkipsMinimumWaitAndExitAnimation() {
        SplashCoordinator coordinator = new SplashCoordinator(1000L, false, true);

        assertTrue(coordinator.shouldKeepOnScreen(1020L));
        coordinator.markWebReady();
        assertFalse(coordinator.shouldKeepOnScreen(1030L));
        assertFalse(coordinator.shouldAnimateExit());
    }

    @Test
    public void releasesAtMaxTimeoutEvenWithoutWebSignal() {
        SplashCoordinator coordinator = new SplashCoordinator(1000L, false, false);

        assertTrue(coordinator.shouldKeepOnScreen(2799L));
        assertFalse(coordinator.shouldKeepOnScreen(2800L));
    }
}
