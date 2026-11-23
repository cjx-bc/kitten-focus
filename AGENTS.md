@C:\Users\33428\.codex\RTK.md

## Agent skills

### Issue tracker

规格和任务使用 cjx-bc/kitten-focus 的 GitHub Issues。
操作前读取 docs/agents/issue-tracker.md。

### Triage labels

使用默认五种 triage 标签。
应用或修改标签前读取 docs/agents/triage-labels.md。

### Domain docs

采用 single-context：根目录 GLOSSARY.md 与 docs/adr/。
探索领域或编写规格前读取 docs/agents/domain.md。

### UX spec & design gate

前端交互与页面改动必须先遵循 docs/ux-spec.md 与 docs/brand-spec.md。
修改任何 `.vue` 页面或弹窗前，先读取 docs/ux-spec.md 并完成对应线框与减法清单（若涉及布局或交互流程变化，须先更新 docs/ux-spec.md）。
硬性约束：
- 单屏第一眼最多 1 个主 CTA、最多 4 个开关或决策项。
- 严禁弹窗套弹窗（0 个嵌套 `<dialog>`），使用弹窗内页面切换、`...` 菜单或路由跳转替代。
- 主流程与主页面不暴露底层工程、诊断或降级状态（按渐进披露收进二级设置或诊断页）。
- 高频学习操作（开始专注、自由专注、暂停/结束、开关学霸模式、查看今日/本周统计与日程）不超过 2 步完成。
- 严格遵守 docs/brand-spec.md 视觉参数、GLOSSARY.md 术语及 docs/adr/0004-native-focus-control-boundary.md 原生边界。
