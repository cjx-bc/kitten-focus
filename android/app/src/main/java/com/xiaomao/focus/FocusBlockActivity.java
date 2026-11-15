package com.xiaomao.focus;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import java.util.Locale;

/** The ordinary application restriction screen. All exits return to the owning focus. */
public class FocusBlockActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView title, time, state;
    private final Runnable refresh = new Runnable() {
        @Override public void run() { render(); handler.postDelayed(this, 500); }
    };
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(28), dp(48), dp(28), dp(40));
        content.setBackgroundColor(Color.WHITE);
        TextView heading = text("现在，把时间留给专注", 22);
        title = text("", 18); time = text("", 52); state = text("", 14);
        content.addView(heading); content.addView(title); content.addView(time); content.addView(state);
        TextView explanation = text("此应用不在本轮白名单中。\n电话、输入法和必要系统交互仍可使用。", 14);
        content.addView(explanation);
        Button back = new Button(this);
        back.setText("返回专注"); back.setTextColor(Color.WHITE); back.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(34, 34, 34)));
        back.setOnClickListener(view -> returnToFocus());
        LinearLayout.LayoutParams button = new LinearLayout.LayoutParams(-1, dp(56)); button.topMargin = dp(28);
        content.addView(back, button);
        setContentView(content);
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size);
        view.setTextColor(Color.rgb(34, 34, 34)); view.setGravity(Gravity.CENTER);
        view.setPadding(0, dp(12), 0, dp(12)); return view;
    }
    @Override protected void onResume() { super.onResume(); handler.post(refresh); }
    @Override protected void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
    private void render() {
        try {
            JSONObject observation = new FocusControl(this).observeControl();
            JSONObject snapshot = observation.getJSONObject("focus");
            JSONObject session = snapshot.optJSONObject("session");
            JSONObject protection = session == null ? null : session.optJSONObject("protection");
            if (protection == null || !protection.optBoolean("study") || observation.optBoolean("needsReconcile")) { finish(); return; }
            title.setText(session.optString("title"));
            long elapsed = snapshot.optLong("elapsedMs");
            long ms = session.optString("mode").equals("countdown") ? Math.max(0, session.optLong("targetMs") - elapsed) : elapsed;
            long seconds = ms / 1000;
            time.setText(String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60));
            state.setText(session.optString("state").equals("paused") ? "计时已暂停 · 应用限制继续" : "本轮学霸模式保护中");
        } catch (Exception error) { finish(); }
    }
    private void returnToFocus() {
        startActivity(new Intent(this, MainActivity.class).putExtra("returnToFocus", true)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        finish();
    }
    @Override public void onBackPressed() { returnToFocus(); }
}
