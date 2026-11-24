package com.xiaomao.focus;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import org.junit.Test;

public class RemindersCopyTest {
    @Test
    public void focusFinishedTitleFollowsGlossary() {
        assertEquals("本次专注正常结束", Reminders.FOCUS_FINISHED_TITLE);
        assertFalse(Reminders.FOCUS_FINISHED_TITLE.contains("已完成"));
        assertFalse(Reminders.FOCUS_FINISHED_TITLE.contains("番茄钟"));
        assertFalse(Reminders.FOCUS_FINISHED_TITLE.contains("待办完成"));
    }
}
