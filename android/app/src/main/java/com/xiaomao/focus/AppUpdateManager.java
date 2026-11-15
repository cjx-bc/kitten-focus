package com.xiaomao.focus;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.URL;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;

/** All network/file work runs on the update plugin's worker, never the WebView thread. */
final class AppUpdateManager {
    private final Context context;
    private final SharedPreferences preferences;
    private final DownloadManager downloads;
    private final LocalStore store;
    final UpgradeBackups backups;
    interface ManifestSource { JSONObject load() throws Exception; }
    private final ManifestSource manifestSource;

    AppUpdateManager(Context context) {
        this(context, AppUpdateManager::fetchManifest);
    }

    AppUpdateManager(Context context, ManifestSource manifestSource) {
        this.context = context.getApplicationContext();
        this.manifestSource = manifestSource;
        preferences = context.getSharedPreferences("app-updates", Context.MODE_PRIVATE);
        downloads = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        store = LocalStore.get(context);
        backups = new UpgradeBackups(context);
    }

    private static JSONObject fetchManifest() throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(UpdateRelease.MANIFEST_URL).openConnection();
        try {
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != 200) throw new IllegalStateException("更新服务暂时不可用，请稍后重试");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                    if (output.size() > 65536) throw new IllegalArgumentException("更新信息过大");
                }
                return new JSONObject(output.toString("UTF-8"));
            }
        } finally { connection.disconnect(); }
    }

    private UpdateRelease stored(String key) throws Exception {
        String value = preferences.getString(key, null);
        return value == null ? null : new UpdateRelease(new JSONObject(value));
    }

    synchronized JSONObject check(boolean force) throws Exception {
        String day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        if (!force && day.equals(preferences.getString("attemptDay", ""))) return status();
        preferences.edit().putString("attemptDay", day).apply();
        try {
            JSONObject manifest = manifestSource.load();
            if (manifest.getInt("schemaVersion") != 1 || !manifest.has("release"))
                throw new IllegalArgumentException("更新信息暂不兼容");
            UpdateRelease release = manifest.isNull("release") ? null : new UpdateRelease(manifest.getJSONObject("release"));
            SharedPreferences.Editor editor = preferences.edit().putLong("checkedAt", System.currentTimeMillis()).remove("checkError");
            if (release == null || release.code <= BuildConfig.VERSION_CODE) editor.remove("release");
            else editor.putString("release", release.json().toString());
            editor.apply();
        } catch (Exception error) {
            preferences.edit().putString("checkError", "暂时无法检查更新，请确认网络后重试").apply();
            if (force) throw new IllegalStateException("暂时无法检查更新，请确认网络后重试", error);
        }
        return status();
    }

    private File packageFile(UpdateRelease release) {
        return new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates/kitten-focus-" + release.code + ".apk");
    }

    private void requireNoFocus() throws Exception {
        new FocusEngine(context).action("read");
        if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注，再下载或安装更新");
    }

    boolean metered() {
        ConnectivityManager network = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        return network == null || network.isActiveNetworkMetered();
    }

    synchronized JSONObject download(boolean allowMetered) throws Exception {
        requireNoFocus();
        UpdateRelease release = stored("release");
        if (release == null || release.code <= BuildConfig.VERSION_CODE) throw new IllegalStateException("请先检查是否有新版本");
        if (release.minSdk > Build.VERSION.SDK_INT) throw new IllegalStateException("这个版本需要更高版本的 Android");
        if (metered() && !allowMetered) throw new IllegalStateException("请先确认使用手机流量下载");
        JSONObject current = status();
        String phase = current.getString("phase");
        UpdateRelease previous = stored("downloadRelease");
        if ((phase.equals("downloading") || phase.equals("ready")) && previous != null && previous.code == release.code)
            return current;
        cancel();
        File file = packageFile(release);
        if (!file.getParentFile().isDirectory() && !file.getParentFile().mkdirs()) throw new IllegalStateException("下载目录不可用");
        if (file.exists() && !file.delete()) throw new IllegalStateException("无法清理旧的下载文件");
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(release.url))
            .setTitle("小猫专注 " + release.name).setDescription("更新下载完成后，可在应用内安装")
            .setMimeType("application/vnd.android.package-archive")
            .setAllowedOverMetered(allowMetered).setAllowedOverRoaming(allowMetered)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "updates/" + file.getName());
        long id = downloads.enqueue(request);
        preferences.edit().putLong("downloadId", id).putString("downloadRelease", release.json().toString())
            .remove("verifiedDigest").remove("downloadError").apply();
        return status();
    }

    synchronized JSONObject cancel() throws Exception {
        long id = preferences.getLong("downloadId", -1);
        if (id >= 0) downloads.remove(id);
        UpdateRelease release = stored("downloadRelease");
        if (release != null) {
            File file = packageFile(release);
            if (file.exists()) file.delete();
        }
        preferences.edit().remove("downloadId").remove("downloadRelease").remove("downloadError").remove("verifiedDigest").apply();
        return status();
    }

    synchronized JSONObject status() throws Exception {
        UpdateRelease release = stored("release"), downloaded = stored("downloadRelease");
        if (release != null && release.code <= BuildConfig.VERSION_CODE) {
            preferences.edit().remove("release").apply(); release = null;
        }
        String phase = "idle", message = "";
        long received = 0, total = downloaded == null ? 0 : downloaded.size;
        long id = preferences.getLong("downloadId", -1);
        if (downloaded != null && downloaded.code <= BuildConfig.VERSION_CODE) {
            if (id >= 0) downloads.remove(id);
            preferences.edit().remove("downloadId").remove("downloadRelease").remove("verifiedDigest").apply();
            downloaded = null; id = -1;
        }
        if (id >= 0 && downloaded != null) {
            try (Cursor cursor = downloads.query(new DownloadManager.Query().setFilterById(id))) {
                if (cursor == null || !cursor.moveToFirst()) {
                    phase = "failed"; message = "下载记录已失效，请重试";
                } else {
                    int state = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    if (state == DownloadManager.STATUS_SUCCESSFUL) {
                        try {
                            String verified = preferences.getString("verifiedDigest", "");
                            if (!preferences.getString("downloadError", "").isEmpty())
                                throw new IllegalArgumentException("上次校验失败");
                            if (!downloaded.sha256.equals(verified)) {
                                verifyPackage(context, packageFile(downloaded), downloaded);
                                preferences.edit().putString("verifiedDigest", downloaded.sha256).apply();
                            }
                            phase = "ready";
                        } catch (Exception error) {
                            phase = "failed"; message = "安装包校验失败，请重新下载";
                            preferences.edit().putString("downloadError", message).apply();
                        }
                    } else if (state == DownloadManager.STATUS_FAILED) {
                        phase = "failed"; message = "下载失败，请检查网络和存储空间后重试";
                    } else {
                        phase = "downloading";
                        if (state == DownloadManager.STATUS_PAUSED) message = "等待网络恢复后继续下载";
                    }
                }
            }
        }
        return new JSONObject().put("currentVersion", BuildConfig.VERSION_NAME).put("currentCode", BuildConfig.VERSION_CODE)
            .put("release", release == null ? JSONObject.NULL : release.json())
            .put("downloadRelease", downloaded == null ? JSONObject.NULL : downloaded.json())
            .put("checkedAt", preferences.getLong("checkedAt", 0)).put("checkError", preferences.getString("checkError", ""))
            .put("phase", phase).put("received", received).put("total", total).put("message", message)
            .put("metered", metered()).put("canInstall", canInstall());
    }

    boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || context.getPackageManager().canRequestPackageInstalls();
    }

    Intent permissionIntent() {
        return new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
    }

    synchronized Intent installerIntent() throws Exception {
        requireNoFocus();
        UpdateRelease release = stored("downloadRelease");
        if (release == null || !status().getString("phase").equals("ready")) throw new IllegalStateException("请先下载完整的安装包");
        if (!canInstall()) throw new IllegalStateException("请先允许小猫专注安装应用更新");
        File file = packageFile(release);
        verifyPackage(context, file, release); // Recheck immediately before installation, including after permission settings.
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注");
            backups.create(BuildConfig.VERSION_CODE, release.code);
        }
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        return new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    }

    static void verifyPackage(Context context, File file, UpdateRelease release) throws Exception {
        if (!file.isFile() || file.length() != release.size) throw new IllegalArgumentException("安装包大小不一致");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream stream = new FileInputStream(file)) {
            byte[] buffer = new byte[65536]; int count;
            while ((count = stream.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hash = new StringBuilder();
        for (byte b : digest.digest()) hash.append(String.format(Locale.US, "%02x", b & 255));
        if (!hash.toString().equals(release.sha256)) throw new IllegalArgumentException("安装包校验不一致");
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageManager manager = context.getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = manager.getPackageInfo(context.getPackageName(), flags);
        if (archive == null || !context.getPackageName().equals(archive.packageName)) throw new IllegalArgumentException("安装包名称不一致");
        long code = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
        long current = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        if (code != release.code || code <= current || !release.name.equals(archive.versionName))
            throw new IllegalArgumentException("安装包版本不一致");
        Signature[] incoming = Build.VERSION.SDK_INT >= 28 && archive.signingInfo != null
            ? archive.signingInfo.getApkContentsSigners() : archive.signatures;
        Signature[] existing = Build.VERSION.SDK_INT >= 28 && installed.signingInfo != null
            ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        if (incoming == null || existing == null || !signatures(incoming).equals(signatures(existing)))
            throw new IllegalArgumentException("安装包签名不一致");
    }

    private static Set<String> signatures(Signature[] values) {
        Set<String> result = new HashSet<>();
        for (Signature value : values) result.add(value.toCharsString());
        return result;
    }
}
