package com.xiaomao.focus;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONObject;
import static org.junit.Assert.*;

/** Test-fixture preservation only. Assertions of product behavior still use the public seam. */
final class QaBusinessBaseline {
    private final Context context;
    private final LocalStore store;
    private final Map<String, String> documents;
    private final Map<String, String> records;

    static QaBusinessBaseline captureIdle(Context context) throws Exception {
        assertIdle(context);
        return new QaBusinessBaseline(context, LocalStore.get(context));
    }

    static void assertIdle(Context context) throws Exception {
        assertTrue("Only the isolated QA application may be changed", context.getPackageName().endsWith(".qa"));
        LocalStore store = LocalStore.get(context);
        assertNull("Leave the existing QA focus/lock untouched", store.read("active"));
        JSONObject rest = store.read("rest");
        assertFalse("Leave the existing QA rest untouched", rest != null && rest.optString("state").equals("running"));
        assertFalse("Resolve old QA recovery duties before testing", new FocusControl(context).previewRecovery().getBoolean("pending"));
    }

    private QaBusinessBaseline(Context context, LocalStore store) {
        this.context = context; this.store = store;
        documents = rows("documents", "key"); records = rows("focus_records", "id");
    }

    private Map<String, String> rows(String table, String key) {
        Map<String, String> result = new LinkedHashMap<>();
        try (Cursor cursor = store.getReadableDatabase().query(table, new String[]{key, "value"}, null, null, null, null, null)) {
            while (cursor.moveToNext()) result.put(cursor.getString(0), cursor.getString(1));
        }
        return result;
    }

    private void restoreRows(SQLiteDatabase database, String table, String key, Map<String, String> original) {
        database.delete(table, null, null);
        for (Map.Entry<String, String> entry : original.entrySet()) {
            ContentValues value = new ContentValues(); value.put(key, entry.getKey()); value.put("value", entry.getValue());
            database.insertOrThrow(table, null, value);
        }
    }

    void restore() throws Exception {
        // A failed fixture must never discard unresolved OS responsibility in order to look clean.
        assertFalse("Retain fixture recovery duty for inspection", new FocusControl(context).previewRecovery().getBoolean("pending"));
        Reminders.cancelFocus(context); Reminders.cancelRest(context);
        SQLiteDatabase database = store.getWritableDatabase(); database.beginTransaction();
        try {
            restoreRows(database, "documents", "key", documents);
            restoreRows(database, "focus_records", "id", records);
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
        assertEquals("Restore every original document byte string", documents, rows("documents", "key"));
        assertEquals("Restore all records, including hidden/tombstoned history", records, rows("focus_records", "id"));
        Reminders.sync(context);
    }
}
