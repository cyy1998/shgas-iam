# 04 — 交付 Admin Custom SSO 真实 Journey

**What to build:** 浏览器从 `/iam-admin` 经真实 SSO 密码登录与 callback 返回 Admin，再通过真实 `/api/iam/rpc` 配置、
启用并读回 seeded client 的 Custom SSO 状态。

**Blocked by:** 03 — 建立 One-shot Seed 与单一 Gateway Origin

**Status:** resolved

**Repository invariant:** 第一条完整纵向行为落地；OIDC journey 尚缺失且不会被 root `test:e2e` 隐藏，因为该入口尚未发布。

**Focused verification:**

- Workspace-local Playwright 只运行 Admin journey，运行前后核对 exact project cleanup。
- 从 UI/API read-back 验证可观察结果，不直连内部 persistence 作为业务断言；运行 `git diff --check`。

- [x] Gateway、Admin、SSO、API、Admin API、PostgreSQL、Redis、Session/Cookie 与 Custom SSO callback 全部真实。
- [x] 不用 `page.route` 替代 journey 经过的 repo-owned core；只关闭明确不经过的 CAPTCHA/SMS 等第三方边。
- [x] 失败保存 trace/screenshot/video，再走统一诊断与 cleanup；cleanup failure 非零。
