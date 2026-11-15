package com.xiaomao.focus.probe.controller;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class CommandReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { ProbeListener.command(context, intent); }
}
