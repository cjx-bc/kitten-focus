package com.xiaomao.focus;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
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
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name="CatFocus",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class CatFocusPlugin extends Plugin {
    private static volatile java.lang.ref.WeakReference<CatFocusPlugin> activeInstance;
    private static final ExecutorService EXPORT_IO = Executors.newSingleThreadExecutor();
    private static final long STALE_EXPORT_TEMP_MS = 3_600_000L;
    private FocusControl control;private LocalStore store;
    private volatile String lastFocusWindowSignature = "";
    private volatile String lastRestWindowSignature = "";
    private volatile String lastLockWindowSignature = "";
    @Override public void load(){
        control=new FocusControl(getContext());
        store=LocalStore.get(getContext());
        activeInstance=new java.lang.ref.WeakReference<>(this);
        cleanupStaleExportTemps();
    }
    private void cleanupStaleExportTemps(){
        final File cacheDir=getContext()==null?null:getContext().getCacheDir();
        if(cacheDir==null)return;
        EXPORT_IO.execute(()->{
            File[] files=cacheDir.listFiles((dir,name)->name.startsWith("saf-export-")&&name.endsWith(".tmp"));
            if(files==null)return;
            long cutoff=System.currentTimeMillis()-STALE_EXPORT_TEMP_MS;
            for(File file:files){
                if(file.lastModified()<cutoff){file.delete();}
            }
        });
    }
    private void allowSafPicker(Intent intent){
        if(getContext()==null||intent==null)return;
        String pkg="com.android.documentsui";
        try{
            ComponentName resolved=intent.resolveActivity(getContext().getPackageManager());
            if(resolved!=null&&resolved.getPackageName()!=null&&!resolved.getPackageName().isEmpty()){
                pkg=resolved.getPackageName();
            }
        }catch(Exception ignored){}
        FocusProtection.allowSettingsForAuthorization(getContext(),pkg);
    }
    private File writeExportTempFile(byte[] bytes)throws Exception{
        File tempFile=File.createTempFile("saf-export-",".tmp",getContext().getCacheDir());
        try(FileOutputStream out=new FileOutputStream(tempFile)){
            out.write(bytes);
        }catch(Exception error){
            tempFile.delete();
            throw error;
        }
        return tempFile;
    }
    private static void deleteTempFile(String path){
        if(path==null||path.isEmpty())return;
        try{new File(path).delete();}catch(Exception ignored){}
    }
    static void emitJsEvent(String eventName,String path){
        JSObject payload=new JSObject();
        if(path!=null&&!path.isEmpty())payload.put("path",path);
        emitJsEvent(eventName,payload);
    }
    static void emitJsEvent(String eventName,JSObject payload){
        java.lang.ref.WeakReference<CatFocusPlugin> ref=activeInstance;
        CatFocusPlugin plugin=ref==null?null:ref.get();
        if(plugin==null||!plugin.hasListeners(eventName))return;
        plugin.notifyListeners(eventName,payload==null?new JSObject():payload);
    }
    private interface Operation { JSONObject run() throws Exception; }
    private void resolve(PluginCall call,Operation operation){try{JSONObject result=operation.run();call.resolve(result==null?new JSObject():new JSObject(result.toString()));}catch(Exception error){call.reject(error.getMessage(),error);}}
    @PluginMethod public void loadData(PluginCall call){resolve(call,()->{new UpgradeBackups(getContext()).prepareStartup();JSONObject data=control.loadData();return new JSONObject().put("data",data==null?JSONObject.NULL:data);});}
    @PluginMethod public void saveData(PluginCall call){resolve(call,()->{store.saveData(call.getObject("data"),false);WhiteNoisePlayer.getInstance(getContext()).syncFromStore(getContext());MainActivity.refreshWindowState(getContext());return null;});}
    @PluginMethod public void replaceData(PluginCall call){resolve(call,()->{control.replaceData(call.getObject("data"));WhiteNoisePlayer.getInstance(getContext()).stop();MainActivity.refreshWindowState(getContext());return null;});}
    @PluginMethod public void startFocus(PluginCall call){resolve(call,()->{JSONObject res=control.startFocus(call.getObject("session"),Boolean.TRUE.equals(call.getBoolean("strictModeConfirmed",false)));MainActivity.refreshWindowState(getContext());FocusBlockOverlay.syncForActiveSession(getContext());return res;});}
    @PluginMethod public void focusAction(PluginCall call){resolve(call,()->{
        String action=call.getString("action","read");
        JSONObject res=control.focusAction(action);
        JSONObject session=res==null?null:res.optJSONObject("session");
        String sig=session==null?"none":session.optString("id","")+"|"+session.optString("state","");
        if(!"read".equals(action)||!sig.equals(lastFocusWindowSignature)){
            lastFocusWindowSignature=sig;
            MainActivity.refreshWindowState(getContext());
        }
        return res;
    });}
    @PluginMethod public void startLock(PluginCall call){resolve(call,()->{JSONObject res=control.startLock(call.getString("configurationId",""),Boolean.TRUE.equals(call.getBoolean("strictLockConfirmed",false)));MainActivity.refreshWindowState(getContext());FocusBlockOverlay.syncForActiveSession(getContext());return res;});}
    @PluginMethod public void lockAction(PluginCall call){resolve(call,()->{
        String action=call.getString("action","read");
        JSONObject res=control.lockAction(action,Boolean.TRUE.equals(call.getBoolean("confirmed",false)));
        JSONObject session=res==null?null:res.optJSONObject("session");
        String sig=session==null?"none":session.optString("id","")+"|"+session.optString("state","");
        if(!"read".equals(action)||!sig.equals(lastLockWindowSignature)){
            lastLockWindowSignature=sig;
            MainActivity.refreshWindowState(getContext());
        }
        return res;
    });}
    @PluginMethod public void startRest(PluginCall call){resolve(call,()->{JSONObject res=control.startRest(call.getString("recordId",""));MainActivity.refreshWindowState(getContext());return res;});}
    @PluginMethod public void restAction(PluginCall call){resolve(call,()->{
        String action=call.getString("action","read");
        JSONObject res=control.restAction(action);
        JSONObject session=res==null?null:res.optJSONObject("session");
        String sig=session==null?"none":session.optString("state","");
        if(!"read".equals(action)||!sig.equals(lastRestWindowSignature)){
            lastRestWindowSignature=sig;
            MainActivity.refreshWindowState(getContext());
        }
        return res;
    });}
    @PluginMethod public void grantTemporaryAccess(PluginCall call){resolve(call,()->control.grantTemporaryAccess(call.getData()));}
    @PluginMethod public void observeControl(PluginCall call){resolve(call,()->control.observeControl());}
    @PluginMethod public void resolveMainEntry(PluginCall call){resolve(call,()->control.resolveMainEntry(call.getString("path","/focus")));}
    @PluginMethod public void getDndStatus(PluginCall call){resolve(call,()->control.getDndStatus());}
    @PluginMethod public void getNotificationStatus(PluginCall call){resolve(call,()->control.getNotificationStatus());}
    @PluginMethod public void getLauncherStatus(PluginCall call){resolve(call,()->control.getLauncherStatus());}
    @PluginMethod public void getWallpaperStatus(PluginCall call){resolve(call,()->control.getWallpaperStatus());}
    @PluginMethod public void prepareWallpaper(PluginCall call){resolve(call,()->control.prepareWallpaper(Boolean.TRUE.equals(call.getBoolean("limitsAccepted",false)),Boolean.TRUE.equals(call.getBoolean("originalMatches",false))));}
    @PluginMethod public void requestWallpaperPicker(PluginCall call){resolve(call,()->control.requestWallpaperPicker(Boolean.TRUE.equals(call.getBoolean("restoreOriginal",false))));}
    @PluginMethod public void importWallpaperOriginal(PluginCall call){
        if(readActive()){call.reject("请先结束当前专注或锁机，再选择原图");return;}
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
        allowSafPicker(intent);
        try{
            startActivityForResult(call,intent,"wallpaperOriginalResult");
        }catch(RuntimeException error){
            FocusProtection.clearSettingsAuthorization();
            call.reject("当前设备未提供文件选择器",error);
        }
    }
    @ActivityCallback private void wallpaperOriginalResult(PluginCall call,ActivityResult result){
        FocusProtection.clearSettingsAuthorization();
        if(call==null)return;
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){call.reject("已取消原图选择，未更改壁纸");return;}
        resolve(call,()->control.importWallpaperOriginal(result.getData().getData().toString(),Boolean.TRUE.equals(call.getBoolean("lockSource",false))));
    }
    @PluginMethod public void confirmWallpaperManualRecovery(PluginCall call){resolve(call,()->control.confirmWallpaperManualRecovery(Boolean.TRUE.equals(call.getBoolean("acknowledged",false))));}
    @PluginMethod public void openWallpaperSettings(PluginCall call){resolve(call,()->{
        FocusProtection.openAuthorizationSettings(getContext(),new Intent(Intent.ACTION_SET_WALLPAPER));return null;
    });}
    @PluginMethod public void getRecentTasksStatus(PluginCall call){resolve(call,()->control.getRecentTasksStatus());}
    @PluginMethod public void openNotificationAccessSettings(PluginCall call){resolve(call,()->{
        FocusProtection.openAuthorizationSettings(getContext(),new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
        return null;
    });}
    @PluginMethod public void rebindNotificationListener(PluginCall call){resolve(call,()->{
        FocusNotificationListener.rebind(getContext());return null;
    });}
    @PluginMethod public void restoreDnd(PluginCall call){resolve(call,()->control.restoreDnd());}
    @PluginMethod public void openDndSettings(PluginCall call){resolve(call,()->{
        FocusProtection.openAuthorizationSettings(getContext(),new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));return null;
    });}
    @PluginMethod public void consumeFocusReturn(PluginCall call){resolve(call,()->{
        Intent intent=getActivity()==null?null:getActivity().getIntent();
        boolean requested=intent!=null&&intent.getBooleanExtra("returnToFocus",false);
        if(intent!=null)intent.removeExtra("returnToFocus");
        return new JSONObject().put("requested",requested);
    });}
    @PluginMethod public void consumeLockReturn(PluginCall call){resolve(call,()->{
        Intent intent=getActivity()==null?null:getActivity().getIntent();
        boolean requested=intent!=null&&intent.getBooleanExtra("returnToLock",false);
        if(intent!=null)intent.removeExtra("returnToLock");
        return new JSONObject().put("requested",requested);
    });}
    @PluginMethod public void protectionStatus(PluginCall call){resolve(call,()->FocusProtection.status(getContext(),store,control.observeControl()));}
    @PluginMethod public void listProtectionApps(PluginCall call){resolve(call,()->new JSONObject().put("apps",FocusProtection.apps(getContext(),store)));}
    @PluginMethod public void openProtectionSettings(PluginCall call){resolve(call,()->{FocusProtection.openSettings(getContext(),call.getString("target","accessibility"));return null;});}
    @PluginMethod public void previewRecovery(PluginCall call){resolve(call,()->control.previewRecovery());}
    @PluginMethod public void confirmRecovery(PluginCall call){resolve(call,()->control.confirmRecovery(call.getString("revision","")));}
    @PluginMethod public void consumeRecoveryReturn(PluginCall call){resolve(call,()->{
        Intent intent=getActivity()==null?null:getActivity().getIntent();
        boolean requested=intent!=null&&intent.getBooleanExtra("openRecovery",false);
        if(intent!=null)intent.removeExtra("openRecovery");
        return new JSONObject().put("requested",requested);
    });}
    @PluginMethod public void syncReminders(PluginCall call){resolve(call,()->{Reminders.sync(getContext());return null;});}
    @PluginMethod public void permissions(PluginCall call){resolve(call,()->new JSONObject().put("notifications",Reminders.notificationsAllowed(getContext())).put("exactAlarms",Reminders.exactAllowed(getContext())).put("batteryOptimizationIgnored",BackgroundKeepAlive.isIgnoringBatteryOptimizations(getContext())).put("foregroundServiceActive",FocusKeepAliveService.isRunning()));}
    @PluginMethod public void requestNotifications(PluginCall call){if(Build.VERSION.SDK_INT>=33&&!Reminders.notificationsAllowed(getContext()))requestPermissionForAlias("notifications",call,"notificationsResult");else notificationsResult(call);}
    @PermissionCallback private void notificationsResult(PluginCall call){resolve(call,()->new JSONObject().put("notifications",Reminders.notificationsAllowed(getContext())));}
    @PluginMethod public void openAlarmSettings(PluginCall call){resolve(call,()->{if(Build.VERSION.SDK_INT>=31)FocusProtection.openAuthorizationSettings(getContext(),new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getContext().getPackageName())));return null;});}
    @PluginMethod public void openBatteryOptimizationSettings(PluginCall call){resolve(call,()->{BackgroundKeepAlive.openBatteryOptimizationSettings(getContext());return null;});}
    @PluginMethod public void exportFile(PluginCall call){
        String text=call.getString("text","");
        if(text==null)text="";
        String name=call.getString("name","小猫专注备份.json");
        File tempFile=null;
        try{
            tempFile=writeExportTempFile(text.getBytes(StandardCharsets.UTF_8));
            call.getData().remove("text");
            call.getData().put("tempFilePath",tempFile.getAbsolutePath());
            Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,name);
            allowSafPicker(intent);
            startActivityForResult(call,intent,"exportResult");
        }catch(RuntimeException error){
            if(tempFile!=null)deleteTempFile(tempFile.getAbsolutePath());
            FocusProtection.clearSettingsAuthorization();
            call.reject("当前设备未提供文件保存选择器",error);
        }catch(Exception error){
            if(tempFile!=null)deleteTempFile(tempFile.getAbsolutePath());
            call.reject("备份导出准备失败",error);
        }
    }
    @ActivityCallback private void exportResult(PluginCall call,ActivityResult result){
        FocusProtection.clearSettingsAuthorization();
        if(call==null)return;
        String tempPath=call.getString("tempFilePath","");
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){
            deleteTempFile(tempPath);
            call.reject("已取消导出");
            return;
        }
        final Uri targetUri=result.getData().getData();
        final android.content.Context ctx=getContext();
        if(ctx==null){
            deleteTempFile(tempPath);
            call.reject("备份导出失败");
            return;
        }
        EXPORT_IO.execute(()->{
            try(InputStream in=new FileInputStream(tempPath);
                OutputStream stream=ctx.getContentResolver().openOutputStream(targetUri,"wt")){
                if(stream==null)throw new IllegalStateException("无法打开备份文件");
                byte[] buffer=new byte[8192];int count;
                while((count=in.read(buffer))!=-1)stream.write(buffer,0,count);
                call.resolve();
            }catch(Exception error){
                call.reject("备份导出失败",error);
            }finally{
                deleteTempFile(tempPath);
            }
        });
    }
    @PluginMethod public void exportBase64File(PluginCall call){
        String base64=call.getString("base64","");
        if(base64==null||base64.isEmpty()){
            call.reject("导出图片数据为空");
            return;
        }
        String mimeType=call.getString("mimeType","image/png");
        if(mimeType==null||mimeType.isEmpty())mimeType="image/png";
        String name=call.getString("name","小猫专注农场打卡.png");
        File tempFile=null;
        try{
            int comma=base64.indexOf(',');
            if(comma>=0)base64=base64.substring(comma+1);
            byte[] bytes=Base64.decode(base64,Base64.DEFAULT);
            if(bytes.length==0){
                call.reject("导出图片数据为空");
                return;
            }
            tempFile=writeExportTempFile(bytes);
            call.getData().remove("base64");
            call.getData().put("tempFilePath",tempFile.getAbsolutePath());
            Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mimeType).putExtra(Intent.EXTRA_TITLE,name);
            allowSafPicker(intent);
            startActivityForResult(call,intent,"exportBase64Result");
        }catch(RuntimeException error){
            if(tempFile!=null)deleteTempFile(tempFile.getAbsolutePath());
            FocusProtection.clearSettingsAuthorization();
            call.reject("当前设备未提供文件保存选择器",error);
        }catch(Exception error){
            if(tempFile!=null)deleteTempFile(tempFile.getAbsolutePath());
            call.reject("图片导出准备失败",error);
        }
    }
    @ActivityCallback private void exportBase64Result(PluginCall call,ActivityResult result){
        FocusProtection.clearSettingsAuthorization();
        if(call==null)return;
        String tempPath=call.getString("tempFilePath","");
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){
            deleteTempFile(tempPath);
            call.reject("已取消导出");
            return;
        }
        final Uri targetUri=result.getData().getData();
        final android.content.Context ctx=getContext();
        if(ctx==null){
            deleteTempFile(tempPath);
            call.reject("图片导出失败");
            return;
        }
        EXPORT_IO.execute(()->{
            try(InputStream in=new FileInputStream(tempPath);
                OutputStream stream=ctx.getContentResolver().openOutputStream(targetUri,"wt")){
                if(stream==null)throw new IllegalStateException("无法打开导出文件");
                byte[] buffer=new byte[8192];int count;
                while((count=in.read(buffer))!=-1)stream.write(buffer,0,count);
                call.resolve();
            }catch(Exception error){
                call.reject("图片导出失败",error);
            }finally{
                deleteTempFile(tempPath);
            }
        });
    }
    @PluginMethod public void importFile(PluginCall call){
        if(readActive()){call.reject("请先结束当前专注");return;}
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        allowSafPicker(intent);
        try{
            startActivityForResult(call,intent,"importResult");
        }catch(RuntimeException error){
            FocusProtection.clearSettingsAuthorization();
            call.reject("当前设备未提供文件选择器",error);
        }
    }
    private boolean readActive(){try{return store.read("active")!=null;}catch(Exception error){return true;}}
    @ActivityCallback private void importResult(PluginCall call,ActivityResult result){
        FocusProtection.clearSettingsAuthorization();
        if(call==null)return;
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){
            call.reject("已取消选择备份");
            return;
        }
        final Uri sourceUri=result.getData().getData();
        final android.content.Context ctx=getContext();
        if(ctx==null){
            call.reject("备份读取失败");
            return;
        }
        EXPORT_IO.execute(()->{
            try(InputStream stream=ctx.getContentResolver().openInputStream(sourceUri);
                ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                if(stream==null)throw new IllegalStateException("无法读取备份文件");
                byte[] buffer=new byte[8192];int count;
                while((count=stream.read(buffer))!=-1){
                    bytes.write(buffer,0,count);
                    if(bytes.size()>20*1024*1024)throw new IllegalArgumentException("备份文件过大");
                }
                call.resolve(new JSObject().put("text",bytes.toString(StandardCharsets.UTF_8.name())));
            }catch(Exception error){
                call.reject("备份读取失败",error);
            }
        });
    }

    @PluginMethod public void setFocusOverlayState(PluginCall call){resolve(call,()->{
        MainActivity.updateRouteState(getContext(),call.getString("route","/"));
        return new JSONObject().put("ok",true);
    });}

    @PluginMethod public void getKeepAliveGuide(PluginCall call){resolve(call,()->OemKeepAliveRouter.buildGuide(getContext(),store));}

    @PluginMethod public void openKeepAliveSettings(PluginCall call){resolve(call,()->{
        String target=call.getString("target","autostart");
        if("battery".equals(target)){
            BackgroundKeepAlive.openBatteryOptimizationSettings(getContext());
        }else if("autostart".equals(target)){
            OemKeepAliveRouter.openAutoStartSettings(getContext());
        }else{
            OemKeepAliveRouter.openAppDetailsSettings(getContext());
        }
        return new JSONObject().put("opened",true);
    });}

    @PluginMethod public void getDeviceAdminStatus(PluginCall call){resolve(call,()->{
        JSONObject resolved=FocusProtection.resolveEffective(FocusProtection.preferences(store));
        boolean prefEnabled=FocusProtection.enhancementRequested(resolved,DeviceAdminProtection.KEY);
        return DeviceAdminProtection.status(getContext(),prefEnabled);
    });}

    @PluginMethod public void requestDeviceAdmin(PluginCall call){resolve(call,()->{
        DeviceAdminProtection.requestActivation(getActivity(), getContext());
        return new JSONObject().put("opened",true);
    });}

    @PluginMethod public void deactivateDeviceAdmin(PluginCall call){resolve(call,()->{
        DeviceAdminProtection.deactivate(getContext());
        JSONObject resolved=FocusProtection.resolveEffective(FocusProtection.preferences(store));
        boolean prefEnabled=FocusProtection.enhancementRequested(resolved,DeviceAdminProtection.KEY);
        return DeviceAdminProtection.status(getContext(),prefEnabled);
    });}

    @PluginMethod public void syncWhiteNoise(PluginCall call){resolve(call,()->{
        boolean userAction=Boolean.TRUE.equals(call.getBoolean("userAction",false));
        WhiteNoisePlayer player=WhiteNoisePlayer.getInstance(getContext());
        if(userAction)player.syncFromUserAction(getContext());
        else player.syncFromStore(getContext());
        return new JSONObject().put("ok",true);
    });}
}
