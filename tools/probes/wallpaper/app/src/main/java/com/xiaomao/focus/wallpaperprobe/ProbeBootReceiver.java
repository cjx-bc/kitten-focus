package com.xiaomao.focus.wallpaperprobe;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Evidence only: boot never automatically reapplies wallpaper or starts a protection. */
public final class ProbeBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        ProbeEnvironment environment = new ProbeEnvironment(context);
        environment.event("boot_observed", intent.getAction());
        environment.session().refresh();
    }
}
