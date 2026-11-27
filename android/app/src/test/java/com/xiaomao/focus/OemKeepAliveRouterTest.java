package com.xiaomao.focus;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class OemKeepAliveRouterTest {
    @Test
    public void oppoHintsExplainBindingAndRecentTaskLockLimits() {
        String autoStart = OemKeepAliveRouter.autoStartHint(OemKeepAliveRouter.BRAND_OPPO);
        assertTrue(autoStart.contains("设置 → 应用 → 自启动"));
        assertTrue(autoStart.contains("避免系统拦截通知监听与后台服务绑定"));
        assertTrue(autoStart.contains("应用信息 → 耗电管理"));
        assertTrue(autoStart.contains("完全允许后台行为"));
        assertTrue(autoStart.contains("「手机管家 / 安全中心」将小猫专注设为信任或白名单"));

        String recentLock = OemKeepAliveRouter.recentLockHint(OemKeepAliveRouter.BRAND_OPPO);
        assertTrue(recentLock.contains("选择「锁定」"));
        assertTrue(recentLock.contains("防底部一键清除"));
        assertTrue(recentLock.contains("Home 或返回键"));
        assertTrue(recentLock.contains("勿手动单独上滑划掉卡片"));
    }

    @Test
    public void otherBrandsExplainTrustOrRestrictedSettings() {
        String xiaomi = OemKeepAliveRouter.autoStartHint(OemKeepAliveRouter.BRAND_XIAOMI);
        assertTrue(xiaomi.contains("安全中心 → 自启动管理"));
        assertTrue(xiaomi.contains("后台弹出界面"));
        assertTrue(xiaomi.contains("在安全中心将小猫专注加入信任或忽略风险"));

        String vivo = OemKeepAliveRouter.autoStartHint(OemKeepAliveRouter.BRAND_VIVO);
        assertTrue(vivo.contains("i 管家 → 权限管理 → 自启动"));
        assertTrue(vivo.contains("i 管家安全检测中将小猫专注加入信任或忽略风险"));

        String huawei = OemKeepAliveRouter.autoStartHint(OemKeepAliveRouter.BRAND_HUAWEI);
        assertTrue(huawei.contains("手机管家 → 应用启动管理"));
        assertTrue(huawei.contains("手机管家「病毒查杀 / 风险管控」中解除管控并加入信任"));

        String samsung = OemKeepAliveRouter.autoStartHint(OemKeepAliveRouter.BRAND_SAMSUNG);
        assertTrue(samsung.contains("电池 → 后台使用限制"));
        assertTrue(samsung.contains("「应用信息 → 右上角 ⋮」点击「允许受限设置」"));

        String generic = OemKeepAliveRouter.autoStartHint(OemKeepAliveRouter.BRAND_GENERIC);
        assertTrue(generic.contains("手机管家白名单"));
        assertTrue(generic.contains("Android 13+ 侧载版需在应用信息右上角「⋮」点击「允许受限设置」"));
    }

    @Test
    public void detectsMajorAndroidOemBrands() {
        assertEquals(OemKeepAliveRouter.BRAND_OPPO, OemKeepAliveRouter.detectBrand("OPPO", "CPH2411"));
        assertEquals(OemKeepAliveRouter.BRAND_OPPO, OemKeepAliveRouter.detectBrand("OnePlus", "oneplus"));
        assertEquals(OemKeepAliveRouter.BRAND_OPPO, OemKeepAliveRouter.detectBrand("realme", "RMX"));
        assertEquals(OemKeepAliveRouter.BRAND_XIAOMI, OemKeepAliveRouter.detectBrand("Xiaomi", "Redmi"));
        assertEquals(OemKeepAliveRouter.BRAND_XIAOMI, OemKeepAliveRouter.detectBrand("POCO", "poco"));
        assertEquals(OemKeepAliveRouter.BRAND_VIVO, OemKeepAliveRouter.detectBrand("vivo", "iQOO"));
        assertEquals(OemKeepAliveRouter.BRAND_HUAWEI, OemKeepAliveRouter.detectBrand("HUAWEI", "huawei"));
        assertEquals(OemKeepAliveRouter.BRAND_HUAWEI, OemKeepAliveRouter.detectBrand("HONOR", "honor"));
        assertEquals(OemKeepAliveRouter.BRAND_SAMSUNG, OemKeepAliveRouter.detectBrand("samsung", "galaxy"));
        assertEquals(OemKeepAliveRouter.BRAND_GENERIC, OemKeepAliveRouter.detectBrand("Google", "Pixel"));
    }

    @Test
    public void suppliesHintsAndCandidateComponentsPerBrand() {
        String[] brands = new String[] {
            OemKeepAliveRouter.BRAND_OPPO,
            OemKeepAliveRouter.BRAND_XIAOMI,
            OemKeepAliveRouter.BRAND_VIVO,
            OemKeepAliveRouter.BRAND_HUAWEI,
            OemKeepAliveRouter.BRAND_SAMSUNG,
            OemKeepAliveRouter.BRAND_GENERIC,
        };
        for (String b : brands) {
            assertFalse(OemKeepAliveRouter.brandLabel(b).isEmpty());
            assertFalse(OemKeepAliveRouter.autoStartHint(b).isEmpty());
            assertFalse(OemKeepAliveRouter.recentLockHint(b).isEmpty());
            List<String[]> components = OemKeepAliveRouter.candidateAutoStartComponents(b);
            if (!OemKeepAliveRouter.BRAND_GENERIC.equals(b)) {
                assertTrue("Expected OEM autostart candidates for " + b, components.size() > 0);
            } else {
                assertEquals(0, components.size());
            }
        }
        assertEquals(
            "com.oplus.battery",
            OemKeepAliveRouter.candidateAutoStartComponents(OemKeepAliveRouter.BRAND_OPPO).get(0)[0]
        );
    }
}
