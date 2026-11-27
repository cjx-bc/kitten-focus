package com.xiaomao.focus;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class KeepScreenOnPolicyTest {
    @Test
    public void keepsScreenOnByDefaultDuringRunningFocusOrRest() throws Exception {
        JSONObject defaultData = new JSONObject().put("preferences", new JSONObject());
        JSONObject runningFocus = new JSONObject().put("id", "f1").put("state", "running");
        JSONObject runningRest = new JSONObject().put("state", "running");

        assertTrue(MainActivity.shouldKeepScreenOn(null, runningFocus, null));
        assertTrue(MainActivity.shouldKeepScreenOn(defaultData, runningFocus, null));
        assertTrue(MainActivity.shouldKeepScreenOn(defaultData, null, runningRest));
    }

    @Test
    public void clearsKeepScreenOnWhenPausedCompletedStandbyLockedOrDisabled() throws Exception {
        JSONObject enabledData = new JSONObject().put("preferences", new JSONObject().put("keepScreenOn", true));
        JSONObject disabledData = new JSONObject().put("preferences", new JSONObject().put("keepScreenOn", false));
        JSONObject runningFocus = new JSONObject().put("id", "f1").put("state", "running");
        JSONObject pausedFocus = new JSONObject().put("id", "f1").put("state", "paused");
        JSONObject runningLock = new JSONObject().put("id", "l1").put("kind", "lock").put("state", "running");
        JSONObject runningRest = new JSONObject().put("state", "running");
        JSONObject completedRest = new JSONObject().put("state", "completed");

        assertFalse(MainActivity.shouldKeepScreenOn(enabledData, null, null));
        assertFalse(MainActivity.shouldKeepScreenOn(enabledData, pausedFocus, null));
        assertFalse(MainActivity.shouldKeepScreenOn(enabledData, runningLock, null));
        assertFalse(MainActivity.shouldKeepScreenOn(enabledData, null, completedRest));

        assertFalse(MainActivity.shouldKeepScreenOn(disabledData, runningFocus, null));
        assertFalse(MainActivity.shouldKeepScreenOn(disabledData, null, runningRest));
    }
}
