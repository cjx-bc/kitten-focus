package com.xiaomao.focus.wallpaperprobe;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Handler;
import android.os.Looper;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;

/** The framework binds this service only while previewed/selected. No FGS or restart trick. */
public final class ProbeWallpaperService extends WallpaperService {
    private ProbeEnvironment environment;
    @Override public void onCreate() {
        super.onCreate();
        environment = new ProbeEnvironment(this);
        environment.event("service_create", "Framework WallpaperService created; preview and selected bindings must be distinguished.");
    }
    @Override public Engine onCreateEngine() { return new ProbeEngine(); }
    @Override public void onDestroy() {
        environment.event("service_destroy", "WallpaperService destroyed; no automatic restart is promised.");
        super.onDestroy();
    }

    private final class ProbeEngine extends Engine {
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private boolean visible;
        private boolean auxiliaryStopped;
        private final Runnable frame = new Runnable() {
            public void run() {
                draw();
                String status = environment.session().snapshot().status;
                boolean running = status.equals("ACTIVE") || status.equals("AWAITING_SYSTEM_CONFIRMATION");
                if (!running && !auxiliaryStopped) {
                    auxiliaryStopped = true;
                    environment.event("auxiliary_animation_stopped", "Recovery remains reachable; system may keep selected WallpaperService bound.");
                }
                if (visible && running) handler.postDelayed(this, 1000);
            }
        };
        @Override public void onCreate(SurfaceHolder holder) {
            super.onCreate(holder);
            environment.event("engine_create", "preview=" + isPreview());
        }
        @Override public void onVisibilityChanged(boolean isVisible) {
            visible = isVisible;
            auxiliaryStopped = false;
            environment.event("engine_visibility", "visible=" + isVisible + "; preview=" + isPreview());
            handler.removeCallbacks(frame);
            if (isVisible) frame.run();
        }
        @Override public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            draw();
        }
        @Override public void onSurfaceDestroyed(SurfaceHolder holder) {
            visible = false;
            handler.removeCallbacks(frame);
            environment.event("surface_destroy", "preview=" + isPreview());
            super.onSurfaceDestroyed(holder);
        }
        @Override public void onDestroy() {
            handler.removeCallbacks(frame);
            environment.event("engine_destroy", "preview=" + isPreview());
            super.onDestroy();
        }
        private void draw() {
            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;
            try {
                canvas = holder.lockCanvas();
                if (canvas == null) return;
                canvas.drawColor(Color.rgb(30, 43, 47));
                paint.setColor(Color.rgb(212, 231, 209));
                paint.setTextSize(Math.max(18, canvas.getWidth() / 23f));
                float left = canvas.getWidth() * .08f;
                canvas.drawText("Kitten wallpaper probe", left, canvas.getHeight() * .40f, paint);
                paint.setTextSize(Math.max(14, canvas.getWidth() / 32f));
                canvas.drawText("Lifecycle evidence only", left, canvas.getHeight() * .46f, paint);
                canvas.drawText("Open probe to stop / restore", left, canvas.getHeight() * .51f, paint);
                canvas.drawText("t=" + android.os.SystemClock.elapsedRealtime() / 1000 + "s", left, canvas.getHeight() * .56f, paint);
            } catch (IllegalArgumentException ignored) {
                // Framework can invalidate a surface between the callback and lockCanvas.
            } finally { if (canvas != null) holder.unlockCanvasAndPost(canvas); }
        }
    }
}
