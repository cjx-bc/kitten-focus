package com.xiaomao.focus;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;

/** App-private recovery snapshots. No upload; manual exports remain separate. */
final class UpgradeBackups {
    private final Context context;
    private final LocalStore store;
    private final File directory;
    private final SharedPreferences preferences;
    private final FocusControl control;

    UpgradeBackups(Context context) {
        this(context, LocalStore.get(context), new FocusControl(context));
    }
    UpgradeBackups(Context context, LocalStore store, FocusControl control) {
        this.context = context.getApplicationContext();
        this.store = store;
        this.control = control;
        directory = new File(context.getFilesDir(), store.getDatabaseName().equals("xiaomao-focus.db") ? "upgrade-backups" : "upgrade-backups-" + store.getDatabaseName());
        preferences = context.getSharedPreferences("upgrade-protection", Context.MODE_PRIVATE);
    }

    synchronized void prepareStartup() throws Exception {
        int current = BuildConfig.VERSION_CODE;
        int previous = preferences.getInt("preparedVersion", 0);
        if (previous != current) create(previous, current);
        JSONObject data = store.read("data");
        // Future schema migrations must run transactionally here. Never fall back to empty data.
        if (data != null && data.optInt("schemaVersion") != 1)
            throw new IllegalStateException("本地数据版本暂不兼容，原数据和升级副本已保留，请联系开发者");
        preferences.edit().putInt("preparedVersion", current).apply();
    }

    synchronized String create(int from, int to) throws Exception {
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("无法建立升级恢复副本");
        String name = "upgrade-" + from + "-" + to + ".json";
        File file = new File(directory, name);
        JSONObject snapshot = BusinessBackupData.snapshot(store.snapshot());
        JSONObject value = new JSONObject().put("format", 1).put("from", from).put("to", to)
            .put("createdAt", System.currentTimeMillis()).put("snapshot", snapshot);
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream stream = null;
        try {
            stream = atomic.startWrite();
            stream.write(value.toString().getBytes(StandardCharsets.UTF_8));
            atomic.finishWrite(stream);
        } catch (Exception error) {
            if (stream != null) atomic.failWrite(stream);
            throw error;
        }
        File[] files = files();
        for (int i = 3; i < files.length; i++) {
            if (!files[i].delete()) throw new IllegalStateException("无法轮换升级恢复副本");
        }
        return name;
    }

    private File[] files() {
        File[] files = directory.listFiles((dir, name) -> name.matches("upgrade-[0-9]+-[0-9]+\\.json"));
        if (files == null) return new File[0];
        Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed().thenComparing(File::getName));
        return files;
    }

    private JSONObject read(String name) throws Exception {
        if (name == null || !name.matches("upgrade-[0-9]+-[0-9]+\\.json"))
            throw new IllegalArgumentException("恢复副本名称无效");
        AtomicFile atomic = new AtomicFile(new File(directory, name));
        try (FileInputStream stream = atomic.openRead(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = stream.read(buffer)) != -1) {
                bytes.write(buffer, 0, count);
                if (bytes.size() > 50 * 1024 * 1024) throw new IllegalArgumentException("恢复副本过大");
            }
            JSONObject value = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            if (value.getInt("format") != 1) throw new IllegalArgumentException("恢复副本格式不兼容");
            return value;
        }
    }

    synchronized JSONArray list() throws Exception {
        JSONArray result = new JSONArray();
        for (File file : files()) {
            JSONObject value = read(file.getName());
            result.put(new JSONObject().put("id", file.getName()).put("createdAt", value.getLong("createdAt"))
                .put("from", value.getInt("from")).put("to", value.getInt("to")));
        }
        return result;
    }

    synchronized JSONObject export(String name) throws Exception {
        JSONObject value = read(name), snapshot = BusinessBackupData.snapshot(value.getJSONObject("snapshot"));
        JSONObject data = snapshot.getJSONObject("documents").optJSONObject("data");
        if (data == null) throw new IllegalStateException("此副本尚无业务数据");
        data.put("records", snapshot.getJSONArray("records"));
        String time = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US)
            .format(new java.util.Date(value.getLong("createdAt")));
        return new JSONObject().put("app", "xiaomao-focus").put("version", 1).put("createdAt", time).put("data", data);
    }

    synchronized void restore(String name) throws Exception {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注或锁机，再恢复备份");
            JSONObject value = read(name);
            // Older local snapshots may contain arbitrary runtime documents. Ignore them.
            JSONObject portable = BusinessBackupData.snapshot(value.getJSONObject("snapshot"));
            BusinessBackupData.validate(portable.getJSONObject("documents").optJSONObject("data"));
            JSONArray records = portable.getJSONArray("records");
            for (int i = 0; i < records.length(); i++)
                if (records.getJSONObject(i).optString("id").isEmpty()) throw new IllegalArgumentException("恢复副本记录损坏");
            control.prepareDataReplacement();
            // Keep a safety snapshot of current data before replacing anything.
            create(BuildConfig.VERSION_CODE, BuildConfig.VERSION_CODE);
            store.restoreSnapshot(portable);
            Reminders.cancelFocus(context);
            Reminders.cancelRest(context);
        }
    }
}
