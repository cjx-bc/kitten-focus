package com.xiaomao.focus;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.ScrollView;
import java.util.UUID;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.util.Locale;

/** The ordinary application restriction screen. All exits return to the owning focus. */
public class FocusBlockActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    static final String TARGET_PACKAGE = "blockedPackage";
    private TextView title, time, state;
    private Button temporary;
    private String blockedPackage = "", sessionId = "";
    private boolean granting;
    private final BroadcastReceiver recovery = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { render(); }
    };
    private final Runnable refresh = new Runnable() {
        @Override public void run() { render(); handler.postDelayed(this, 500); }
    };
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        blockedPackage = getIntent().getStringExtra(TARGET_PACKAGE);
        if (blockedPackage == null) blockedPackage = "";
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
        back.setText("返回当前会话"); back.setTextColor(Color.WHITE); back.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(34, 34, 34)));
        back.setOnClickListener(view -> returnToFocus());
        LinearLayout.LayoutParams button = new LinearLayout.LayoutParams(-1, dp(56)); button.topMargin = dp(28);
        content.addView(back, button);
        temporary = new Button(this); temporary.setText("临时打开应用");
        temporary.setOnClickListener(view -> chooseDuration());
        LinearLayout.LayoutParams temporaryLayout = new LinearLayout.LayoutParams(-1, dp(52));
        temporaryLayout.topMargin = dp(12); content.addView(temporary, temporaryLayout);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.addView(content);
        setContentView(scroll);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        blockedPackage = intent.getStringExtra(TARGET_PACKAGE);
        if (blockedPackage == null) blockedPackage = "";
        render();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size);
        view.setTextColor(Color.rgb(34, 34, 34)); view.setGravity(Gravity.CENTER);
        view.setPadding(0, dp(12), 0, dp(12)); return view;
    }
    @Override protected void onStart() {
        super.onStart();
        ContextCompat.registerReceiver(this, recovery, new IntentFilter(FocusRecovery.DISMISS_BLOCK), ContextCompat.RECEIVER_NOT_EXPORTED);
    }
    @Override protected void onStop() { unregisterReceiver(recovery); super.onStop(); }
    @Override protected void onResume() { super.onResume(); handler.post(refresh); }
    @Override protected void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
    private void render() {
        try {
            JSONObject observation = new FocusControl(this).observeControl();
            JSONObject snapshot = observation.getJSONObject("lock".equals(observation.optString("owner")) ? "lock" : "focus");
            JSONObject session = snapshot.optJSONObject("session");
            JSONObject protection = session == null ? null : session.optJSONObject("protection");
            if (protection == null || !protection.optBoolean("study") || protection.optBoolean("applicationsWithdrawn") || observation.optBoolean("needsReconcile")) { finish(); return; }
            if (!blockedPackage.isEmpty() && !FocusProtection.shouldBlock(this, observation, blockedPackage, "")) { finish(); return; }
            sessionId = session.optString("id");
            JSONObject grant = session.optJSONObject("temporaryAccess");
            boolean strict = session.optBoolean("strictMode") && session.optString("mode").equals("countdown");
            int remaining = grant == null ? 3 : grant.optInt("remainingUses");
            temporary.setVisibility(strict ? android.view.View.GONE : android.view.View.VISIBLE);
            temporary.setEnabled(!granting && remaining > 0 && !blockedPackage.isEmpty());
            temporary.setText("临时打开 " + appLabel(blockedPackage) + " · 剩余 " + remaining + " 次");
            title.setText(session.optString("title"));
            long elapsed = snapshot.optLong("elapsedMs");
            long ms = session.optString("mode").equals("countdown") ? Math.max(0, session.optLong("targetMs") - elapsed) : elapsed;
            long seconds = ms / 1000;
            time.setText(String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60));
            String description = strict ? "严格倒计时 · 不可临时放行" : session.optString("state").equals("paused")
                ? "计时已暂停 · 应用限制继续" : "本轮学霸模式保护中";
            if (!strict && grant != null && grant.optLong("remainingMs") > 0)
                description += "\n正在放行 " + grant.optString("targetLabel") + " · 剩余 " + (grant.optLong("remainingMs") + 999) / 1000 + " 秒";
            state.setText(description);
        } catch (Exception error) { finish(); }
    }
    private String appLabel(String packageName) {
        try { return getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(packageName, 0)).toString(); }
        catch (Exception error) { return packageName; }
    }
    private void chooseDuration() {
        if (granting || blockedPackage.isEmpty()) return;
        final String target = blockedPackage, owner = sessionId;
        final int[] choice = {0};
        final int[] minutes = {1, 3, 5};
        new AlertDialog.Builder(this).setTitle("临时打开 " + appLabel(blockedPackage))
            .setSingleChoiceItems(new String[]{"1 分钟", "3 分钟", "5 分钟"}, 0, (dialog, which) -> choice[0] = which)
            .setNegativeButton("取消", null)
            .setPositiveButton("打开应用", (dialog, which) -> grant(minutes[choice[0]], UUID.randomUUID().toString(), false, target, owner))
            .show();
    }
    private void grant(int minutes, String requestId, boolean confirmed, String target, String owner) {
        if (granting) return;
        granting = true; temporary.setEnabled(false);
        try {
            JSONObject result = new FocusControl(this).grantTemporaryAccess(new JSONObject().put("sessionId", owner)
                .put("targetPackage", target).put("durationMinutes", minutes).put("requestId", requestId)
                .put("replaceConfirmed", confirmed));
            String outcome = result.optString("status");
            if (outcome.equals("granted")) { finish(); return; }
            if (outcome.equals("confirmation-required")) {
                JSONObject current = result.getJSONObject("state");
                new AlertDialog.Builder(this).setTitle("结束上一个临时放行？")
                    .setMessage("将立即结束 " + current.optString("targetLabel") + " 的放行，然后打开 " + appLabel(target) + "。新放行成功后扣一次。")
                    .setNegativeButton("取消", null)
                    .setPositiveButton("结束并打开", (dialog, which) -> grant(minutes, requestId, true, target, owner)).show();
            } else {
                new AlertDialog.Builder(this).setTitle("未能临时打开")
                    .setMessage(result.optString("reason")).setPositiveButton("知道了", null).show();
            }
        } catch (Exception error) {
            new AlertDialog.Builder(this).setTitle("未能临时打开").setMessage("请返回后重试：" + error.getMessage())
                .setPositiveButton("知道了", null).show();
        } finally { granting = false; if (!isFinishing()) render(); }
    }
    private void returnToFocus() {
        startActivity(new Intent(this, MainActivity.class).putExtra("returnToFocus", true)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        finish();
    }
    @Override public void onBackPressed() { returnToFocus(); }
}
