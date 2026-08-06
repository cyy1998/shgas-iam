# 03 — 建立 One-shot Seed 与单一 Gateway Origin

**What to build:** 实现 E2E-local `seedE2EScenario`，以 run id/canonical origin 通过 production repository/Drizzle 与
Redis owner seam 建立两条 journey 所需领域状态，并渲染、探测单一 Gateway origin contract。

**Blocked by:** 02 — 启动 Repo Runtimes 并封闭诊断清理路径

**Status:** resolved

**Repository invariant:** Seed 与 origin contract 独立可观察且受 Ticket 02 lifecycle 保护；尚未宣称 browser journey 已交付。

**Focused verification:**

- 空 project 运行 `migrate -> runtimes/readiness -> seed -> route probes -> cleanup`。
- 从 owner interface/read-back 验证 seed，检查 descriptor/receipt 不含 password/token/secret；运行 workspace lint/typecheck
  与 `git diff --check`。

- [x] Seed 形成 active admin subject、密码、组织/任职/角色、Custom SSO client 与 public OIDC PKCE client，并只返回
  run-scoped 非敏感引用。
- [x] Redis 不复制 key/serializer/TTL/Lua；seed 不公开 DSL 或通用 fixture interface。
- [x] `IAM_SSO_INTERNAL_HOST`/`IAM_SSO_EXTERNAL_HOST`、issuer 与 registered redirects 都对应同一个
  `127.0.0.1` 动态 origin。
