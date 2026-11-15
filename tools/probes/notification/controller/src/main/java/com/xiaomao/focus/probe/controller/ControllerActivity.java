package com.xiaomao.focus.probe.controller;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.xiaomao.focus.probe.common.ProbeLog;

public final class ControllerActivity extends Activity {
    private LinearLayout layout;
    private TextView events;
    private EditText id;
    private EditText duration;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(24, 24, 24, 24);
        scroll.addView(layout);
        TextView heading = new TextView(this);
        heading.setText("通知探针 · 控制端\n" + getPackageName()
            + "\n普通通知监听身份；仅操作独立发送端合成通知。\n请求不等于系统已执行；无公开通用提前释放接口。");
        heading.setTextSize(19);
        layout.addView(heading);
        button("打开系统通知使用权设置", () -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        id = number("101", "通知 id；-1 选择发送端全部活动通知");
        duration = number("15000", "暂缓毫秒；1 至 300000");
        button("检查活动 / 已暂缓元数据", () -> command("snapshot"));
        button("请求固定时长暂缓", () -> command("hold"));
        button("无截止时间能力检查", () -> command("no_deadline"));
        button("提前结束：检查公开释放能力", () -> command("early_release"));
        button("实验：对已暂缓 key 再 snooze 1ms", () -> command("resnooze_short"));
        button("调用当前原通知点击动作", () -> command("click"));
        button("主动断开监听", () -> command("disconnect"));
        button("请求重连监听", () -> command("rebind"));
        button("刷新元数据", this::refresh);
        events = new TextView(this);
        events.setTextIsSelectable(true);
        events.setTextSize(11);
        layout.addView(events);
        setContentView(scroll);
        refresh();
    }

    @Override protected void onResume() { super.onResume(); refresh(); }

    private EditText number(String initial, String hint) {
        EditText field = new EditText(this);
        field.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_SIGNED);
        field.setText(initial);
        field.setHint(hint);
        layout.addView(field);
        return field;
    }

    private void command(String operation) {
        try {
            ProbeListener.command(this, new Intent().putExtra("op", operation)
                .putExtra("id", Integer.parseInt(id.getText().toString()))
                .putExtra("duration_ms", Long.parseLong(duration.getText().toString())));
        } catch (NumberFormatException error) {
            ProbeLog.event(this, "command_rejected", ProbeLog.fields("reason", "invalid_numeric_input"));
        }
        refresh();
    }

    private void button(String title, Runnable action) {
        Button button = new Button(this);
        button.setText(title);
        button.setOnClickListener(view -> action.run());
        layout.addView(button);
    }

    private void refresh() {
        if (events != null) events.setText("监听连接：" + ProbeListener.isConnected() + "\n" + ProbeLog.tail(this));
    }
}
