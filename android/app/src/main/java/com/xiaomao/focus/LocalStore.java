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
    private LocalStore(Context context) { this(context, "xiaomao-focus.db"); }
    LocalStore(Context context, String databaseName) { super(context, databaseName, null, 1); }
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
            if(replace){db.delete("focus_records",null,null);write("active",null);write("lastFinished",null);write("rest",null);}
            JSONArray records=data.optJSONArray("records");if(records!=null)for(int i=0;i<records.length();i++)upsertRecord(records.getJSONObject(i));
            JSONArray deleted=data.optJSONArray("deletedRecordIds");if(deleted!=null)for(int i=0;i<deleted.length();i++)db.delete("focus_records","id=?",new String[]{deleted.getString(i)});
            write("data",data);db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    synchronized void finish(JSONObject record) { finish(record, null); }
    synchronized void finish(JSONObject record, JSONObject rest) {SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{if(record!=null&&record.optLong("durationMs")>0){upsertRecord(record);write("lastFinished",record);}write("active",null);write("rest",rest);db.setTransactionSuccessful();}finally{db.endTransaction();}}

    synchronized JSONObject snapshot() throws JSONException {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            JSONObject documents = new JSONObject();
            JSONArray records = new JSONArray();
            try (Cursor c = db.rawQuery("SELECT key,value FROM documents", null)) {
                while (c.moveToNext()) documents.put(c.getString(0), new JSONObject(c.getString(1)));
            }
            try (Cursor c = db.rawQuery("SELECT value FROM focus_records", null)) {
                while (c.moveToNext()) records.put(new JSONObject(c.getString(0)));
            }
            db.setTransactionSuccessful();
            return new JSONObject().put("documents", documents).put("records", records);
        } finally { db.endTransaction(); }
    }

    synchronized void restoreSnapshot(JSONObject snapshot) throws JSONException {
        JSONObject documents = snapshot.getJSONObject("documents");
        JSONArray records = snapshot.getJSONArray("records");
        JSONObject data = documents.optJSONObject("data");
        if (data == null || data.optInt("schemaVersion") != 1)
            throw new IllegalArgumentException("此恢复副本与当前版本不兼容");
        // Parse every row before entering the transaction; malformed backups never replace data.
        for (int i = 0; i < records.length(); i++) {
            if (records.getJSONObject(i).optString("id").isEmpty())
                throw new IllegalArgumentException("恢复副本记录损坏");
        }
        java.util.Iterator<String> keys = documents.keys();
        while (keys.hasNext()) documents.getJSONObject(keys.next());
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("documents", null, null);
            db.delete("focus_records", null, null);
            keys = documents.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!key.equals("active") && !key.equals("lastFinished") && !key.equals("rest")) write(key, documents.getJSONObject(key));
            }
            for (int i = 0; i < records.length(); i++) upsertRecord(records.getJSONObject(i));
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
}
