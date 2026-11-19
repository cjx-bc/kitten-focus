package com.xiaomao.focus;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

/** Bounded association evidence, never business data or a second timer. */
final class WallpaperLifecycle {
    private static final Object LOCK = new Object();
    private static final String PROCESS = UUID.randomUUID().toString();
    static void record(Context context, String kind, boolean preview, JSONObject observation) {
        synchronized (LOCK) {
            try {
                SharedPreferences preferences = context.getSharedPreferences("catfocus-wallpaper-lifecycle", 0);
                JSONArray previous = new JSONArray(preferences.getString("events", "[]")), events = new JSONArray();
                for (int i = Math.max(0, previous.length() - 47); i < previous.length(); i++) events.put(previous.get(i));
                JSONObject event = new JSONObject().put("event", kind).put("preview", preview)
                    .put("pid", android.os.Process.myPid()).put("processToken", PROCESS)
                    .put("elapsedMs", SystemClock.elapsedRealtime()).put("epochMs", System.currentTimeMillis())
                    .put("bootCount", Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1));
                if (observation != null) {
                    JSONObject session = ControlSession.from(observation);
                    event.put("owner", observation.opt("owner")).put("sessionId", session == null ? "" : session.optString("id"));
                    JSONObject focus = observation.optJSONObject("focus");
                    if (focus != null) event.put("focusElapsedMs", focus.optLong("elapsedMs"));
                }
                events.put(event);
                // Flush before returning so a subsequent process death can be correlated.
                if (!preferences.edit().putString("events", events.toString()).commit())
                    Log.w("FocusWallpaper", "Could not persist wallpaper lifecycle evidence");
            } catch (Exception ignored) { /* Evidence failure never invents a successful association. */ }
        }
    }
    static JSONObject observation(Context context) {
        synchronized (LOCK) {
            try {
                JSONArray events = new JSONArray(context.getSharedPreferences("catfocus-wallpaper-lifecycle", 0).getString("events", "[]"));
                for (int i = events.length() - 1; i >= 0; i--) {
                    JSONObject event = events.getJSONObject(i);
                    if (event.optString("event").equals("existing_session_reconciled")) return event;
                }
            } catch (Exception ignored) { }
            return new JSONObject();
        }
    }
}
