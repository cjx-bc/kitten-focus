package com.xiaomao.focus;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class RemindersCopyTest {
    @Test
    public void focusFinishedTitleFollowsGlossary() {
        assertEquals("本次专注正常结束", Reminders.FOCUS_FINISHED_TITLE);
        assertFalse(Reminders.FOCUS_FINISHED_TITLE.contains("已完成"));
        assertFalse(Reminders.FOCUS_FINISHED_TITLE.contains("番茄钟"));
        assertFalse(Reminders.FOCUS_FINISHED_TITLE.contains("待办完成"));
    }

    @Test
    public void accessibilityRevokedNoticeExplainsHowToRestoreProtection() {
        String title = Reminders.ACCESSIBILITY_REVOKED_TITLE;
        String body = Reminders.ACCESSIBILITY_REVOKED_TEXT;
        assertEquals("无障碍保护已被系统关闭", title);
        assertTrue(body.contains("手机管家/安全中心"));
        assertTrue(body.contains("请先在安全中心设为信任或白名单，再重开无障碍"));

        String[] avoidedTerms = { "已完成", "番茄钟", "待办完成", "系统冻结", "设备所有者模式" };
        for (String term : avoidedTerms) {
            assertFalse(title.contains(term));
            assertFalse(body.contains(term));
        }
    }

    @Test
    public void leaveWarningCopyMatchesSpecAndAvoidsGlossaryViolations() {
        assertEquals("快回来！再不回专注小动物就要挂了", Reminders.LEAVE_WARN_TITLE);
        assertTrue(Reminders.LEAVE_WARN_TEXT.contains("10 秒"));

        String[] avoidedTerms = { "已完成", "番茄钟", "待办完成", "系统冻结", "设备所有者模式", "失败" };
        for (String term : avoidedTerms) {
            assertFalse(Reminders.LEAVE_WARN_TITLE.contains(term));
            assertFalse(Reminders.LEAVE_WARN_TEXT.contains(term));
        }
    }
}
