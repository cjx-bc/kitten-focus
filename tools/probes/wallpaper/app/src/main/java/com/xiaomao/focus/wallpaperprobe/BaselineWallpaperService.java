package com.xiaomao.focus.wallpaperprobe;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;

/** Test original only, isolated from the lifecycle probe process; no provider settings exist. */
public final class BaselineWallpaperService extends WallpaperService {
    @Override public Engine onCreateEngine() { return new Engine() {
        private void draw() {
            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;
            try {
                canvas = holder.lockCanvas();
                if (canvas == null) return;
                canvas.drawColor(Color.rgb(75, 46, 98));
                Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
                paint.setColor(Color.WHITE); paint.setTextSize(30);
                canvas.drawText("LIVE ORIGINAL FIXTURE", 30, canvas.getHeight() * .45f, paint);
                paint.setTextSize(20);
                canvas.drawText("Purple baseline / no private settings", 30, canvas.getHeight() * .50f, paint);
            } catch (IllegalArgumentException ignored) {
            } finally { if (canvas != null) holder.unlockCanvasAndPost(canvas); }
        }
        @Override public void onVisibilityChanged(boolean visible) { if (visible) draw(); }
        @Override public void onSurfaceChanged(SurfaceHolder holder, int f, int w, int h) { draw(); }
    }; }
}
