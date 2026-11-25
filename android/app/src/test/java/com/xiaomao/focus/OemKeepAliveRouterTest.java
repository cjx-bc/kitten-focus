package com.xiaomao.focus;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class OemKeepAliveRouterTest {
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
