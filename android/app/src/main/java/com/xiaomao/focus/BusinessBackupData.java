package com.xiaomao.focus;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Portable configuration and history only. Never copy adapter journals or OS grants. */
final class BusinessBackupData {
    static void validate(JSONObject data) throws JSONException {
        if (data == null || data.optInt("schemaVersion") != 1)
            throw new IllegalArgumentException("此恢复副本与当前版本不兼容");
        JSONObject preferences = data.optJSONObject("preferences");
        if (preferences == null) throw new IllegalArgumentException("备份设置损坏");
        if (preferences.has("protection")) {
            JSONObject protection = preferences.getJSONObject("protection");
            for (String key : new String[]{"study", "strict", "interceptNotifications", "dnd"})
                if (protection.has(key) && !(protection.get(key) instanceof Boolean))
                    throw new IllegalArgumentException("保护设置损坏");
            for (String key : new String[]{"globalWhitelist", "enhancements"})
                if (protection.has(key)) strings(protection.getJSONArray(key));
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
                if (list.optString("source").equals("custom")) strings(list.getJSONArray("packages"));
                else if (!list.optString("source").equals("global")) throw new IllegalArgumentException("锁机白名单损坏");
            }
        }
    }
    private static void strings(JSONArray values) throws JSONException {
        for (int i = 0; i < values.length(); i++)
            if (!(values.get(i) instanceof String) || values.getString(i).trim().isEmpty())
                throw new IllegalArgumentException("保护应用或增强设置损坏");
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
    static JSONObject portable(JSONObject source) throws JSONException {
        if (source == null) throw new IllegalArgumentException("恢复副本缺少业务数据");
        JSONObject result = pick(source, "schemaVersion deletedRecordIds");
        String[][] groups = {
            {"themes", "id name color order collapsed deleted"},
            {"items", "id themeId title note mode minutes order deleted"},
            {"records", "id itemId themeId title themeName color mode targetMs startedAt endedAt timeZone durationMs pausedMs status"},
            {"events", "id title start end allDay note repeat weekdays until itemId reminderMinutes"},
            {"eventExceptions", "eventId date cancelled title start end"},
            {"semesters", "id name startDate weeks"},
            {"courses", "id semesterId title weekday firstPeriod lastPeriod firstWeek lastWeek parity room teacher color reminderMinutes"},
            {"courseExceptions", "courseId date cancelled start end"},
            {"lockConfigurations", "id name minutes strict"},
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
            JSONObject clean = pick(preferences, "defaultMinutes sound vibration activeSemesterId");
            JSONObject protection = preferences.optJSONObject("protection");
            if (protection != null) clean.put("protection", pick(protection, "study strict interceptNotifications dnd globalWhitelist enhancements"));
            result.put("preferences", clean);
        }
        return result;
    }
    static JSONObject snapshot(JSONObject original) throws JSONException {
        JSONObject documents = original.getJSONObject("documents"), clean = new JSONObject();
        JSONObject data = documents.optJSONObject("data");
        JSONArray records = rows(original.getJSONArray("records"), "id itemId themeId title themeName color mode targetMs startedAt endedAt timeZone durationMs pausedMs status");
        JSONArray sourceRecords = original.getJSONArray("records");
        for (int i = 0; i < records.length(); i++) records.getJSONObject(i).put("segments", rows(sourceRecords.getJSONObject(i).optJSONArray("segments"), "start end"));
        if (data != null) clean.put("data", portable(data));
        // Lock history is durable history, never a runnable control session.
        JSONObject locks = documents.optJSONObject("lockHistory");
        if (locks != null) clean.put("lockHistory", new JSONObject().put("records", rows(locks.optJSONArray("records"),
            "id configurationId title targetMs startedAt endedAt durationMs status")));
        return new JSONObject().put("documents", clean).put("records", records);
    }
}
