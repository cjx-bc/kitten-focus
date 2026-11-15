package com.xiaomao.focus;

import org.json.JSONObject;
import java.net.URI;

final class UpdateRelease {
    static final String ORIGIN = "https://47.251.9.162";
    static final String MANIFEST_URL = BuildConfig.UPDATE_MANIFEST_URL;
    final int code, minSdk;
    final long size;
    final String name, url, sha256, notes;

    UpdateRelease(JSONObject value) throws Exception {
        if (!BuildConfig.APPLICATION_ID.equals(value.getString("applicationId")))
            throw new IllegalArgumentException("更新包不属于小猫专注");
        code = value.getInt("versionCode");
        minSdk = value.getInt("minSdk");
        size = value.getLong("size");
        name = value.getString("versionName");
        url = value.getString("url");
        sha256 = value.getString("sha256").toLowerCase(java.util.Locale.ROOT);
        notes = value.getString("notes");
        URI address = new URI(url);
        if (code <= 0 || minSdk < 24 || minSdk > 100 || size <= 0 || size > 256L * 1024 * 1024
            || name.length() > 40 || !name.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-zA-Z0-9.-]+)?") || notes.length() > 6000
            || !sha256.matches("[0-9a-f]{64}")
            || !"https".equals(address.getScheme()) || !"47.251.9.162".equals(address.getHost())
            || (address.getPort() != -1 && address.getPort() != 443)
            || address.getUserInfo() != null || address.getFragment() != null || address.getQuery() != null
            || !address.getPath().matches("/releases/[a-zA-Z0-9._-]+\\.apk"))
            throw new IllegalArgumentException("更新信息格式无效，请稍后重试");
    }

    JSONObject json() throws Exception {
        return new JSONObject().put("applicationId", BuildConfig.APPLICATION_ID).put("versionCode", code)
            .put("minSdk", minSdk).put("versionName", name).put("size", size).put("url", url)
            .put("sha256", sha256).put("notes", notes);
    }
}
