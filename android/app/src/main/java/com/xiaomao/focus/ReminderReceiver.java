package com.xiaomao.focus;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        PendingResult result=goAsync();new Thread(()->{try{
            String action=intent.getAction();if(Reminders.FOCUS_ACTION.equals(action))new FocusEngine(context).action("read");
            else if("com.xiaomao.focus.SCHEDULE".equals(action)){Reminders.showSchedule(context,intent.getIntExtra("id",1000),intent.getStringExtra("title"),intent.getStringExtra("text"));Reminders.sync(context);}
            else{new FocusEngine(context).action("read");Reminders.sync(context);}
        }catch(Exception error){Log.e("CatFocus","Reminder handling failed",error);}finally{result.finish();}},"cat-focus-reminder").start();
    }
}
