package com.xiaomao.focus;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Set;
import java.util.regex.Pattern;

/** Portable configuration and history only. Never copy adapter journals or OS grants. */
final class BusinessBackupData {
    private static final String RECORD_FIELDS =
        "id itemId themeId title themeName color mode targetMs startedAt endedAt timeZone durationMs pausedMs status " +
        "animalId skinId note source failReason";
    private static final String PREFERENCE_FIELDS =
        "defaultMinutes sound vibration activeSemesterId restMinutes autoRest pomodoroLoop keepScreenOn " +
        "leaveAppFail whiteNoise whiteNoiseVolume animation";
    private static final String PET_FIELDS = "version selectedAnimalId lastSelectedItemId retroCutoffAt";
    private static final Set<String> ANIMAL_IDS = Set.of(
        "black-cat", "yellow-chick", "white-goose", "orange-cat", "pixel-bird", "patch-bear",
        "green-parrot", "flying-pig", "balloon-dog", "light-deer", "angel-cat", "black-dragon"
    );
    private static final Set<String> WHITE_NOISE_IDS = Set.of("off", "rain", "birds", "stream", "fire", "waves");
    private static final Set<String> ANIMATIONS = Set.of("system", "on", "off");
    private static final Set<String> RECORD_SOURCES = Set.of("timer", "manual");
    private static final Set<String> FAIL_REASONS = Set.of("manual_giveup", "left_app");
    private static final String[] BOOLEAN_PREFERENCES = {"autoRest", "pomodoroLoop", "keepScreenOn", "leaveAppFail"};
    // Match the whitespace removed by TypeScript's String.trim(), including NBSP and BOM.
    private static final Pattern NON_BLANK = Pattern.compile(
        "[^\\x09-\\x0D\\x20\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]"
    );

    static void validate(JSONObject data) throws JSONException {
        if (data == null || data.optInt("schemaVersion") != 1)
            throw new IllegalArgumentException("此恢复副本与当前版本不兼容");
        JSONObject preferences = data.optJSONObject("preferences");
        if (preferences == null) throw new IllegalArgumentException("备份设置损坏");
        validateCompanionPreferences(preferences);
        if (data.has("pet")) validatePet(data.opt("pet"));
        if (data.has("records")) {
            JSONArray records = data.getJSONArray("records");
            for (int i = 0; i < records.length(); i++) validateRecordFields(records.getJSONObject(i));
        }
        if (preferences.has("protection")) {
            JSONObject protection = preferences.getJSONObject("protection");
            for (String key : new String[]{"study", "strict", "interceptNotifications", "dnd"})
                if (protection.has(key) && !(protection.get(key) instanceof Boolean))
                    throw new IllegalArgumentException("保护设置损坏");
            for (String key : new String[]{"globalWhitelist", "enhancements"})
                if (protection.has(key)) strings(protection.getJSONArray(key));
            if (protection.has("modules")) validateModules(protection.opt("modules"));
        }
        if (data.has("lockConfigurations")) {
            JSONArray locks = data.getJSONArray("lockConfigurations"); java.util.Set<String> ids = new java.util.HashSet<>();
            for (int i = 0; i < locks.length(); i++) {
                JSONObject lock = locks.getJSONObject(i); Object minutes = lock.opt("minutes");
                if (!(lock.opt("id") instanceof String) || lock.optString("id").isEmpty() || !ids.add(lock.getString("id")) ||
                    !(lock.opt("name") instanceof String) || lock.optString("name").trim().isEmpty() ||
                    !(minutes instanceof Number) || ((Number)minutes).doubleValue() < 1 ||
                    ((Number)minutes).doubleValue() != Math.floor(((Number)minutes).doubleValue()) ||
                    lock.has("strict") && !(lock.get("strict") instanceof Boolean))
                    throw new IllegalArgumentException("锁机配置损坏");
                JSONObject list = lock.getJSONObject("whitelist");
                if (lock.has("enhancements")) strings(lock.getJSONArray("enhancements"));
                if (list.optString("source").equals("custom")) strings(list.getJSONArray("packages"));
                else if (!list.optString("source").equals("global")) throw new IllegalArgumentException("锁机白名单损坏");
            }
        }
    }

    private static boolean isChoice(Object value, Set<String> choices) {
        return value instanceof String && choices.contains(value);
    }

    private static boolean nonBlankString(Object value) {
        return value instanceof String && NON_BLANK.matcher((String) value).find();
    }

    private static boolean withinCodePoints(Object value, int max) {
        if (!(value instanceof String)) return false;
        String text = (String) value;
        return text.codePointCount(0, text.length()) <= max;
    }

    private static boolean validSkin(Object value) {
        return nonBlankString(value) && withinCodePoints(value, 40);
    }

    private static boolean finiteInRange(Object value, double min, double max) {
        if (!(value instanceof Number)) return false;
        double number = ((Number) value).doubleValue();
        return Double.isFinite(number) && number >= min && number <= max;
    }

    private static void validateRecordFields(JSONObject record) {
        if ((record.has("animalId") && !isChoice(record.opt("animalId"), ANIMAL_IDS)) ||
            (record.has("skinId") && !validSkin(record.opt("skinId"))) ||
            (record.has("note") && !withinCodePoints(record.opt("note"), 100)) ||
            (record.has("source") && !isChoice(record.opt("source"), RECORD_SOURCES)) ||
            (record.has("failReason") && !isChoice(record.opt("failReason"), FAIL_REASONS))) {
            throw new IllegalArgumentException("专注记录损坏");
        }
    }

    private static void validateCompanionPreferences(JSONObject preferences) {
        Object restMinutes = preferences.opt("restMinutes");
        if ((preferences.has("restMinutes") &&
                (!finiteInRange(restMinutes, 1, 60) || ((Number) restMinutes).doubleValue() % 1 != 0)) ||
            (preferences.has("whiteNoise") && !isChoice(preferences.opt("whiteNoise"), WHITE_NOISE_IDS)) ||
            (preferences.has("whiteNoiseVolume") && !finiteInRange(preferences.opt("whiteNoiseVolume"), 0, 1)) ||
            (preferences.has("animation") && !isChoice(preferences.opt("animation"), ANIMATIONS))) {
            throw new IllegalArgumentException("备份设置损坏");
        }
        for (String key : BOOLEAN_PREFERENCES) {
            if (preferences.has(key) && !(preferences.opt(key) instanceof Boolean)) {
                throw new IllegalArgumentException("备份设置损坏");
            }
        }
    }

    private static void validatePet(Object value) {
        if (!(value instanceof JSONObject)) throw new IllegalArgumentException("伙伴设置损坏");
        JSONObject pet = (JSONObject) value;
        Object selected = pet.opt("selectedAnimalId");
        Object lastSelectedItemId = pet.opt("lastSelectedItemId");
        Object retroCutoffAt = pet.opt("retroCutoffAt");
        if (!finiteInRange(pet.opt("version"), 1, 1) ||
            (!"random".equals(selected) && !isChoice(selected, ANIMAL_IDS)) ||
            (lastSelectedItemId != JSONObject.NULL && !nonBlankString(lastSelectedItemId)) ||
            (retroCutoffAt != JSONObject.NULL && !finiteInRange(retroCutoffAt, 0, Double.POSITIVE_INFINITY))) {
            throw new IllegalArgumentException("伙伴设置损坏");
        }
        if (pet.has("selectedSkins")) {
            JSONObject skins = pet.optJSONObject("selectedSkins");
            if (skins == null) throw new IllegalArgumentException("伙伴设置损坏");
            Iterator<String> keys = skins.keys();
            while (keys.hasNext()) {
                String animal = keys.next();
                if (!ANIMAL_IDS.contains(animal) || !validSkin(skins.opt(animal))) {
                    throw new IllegalArgumentException("伙伴设置损坏");
                }
            }
        }
    }

    private static void strings(JSONArray values) throws JSONException {
        for (int i = 0; i < values.length(); i++)
            if (!(values.get(i) instanceof String) || values.getString(i).trim().isEmpty())
                throw new IllegalArgumentException("保护应用或增强设置损坏");
    }
    private static final java.util.Map<String, java.util.Set<String>> MODULE_SUB_KEYS = java.util.Map.of(
        "apps", java.util.Set.of("restrict", "temporaryAccess"),
        "strict", java.util.Set.of("noPauseEnd", "navigation", "antiClose", "hideRecents", "hideLauncher", "wallpaper", "strictSettings", "deviceAdmin", "rebootResume"),
        "quiet", java.util.Set.of("sound", "intercept", "whitelistPass")
    );
    private static void validateModules(Object raw) throws JSONException {
        if (!(raw instanceof JSONObject)) throw new IllegalArgumentException("保护设置损坏");
        JSONObject modules = (JSONObject) raw;
        for (String flag : new String[]{"master", "initialized", "focusLock"}) {
            if (modules.has(flag) && !(modules.get(flag) instanceof Boolean))
                throw new IllegalArgumentException("保护设置损坏");
        }
        for (String key : new String[]{"apps", "strict", "quiet"}) {
            if (!modules.has(key) || !(modules.get(key) instanceof JSONObject))
                throw new IllegalArgumentException("保护设置损坏");
            JSONObject mod = modules.getJSONObject(key);
            if (!mod.has("enabled") || !(mod.get("enabled") instanceof Boolean))
                throw new IllegalArgumentException("保护设置损坏");
            if (mod.has("custom")) {
                if (!(mod.get("custom") instanceof JSONObject))
                    throw new IllegalArgumentException("保护设置损坏");
                JSONObject custom = mod.getJSONObject("custom");
                java.util.Set<String> allowed = MODULE_SUB_KEYS.get(key);
                java.util.Iterator<String> it = custom.keys();
                while (it.hasNext()) {
                    String subKey = it.next();
                    if (!allowed.contains(subKey) || !(custom.get(subKey) instanceof Boolean))
                        throw new IllegalArgumentException("保护设置损坏");
                }
            }
        }
    }
    private static JSONObject cleanModules(JSONObject raw) throws JSONException {
        JSONObject out = new JSONObject();
        if (raw.has("master")) out.put("master", raw.getBoolean("master"));
        if (raw.has("initialized")) out.put("initialized", raw.getBoolean("initialized"));
        if (raw.has("focusLock")) out.put("focusLock", raw.getBoolean("focusLock"));
        for (String key : new String[]{"apps", "strict", "quiet"}) {
            JSONObject mod = raw.getJSONObject(key);
            JSONObject cleanMod = new JSONObject().put("enabled", mod.getBoolean("enabled"));
            if (mod.has("custom")) {
                JSONObject custom = mod.getJSONObject("custom");
                JSONObject cleanCustom = new JSONObject();
                for (String subKey : MODULE_SUB_KEYS.get(key)) {
                    if (custom.has(subKey)) cleanCustom.put(subKey, custom.getBoolean(subKey));
                }
                if (cleanCustom.length() > 0) cleanMod.put("custom", cleanCustom);
            }
            out.put(key, cleanMod);
        }
        return out;
    }
    private static JSONObject pick(JSONObject source, String fields) throws JSONException {
        JSONObject result = new JSONObject();
        for (String key : fields.split(" ")) if (source.has(key)) result.put(key, source.get(key));
        return result;
    }
    private static JSONArray rows(JSONArray source, String fields) throws JSONException {
        JSONArray result = new JSONArray();
        if (source != null) for (int i = 0; i < source.length(); i++) result.put(pick(source.getJSONObject(i), fields));
        return result;
    }
    private static JSONObject whitelist(JSONObject value) throws JSONException {
        return pick(value, value.optString("source").equals("global") ? "source" : "source packages");
    }
    private static JSONObject cleanPet(JSONObject pet) throws JSONException {
        JSONObject clean = pick(pet, PET_FIELDS);
        JSONObject skins = pet.optJSONObject("selectedSkins");
        if (skins != null) {
            JSONObject cleanSkins = new JSONObject();
            for (String animal : ANIMAL_IDS) {
                Object skin = skins.opt(animal);
                if (validSkin(skin)) cleanSkins.put(animal, skin);
            }
            clean.put("selectedSkins", cleanSkins);
        }
        return clean;
    }
    static JSONObject portable(JSONObject source) throws JSONException {
        if (source == null) throw new IllegalArgumentException("恢复副本缺少业务数据");
        JSONObject result = pick(source, "schemaVersion deletedRecordIds");
        String[][] groups = {
            {"themes", "id name color order collapsed deleted"},
            {"items", "id themeId title note mode minutes order deleted"},
            {"records", RECORD_FIELDS},
            {"events", "id title start end allDay note repeat weekdays until itemId reminderMinutes"},
            {"eventExceptions", "eventId date cancelled title start end"},
            {"semesters", "id name startDate weeks"},
            {"courses", "id semesterId title weekday firstPeriod lastPeriod firstWeek lastWeek parity room teacher color reminderMinutes"},
            {"courseExceptions", "courseId date cancelled start end"},
            {"lockConfigurations", "id name minutes strict enhancements"},
        };
        for (String[] group : groups) {
            if (!source.has(group[0])) continue; // Old schema-one backups lack protection fields.
            JSONArray original = source.getJSONArray(group[0]);
            JSONArray clean = rows(original, group[1]);
            for (int i = 0; i < clean.length(); i++) {
                JSONObject row = original.getJSONObject(i), target = clean.getJSONObject(i);
                if ((group[0].equals("items") || group[0].equals("lockConfigurations")) && row.has("whitelist"))
                    target.put("whitelist", whitelist(row.getJSONObject("whitelist")));
                if (group[0].equals("records")) target.put("segments", rows(row.optJSONArray("segments"), "start end"));
                if (group[0].equals("semesters")) target.put("periods", rows(row.optJSONArray("periods"), "index start end"));
            }
            result.put(group[0], clean);
        }
        JSONObject preferences = source.optJSONObject("preferences");
        if (preferences != null) {
            JSONObject clean = pick(preferences, PREFERENCE_FIELDS);
            JSONObject protection = preferences.optJSONObject("protection");
            if (protection != null) {
                JSONObject cleanProtection = pick(protection, "study strict interceptNotifications dnd globalWhitelist enhancements");
                if (protection.has("modules")) cleanProtection.put("modules", cleanModules(protection.getJSONObject("modules")));
                clean.put("protection", cleanProtection);
            }
            result.put("preferences", clean);
        }
        if (source.has("pet") && !source.isNull("pet")) {
            result.put("pet", cleanPet(source.getJSONObject("pet")));
        }
        return result;
    }
    static JSONObject snapshot(JSONObject original) throws JSONException {
        JSONObject documents = original.getJSONObject("documents"), clean = new JSONObject();
        JSONObject data = documents.optJSONObject("data");
        JSONArray sourceRecords = original.getJSONArray("records");
        JSONArray records = rows(sourceRecords, RECORD_FIELDS);
        for (int i = 0; i < records.length(); i++) records.getJSONObject(i).put("segments", rows(sourceRecords.getJSONObject(i).optJSONArray("segments"), "start end"));
        if (data != null) clean.put("data", portable(data));
        // Lock history is durable history, never a runnable control session.
        JSONObject locks = documents.optJSONObject("lockHistory");
        if (locks != null) clean.put("lockHistory", new JSONObject().put("records", rows(locks.optJSONArray("records"),
            "id configurationId title targetMs startedAt endedAt durationMs status")));
        return new JSONObject().put("documents", clean).put("records", records);
    }
}
