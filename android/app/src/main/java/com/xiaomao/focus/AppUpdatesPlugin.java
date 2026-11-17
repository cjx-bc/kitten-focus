package com.xiaomao.focus;

import android.app.Activity;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdates")
public class AppUpdatesPlugin extends Plugin {
    private AppUpdateManager manager;
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    @Override public void load() { manager = new AppUpdateManager(getContext()); }
    private interface Operation { JSONObject run() throws Exception; }
    private void run(PluginCall call, Operation operation) {
        worker.execute(() -> {
            try { call.resolve(new JSObject(operation.run().toString())); }
            catch (Exception error) { call.reject(error.getMessage() == null ? "更新操作失败，请重试" : error.getMessage(), error); }
        });
    }
    @PluginMethod public void status(PluginCall call) { run(call, () -> manager.status()); }
    @PluginMethod public void check(PluginCall call) { run(call, () -> manager.check(call.getBoolean("force", false))); }
    @PluginMethod public void download(PluginCall call) { run(call, () -> manager.download(call.getBoolean("allowMetered", false))); }
    @PluginMethod public void cancel(PluginCall call) { run(call, () -> manager.cancel()); }
    @PluginMethod public void backups(PluginCall call) { run(call, () -> new JSONObject().put("backups", manager.backups.list())); }
    @PluginMethod public void exportBackup(PluginCall call) {
        run(call, () -> new JSONObject().put("text", manager.backups.export(call.getString("id")).toString(2)));
    }
    @PluginMethod public void restoreBackup(PluginCall call) {
        run(call, () -> { manager.backups.restore(call.getString("id")); Reminders.sync(getContext()); return new JSONObject(); });
    }
    @PluginMethod public void installPermission(PluginCall call) {
        if (manager.canInstall()) { call.resolve(); return; }
        try { FocusProtection.openAuthorizationSettings(getContext(), manager.permissionIntent()); call.resolve(); }
        catch (Exception error) { call.reject("无法打开安装权限设置，请在系统设置中允许此来源", error); }
    }
    @PluginMethod public void install(PluginCall call) {
        worker.execute(() -> {
            try {
                Intent intent = manager.installerIntent();
                Activity activity = getActivity();
                if (activity == null) {
                    call.reject("当前页面已关闭，请重新进入后再安装更新");
                    return;
                }
                activity.runOnUiThread(() -> {
                    try {
                        if (LocalStore.get(getContext()).read("active") != null)
                            throw new IllegalStateException("请先结束当前专注，再安装更新");
                        if (activity.isFinishing() || activity.isDestroyed()) {
                            call.reject("当前页面已关闭，请重新进入后再安装更新");
                            return;
                        }
                        activity.startActivity(intent); call.resolve();
                    }
                    catch (Exception error) { call.reject("无法打开系统安装界面，请重试", error); }
                });
            } catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
}
