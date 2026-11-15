package com.xiaomao.focus.probe.common;

import android.content.Context;
import android.os.Build;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Metadata only. Call sites never pass title, text, arbitrary extras or intent URI. */
public final class ProbeLog {
    public static final String FILE = "probe-events.jsonl";
    private ProbeLog() { }

    public static JSONObject fields(Object... pairs) {
        JSONObject result = new JSONObject();
        try {
            for (int i = 0; i < pairs.length; i += 2) {
                result.put((String) pairs[i], pairs[i + 1] == null ? JSONObject.NULL : pairs[i + 1]);
            }
        } catch (JSONException error) { throw new IllegalArgumentException(error); }
        return result;
    }

    public static synchronized void event(Context context, String event, JSONObject details) {
        JSONObject row = fields("schema", 1, "event", event,
            "wallTimeMs", System.currentTimeMillis(), "elapsedMs", SystemClock.elapsedRealtime(),
            "actorPackage", context.getPackageName(), "actorUid", Process.myUid(),
            "api", Build.VERSION.SDK_INT, "manufacturer", Build.MANUFACTURER,
            "model", Build.MODEL, "fingerprint", Build.FINGERPRINT, "details", details);
        String line = row + "\n";
        try (FileOutputStream out = new FileOutputStream(new File(context.getFilesDir(), FILE), true)) {
            out.write(line.getBytes(StandardCharsets.UTF_8));
        } catch (Exception error) { Log.e("NotificationProbe", "metadata_write_failed:" + error.getClass().getSimpleName()); }
        Log.i("NotificationProbe", row.toString());
    }

    public static String tail(Context context) {
        try {
            // java.nio.file is API 26; stream path preserves minSdk 24.
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            try (java.io.FileInputStream input = context.openFileInput(FILE)) {
                byte[] bytes = new byte[4096];
                int count;
                while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count);
            }
            String text = output.toString("UTF-8");
            return text.length() > 24000 ? text.substring(text.length() - 24000) : text;
        } catch (Exception ignored) { return "尚无事件 / No events"; }
    }
}
