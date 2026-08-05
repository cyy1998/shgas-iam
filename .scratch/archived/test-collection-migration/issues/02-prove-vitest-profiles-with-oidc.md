# 02 — 用 OIDC 纵切验证 Vitest 多 Profile 迁移

**What to build:** 以 OIDC Provider 为 Vitest tracer bullet，把当前 ordinary/process/external/redis 四套 configs 与
18/5/1/1 文件迁为完整 package-local `test:unit`、`test:integration:component`、`test:integration:process`、
`test:integration:composition`、`test:integration:redis` commands，同时保持旧 package scripts 可达。

**Blocked by:** 01 — 锁定旧 Collection 基线与目标归属

**Status:** resolved

**Repository invariant:** 每个新 package command 从出现起即完整；旧 root/legacy commands 尚未切换，其他 workspaces
不受影响。

**Focused verification:**

- 对五个 Vitest `--list` 机器输出做 equality/互斥 diff，并聚焦运行各 canonical command。
- 运行 `pnpm --filter @iam/oidc-provider lint`、typecheck 与 root orchestration tests。

- [x] 五个 Vitest lists 与 Ticket 01 的 OIDC 子集完全相等且互斥；Unit/component 归属经人工映射，不按 `src` 机械决定。
- [x] Package scripts、Vitest include/exclude、tsconfig、lint 与 env-name guard 同步，不产生漏 lint/typecheck。
- [x] 只改变 collection、命名与 orchestration；RESP fidelity 和业务断言留给下游 feature。
