package com.xiaomao.focus;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Same APK/process as FocusControl. Android decides when this service is bound. */
public final class FocusWallpaperService extends WallpaperService {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean reconciled = new AtomicBoolean();
    @Override public void onCreate() {
        super.onCreate(); WallpaperLifecycle.record(this, "service_create", false, null);
    }
    @Override public Engine onCreateEngine() { return new FocusWallpaperEngine(); }
    @Override public void onDestroy() {
        worker.shutdown(); WallpaperLifecycle.record(this, "service_destroy", false, null); super.onDestroy();
    }
    private final class FocusWallpaperEngine extends Engine {
        final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        @Override public void onCreate(SurfaceHolder holder) {
            super.onCreate(holder);
            boolean preview = isPreview();
            WallpaperLifecycle.record(FocusWallpaperService.this, "engine_create", preview, null);
            if (preview || reconciled.compareAndSet(false, true)) worker.execute(() -> {
                try { new FocusControl(FocusWallpaperService.this).wallpaperEngineCreated(preview); }
                catch (Exception error) { WallpaperLifecycle.record(FocusWallpaperService.this, "reconcile_failed", preview, null); }
            });
        }
        @Override public void onVisibilityChanged(boolean visible) { if (visible) draw(); }
        @Override public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height); draw();
        }
        @Override public void onDestroy() {
            if (isPreview() && !worker.isShutdown()) worker.execute(() -> {
                try { new FocusControl(FocusWallpaperService.this).wallpaperPreviewDestroyed(); } catch (Exception ignored) { }
            });
            WallpaperLifecycle.record(FocusWallpaperService.this, "engine_destroy", isPreview(), null); super.onDestroy();
        }
        private void draw() {
            Canvas canvas = null; SurfaceHolder holder = getSurfaceHolder();
            try {
                canvas = holder.lockCanvas(); if (canvas == null) return;
                canvas.drawColor(Color.rgb(31, 49, 43));
                float cx = canvas.getWidth() * .5f, cy = canvas.getHeight() * .43f, radius = canvas.getWidth() * .12f;
                paint.setColor(Color.rgb(218, 226, 204)); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(Math.max(2, radius * .035f));
                canvas.drawCircle(cx, cy, radius, paint);
                canvas.drawLine(cx - radius * .85f, cy - radius * .5f, cx - radius * .65f, cy - radius * 1.25f, paint);
                canvas.drawLine(cx - radius * .65f, cy - radius * 1.25f, cx - radius * .2f, cy - radius * .95f, paint);
                canvas.drawLine(cx + radius * .85f, cy - radius * .5f, cx + radius * .65f, cy - radius * 1.25f, paint);
                canvas.drawLine(cx + radius * .65f, cy - radius * 1.25f, cx + radius * .2f, cy - radius * .95f, paint);
                paint.setStyle(Paint.Style.FILL); canvas.drawCircle(cx - radius * .35f, cy, radius * .06f, paint);
                canvas.drawCircle(cx + radius * .35f, cy, radius * .06f, paint);
                paint.setTextAlign(Paint.Align.CENTER); paint.setTextSize(canvas.getWidth() / 22f);
                canvas.drawText("专注在当下", cx, cy + radius * 2.1f, paint);
                paint.setTextSize(canvas.getWidth() / 34f);
                canvas.drawText("小猫专注 · 帮助与原壁纸恢复请打开应用", cx, canvas.getHeight() * .72f, paint);
            } catch (IllegalArgumentException ignored) { }
            finally { if (canvas != null) try { holder.unlockCanvasAndPost(canvas); } catch (IllegalArgumentException ignored) { } }
        }
    }
}
