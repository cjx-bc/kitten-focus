package com.xiaomao.focus;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;

final class LocalStore extends SQLiteOpenHelper {
    private static LocalStore instance;
    static synchronized LocalStore get(Context context) { if(instance == null) instance = new LocalStore(context.getApplicationContext()); return instance; }
    private LocalStore(Context context) { super(context, "xiaomao-focus.db", null, 1); }
    @Override public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE documents (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"); db.execSQL("CREATE TABLE focus_records (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"); }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }
    synchronized JSONObject read(String key) throws JSONException { try(Cursor cursor=getReadableDatabase().rawQuery("SELECT value FROM documents WHERE key=?",new String[]{key})) { return cursor.moveToFirst()?new JSONObject(cursor.getString(0)):null; } }
    synchronized void write(String key, JSONObject value) { if(value==null){getWritableDatabase().delete("documents","key=?",new String[]{key});return;}ContentValues row=new ContentValues();row.put("key",key);row.put("value",value.toString());getWritableDatabase().insertWithOnConflict("documents",null,row,SQLiteDatabase.CONFLICT_REPLACE); }
    synchronized JSONObject loadData() throws JSONException {
        JSONObject data=read("data"); if(data==null)return null;
        JSONArray records=new JSONArray(),deleted=data.optJSONArray("deletedRecordIds");
        try(Cursor cursor=getReadableDatabase().rawQuery("SELECT id,value FROM focus_records",null)){while(cursor.moveToNext()){boolean removed=false;if(deleted!=null)for(int i=0;i<deleted.length();i++)if(cursor.getString(0).equals(deleted.optString(i))){removed=true;break;}if(!removed)records.put(new JSONObject(cursor.getString(1)));}}
        data.put("records",records);return data;
    }
    private void upsertRecord(JSONObject record) { ContentValues row=new ContentValues();row.put("id",record.optString("id"));row.put("value",record.toString());getWritableDatabase().insertWithOnConflict("focus_records",null,row,SQLiteDatabase.CONFLICT_REPLACE); }
    synchronized void saveData(JSONObject data, boolean replace) throws JSONException {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{
            if(replace){db.delete("focus_records",null,null);write("active",null);write("lastFinished",null);}
            JSONArray records=data.optJSONArray("records");if(records!=null)for(int i=0;i<records.length();i++)upsertRecord(records.getJSONObject(i));
            JSONArray deleted=data.optJSONArray("deletedRecordIds");if(deleted!=null)for(int i=0;i<deleted.length();i++)db.delete("focus_records","id=?",new String[]{deleted.getString(i)});
            write("data",data);db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    synchronized void finish(JSONObject record) {SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{if(record!=null&&record.optLong("durationMs")>0){upsertRecord(record);write("lastFinished",record);}write("active",null);db.setTransactionSuccessful();}finally{db.endTransaction();}}
}
