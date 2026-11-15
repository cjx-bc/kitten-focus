package com.xiaomao.focus;

import org.json.JSONObject;

/** OS-only seam: actual identity, system window metadata and the return action. */
interface AntiCloseSystem {
    boolean authorized();
    boolean connected();
    boolean systemSurface(String pkg);
    String appLabel();
    AntiCloseWindow.Node root(String pkg);
    void returnToFocus() throws Exception;
    JSONObject identity() throws Exception;
}
