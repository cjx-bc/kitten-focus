package com.xiaomao.focus;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.os.Bundle;

/** Internal result host. Android's real picker is the only activation authority. */
public final class WallpaperConfirmationActivity extends Activity {
    private boolean reported;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (saved != null) {
            reported = saved.getBoolean("reported", false);
            return;
        }
        try {
            ComponentName component = ComponentName.unflattenFromString(getIntent().getStringExtra("component"));
            if (component == null) throw new IllegalArgumentException("壁纸组件不可用");
            Intent picker = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
                .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, component);
            ResolveInfo target = getPackageManager().resolveActivity(picker, 0);
            if (target == null) throw new IllegalStateException("系统没有动态壁纸确认界面");
            FocusProtection.allowSettingsForAuthorization(this, target.activityInfo.packageName);
            startActivityForResult(picker, 17);
        } catch (Exception error) { complete(); }
    }
    @Override protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putBoolean("reported", reported);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 17) complete();
    }
    @Override protected void onDestroy() {
        if (!isChangingConfigurations()) reportReturned();
        super.onDestroy();
    }
    private void reportReturned() {
        if (reported) return;
        reported = true;
        try { new FocusControl(this).wallpaperPickerReturned(getIntent().getStringExtra("pickerToken")); } catch (Exception ignored) { }
    }
    private void complete() {
        reportReturned();
        finish();
    }
}
