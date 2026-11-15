package com.xiaomao.focus.wallpaperprobe;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.WallpaperManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Recoverable launcher remains enabled throughout every probe state. */
public final class ProbeActivity extends Activity {
    private ProbeEnvironment environment;
    private ProbeSession session;
    private TextView stateView;
    private TextView evidenceView;
    private CheckBox disposableBaseline;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        environment = new ProbeEnvironment(this);
        session = environment.session();
        environment.event("activity_create", "Probe UI opened; no wallpaper change requested.");
        ScrollView scroll = new ScrollView(this);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(28, 36, 28, 48);
        scroll.addView(body);
        TextView title = text(body, "T03 · Wallpaper auxiliary probe", 24);
        title.setContentDescription("Wallpaper probe recovery entry");
        text(body, "Separate test app · ordinary application identity · no root/device-owner. It records Android wallpaper service callbacks; it cannot guarantee process survival or immunity to force-stop. Production focus data is not touched.", 16);
        button(body, "Fixture - set known static original", v -> fixture(false, false));
        button(body, "Fixture - choose known live original", v -> {
            if (!environment.fixtureUserAllowed()) { showFixtureFailure("Live test fixture is blocked for system user 0."); return; }
            if (session.snapshot().unresolved) { showFixtureFailure("Resolve the existing experiment first."); return; }
            launchPicker(new ComponentName(this, BaselineWallpaperService.class), true);
        });
        button(body, "Fixture - later home choice", v -> fixture(false, true));
        button(body, "Fixture - later lock choice", v -> fixture(true, true));
        stateView = new TextView(this);
        stateView.setTextSize(15);
        button(body, "1 · Capture original wallpaper state", v -> capture());
        if (Build.VERSION.SDK_INT <= 32)
            button(body, "Optional · grant image-read permission", v -> requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 41));
        disposableBaseline = new CheckBox(this);
        disposableBaseline.setText("Disposable test baseline only: I have an externally restorable original and accept that original live settings / crop may be unavailable. Leave OFF for existing personal wallpaper.");
        body.addView(disposableBaseline);
        button(body, "2 · Request system wallpaper confirmation", v -> confirmEnable());
        button(body, "Decline experiment / leave wallpaper unchanged", v -> {
            environment.event("user_declined", "No system picker opened; no wallpaper write.");
            render();
        });
        button(body, "Refresh actual state / lifecycle evidence", v -> {
            session.refresh();
            environment.event("manual_refresh", "State re-read from WallpaperManager.");
            render();
        });
        button(body, "3 · Stop and restore original (or retry)", v -> new AlertDialog.Builder(this)
            .setTitle("Stop wallpaper experiment?")
            .setMessage("This restores only the captured state while this experiment still owns the current home wallpaper. A later wallpaper choice is preserved. If the original cannot be restored automatically, the recovery responsibility remains visible and system settings are available.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Stop / restore", (d, which) -> restore()).show());
        button(body, "Open system wallpaper settings for manual recovery", v -> openWallpaperSettings());
        button(body, "Confirm manual recovery / recheck", v -> { session.confirmManualRestore(); render(); });
        body.addView(stateView);
        text(body, "Evidence (private local files; run-as export instructions in README)", 18);
        evidenceView = text(body, "", 12);
        setContentView(scroll);
        render();
    }

    @Override protected void onResume() {
        super.onResume();
        if (session != null) {
            ProbeSession.Snapshot before = session.snapshot();
            // Do not classify a still-open system preview from callbacks; observe only after UI resumes.
            session.refresh();
            environment.event("activity_resume", "previous=" + before.status + "; observed=" + session.snapshot().status);
            render();
        }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        environment.event("read_permission_result", grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED ? "granted" : "denied");
        render();
    }

    private void fixture(boolean lockOnly, boolean later) {
        new AlertDialog.Builder(this).setTitle("Disposable test user only")
            .setMessage("This explicitly replaces " + (lockOnly ? "lock" : "home") + " wallpaper with a generated known-source test image. Continue only inside the disposable Android test user; never on the owner's original wallpaper.")
            .setNegativeButton("Cancel", null).setPositiveButton("Set test fixture", (d, w) -> {
                try { environment.installStaticFixture(lockOnly, later); render(); }
                catch (Exception e) { showFixtureFailure(e.toString()); }
            }).show();
    }

    private void showFixtureFailure(String detail) {
        environment.event("fixture_failed", detail);
        new AlertDialog.Builder(this).setTitle("Fixture refused").setMessage(detail).setPositiveButton("OK", null).show();
    }

    private void capture() {
        ProbeSession.Snapshot result = session.captureBaseline();
        environment.event("capture_result", result.status + ": " + result.detail);
        render();
    }

    private void confirmEnable() {
        new AlertDialog.Builder(this).setTitle("Request a live wallpaper experiment?")
            .setMessage("The next screen is Android's confirmation UI. Nothing is set by this button alone. If the saved original is incomplete, keep your existing wallpaper and decline. A disposable/external backup acknowledgment is required to continue with incomplete recovery.")
            .setNegativeButton("Decline", (d, which) -> { environment.event("enable_declined", "No picker; no write."); render(); })
            .setPositiveButton("Continue to Android", (d, which) -> {
                ProbeSession.Snapshot result = session.enable(disposableBaseline.isChecked());
                environment.event("enable_result", result.status);
                render();
                if (result.status.equals("AWAITING_SYSTEM_CONFIRMATION"))
                    launchPicker(new ComponentName(this, ProbeWallpaperService.class), false);
            }).show();
    }

    private void restore() {
        ProbeSession.Snapshot result = session.restore();
        environment.event("restore_result", result.status + ": " + result.detail);
        render();
        if (result.status.equals("AWAITING_ORIGINAL_CONFIRMATION") && result.baseline != null) {
            ComponentName original = ComponentName.unflattenFromString(result.baseline.identity.component);
            if (original != null) launchPicker(original, true);
        }
    }

    private void launchPicker(ComponentName component, boolean restoring) {
        Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
            .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, component);
        try { startActivity(intent); }
        catch (ActivityNotFoundException | SecurityException e) {
            if (!restoring) session.pickerUnavailable(e.getClass().getSimpleName() + ": " + e.getMessage());
            environment.event("picker_unavailable", "restoring=" + restoring + "; " + e.getClass().getSimpleName());
            new AlertDialog.Builder(this).setTitle("System picker unavailable")
                .setMessage("This device cannot open the requested live wallpaper confirmation. No wallpaper was silently applied. Restore via system wallpaper settings if needed.")
                .setPositiveButton("OK", null).show();
            render();
        }
    }

    private void openWallpaperSettings() {
        try { startActivity(new Intent(Intent.ACTION_SET_WALLPAPER)); }
        catch (ActivityNotFoundException e) {
            try { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
            catch (ActivityNotFoundException ignored) {
                environment.event("settings_unavailable", "Open wallpaper settings manually from the launcher/system Settings.");
            }
        }
    }

    private void render() {
        ProbeSession.Snapshot snapshot = session.snapshot();
        String baseline = snapshot.baseline == null ? "No baseline." : snapshot.baseline.note
            + "\nAutomatic image restore possible: " + snapshot.baseline.automaticImageRestoreAvailable();
        String current;
        try {
            ProbeSession.Identity i = environment.current();
            current = "homeId=" + i.homeId + "; lockId=" + i.lockId + "; component=" + i.component;
        } catch (Exception e) { current = "Unavailable: " + e.getClass().getSimpleName() + ": " + e.getMessage(); }
        stateView.setText("Status: " + snapshot.status + "\n" + snapshot.detail
            + "\nRecovery pending: " + snapshot.unresolved + "\n\nBaseline: " + baseline
            + "\n\nObserved now: " + current
            + "\n\nSetting success is not evidence of reconnect benefit. Compare service_create/engine_create events, processToken, bootCount and preview=false in the exported journal.");
        evidenceView.setText(environment.recentEvents());
    }

    private TextView text(LinearLayout parent, String value, float size) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setPadding(0, 10, 0, 12);
        view.setTextIsSelectable(true);
        parent.addView(view);
        return view;
    }
    private void button(LinearLayout parent, String label, View.OnClickListener click) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setOnClickListener(click);
        parent.addView(button, new LinearLayout.LayoutParams(-1, -2));
    }
}
