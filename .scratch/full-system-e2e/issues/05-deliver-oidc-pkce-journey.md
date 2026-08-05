# 05 — 交付 OIDC Authorization Code + PKCE 真实 Journey

**What to build:** Test-owned RP helper 生成 S256 challenge 并接收 callback；浏览器经真实 authorize、SSO/API password
login 与 resume 取得 code，再调用真实 token endpoint 和 `/oidc/me`。

**Blocked by:** 03 — 建立 One-shot Seed 与单一 Gateway Origin

**Status:** ready-for-agent

**Repository invariant:** 与 Admin journey 共享已验证 lifecycle/seed，但行为与断言独立；仍不提前发布 root `test:e2e`。

**Focused verification:**

- Workspace-local Playwright/HTTP helper 只运行 OIDC journey，运行前后核对 exact project cleanup。
- 验证 redirect/origin/Cookie contract 与公开 token/UserInfo 结果；运行 `git diff --check`。

- [ ] OIDC Provider、SSO/API authentication、Gateway routes、Session 与 token/UserInfo runtime 全部真实；只有系统外 RP
  callback 是 test-owned。
- [ ] Issuer/redirect 精确使用 canonical origin；本地 HTTP 只令 interaction Cookie `Secure=false`，`Path=/oidc` 与其他
  contract 保持。
- [ ] PKCE、authorization code 单次使用、token 与 UserInfo 全部以公开协议结果验收。
