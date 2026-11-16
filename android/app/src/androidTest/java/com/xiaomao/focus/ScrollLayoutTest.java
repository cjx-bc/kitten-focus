package com.xiaomao.focus;

import android.app.Instrumentation;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises native Android edge stretching, which DOM bounding boxes cannot detect. */
@RunWith(AndroidJUnit4.class)
public class ScrollLayoutTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private WebView webView;

    private String evaluate(String expression) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        String[] result = new String[1];
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(expression, value -> {
            result[0] = value;
            ready.countDown();
        }));
        assertTrue("WebView evaluation timed out", ready.await(5, TimeUnit.SECONDS));
        return result[0];
    }

    private void touch(long down, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            assertTrue(instrumentation.getUiAutomation().injectInputEvent(event, true));
        } finally {
            event.recycle();
        }
    }

    private void awaitVisualCommit() throws Exception {
        CountDownLatch rendered = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> webView.postVisualStateCallback(SystemClock.uptimeMillis(), new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) { rendered.countDown(); }
        }));
        assertTrue("WebView did not commit the test layout", rendered.await(5, TimeUnit.SECONDS));
    }

    private void openTasks(ActivityScenario<MainActivity> scenario) throws Exception {
        scenario.onActivity(activity -> webView = activity.getBridge().getWebView());
        evaluate("location.hash='/tasks'");
        boolean ready = false;
        for (int i = 0; i < 80; i++) {
            if ("true".equals(evaluate("!!document.querySelector('.tasks-page') && !!document.querySelector('.tabbar') && document.fonts.status==='loaded'"))) {
                ready = true;
                break;
            }
            SystemClock.sleep(100);
        }
        assertTrue("Tasks page did not become ready", ready);
        SystemClock.sleep(350);
    }

    private void assertNavigationStable(boolean pullDown) throws Exception {
        evaluate("document.querySelector('main').scrollTop=" + (pullDown ? "0" : "100000")
            + ";window.scrollTo(0," + (pullDown ? "0" : "100000") + ");");
        SystemClock.sleep(350);
        JSONArray bounds = new JSONArray(evaluate("(()=>{const r=document.querySelector('.tabbar').getBoundingClientRect();return [r.left,r.top,r.width,r.height,devicePixelRatio]})()"));
        int[] origin = new int[2];
        int[] scrollbarWidth = new int[1];
        instrumentation.runOnMainSync(() -> {
            webView.getLocationOnScreen(origin);
            scrollbarWidth[0] = webView.isVerticalScrollBarEnabled() ? webView.getVerticalScrollbarWidth() : 0;
        });
        float scale = (float) bounds.getDouble(4);
        int left = origin[0] + Math.round((float) bounds.getDouble(0) * scale) + 3;
        int top = origin[1] + Math.round((float) bounds.getDouble(1) * scale) + 3;
        // Android's native overlay scrollbar is separate from the fixed navigation.
        // At QA density 240 its measured 6px gutter extends beyond the old 3px inset.
        int width = Math.round((float) bounds.getDouble(2) * scale) - 3 - Math.max(3, scrollbarWidth[0]);
        int height = Math.round((float) bounds.getDouble(3) * scale) - 6;
        Bitmap before = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(before);
        long down = SystemClock.uptimeMillis();
        float x = origin[0] + webView.getWidth() * .5f;
        float start = origin[1] + webView.getHeight() * (pullDown ? .28f : .7f);
        float distance = webView.getHeight() * (pullDown ? .4f : -.4f);
        try {
            touch(down, MotionEvent.ACTION_DOWN, x, start);
            for (int i = 1; i <= 24; i++) {
                touch(down, MotionEvent.ACTION_MOVE, x, start + distance * i / 24);
                SystemClock.sleep(12);
            }
            Bitmap during = instrumentation.getUiAutomation().takeScreenshot();
            assertNotNull(during);
            int changed = 0;
            for (int y = top; y < top + height; y++) {
                for (int column = left; column < left + width; column++) {
                    int a = before.getPixel(column, y), b = during.getPixel(column, y);
                    int delta = Math.abs(((a >> 16) & 255) - ((b >> 16) & 255))
                        + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255))
                        + Math.abs((a & 255) - (b & 255));
                    if (delta > 75) changed++;
                }
            }
            double fraction = (double) changed / (width * height);
            JSONArray after = new JSONArray(evaluate("(()=>{const r=document.querySelector('.tabbar').getBoundingClientRect();return [r.left,r.top,r.width,r.height,devicePixelRatio]})()"));
            assertEquals("Navigation geometry remains fixed during the native drag", bounds.toString(), after.toString());
            during.recycle();
            assertTrue((pullDown ? "Top" : "Bottom")
                + " edge drag moved/stretched bottom navigation; changed pixel fraction=" + fraction,
                fraction < .002);
        } finally {
            touch(down, MotionEvent.ACTION_CANCEL, x, start + distance);
            before.recycle();
            SystemClock.sleep(350);
        }
    }

    @Test public void bottomNavigationStaysStillAtBothScrollEdges() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openTasks(scenario);
            assertNavigationStable(true);
            assertNavigationStable(false);
        }
    }

    @Test public void longPageStillScrollsAndNavigationStaysStillAtEdges() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openTasks(scenario);
            // Add height only to the live DOM; never change the user's persisted data.
            evaluate("(()=>{const content=document.createElement('div');content.id='scroll-test-content';content.style.height='3000px';document.querySelector('main').append(content);window.scrollTo(0,0);document.querySelector('main').scrollTop=0})()");
            assertEquals("Long-page fixture must be laid out before native touch", "true", evaluate("document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight>1000"));
            awaitVisualCommit();
            try {
                int[] origin = new int[2];
                instrumentation.runOnMainSync(() -> webView.getLocationOnScreen(origin));
                float x = origin[0] + webView.getWidth() * .5f;
                float start = origin[1] + webView.getHeight() * .7f;
                float distance = webView.getHeight() * -.4f;
                long down = SystemClock.uptimeMillis();
                try {
                    touch(down, MotionEvent.ACTION_DOWN, x, start);
                    for (int i = 1; i <= 24; i++) {
                        touch(down, MotionEvent.ACTION_MOVE, x, start + distance * i / 24);
                        SystemClock.sleep(12);
                    }
                } finally {
                    touch(down, MotionEvent.ACTION_CANCEL, x, start + distance);
                }
                SystemClock.sleep(350);
                double scrolled = Double.parseDouble(evaluate("window.scrollY+document.querySelector('main').scrollTop"));
                assertTrue("Normal vertical scrolling must remain enabled: " + scrolled, scrolled > 100);
                assertNavigationStable(true);
                assertNavigationStable(false);
            } finally {
                evaluate("document.getElementById('scroll-test-content')?.remove();window.scrollTo(0,0)");
            }
        }
    }
}
