package com.xiaomao.focus.probe.sender;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Explicit component commands only; this receiver ships solely in the debug probe APK. */
public final class CommandReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        SenderCommands.execute(context, intent);
    }
}
