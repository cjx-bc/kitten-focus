package com.xiaomao.focus.wallpaperprobe;

import android.app.WallpaperInfo;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import java.util.UUID;

/** Real Android adapter. It never uses shell/root/device-owner or hidden wallpaper APIs. */
public final class ProbeEnvironment implements ProbeSession.Platform, ProbeSession.Store {
    private static final Object LOCK = new Object();
    private static final String PROCESS = UUID.randomUUID().toString();
    private final Context context;
    private final WallpaperManager manager;
    private final File directory;

    public ProbeEnvironment(Context context) {
        this.context = context.getApplicationContext();
        this.manager = WallpaperManager.getInstance(context);
        this.directory = new File(context.getFilesDir(), "wallpaper-probe");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Cannot create private probe directory");
    }

    public ProbeSession session() { return new ProbeSession(this, this); }

    public Properties load() {
        synchronized (LOCK) {
            Properties properties = new Properties();
            File file = new File(directory, "session.properties");
            if (file.isFile()) try (InputStream in = new FileInputStream(file)) { properties.load(in); }
            catch (Exception e) { throw new IllegalStateException("Cannot read recovery journal", e); }
            return properties;
        }
    }

    public void save(Properties properties) {
        synchronized (LOCK) {
            File file = new File(directory, "session.properties");
            File temp = new File(directory, "session.properties.next");
            try (FileOutputStream out = new FileOutputStream(temp)) {
                properties.store(out, "Isolated wallpaper probe recovery journal");
                out.getFD().sync();
            } catch (Exception e) { throw new IllegalStateException("Cannot persist recovery journal", e); }
            if (!temp.renameTo(file)) throw new IllegalStateException("Cannot replace recovery journal");
        }
    }

    public ProbeSession.Identity current() {
        if (!manager.isWallpaperSupported() || !manager.isSetWallpaperAllowed())
            throw new IllegalStateException("Wallpaper unsupported or setting denied by system policy");
        WallpaperInfo info = manager.getWallpaperInfo();
        WallpaperInfo lockInfo = Build.VERSION.SDK_INT >= 34 ? manager.getWallpaperInfo(WallpaperManager.FLAG_LOCK) : null;
        return new ProbeSession.Identity(manager.getWallpaperId(WallpaperManager.FLAG_SYSTEM),
            manager.getWallpaperId(WallpaperManager.FLAG_LOCK),
            info == null ? "" : info.getComponent().flattenToString(), "",
            lockInfo == null ? "" : lockInfo.getComponent().flattenToString());
    }

    public String ownComponent() {
        return new ComponentName(context, ProbeWallpaperService.class).flattenToString();
    }

    public ProbeSession.Baseline capture() throws Exception {
        ProbeSession.Identity original = current();
        StringBuilder note = new StringBuilder();
        note.append("API ").append(Build.VERSION.SDK_INT).append("; ").append(Build.MANUFACTURER).append(' ')
            .append(Build.MODEL).append("; ordinary application identity. Home ID=").append(original.homeId)
            .append("; lock ID=").append(original.lockId).append("; live component=").append(original.component)
            .append("; lock live component=").append(original.lockComponent).append(". ");
        String home = "";
        String lock = "";
        if (original.component.isEmpty()) home = copyWallpaper(WallpaperManager.FLAG_SYSTEM, "baseline-home.image", note);
        else note.append("Live component only; its provider settings cannot be exported with public APIs. ");
        if (original.lockId >= 0 && original.lockComponent.isEmpty()) lock = copyWallpaper(WallpaperManager.FLAG_LOCK, "baseline-lock.image", note);
        else if (!original.lockComponent.isEmpty()) note.append("Separate live lock wallpaper requires manual recovery. ");
        ProbeSession.Identity after = current();
        if (!original.sameHome(after) || original.lockId != after.lockId)
            throw new IllegalStateException("Wallpaper changed while capturing; retry capture before enabling.");
        event("baseline", note.toString());
        return new ProbeSession.Baseline(original, home, lock, note.toString());
    }

    public boolean fixtureUserAllowed() {
        return !context.getSystemService(android.os.UserManager.class).isSystemUser();
    }

    /** Explicit test fixture only; refuses to erase an unresolved experiment unless this is a later user choice. */
    public void installStaticFixture(boolean lockOnly, boolean laterChoice) throws Exception {
        if (!fixtureUserAllowed()) throw new IllegalStateException("Test fixture writes are blocked for Android system user 0.");
        if (session().snapshot().unresolved && !laterChoice)
            throw new IllegalStateException("Resolve the previous experiment first.");
        int which = lockOnly ? WallpaperManager.FLAG_LOCK : WallpaperManager.FLAG_SYSTEM;
        String fileName = lockOnly ? "fixture-lock.png" : laterChoice ? "fixture-later-home.png" : "fixture-home.png";
        File source = new File(directory, fileName);
        Bitmap image = Bitmap.createBitmap(540, 960, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(image);
        canvas.drawColor(lockOnly ? Color.rgb(95, 51, 42) : laterChoice ? Color.rgb(38, 79, 112) : Color.rgb(34, 85, 67));
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.WHITE);
        paint.setTextSize(30);
        canvas.drawText(lockOnly ? "LATER LOCK FIXTURE" : laterChoice ? "LATER HOME FIXTURE" : "STATIC ORIGINAL FIXTURE", 30, 430, paint);
        paint.setTextSize(20);
        canvas.drawText("Known source saved before wallpaper write", 30, 475, paint);
        try (FileOutputStream out = new FileOutputStream(source)) {
            if (!image.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new IllegalStateException("PNG save failed");
            out.getFD().sync();
        } finally { image.recycle(); }
        int target = !lockOnly && !laterChoice ? WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK : which;
        int written;
        try (InputStream in = new FileInputStream(source)) { written = manager.setStream(in, null, false, target); }
        ProbeSession.Identity observed = current();
        int actual = lockOnly ? observed.lockId : observed.homeId;
        if (written != actual) throw new IllegalStateException("Fixture identity changed: write=" + written + "; observed=" + actual + "; source receipt refused");
        Properties receipt = new Properties();
        receipt.setProperty("id", Integer.toString(written));
        receipt.setProperty("file", fileName);
        try (FileOutputStream out = new FileOutputStream(new File(directory, lockOnly ? "fixture-lock.properties" : "fixture-home.properties"))) {
            receipt.store(out, "Known source created before explicit test fixture wallpaper write");
            out.getFD().sync();
        }
        event("fixture_written", "which=" + which + "; id=" + written + "; source=" + fileName + "; laterChoice=" + laterChoice);
    }

    private String copyWallpaper(int which, String name, StringBuilder note) {
        // A source explicitly provided by this test fixture is not a read of arbitrary user wallpaper.
        File receiptFile = new File(directory, which == WallpaperManager.FLAG_LOCK ? "fixture-lock.properties" : "fixture-home.properties");
        if (receiptFile.isFile()) try (InputStream receiptIn = new FileInputStream(receiptFile)) {
            Properties receipt = new Properties();
            receipt.load(receiptIn);
            String source = receipt.getProperty("file", "");
            int observed = manager.getWallpaperId(which);
            if (Integer.toString(observed).equals(receipt.getProperty("id"))
                    && source.matches("fixture-(home|lock|later-home)\\.png") && new File(directory, source).isFile()) {
                File destination = new File(directory, name);
                try (InputStream in = new FileInputStream(new File(directory, source)); FileOutputStream out = new FileOutputStream(destination)) {
                    byte[] bytes = new byte[65536]; int count;
                    while ((count = in.read(bytes)) != -1) out.write(bytes, 0, count);
                    out.getFD().sync();
                }
                note.append(name).append(" supplied by known test source with matching wallpaper ID receipt; not an arbitrary original-image read. ");
                return name;
            }
        } catch (Exception e) { note.append("Test source receipt unavailable: ").append(e.getClass().getSimpleName()).append(". "); }

        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13 can return a default image instead of the real wallpaper. Never mislabel it a backup.
            note.append(name).append(" not backed up: Android 13+ cannot reliably expose the real original to this ordinary app. ");
            return "";
        }
        File destination = new File(directory, name);
        try (ParcelFileDescriptor pfd = manager.getWallpaperFile(which)) {
            if (pfd == null) { note.append(name).append(" unavailable (no readable file). "); return ""; }
            try (InputStream in = new ParcelFileDescriptor.AutoCloseInputStream(pfd);
                    FileOutputStream out = new FileOutputStream(destination)) {
                byte[] buffer = new byte[65536];
                int count;
                while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                out.getFD().sync();
            }
            note.append(name).append(" privately backed up (cropping/offset metadata unavailable). ");
            return name;
        } catch (Exception e) {
            if (destination.exists()) destination.delete();
            note.append(name).append(" not backed up: ").append(e.getClass().getSimpleName()).append(". ");
            return "";
        }
    }

    public void restoreStatic(ProbeSession.Baseline baseline, boolean restoreLock) throws Exception {
        // Restore lock first: a failure before home is changed keeps ownership observable and retryable.
        if (restoreLock && baseline.identity.lockId >= 0) {
            try (InputStream in = new FileInputStream(new File(directory, baseline.lockFile))) {
                manager.setStream(in, null, false, WallpaperManager.FLAG_LOCK);
            }
            event("restore_lock_written", "Original separate lock image write returned; visual verification still required.");
        }
        try (InputStream in = new FileInputStream(new File(directory, baseline.homeFile))) {
            manager.setStream(in, null, false, WallpaperManager.FLAG_SYSTEM);
        }
        event("restore_home_written", "Original home image write returned; visual verification still required.");
        if (restoreLock && baseline.identity.lockId < 0) {
            manager.clear(WallpaperManager.FLAG_LOCK);
            event("restore_lock_shared", "Lock reset to shared home wallpaper; verify visually.");
        }
    }

    public void event(String kind, String detail) {
        synchronized (LOCK) {
            try {
                JSONObject record = new JSONObject();
                record.put("utcMs", System.currentTimeMillis());
                record.put("elapsedMs", SystemClock.elapsedRealtime());
                record.put("bootCount", Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1));
                record.put("pid", android.os.Process.myPid());
                record.put("processToken", PROCESS);
                record.put("api", Build.VERSION.SDK_INT);
                record.put("device", Build.MANUFACTURER + " " + Build.MODEL);
                record.put("event", kind);
                record.put("detail", detail);
                try (FileOutputStream out = new FileOutputStream(new File(directory, "events.jsonl"), true)) {
                    out.write((record + "\n").getBytes(StandardCharsets.UTF_8));
                }
            } catch (Exception e) { throw new IllegalStateException("Cannot record lifecycle evidence", e); }
        }
    }

    public String recentEvents() {
        File file = new File(directory, "events.jsonl");
        if (!file.exists()) return "No events yet.";
        try (FileInputStream in = new FileInputStream(file)) {
            long length = file.length();
            if (length > 24000) in.skip(length - 24000);
            byte[] bytes = new byte[(int) Math.min(length, 24000)];
            int count = in.read(bytes);
            return count < 0 ? "" : new String(bytes, 0, count, StandardCharsets.UTF_8);
        } catch (Exception e) { return "Evidence read failed: " + e.getClass().getSimpleName(); }
    }
}
