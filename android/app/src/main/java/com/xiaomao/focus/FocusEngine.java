package com.xiaomao.focus;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONObject;
import org.json.JSONArray;
import org.json.JSONException;

final class FocusEngine {
    private final Context context;private final LocalStore store;
    FocusEngine(Context context){this.context=context.getApplicationContext();store=LocalStore.get(context);}
    private int boot(){return Settings.Global.getInt(context.getContentResolver(),Settings.Global.BOOT_COUNT,0);}
    JSONObject start(JSONObject session) throws JSONException {synchronized(store){return startLocked(session);}}
    private JSONObject startLocked(JSONObject session) throws JSONException {
        if(store.read("active")!=null)throw new IllegalStateException("请先结束当前专注");
        if(session.optLong("targetMs")<=0||(!session.optString("mode").equals("countdown")&&!session.optString("mode").equals("stopwatch")))throw new IllegalArgumentException("计时参数无效");
        session.put("anchorMono",SystemClock.elapsedRealtime());session.put("anchorEpoch",System.currentTimeMillis());session.put("startedAt",System.currentTimeMillis());session.put("bootId",boot());store.write("active",session);
        Reminders.scheduleFocus(context,session);Reminders.showFocus(context,session,0);return snapshot(session,0,null);
    }
    private long elapsed(JSONObject s,long now){long ms=s.optLong("elapsedMs")+(s.optString("state").equals("running")?Math.max(0,now-s.optLong("anchorMono")):0);return s.optString("mode").equals("countdown")?Math.min(ms,s.optLong("targetMs")):ms;}
    private void checkpoint(JSONObject s,long now,long epoch) throws JSONException {
        long delta=Math.max(0,now-s.optLong("anchorMono"));if(s.optString("mode").equals("countdown"))delta=Math.min(delta,Math.max(0,s.optLong("targetMs")-s.optLong("elapsedMs")));
        if(delta>0){JSONArray segments=s.getJSONArray("segments");JSONObject last=segments.length()>0?segments.getJSONObject(segments.length()-1):null;
            if(last!=null&&last.optLong("end")==s.optLong("anchorEpoch"))last.put("end",s.optLong("anchorEpoch")+delta);
            else segments.put(new JSONObject().put("start",s.optLong("anchorEpoch")).put("end",s.optLong("anchorEpoch")+delta));}
        s.put("elapsedMs",s.optLong("elapsedMs")+delta);s.put("anchorMono",now);s.put("anchorEpoch",epoch);
    }
    JSONObject action(String action) throws JSONException {synchronized(store){return actionLocked(action);}}
    private JSONObject actionLocked(String action) throws JSONException {
        JSONObject s=store.read("active");if(s==null)return snapshot(null,0,store.read("lastFinished"));
        long now=SystemClock.elapsedRealtime(),epoch=System.currentTimeMillis();boolean interrupted=s.optInt("bootId")!=boot()||now<s.optLong("anchorMono");
        long value=interrupted?s.optLong("elapsedMs"):elapsed(s,now);
        boolean reached=s.optString("mode").equals("countdown")&&value>=s.optLong("targetMs");
        if(interrupted||reached||action.equals("finish")){
            if(!interrupted&&s.optString("state").equals("running"))checkpoint(s,now,epoch);
            if(!interrupted&&s.optString("state").equals("paused"))s.put("pausedMs",s.optLong("pausedMs")+Math.max(0,now-s.optLong("anchorMono")));
            String status=interrupted?"interrupted":reached||s.optString("mode").equals("stopwatch")?"completed":"early";
            JSONArray segments=s.getJSONArray("segments");long ended=interrupted||reached?(segments.length()>0?segments.getJSONObject(segments.length()-1).optLong("end"):s.optLong("startedAt")):epoch;
            JSONObject record=new JSONObject();for(String key:new String[]{"id","itemId","themeId","title","themeName","color","mode","targetMs","startedAt","timeZone","pausedMs","segments"})record.put(key,s.get(key));
            record.put("endedAt",ended);record.put("durationMs",s.optLong("elapsedMs"));record.put("status",status);store.finish(record);Reminders.cancelFocus(context);if(reached)Reminders.showFinished(context,s);return snapshot(null,s.optLong("elapsedMs"),record.optLong("durationMs")>0?record:null);
        }
        if(action.equals("pause")&&s.optString("state").equals("running")){checkpoint(s,now,epoch);s.put("state","paused");s.put("anchorMono",now);Reminders.cancelFocusAlarm(context);}
        else if(action.equals("resume")&&s.optString("state").equals("paused")){s.put("pausedMs",s.optLong("pausedMs")+Math.max(0,now-s.optLong("anchorMono")));s.put("state","running");s.put("anchorMono",now);s.put("anchorEpoch",epoch);Reminders.scheduleFocus(context,s);}
        else if(s.optString("state").equals("running")&&now-s.optLong("anchorMono")>=5000)checkpoint(s,now,epoch);
        store.write("active",s);Reminders.showFocus(context,s,elapsed(s,now));return snapshot(s,elapsed(s,now),null);
    }
    private JSONObject snapshot(JSONObject session,long elapsed,JSONObject record) throws JSONException {JSONObject result=new JSONObject().put("session",session==null?JSONObject.NULL:session).put("elapsedMs",elapsed);if(record!=null)result.put("record",record);return result;}
}
