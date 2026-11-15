package com.xiaomao.focus;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import org.json.JSONArray;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Calendar;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;

final class Reminders {
    static final int FOCUS_ID=40;static final String FOCUS_ACTION="com.xiaomao.focus.FOCUS_DUE";
    static final int REST_ID=43;
    static final String REST_ACTION="com.xiaomao.focus.REST_DUE";
    private static PendingIntent restIntent(Context c){return PendingIntent.getBroadcast(c,REST_ID,new Intent(c,ReminderReceiver.class).setAction(REST_ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void scheduleRest(Context c,long due){schedule(c,AlarmManager.ELAPSED_REALTIME_WAKEUP,due,restIntent(c));}
    static void cancelRest(Context c){c.getSystemService(AlarmManager.class).cancel(restIntent(c));NotificationManagerCompat.from(c).cancel(REST_ID);}
    static void showRestFinished(Context c){
        if(!notificationsAllowed(c))return;
        boolean sound=true,vibration=true;
        try{JSONObject data=LocalStore.get(c).read("data");if(data!=null){JSONObject preferences=data.optJSONObject("preferences");if(preferences!=null){sound=preferences.optBoolean("sound",true);vibration=preferences.optBoolean("vibration",true);}}}catch(Exception ignored){}
        String id="rest-done-"+sound+"-"+vibration;
        channel(c,id,"休息结束提醒",sound,vibration,false);
        NotificationManagerCompat.from(c).notify(REST_ID,builder(c,id).setContentTitle("休息结束，准备好再开始")
            .setContentText("下一段专注，由你自己开始。").setAutoCancel(true).build());
    }
    static boolean notificationsAllowed(Context c){return Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;}
    static boolean exactAllowed(Context c){return Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager.class).canScheduleExactAlarms();}
    private static PendingIntent focusIntent(Context c){return PendingIntent.getBroadcast(c,FOCUS_ID,new Intent(c,ReminderReceiver.class).setAction(FOCUS_ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static PendingIntent open(Context c){return PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static PendingIntent returnToFocus(Context c){return PendingIntent.getActivity(c,FOCUS_ID,new Intent(c,MainActivity.class).putExtra("returnToFocus",true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static PendingIntent recovery(Context c){return PendingIntent.getActivity(c,44,new Intent(c,MainActivity.class).putExtra("openRecovery",true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void scheduleFocus(Context c,JSONObject s){if(!s.optString("mode").equals("countdown")||!s.optString("state").equals("running"))return;long due=s.optLong("anchorMono")+Math.max(0,s.optLong("targetMs")-s.optLong("elapsedMs"));schedule(c,AlarmManager.ELAPSED_REALTIME_WAKEUP,due,focusIntent(c));}
    private static void schedule(Context c,int type,long due,PendingIntent intent){AlarmManager manager=c.getSystemService(AlarmManager.class);try{if(exactAllowed(c)){manager.setExactAndAllowWhileIdle(type,due,intent);return;}}catch(SecurityException ignored){}manager.setAndAllowWhileIdle(type,due,intent);}
    static void cancelFocusAlarm(Context c){c.getSystemService(AlarmManager.class).cancel(focusIntent(c));}
    static void cancelFocus(Context c){cancelFocusAlarm(c);NotificationManagerCompat.from(c).cancel(FOCUS_ID);}
    private static void channel(Context c,String id,String title,boolean sound,boolean vibration,boolean low){if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel(id,title,low?NotificationManager.IMPORTANCE_LOW:NotificationManager.IMPORTANCE_DEFAULT);channel.enableVibration(vibration);if(!sound)channel.setSound(null,null);else channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());c.getSystemService(NotificationManager.class).createNotificationChannel(channel);}}
    private static NotificationCompat.Builder builder(Context c,String channel){return new NotificationCompat.Builder(c,channel).setSmallIcon(R.drawable.ic_stat_focus).setContentIntent(open(c)).setColor(0xff222222);}
    static void showFocus(Context c,JSONObject s,long elapsed){if(!notificationsAllowed(c))return;channel(c,"focus-status","专注状态",false,false,true);boolean paused=s.optString("state").equals("paused"),countdown=s.optString("mode").equals("countdown");NotificationCompat.Builder notification=builder(c,"focus-status").setContentIntent(returnToFocus(c)).setContentTitle(s.optString("title")).setContentText(paused?"已暂停 · 点击返回专注":countdown?"倒计时专注进行中":"正计时专注进行中").setOngoing(true).setOnlyAlertOnce(true).setSilent(true);
        if(LockEngine.owns(s)) notification.setContentText("普通锁机进行中 · 点击返回锁机");
        if(!paused){notification.setUsesChronometer(true).setWhen(countdown?System.currentTimeMillis()+Math.max(0,s.optLong("targetMs")-elapsed):System.currentTimeMillis()-elapsed);if(Build.VERSION.SDK_INT>=24)notification.setChronometerCountDown(countdown);}
        notification.addAction(0,"帮助与故障恢复",recovery(c));
        NotificationManagerCompat.from(c).notify(FOCUS_ID,notification.build());}
    static void showFinished(Context c,JSONObject s){if(!notificationsAllowed(c))return;boolean sound=true,vibration=true;try{JSONObject data=LocalStore.get(c).read("data");if(data!=null){JSONObject preferences=data.optJSONObject("preferences");if(preferences!=null){sound=preferences.optBoolean("sound",true);vibration=preferences.optBoolean("vibration",true);}}}catch(Exception ignored){}String id="focus-done-"+sound+"-"+vibration;channel(c,id,"专注结束提醒",sound,vibration,false);NotificationManagerCompat.from(c).notify(41,builder(c,id).setContentTitle("本次专注已完成").setContentText(s.optString("title")+" · 认真投入的时间已经记录").setAutoCancel(true).build());}
    static void showLockFinished(Context c,JSONObject session) {
        if(!notificationsAllowed(c))return;
        boolean sound=true,vibration=true;
        try { JSONObject data=LocalStore.get(c).read("data"); JSONObject preferences=data==null?null:data.optJSONObject("preferences");
            if(preferences!=null){sound=preferences.optBoolean("sound",true);vibration=preferences.optBoolean("vibration",true);} }
        catch(Exception ignored) { }
        String channel="lock-done-"+sound+"-"+vibration;
        channel(c,channel,"锁机结束提醒",sound,vibration,false);
        Intent intent = new Intent(c,MainActivity.class).putExtra("returnToLock",true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent target = PendingIntent.getActivity(c,45,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationManagerCompat.from(c).notify(45,builder(c,channel).setContentTitle("本轮锁机已到期")
            .setContentIntent(target).setContentText(session.optString("title")+" · 查看独立锁机记录").setAutoCancel(true).build());
    }
    static void showSchedule(Context c,int id,String title,String text){if(!notificationsAllowed(c))return;channel(c,"schedule","日程与课程提醒",true,true,false);NotificationManagerCompat.from(c).notify(id,builder(c,"schedule").setContentTitle(title).setContentText(text).setAutoCancel(true).build());}
    static synchronized void sync(Context c) throws Exception {
        Set<String> old=c.getSharedPreferences("reminders",0).getStringSet("ids",new HashSet<>());AlarmManager manager=c.getSystemService(AlarmManager.class);
        for(String value:old){int id=Integer.parseInt(value);manager.cancel(scheduleIntent(c,id,"",""));}
        Set<String> ids=new HashSet<>();JSONObject data=LocalStore.get(c).read("data");if(data==null)return;
        JSONArray events=data.optJSONArray("events"),courses=data.optJSONArray("courses"),semesters=data.optJSONArray("semesters");
        SimpleDateFormat dayFormat=new SimpleDateFormat("yyyy-MM-dd",Locale.US),timestamp=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm",Locale.US);
        long now=System.currentTimeMillis();Calendar day=Calendar.getInstance();day.set(Calendar.HOUR_OF_DAY,12);day.set(Calendar.MINUTE,0);day.set(Calendar.SECOND,0);day.set(Calendar.MILLISECOND,0);
        for(int offset=0;offset<90;offset++,day.add(Calendar.DAY_OF_YEAR,1)){
            String date=dayFormat.format(day.getTime());int weekday=((day.get(Calendar.DAY_OF_WEEK)+5)%7)+1;
            if(events!=null)for(int i=0;i<events.length();i++){JSONObject event=events.getJSONObject(i);if(event.isNull("reminderMinutes"))continue;String base=event.optString("start").substring(0,10);boolean once=event.optString("repeat").equals("none");if(once&&!date.equals(base))continue;if(!once&&(date.compareTo(base)<0||!contains(event.optJSONArray("weekdays"),weekday)||(!event.optString("until").isEmpty()&&date.compareTo(event.optString("until"))>0)))continue;
                JSONObject exception=findException(data.optJSONArray("eventExceptions"),"eventId",event.optString("id"),date);if(exception!=null&&exception.optBoolean("cancelled"))continue;String start=exception!=null?exception.optString("start",date+event.optString("start").substring(10)):date+event.optString("start").substring(10);long due=timestamp.parse(start).getTime()-event.optLong("reminderMinutes")*60000;if(due>now){int id=1000+Math.abs((event.optString("id")+date).hashCode()%100000000);queue(c,id,due,event.optString("title"),"日程即将开始",ids);}}
            if(courses!=null&&semesters!=null)for(int i=0;i<courses.length();i++){JSONObject course=courses.getJSONObject(i);if(course.isNull("reminderMinutes")||!course.optString("semesterId").equals(data.getJSONObject("preferences").optString("activeSemesterId"))||course.optInt("weekday")!=weekday)continue;JSONObject semester=null;for(int j=0;j<semesters.length();j++)if(semesters.getJSONObject(j).optString("id").equals(course.optString("semesterId")))semester=semesters.getJSONObject(j);if(semester==null)continue;long diff=Math.round((day.getTimeInMillis()-timestamp.parse(semester.optString("startDate")+"T12:00").getTime())/86400000.0);int week=(int)Math.floor(diff/7.0)+1;if(week<course.optInt("firstWeek")||week>course.optInt("lastWeek")||week>semester.optInt("weeks")||course.optString("parity").equals("odd")&&week%2==0||course.optString("parity").equals("even")&&week%2!=0)continue;
                JSONObject exception=findException(data.optJSONArray("courseExceptions"),"courseId",course.optString("id"),date);if(exception!=null&&exception.optBoolean("cancelled"))continue;JSONArray periods=semester.getJSONArray("periods");String start=date+"T"+periods.getJSONObject(course.optInt("firstPeriod")-1).optString("start");if(exception!=null)start=exception.optString("start",start);long due=timestamp.parse(start).getTime()-course.optLong("reminderMinutes")*60000;if(due>now){int id=1000+Math.abs((course.optString("id")+date).hashCode()%100000000);queue(c,id,due,course.optString("title"),course.optString("room","课程即将开始"),ids);}}
        }
        queueMovedExceptions(c,data,now,timestamp,ids);
        c.getSharedPreferences("reminders",0).edit().putStringSet("ids",ids).apply();
        PendingIntent refresh=PendingIntent.getBroadcast(c,42,new Intent(c,ReminderReceiver.class).setAction("com.xiaomao.focus.REFRESH_REMINDERS"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,now+86400000,refresh);
    }
    private static void queueMovedExceptions(Context c,JSONObject data,long now,SimpleDateFormat timestamp,Set<String> ids)throws Exception{
        for(String type:new String[]{"event","course"}){
            JSONArray exceptions=data.optJSONArray(type.equals("event")?"eventExceptions":"courseExceptions"),sources=data.optJSONArray(type.equals("event")?"events":"courses");if(exceptions==null||sources==null)continue;
            for(int i=0;i<exceptions.length();i++){JSONObject exception=exceptions.getJSONObject(i);if(exception.optBoolean("cancelled")||!exception.has("start"))continue;
                for(int j=0;j<sources.length();j++){JSONObject source=sources.getJSONObject(j);if(!source.optString("id").equals(exception.optString(type+"Id"))||source.isNull("reminderMinutes"))continue;
                    if(type.equals("course")&&!source.optString("semesterId").equals(data.getJSONObject("preferences").optString("activeSemesterId")))continue;
                    long due=timestamp.parse(exception.getString("start")).getTime()-source.optLong("reminderMinutes")*60000;if(due<=now||due>now+90L*86400000)continue;
                    int id=1000+Math.abs((source.optString("id")+exception.optString("date")).hashCode()%100000000);queue(c,id,due,exception.optString("title",source.optString("title")),type.equals("course")?source.optString("room"):"日程即将开始",ids);
                }
            }
        }
    }
    private static JSONObject findException(JSONArray values,String key,String id,String date)throws Exception{if(values!=null)for(int i=0;i<values.length();i++){JSONObject row=values.getJSONObject(i);if(row.optString(key).equals(id)&&row.optString("date").equals(date))return row;}return null;}
    private static boolean contains(JSONArray values,int value){if(values!=null)for(int i=0;i<values.length();i++)if(values.optInt(i)==value)return true;return false;}
    private static PendingIntent scheduleIntent(Context c,int id,String title,String text){return PendingIntent.getBroadcast(c,id,new Intent(c,ReminderReceiver.class).setAction("com.xiaomao.focus.SCHEDULE").putExtra("id",id).putExtra("title",title).putExtra("text",text),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static void queue(Context c,int id,long due,String title,String text,Set<String> ids){schedule(c,AlarmManager.RTC_WAKEUP,due,scheduleIntent(c,id,title,text));ids.add(String.valueOf(id));}
}
