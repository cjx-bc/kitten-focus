package com.xiaomao.focus;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.ActivityCallback;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name="CatFocus",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class CatFocusPlugin extends Plugin {
    private FocusEngine engine;private LocalStore store;
    @Override public void load(){engine=new FocusEngine(getContext());store=LocalStore.get(getContext());}
    private interface Operation { JSONObject run() throws Exception; }
    private void resolve(PluginCall call,Operation operation){try{JSONObject result=operation.run();call.resolve(result==null?new JSObject():new JSObject(result.toString()));}catch(Exception error){call.reject(error.getMessage(),error);}}
    @PluginMethod public void loadData(PluginCall call){resolve(call,()->{new UpgradeBackups(getContext()).prepareStartup();JSONObject data=store.loadData();return new JSONObject().put("data",data==null?JSONObject.NULL:data);});}
    @PluginMethod public void saveData(PluginCall call){resolve(call,()->{store.saveData(call.getObject("data"),false);return null;});}
    @PluginMethod public void replaceData(PluginCall call){resolve(call,()->{if(store.read("active")!=null)throw new IllegalStateException("请先结束当前专注");store.saveData(call.getObject("data"),true);Reminders.cancelFocus(getContext());return null;});}
    @PluginMethod public void startFocus(PluginCall call){resolve(call,()->engine.start(call.getObject("session")));}
    @PluginMethod public void focusAction(PluginCall call){resolve(call,()->engine.action(call.getString("action","read")));}
    @PluginMethod public void syncReminders(PluginCall call){resolve(call,()->{Reminders.sync(getContext());return null;});}
    @PluginMethod public void permissions(PluginCall call){resolve(call,()->new JSONObject().put("notifications",Reminders.notificationsAllowed(getContext())).put("exactAlarms",Reminders.exactAllowed(getContext())));}
    @PluginMethod public void requestNotifications(PluginCall call){if(Build.VERSION.SDK_INT>=33&&!Reminders.notificationsAllowed(getContext()))requestPermissionForAlias("notifications",call,"notificationsResult");else notificationsResult(call);}
    @PermissionCallback private void notificationsResult(PluginCall call){resolve(call,()->new JSONObject().put("notifications",Reminders.notificationsAllowed(getContext())));}
    @PluginMethod public void openAlarmSettings(PluginCall call){if(Build.VERSION.SDK_INT>=31)getActivity().startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getContext().getPackageName())));call.resolve();}
    @PluginMethod public void exportFile(PluginCall call){Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,call.getString("name","小猫专注备份.json"));startActivityForResult(call,intent,"exportResult");}
    @ActivityCallback private void exportResult(PluginCall call,ActivityResult result){if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.reject("已取消导出");return;}try(OutputStream stream=getContext().getContentResolver().openOutputStream(result.getData().getData(),"wt")){if(stream==null)throw new IllegalStateException("无法打开备份文件");stream.write(call.getString("text","").getBytes(StandardCharsets.UTF_8));call.resolve();}catch(Exception error){call.reject("备份导出失败",error);}}
    @PluginMethod public void importFile(PluginCall call){if(readActive()){call.reject("请先结束当前专注");return;}startActivityForResult(call,new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),"importResult");}
    private boolean readActive(){try{return store.read("active")!=null;}catch(Exception error){return true;}}
    @ActivityCallback private void importResult(PluginCall call,ActivityResult result){if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.reject("已取消选择备份");return;}try(InputStream stream=getContext().getContentResolver().openInputStream(result.getData().getData());ByteArrayOutputStream bytes=new ByteArrayOutputStream()){if(stream==null)throw new IllegalStateException("无法读取备份文件");byte[] buffer=new byte[8192];int count;while((count=stream.read(buffer))!=-1){bytes.write(buffer,0,count);if(bytes.size()>20*1024*1024)throw new IllegalArgumentException("备份文件过大");}call.resolve(new JSObject().put("text",bytes.toString(StandardCharsets.UTF_8.name())));}catch(Exception error){call.reject("备份读取失败",error);}}
}
