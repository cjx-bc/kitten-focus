package com.xiaomao.focus;

import org.json.JSONObject;

/** The one activity owner, irrespective of which engine projects its read-only snapshot. */
final class ControlSession {
    static JSONObject from(JSONObject observation) {
        String owner = observation.optString("owner");
        if (!"focus".equals(owner) && !"lock".equals(owner)) return null;
        JSONObject snapshot = observation.optJSONObject(owner);
        return snapshot == null ? null : snapshot.optJSONObject("session");
    }
}
