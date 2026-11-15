package com.xiaomao.focus;

import org.json.JSONObject;
import org.json.JSONArray;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class UpdateRelease {
    static final String ORIGIN = "https://47.251.9.162";
    static final String MANIFEST_URL = BuildConfig.UPDATE_MANIFEST_URL;
    static final String FALLBACK_MANIFEST_URL = BuildConfig.UPDATE_FALLBACK_URL;
    static final String GITHUB = "https://github.com/cjx-bc/kitten-focus/releases/download/";
    static final String MIRROR = "https://gh-proxy.com/";
    final int code, minSdk;
    final long size;
    final String name, url, sha256, notes;
    final List<String> downloadUrls;

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
        if (code <= 0 || minSdk < 24 || minSdk > 100 || size <= 0 || size > 256L * 1024 * 1024
            || name.length() > 40 || !name.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-zA-Z0-9.-]+)?") || notes.length() > 6000
            || !sha256.matches("[0-9a-f]{64}"))
            throw new IllegalArgumentException("更新信息格式无效，请稍后重试");
        validateUrl(url);
        List<String> addresses = new ArrayList<>();
        JSONArray configured = value.optJSONArray("downloadUrls");
        if (value.has("downloadUrls") && configured == null) throw new IllegalArgumentException("下载线路格式无效");
        if (configured != null) {
            if (configured.length() < 1 || configured.length() > 4) throw new IllegalArgumentException("下载线路数量无效");
            for (int i = 0; i < configured.length(); i++) {
                String address = configured.getString(i);
                validateUrl(address);
                if (addresses.contains(address)) throw new IllegalArgumentException("下载线路不能重复");
                addresses.add(address);
            }
        } else {
            addresses.add(url);
            String fallback = fallbackUrl();
            if (!fallback.equals(url)) addresses.add(fallback);
        }
        downloadUrls = Collections.unmodifiableList(addresses);
    }

    private void validateUrl(String address) throws Exception {
        URI parsed = new URI(address);
        if (!"https".equals(parsed.getScheme()) || (parsed.getPort() != -1 && parsed.getPort() != 443)
            || parsed.getUserInfo() != null || parsed.getFragment() != null || parsed.getQuery() != null)
            throw new IllegalArgumentException("更新地址无效");
        String github = GITHUB + "v" + name + "/xiaomao-focus-" + name + "-debug.apk";
        if (address.equals(github) || address.equals(MIRROR + github)) return;
        if (("download-focus.linma.asia".equals(parsed.getHost()) || "47.251.9.162".equals(parsed.getHost()))
            && parsed.getPath().matches("/releases/[a-zA-Z0-9._-]+\\.apk")) return;
        throw new IllegalArgumentException("更新地址不在可信来源内");
    }

    String fallbackUrl() throws Exception {
        if (url.startsWith(GITHUB) || url.startsWith(MIRROR))
            return ORIGIN + "/releases/xiaomao-focus-" + name + "-debug.apk";
        return ORIGIN + new URI(url).getRawPath();
    }

    JSONObject json() throws Exception {
        return new JSONObject().put("applicationId", BuildConfig.APPLICATION_ID).put("versionCode", code)
            .put("minSdk", minSdk).put("versionName", name).put("size", size).put("url", url)
            .put("sha256", sha256).put("notes", notes).put("downloadUrls", new JSONArray(downloadUrls));
    }
}
