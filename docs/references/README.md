# 小猫专注：界面参考资料

整理日期：2026-11-14。这里保存需求讨论中已获取的原始参考图，便于后续设计对照。

## 参考优先级

1. 外观设计全面参考「小鸡专注」；配色、字体气质、图标、按钮、卡片、留白、背景与状态呈现均沿该方向设计。
2. 功能和信息结构以 [第一版规格](../v1-spec.md) 为准，例如五栏导航、长期可复用待办、课表及仅显示文案的小猫页。
3. 用户提供的图片用于待办层级、专注布局和统计内容参考；图中未纳入首版的功能不因出现在图片上自动加入。
4. 官方商店展示图包含宣传排版、手机外框和叠放预览，应对照其中的应用界面区域；未覆盖界面按统一视觉语言补齐，并在界面阶段验收。

## 小鸡专注官方展示图

来源：Apple App Store，应用 ID `1627691759`。下列是已取得的商店展示图，不代表完整交互状态或所有页面；来源对应关系见 [清单](source-manifest.json)。

| 文件 | 主要参考 |
| --- | --- |
| [official-01.jpg](chickfocus/official-01.jpg) | 专注页、计时数字、主要操作 |
| [official-02.jpg](chickfocus/official-02.jpg) | 结束反馈与主要按钮；宠物惩罚机制不属于首版 |
| [official-03.jpg](chickfocus/official-03.jpg) | 角色插画方向，留供后续宠物版本 |
| [official-04.jpg](chickfocus/official-04.jpg) | 提示页与按钮风格；锁机功能不属于首版 |
| [official-05.jpg](chickfocus/official-05.jpg) | 场景与宠物布局，留供后续版本 |
| [official-06.jpg](chickfocus/official-06.jpg) | 徽章插画方向；首版未纳入成就系统 |
| [official-07.jpg](chickfocus/official-07.jpg) | 周日期选择、时间轴与记录卡片 |
| [official-08.jpg](chickfocus/official-08.jpg) | 统计周期切换、概览、占比与趋势 |
| [official-09.jpg](chickfocus/official-09.jpg) | 计时状态和图形风格；不是已确定的首版锁屏组件需求 |
| [official-10.jpg](chickfocus/official-10.jpg) | 数字、统计卡片与深浅背景表现；桌面小组件未纳入首版 |

实际字体名、主题切换选项、所有弹窗状态等不能仅凭这些图确认。Q29 已确定参考方向，未接受助手另行提出的主题和纯色背景方案；设计阶段应对可见状态做对照，不把未经核实的功能描述为参考产品已有行为。

## 用户提供的结构参考

- [待办层级](user/task-structure.jpg)：大主题、子待办和开始入口。
- [全屏专注](user/focus-layout.jpg)：大号计时、事项名称和计时操作。
- [统计内容](user/statistics-content.jpg)：统计项目参考；App 使用、起床/睡眠打卡、打断原因不属于首版。
