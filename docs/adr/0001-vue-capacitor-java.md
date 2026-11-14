---
status: accepted
date: 2026-11-14
---

# 采用 Vue 界面、Capacitor 与 Java 原生能力

小猫专注要求同时使用 Vue 和 Java，并需为安卓专注计时、通知及后期锁机保留原生能力；用户已接受 Vue 3 + TypeScript + Capacitor、Android Java，以及 Java 21 + Spring Boot 的分工。相较调研过的 uni-app 路线，当前选择保留标准 Vue 工程和明确的 Java 原生插件边界，优先满足安卓定制界面与系统能力接入；这也意味着需要维护前端、安卓原生与服务端各自的工程边界。存储选定本地 SQLite 与云端 MySQL；后续访谈已确认第一阶段免登录、本地完整使用，账号与云同步后移，见 ADR 0002。具体依赖版本与真机行为仍须验证。
