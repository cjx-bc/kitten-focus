import com.xiaomao.focus.probe.common.HoldRequest;

/** Host checks at the hold command's public decision seam; no Android mocks. */
public final class HoldRequestTest {
    public static void main(String[] args) {
        HoldRequest.Decision oldAndroid = HoldRequest.evaluate(25, true, false, 20000L, 10000L);
        equal("unsupported_api", oldAndroid.code);
        if (oldAndroid.maySnooze) throw new AssertionError("API 25 must not snooze");
        System.out.println("PASS: API 24/25 capability gate");
        HoldRequest.Decision fixed = HoldRequest.evaluate(26, true, false, 20000L, 10000L);
        equal("ready", fixed.code);
        equal(10000L, fixed.durationMs);
        if (!fixed.maySnooze) throw new AssertionError("fixed deadline must permit an attempt");
        System.out.println("PASS: fixed deadline hold duration");
        equal("listener_disconnected", HoldRequest.evaluate(36, false, false, 20000L, 10000L).code);
        equal("necessary_exception", HoldRequest.evaluate(36, true, true, 20000L, 10000L).code);
        equal("unsupported_no_deadline", HoldRequest.evaluate(36, true, false, null, 10000L).code);
        equal("deadline_elapsed", HoldRequest.evaluate(36, true, false, 10000L, 10000L).code);
        System.out.println("PASS: disconnected, exception, no-deadline and expired gates");
    }

    static void equal(Object expected, Object actual) {
        if (!expected.equals(actual)) throw new AssertionError(expected + " != " + actual);
    }
}
