package com.xiaomao.focus;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import org.json.JSONException;

public class ReminderReceiver extends BroadcastReceiver {
    interface FocusActionDispatcher {
        void focusAction(String action) throws JSONException;
    }

    static boolean handleNotificationAction(FocusControl control, String action) throws JSONException {
        if (Reminders.FOCUS_ACTION_FINISH.equals(action)) {
            control.finishFromNotification();
            return true;
        }
        return handleNotificationAction((FocusActionDispatcher) control::focusAction, action);
    }

    static boolean handleNotificationAction(FocusActionDispatcher dispatcher, String action) throws JSONException {
        if (Reminders.FOCUS_ACTION_PAUSE.equals(action)) {
            dispatcher.focusAction("pause");
            return true;
        }
        if (Reminders.FOCUS_ACTION_RESUME.equals(action)) {
            dispatcher.focusAction("resume");
            return true;
        }
        if (Reminders.FOCUS_ACTION_FINISH.equals(action)) {
            dispatcher.focusAction("finish");
            return true;
        }
        return false;
    }

    @Override public void onReceive(Context context,Intent intent){
        PendingResult result=goAsync();new Thread(()->{try{
            FocusControl control=new FocusControl(context);
            String action=intent.getAction();if(Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)){control.restoreLauncher();control.reconcile();Reminders.sync(context);FocusNotificationListener.rebindIfAuthorized(context);}
            else if(Reminders.FOCUS_ACTION.equals(action))control.focusAction("read");
            else if(Reminders.REST_ACTION.equals(action))control.restAction("read");
            else if(handleNotificationAction(control,action)){CatFocusPlugin.emitJsEvent("sessionChanged","");MainActivity.refreshWindowState(context);}
            else if(Reminders.KEEP_ALIVE_REVIVE_ACTION.equals(action)||Reminders.KEEP_ALIVE_HEARTBEAT_ACTION.equals(action)){
                control.reconcile();
                FocusNotificationListener.rebindIfAuthorized(context);
                if(LocalStore.get(context).read("active")!=null){
                    FocusKeepAliveService.ensureStarted(context);
                    Reminders.scheduleKeepAliveHeartbeat(context);
                }else{
                    Reminders.cancelKeepAlive(context);
                }
            }
            else if("com.xiaomao.focus.SCHEDULE".equals(action)){Reminders.showSchedule(context,intent.getIntExtra("id",1000),intent.getStringExtra("title"),intent.getStringExtra("text"));Reminders.sync(context);}
            else{control.reconcile(Intent.ACTION_BOOT_COMPLETED.equals(action));Reminders.sync(context);FocusNotificationListener.rebindIfAuthorized(context);}
        }catch(Exception error){Log.e("CatFocus","Reminder handling failed",error);}finally{result.finish();}},"cat-focus-reminder").start();
    }
}
