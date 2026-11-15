package com.xiaomao.focus;

import android.app.WallpaperInfo;
import android.app.WallpaperManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.net.Uri;
import android.graphics.BitmapFactory;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import org.json.JSONObject;

/** Ordinary public Android APIs. Never reads arbitrary original wallpaper pixels. */
final class AndroidWallpaperSystem implements WallpaperSystem {
    private final Context context;
    private final WallpaperManager manager;
    AndroidWallpaperSystem(Context context) {
        this.context = context.getApplicationContext();
        manager = WallpaperManager.getInstance(context);
    }
    public boolean supported() {
        return manager.isWallpaperSupported() && manager.isSetWallpaperAllowed();
    }
    public String ownComponent() { return context.getPackageName() + "/com.xiaomao.focus.FocusWallpaperService"; }
    public void openPicker(String component, String pickerToken) {
        context.startActivity(new Intent(context, WallpaperConfirmationActivity.class)
            .putExtra("component", component).putExtra("pickerToken", pickerToken).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
    public JSONObject current() throws Exception {
        WallpaperInfo home = manager.getWallpaperInfo();
        WallpaperInfo lock = Build.VERSION.SDK_INT >= 34 ? manager.getWallpaperInfo(WallpaperManager.FLAG_LOCK) : null;
        return new JSONObject().put("homeId", manager.getWallpaperId(WallpaperManager.FLAG_SYSTEM))
            .put("lockId", manager.getWallpaperId(WallpaperManager.FLAG_LOCK))
            .put("component", home == null ? "" : home.getComponent().flattenToString())
            .put("lockComponent", lock == null ? "" : lock.getComponent().flattenToString());
    }
    private File originalFile(String source) {
        if (!"home-original.image".equals(source) && !"lock-original.image".equals(source))
            throw new IllegalArgumentException("原图标识无效");
        File directory = new File(new File(context.getApplicationInfo().dataDir, "no_backup"), "wallpaper-originals");
        return new File(directory, source);
    }
    public String importOriginal(String value, boolean lock) throws Exception {
        Uri uri = Uri.parse(value);
        if (!"content".equals(uri.getScheme())) throw new IllegalArgumentException("请使用 Android 文件选择器提供原图");
        String source = lock ? "lock-original.image" : "home-original.image";
        File destination = originalFile(source), temporary = new File(destination.getParentFile(), source + ".next");
        if (!destination.getParentFile().isDirectory() && !destination.getParentFile().mkdirs())
            throw new IllegalStateException("无法建立私有原图目录");
        try {
            try (InputStream input = context.getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(temporary)) {
                if (input == null) throw new IllegalStateException("无法读取所选原图");
                byte[] buffer = new byte[65536]; int count; long size = 0;
                while ((count = input.read(buffer)) != -1) {
                    size += count; if (size > 20 * 1024 * 1024) throw new IllegalArgumentException("原图请小于 20 MB");
                    output.write(buffer, 0, count);
                }
                output.getFD().sync();
            }
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(temporary.getAbsolutePath(), options);
            if (options.outWidth <= 0 || options.outHeight <= 0 || options.outWidth > 16384 || options.outHeight > 16384
                || (long) options.outWidth * options.outHeight > 64000000L)
                throw new IllegalArgumentException("请选择有效且不超过 6400 万像素的图片");
            if (!temporary.renameTo(destination)) throw new IllegalStateException("无法保存私有原图");
            return source;
        } finally { if (temporary.exists()) temporary.delete(); }
    }
    public boolean sourceAvailable(String source) {
        try { return originalFile(source).isFile() && originalFile(source).length() > 0; }
        catch (RuntimeException failure) { return false; }
    }
    public void restoreStatic(JSONObject original, String homeSource, String lockSource, boolean home, boolean lock) throws Exception {
        // Lock first keeps a failed early write from losing observable home ownership.
        if (lock && original.optInt("lockId", -1) >= 0) {
            try (InputStream input = new FileInputStream(originalFile(lockSource))) {
                manager.setStream(input, null, false, WallpaperManager.FLAG_LOCK);
            }
        }
        if (home) try (InputStream input = new FileInputStream(originalFile(homeSource))) {
            manager.setStream(input, null, false, WallpaperManager.FLAG_SYSTEM);
        }
        if (lock && original.optInt("lockId", -1) < 0) manager.clear(WallpaperManager.FLAG_LOCK);
    }
}
