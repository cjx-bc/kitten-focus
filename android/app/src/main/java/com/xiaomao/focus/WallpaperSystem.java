package com.xiaomao.focus;

import org.json.JSONObject;

/** Android wallpaper effects only; the native control owns sessions and duties. */
interface WallpaperSystem {
    boolean supported();
    JSONObject current() throws Exception;
    String ownComponent();
    void openPicker(String component, String pickerToken) throws Exception;
    String importOriginal(String uri, boolean lock) throws Exception;
    boolean sourceAvailable(String source);
    void restoreStatic(JSONObject original, String homeSource, String lockSource, boolean home, boolean lock) throws Exception;
}
