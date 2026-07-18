# 03 — 迁移 OIDC client-scoped 授权解析

**What to build:** 让 OIDC 授权快照从共享 resolver 获取当前 client 的 Effective Role，使新签发快照与 admin/User Profile 使用同一角色分配事实，同时保持 `iam:authorization` 的结构、权限聚合和稳定排序不变。

**Blocked by:** 01 — 建立角色分配解析模块

**Status:** resolved

- [x] OIDC composition root 创建 resolver，并将其注入授权快照持久化适配器，不由叶子 repository 自行构造。
- [x] OIDC 为一次快照批量解析全部有效任职，并显式传入当前 IAM client ID。
- [x] 角色 assignment 匹配、有效性、client 过滤和去重全部由 resolver 提供；OIDC 只保留任职、组织路径、权限和 claim 映射。
- [x] `iam:authorization` 的外部结构、角色与权限稳定排序、scope 行为和 snapshot 生命周期保持不变。
- [x] OIDC 本地 assignment 查询、内存聚合函数和被新 package 接口测试取代的规则测试被删除，不保留 wrapper 或 re-export。
- [x] OIDC 调用方测试验证 client 参数、角色/权限映射和 claim 可观察行为，但不复制共享规则矩阵。
- [x] OIDC provider 的聚焦测试、lint、typecheck 以及共享模块显式 PostgreSQL 测试通过并记录证据。

## Resolution

- Commit: `c86baf0e`
- Validation:
  - `pnpm --filter @iam/oidc-provider test` — passed (20 files, 79 tests)
  - `pnpm --filter @iam/oidc-provider lint` — passed
  - `pnpm --filter @iam/oidc-provider typecheck` — passed
  - `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed (45 tests)
  - `pnpm install --frozen-lockfile` — passed with Node 24 and pnpm 11.5.0
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
