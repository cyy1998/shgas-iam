# 02 — 让 OIDC External Entry 复用同一 Owner Pattern

**What to build:** 把 OIDC external entry 的 RESP seed/raw barrier/facts/cache writes 迁为 production owners，保留
discovery、PKCE、token、UserInfo 与 logout 的真实 process、PostgreSQL、Redis composition 行为。

**Blocked by:** 01 — 用 API External Entry 证明 Production-owner Seed

**Status:** resolved

**Repository invariant:** 第二个高价值 consumer 完整替换后才删除其旧写法；其余 process consumers 仍由 shim 支撑。

**Focused verification:**

- 运行 `pnpm --filter @iam/oidc-provider test:integration:composition`，验证公开 OIDC 结果和真实状态。
- 盘点 RESP seed/raw `mset` imports，并运行 package lint/typecheck 与 `git diff --check`。

- [x] 不使用 `createSessionKernelForTesting` 冒充真实 Redis persistence，不手写 Session/Subject Facts/Custom SSO payload。
- [x] Lookup HMAC、namespace、TTL 与 cleanup adapters 与被测 production entry 完全同源。
- [x] 沿用 Ticket 01 的局部 composition helper；只有实际重复非平凡 lifecycle 才提取窄 testing export。
