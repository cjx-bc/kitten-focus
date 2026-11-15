package com.xiaomao.focus;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import org.json.JSONObject;

/** Reachable information/recovery screen for the rule's system settings entry. */
public final class DndRuleActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        showStatus("");
    }

    private void showStatus(String result) {
        String detail;
        try {
            JSONObject status = new FocusControl(this).getDndStatus();
            String active = status.isNull("ruleActive") ? "系统尚未核实" : status.optBoolean("ruleActive") ? "正在生效" : "未激活";
            detail = "小猫只管理自己的声音规则，默认保留来电、闹钟与媒体，通知仍可显示。\n\n"
                + "勿扰授权：" + (status.optBoolean("permissionGranted") ? "已授权" : "未授权")
                + "\n本轮选择：" + (status.optBoolean("requested") ? "开启" : "关闭")
                + "\n规则状态：" + active
                + "\n" + status.optString("error")
                + "\n\n撤销声音辅助后计时继续，本轮不会自动重开。";
        } catch (Exception error) { detail = "读取失败：" + error.getMessage(); }
        new AlertDialog.Builder(this).setTitle("小猫声音辅助")
            .setMessage(result + detail)
            .setPositiveButton("打开小猫", (dialog, which) -> {
                startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));
                finish();
            })
            .setNeutralButton("撤销本轮声音辅助", (dialog, which) -> new AlertDialog.Builder(this)
                .setTitle("撤销声音辅助？").setMessage("仅撤销小猫自身规则，保留计时与其他勿扰选择。")
                .setPositiveButton("确认撤销", (confirm, selected) -> {
                    try {
                        JSONObject status = new FocusControl(this).restoreDnd();
                        showStatus(status.optBoolean("recoveryPending") ? "撤销未完成，请检查下方原因。\n\n" : "小猫声音规则已撤销。\n\n");
                    } catch (Exception error) { showStatus("撤销失败：" + error.getMessage() + "\n\n"); }
                }).setNegativeButton("取消", (confirm, selected) -> showStatus("")).setOnCancelListener(confirm -> finish()).show())
            .setNegativeButton("关闭", (dialog, which) -> finish())
            .setOnCancelListener(dialog -> finish()).show();
    }
}
