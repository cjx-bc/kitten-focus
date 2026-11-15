package com.xiaomao.focus;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;

/** Device time boundary shared by focus and rest lifecycle operations. */
interface SessionClock {
    long epoch();
    long mono();
    int boot();

    static SessionClock system(Context context) {
        Context app = context.getApplicationContext();
        return new SessionClock() {
            public long epoch() { return System.currentTimeMillis(); }
            public long mono() { return SystemClock.elapsedRealtime(); }
            public int boot() {
                return Settings.Global.getInt(app.getContentResolver(), Settings.Global.BOOT_COUNT, 0);
            }
        };
    }
}
