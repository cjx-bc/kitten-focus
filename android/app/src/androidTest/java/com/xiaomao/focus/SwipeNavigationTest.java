package com.xiaomao.focus;

import android.app.Instrumentation;
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
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SwipeNavigationTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> scenario;
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

    private void waitFor(String expression) throws Exception {
        for (int i = 0; i < 80; i++) {
            if ("true".equals(evaluate(expression))) return;
            SystemClock.sleep(100);
        }
        fail("Timed out: " + expression + "; current route=" + evaluate("location.hash"));
    }

    private void waitForRoute(String path) throws Exception {
        waitFor("location.hash==='#" + path + "' && "
            + (path.equals("/focus") ? "!!document.querySelector('.focus-page') && !document.querySelector('.tabbar')"
                : "document.querySelector('.tabbar a[aria-current=page]')?.getAttribute('href')==='#" + path + "'"));
        SystemClock.sleep(150);
    }

    private void openRoute(String path) throws Exception {
        evaluate("location.hash='" + path + "'");
        waitForRoute(path);
        evaluate("window.scrollTo(0,0)");
    }

    @Before public void setup() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity -> webView = activity.getBridge().getWebView());
        openRoute("/tasks");
    }

    @After public void cleanup() {
        if (scenario != null) scenario.close();
    }

    private void touch(long down, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            assertTrue("Touch event was rejected", instrumentation.getUiAutomation().injectInputEvent(event, true));
        } finally {
            event.recycle();
        }
    }

    private void swipe(float fromX, float toX, float fromY, float toY, boolean cancel) throws Exception {
        int[] origin = new int[2];
        instrumentation.runOnMainSync(() -> webView.getLocationOnScreen(origin));
        JSONArray bounds = new JSONArray(evaluate("(()=>{const r=document.querySelector('main').getBoundingClientRect();return [r.left,r.width,devicePixelRatio]})()"));
        float left = (float) bounds.getDouble(0), width = (float) bounds.getDouble(1), scale = (float) bounds.getDouble(2);
        float x = origin[0] + (left + width * fromX) * scale;
        float y = origin[1] + webView.getHeight() * fromY;
        float endX = origin[0] + (left + width * toX) * scale;
        float endY = origin[1] + webView.getHeight() * toY;
        long down = SystemClock.uptimeMillis();
        boolean released = false;
        try {
            touch(down, MotionEvent.ACTION_DOWN, x, y);
            for (int i = 1; i <= 16; i++) {
                touch(down, MotionEvent.ACTION_MOVE, x + (endX - x) * i / 16, y + (endY - y) * i / 16);
                SystemClock.sleep(10);
            }
            touch(down, cancel ? MotionEvent.ACTION_CANCEL : MotionEvent.ACTION_UP, endX, endY);
            released = true;
        } finally {
            if (!released) touch(down, MotionEvent.ACTION_CANCEL, endX, endY);
        }
        SystemClock.sleep(200);
    }

    private void horizontal(boolean left) throws Exception {
        swipe(left ? .78f : .22f, left ? .22f : .78f, .18f, .18f, false);
    }

    private void assertRoute(String path) throws Exception {
        assertEquals("\"#" + path + "\"", evaluate("location.hash"));
    }

    @Test public void fiveTabsSwitchInOrderInBothDirections() throws Exception {
        String[] paths = {"/tasks", "/calendar", "/cat", "/statistics", "/settings"};
        for (int i = 1; i < paths.length; i++) {
            horizontal(true);
            waitForRoute(paths[i]);
        }
        for (int i = paths.length - 2; i >= 0; i--) {
            horizontal(false);
            waitForRoute(paths[i]);
        }
        assertEquals("No page transition animation", "0", evaluate("document.querySelector('main').getAnimations({subtree:true}).filter(a=>a.effect?.target.closest('.page, .cat-placeholder')).length"));
    }

    @Test public void boundariesVerticalDragsShortDragsAndCancelledTouchesDoNotSwitch() throws Exception {
        horizontal(false);
        assertRoute("/tasks");
        swipe(.5f, .51f, .3f, .65f, false);
        assertRoute("/tasks");
        swipe(.5f, .53f, .38f, .38f, false);
        assertRoute("/tasks");
        swipe(.78f, .22f, .38f, .38f, true);
        assertRoute("/tasks");
        openRoute("/settings");
        horizontal(true);
        assertRoute("/settings");
    }

    @Test public void secondaryPagesAndOpenFormsDoNotSwitch() throws Exception {
        openRoute("/focus");
        horizontal(true);
        horizontal(false);
        assertRoute("/focus");

        openRoute("/settings");
        evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('关于小猫专注')).click()");
        waitFor("!!document.querySelector('dialog[open]')");
        horizontal(true);
        horizontal(false);
        assertRoute("/settings");
        assertEquals("true", evaluate("!!document.querySelector('dialog[open]')"));
        evaluate("document.querySelector('dialog[open] button[aria-label=关闭]').click()");

        openRoute("/tasks");
        evaluate("document.querySelector('button[aria-label=新建主题]').click()");
        waitFor("!!document.querySelector('dialog[open] input')");
        evaluate("document.querySelector('dialog[open] input').value='Unsubmitted theme'");
        horizontal(true);
        assertRoute("/tasks");
        assertEquals("\"Unsubmitted theme\"", evaluate("document.querySelector('dialog[open] input').value"));
        evaluate("document.querySelector('dialog[open] button[aria-label=关闭]').click()");
    }
}
