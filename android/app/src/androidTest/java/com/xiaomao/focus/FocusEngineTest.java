package com.xiaomao.focus;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import org.json.JSONArray;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class FocusEngineTest {
    Context context;LocalStore store;FocusEngine engine;
    JSONObject empty()throws Exception{return new JSONObject("{\"schemaVersion\":1,\"themes\":[],\"items\":[],\"records\":[],\"deletedRecordIds\":[],\"events\":[],\"eventExceptions\":[],\"semesters\":[],\"courses\":[],\"courseExceptions\":[],\"preferences\":{\"defaultMinutes\":25,\"sound\":false,\"vibration\":false,\"activeSemesterId\":null}}");}
    @Before public void setup()throws Exception{
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Only the isolated QA application may be tested",context.getPackageName().endsWith(".qa"));
        assertNull("Do not disturb an existing QA focus/lock",LocalStore.get(context).read("active"));
        JSONObject rest=LocalStore.get(context).read("rest");
        assertFalse("Do not disturb an existing QA rest",rest!=null&&rest.optString("state").equals("running"));
        assertFalse("Resolve existing QA recovery duties first",new FocusControl(context).previewRecovery().getBoolean("pending"));
        store=new LocalStore(context,"focus-engine-"+System.nanoTime()+".db");
        store.saveData(empty(),true);engine=new FocusEngine(context,store,SessionClock.system(context));
    }
    @After public void cleanup()throws Exception{
        if(store==null)return;
        Reminders.cancelFocus(context);Reminders.cancelRest(context);
        String database=store.getDatabaseName();store.close();context.deleteDatabase(database);
        Reminders.sync(context);
    }
    JSONObject session(String mode)throws Exception{return new JSONObject().put("id","test-"+System.nanoTime()).put("itemId",JSONObject.NULL).put("themeId",JSONObject.NULL).put("title","测试专注").put("themeName","自由专注").put("color","#222222").put("mode",mode).put("targetMs",60000).put("startedAt",System.currentTimeMillis()).put("timeZone","UTC").put("state","running").put("elapsedMs",0).put("pausedMs",0).put("segments",new JSONArray());}
    @Test public void countdownCapsAndPersistsExactlyOnce()throws Exception{
        engine.start(session("countdown"));JSONObject active=store.read("active");long past=SystemClock.elapsedRealtime()-90000;active.put("anchorMono",past).put("anchorEpoch",System.currentTimeMillis()-90000);store.write("active",active);
        JSONObject result=engine.action("read"),record=result.getJSONObject("record");assertTrue(result.isNull("session"));assertEquals(60000,record.getLong("durationMs"));assertEquals("completed",record.getString("status"));
        engine.action("read");assertEquals(1,store.loadData().getJSONArray("records").length());
    }
    @Test public void pauseAndResumeExcludePausedTime()throws Exception{
        engine.start(session("stopwatch"));SystemClock.sleep(130);JSONObject paused=engine.action("pause");long value=paused.getLong("elapsedMs");assertTrue(value>=100);SystemClock.sleep(150);assertEquals(value,engine.action("read").getLong("elapsedMs"));
        engine.action("resume");SystemClock.sleep(110);JSONObject record=engine.action("finish").getJSONObject("record");assertTrue(record.getLong("pausedMs")>=140);assertTrue(record.getLong("durationMs")>=220);assertEquals("completed",record.getString("status"));assertEquals(2,record.getJSONArray("segments").length());
    }
    @Test public void recreationRecoversSameBootSession()throws Exception{
        JSONObject started=engine.start(session("stopwatch"));SystemClock.sleep(100);JSONObject result=new FocusEngine(context,store,SessionClock.system(context)).action("read");assertEquals(started.getJSONObject("session").getString("id"),result.getJSONObject("session").getString("id"));assertTrue(result.getLong("elapsedMs")>=90);
    }
    @Test public void rebootKeepsOnlyCheckpointedTime()throws Exception{
        engine.start(session("stopwatch"));JSONObject active=store.read("active");active.put("bootId",Settings.Global.getInt(context.getContentResolver(),Settings.Global.BOOT_COUNT,0)-1);active.put("elapsedMs",12000);active.getJSONArray("segments").put(new JSONObject().put("start",100000).put("end",112000));store.write("active",active);
        JSONObject record=engine.action("read").getJSONObject("record");assertEquals("interrupted",record.getString("status"));assertEquals(12000,record.getLong("durationMs"));
    }
    @Test public void deletingRecordAndRestoringDoNotResurrectOldRecord()throws Exception{
        engine.start(session("stopwatch"));SystemClock.sleep(20);JSONObject result=engine.action("finish");String id=result.getJSONObject("record").getString("id");JSONObject data=store.loadData();data.put("records",new JSONArray());data.getJSONArray("deletedRecordIds").put(id);store.saveData(data,false);assertEquals(0,store.loadData().getJSONArray("records").length());
        store.saveData(empty(),true);assertTrue(engine.action("read").isNull("session"));assertFalse(engine.action("read").has("record"));
    }
    @Test public void secondFocusCannotStartWhilePaused()throws Exception{
        engine.start(session("stopwatch"));engine.action("pause");try{engine.start(session("countdown"));fail("Should reject a second active session");}catch(IllegalStateException expected){}
    }
}
