package com.xiaomao.focus.probe.sender;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.xiaomao.focus.probe.common.ProbeLog;

public final class SenderActivity extends Activity {
    private LinearLayout layout;
    private TextView events;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        recordClick(getIntent());
        ScrollView scroll = new ScrollView(this);
        layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(24, 24, 24, 24);
        scroll.addView(layout);
        TextView heading = new TextView(this);
        heading.setText("通知探针 · 发送端\n独立身份：" + getPackageName()
            + "\n只发送合成消息；点击后记录 id/revision，不记录正文。");
        heading.setTextSize(19);
        layout.addView(heading);
        button("授权发送通知 (Android 13+)", () -> {
            if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        });
        button("发送 #101 revision 1", () -> command("post", 101, 1, "normal"));
        button("更新 #101 revision 2", () -> command("update", 101, 2, "normal"));
        button("撤回 #101", () -> command("withdraw", 101, 1, "normal"));
        button("发送分组 #200 / #201 / #202", () -> command("group", 200, 1, "normal"));
        button("重复发送同一 #301", () -> command("duplicate", 301, 1, "normal"));
        button("持续通知例外 #401", () -> command("post", 401, 1, "ongoing"));
        button("来电类别例外 #402", () -> command("post", 402, 1, "call"));
        button("闹钟类别例外 #403", () -> command("post", 403, 1, "alarm"));
        button("全屏 Intent 例外 #404", () -> command("post", 404, 1, "full_screen"));
        button("清理发送端所有合成通知", () -> command("cancel_all", 0, 1, "normal"));
        button("刷新元数据", this::refresh);
        events = new TextView(this);
        events.setTextIsSelectable(true);
        events.setTextSize(11);
        layout.addView(events);
        setContentView(scroll);
        refresh();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        recordClick(intent);
        refresh();
    }

    private void recordClick(Intent intent) {
        if ("com.xiaomao.focus.probe.CLICK".equals(intent.getAction())) {
            ProbeLog.event(this, "content_intent_opened", ProbeLog.fields(
                "id", intent.getIntExtra("id", -1), "revision", intent.getIntExtra("revision", -1)));
        }
    }

    private void command(String op, int id, int revision, String kind) {
        SenderCommands.execute(this, new Intent().putExtra("op", op).putExtra("id", id)
            .putExtra("revision", revision).putExtra("kind", kind));
        refresh();
    }

    private void button(String text, Runnable action) {
        Button button = new Button(this);
        button.setText(text);
        button.setOnClickListener(view -> action.run());
        layout.addView(button);
    }
    private void refresh() { if (events != null) events.setText(ProbeLog.tail(this)); }
}
