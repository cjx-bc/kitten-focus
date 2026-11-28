package com.xiaomao.focus;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public class BusinessBackupDataPetTest {
    private static final String CHICK = "\uD83D\uDC25";

    @Test
    public void legacyDataRemainsValidAndOptionalFieldsStayAbsent() throws Exception {
        JSONObject data = data();
        BusinessBackupData.validate(data);
        assertJsonEquals(data, BusinessBackupData.portable(data));
        assertJsonEquals(snapshot(data), BusinessBackupData.snapshot(snapshot(data)));
    }

    @Test
    public void portableAndSnapshotPreserveAllCompanionFieldsIncludingJsonNull() throws Exception {
        JSONObject data = companionData();
        BusinessBackupData.validate(data);
        JSONObject portable = BusinessBackupData.portable(data);
        assertJsonEquals(data, portable);
        assertTrue(portable.getJSONObject("pet").has("lastSelectedItemId"));
        assertTrue(portable.getJSONObject("pet").isNull("lastSelectedItemId"));
        assertTrue(portable.getJSONObject("pet").has("retroCutoffAt"));
        assertTrue(portable.getJSONObject("pet").isNull("retroCutoffAt"));
        assertJsonEquals(snapshot(data), BusinessBackupData.snapshot(snapshot(data)));

        JSONObject pet = data.getJSONObject("pet");
        pet.remove("selectedSkins");
        pet.put("selectedAnimalId", "black-cat").put("lastSelectedItemId", "task-1").put("retroCutoffAt", 0.5);
        record(data).put("note", "").put("source", "manual").put("failReason", "left_app");
        BusinessBackupData.validate(data);
        assertJsonEquals(data, BusinessBackupData.portable(data));
        assertFalse(BusinessBackupData.portable(data).getJSONObject("pet").has("selectedSkins"));
    }

    @Test
    public void portableAndSnapshotStripInjectedRuntimeFields() throws Exception {
        JSONObject expected = companionData();
        JSONObject injected = companionData();
        injected.put("active", new JSONObject()).put("rest", new JSONObject().put("durationMs", 60000))
            .put("notifications", new JSONArray()).put("authorized", true).put("temporaryAccess", new JSONObject());
        injected.getJSONObject("preferences").put("authorized", true);
        injected.getJSONObject("pet").put("secret", true);
        record(injected).put("temporaryAccess", new JSONObject()).put("active", true)
            .getJSONArray("segments").getJSONObject(0).put("runtime", true);
        BusinessBackupData.validate(injected);

        injected.getJSONObject("pet").getJSONObject("selectedSkins").put("secret", "x").put("black-cat", " ");
        assertJsonEquals(expected, BusinessBackupData.portable(injected));
        JSONObject saved = snapshot(injected).put("active", new JSONObject());
        saved.getJSONObject("documents").put("notifications", new JSONArray());
        assertJsonEquals(snapshot(expected), BusinessBackupData.snapshot(saved));
    }

    @Test
    public void rejectsMalformedOptionalRecordFields() throws Exception {
        rejectRecord("animalId", "unlisted", true, JSONObject.NULL);
        rejectRecord("skinId", "", "\u00a0", CHICK.repeat(41), 3, JSONObject.NULL);
        rejectRecord("note", CHICK.repeat(101), false, JSONObject.NULL);
        rejectRecord("source", "other", 3, JSONObject.NULL);
        rejectRecord("failReason", "other", false, JSONObject.NULL);

        assertThrows(IllegalArgumentException.class, () ->
            BusinessBackupData.validateRecordFields(new JSONObject().put("id", "r1").put("animalId", "bad"))
        );
    }

    @Test
    public void rejectsMalformedOptionalPreferences() throws Exception {
        rejectPreference("restMinutes", 0, 61, 5.5, "5", true, JSONObject.NULL);
        for (String key : new String[]{"autoRest", "pomodoroLoop", "keepScreenOn", "leaveAppFail"}) {
            rejectPreference(key, 0, "true", JSONObject.NULL);
        }
        rejectPreference("whiteNoise", "thunder", 0, JSONObject.NULL);
        rejectPreference("whiteNoiseVolume", -0.1, 1.1, "0.4", true, JSONObject.NULL);
        rejectPreference("animation", "auto", true, JSONObject.NULL);
    }

    @Test
    public void rejectsMalformedPetData() throws Exception {
        for (Object pet : new Object[]{JSONObject.NULL, new JSONArray(), true, "pet", new JSONObject()}) {
            JSONObject data = data().put("pet", pet);
            assertThrows(IllegalArgumentException.class, () -> BusinessBackupData.validate(data));
        }
        rejectPetField("version", "1", 1.5, 2, JSONObject.NULL);
        rejectPetField("selectedAnimalId", "unlisted", JSONObject.NULL);
        rejectPetField("selectedSkins", new JSONArray(), JSONObject.NULL,
            new JSONObject().put("unlisted", "coat"), new JSONObject().put("black-cat", 3),
            new JSONObject().put("black-cat", "\u00a0"), new JSONObject().put("black-cat", CHICK.repeat(41)));
        rejectPetField("lastSelectedItemId", "", " ", false);
        rejectPetField("retroCutoffAt", -1, true, "1");
        for (String key : new String[]{"lastSelectedItemId", "retroCutoffAt"}) {
            JSONObject data = companionData();
            data.getJSONObject("pet").remove(key);
            assertThrows(key, IllegalArgumentException.class, () -> BusinessBackupData.validate(data));
        }
    }

    @Test
    public void rejectsNumericOverflowInBackupJson() throws Exception {
        String json = companionData().toString();
        JSONObject preferenceOverflow = new JSONObject(json.replace("\"whiteNoiseVolume\":0.4", "\"whiteNoiseVolume\":1e400"));
        assertThrows(IllegalArgumentException.class, () -> BusinessBackupData.validate(preferenceOverflow));
        JSONObject cutoffOverflow = new JSONObject(json.replace("\"retroCutoffAt\":null", "\"retroCutoffAt\":1e400"));
        assertThrows(IllegalArgumentException.class, () -> BusinessBackupData.validate(cutoffOverflow));
    }

    private static void assertJsonEquals(Object expected, Object actual) throws Exception {
        if (expected instanceof JSONObject && actual instanceof JSONObject) {
            JSONObject expectedObject = (JSONObject) expected;
            JSONObject actualObject = (JSONObject) actual;
            assertEquals(expectedObject.length(), actualObject.length());
            java.util.Iterator<String> keys = expectedObject.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                assertJsonEquals(expectedObject.get(key), actualObject.get(key));
            }
        } else if (expected instanceof JSONArray && actual instanceof JSONArray) {
            JSONArray expectedArray = (JSONArray) expected;
            JSONArray actualArray = (JSONArray) actual;
            assertEquals(expectedArray.length(), actualArray.length());
            for (int i = 0; i < expectedArray.length(); i++) assertJsonEquals(expectedArray.get(i), actualArray.get(i));
        } else {
            assertEquals(expected, actual);
        }
    }

    private static void rejectRecord(String key, Object... values) throws Exception {
        for (Object value : values) {
            JSONObject data = data();
            record(data).put(key, value);
            assertThrows(key + "=" + value, IllegalArgumentException.class, () -> BusinessBackupData.validate(data));
        }
    }

    private static void rejectPreference(String key, Object... values) throws Exception {
        for (Object value : values) {
            JSONObject data = data();
            data.getJSONObject("preferences").put(key, value);
            assertThrows(key + "=" + value, IllegalArgumentException.class, () -> BusinessBackupData.validate(data));
        }
    }

    private static void rejectPetField(String key, Object... values) throws Exception {
        for (Object value : values) {
            JSONObject data = companionData();
            data.getJSONObject("pet").put(key, value);
            assertThrows(key + "=" + value, IllegalArgumentException.class, () -> BusinessBackupData.validate(data));
        }
    }

    private static JSONObject record(JSONObject data) throws Exception {
        return data.getJSONArray("records").getJSONObject(0);
    }

    private static JSONObject snapshot(JSONObject data) throws Exception {
        return new JSONObject().put("documents", new JSONObject().put("data", data))
            .put("records", data.getJSONArray("records"));
    }

    private static JSONObject data() throws Exception {
        JSONObject data = new JSONObject().put("schemaVersion", 1)
            .put("preferences", new JSONObject().put("defaultMinutes", 25).put("sound", true)
                .put("vibration", true).put("activeSemesterId", JSONObject.NULL));
        for (String key : new String[]{"themes", "items", "deletedRecordIds", "events", "eventExceptions",
                "semesters", "courses", "courseExceptions"}) {
            data.put(key, new JSONArray());
        }
        JSONObject record = new JSONObject().put("id", "focus-1").put("itemId", JSONObject.NULL)
            .put("themeId", JSONObject.NULL).put("title", "Free focus").put("themeName", "Free focus")
            .put("color", "#ef4e36").put("mode", "countdown").put("targetMs", 25000)
            .put("startedAt", 10000).put("endedAt", 20000).put("timeZone", "UTC")
            .put("durationMs", 10000).put("pausedMs", 0).put("status", "early")
            .put("segments", new JSONArray().put(new JSONObject().put("start", 10000).put("end", 20000)));
        return data.put("records", new JSONArray().put(record));
    }

    private static JSONObject companionData() throws Exception {
        JSONObject data = data();
        record(data).put("animalId", "yellow-chick").put("skinId", CHICK.repeat(40))
            .put("note", "a".repeat(99) + CHICK).put("source", "timer").put("failReason", "manual_giveup");
        data.getJSONObject("preferences").put("restMinutes", 60).put("autoRest", true).put("pomodoroLoop", false)
            .put("keepScreenOn", true).put("leaveAppFail", false).put("whiteNoise", "rain")
            .put("whiteNoiseVolume", 0.4).put("animation", "system");
        return data.put("pet", new JSONObject().put("version", 1).put("selectedAnimalId", "random")
            .put("selectedSkins", new JSONObject().put("yellow-chick", CHICK.repeat(40)))
            .put("lastSelectedItemId", JSONObject.NULL).put("retroCutoffAt", JSONObject.NULL));
    }
}
