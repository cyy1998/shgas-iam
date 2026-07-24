# 01 — 补全 User Resignation 会话撤销

**What to build:** 让现有 User Resignation 在事务成功提交后尽力撤销目标用户的全部活跃访问会话，同时保持离职状态变更、调用方 contract 和失败语义不变。该切片应从用例行为、消费方端口、production composition 到架构守卫完整交付，并复用现有 admin session revocation capability。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 离职事务继续原子地结束全部有效任职、禁用账号、写入审计并标记 User Profile 失效。
- [x] 事务成功提交后，以 `user_disabled` 原因和当前审计上下文撤销目标用户全部会话，不设置 principal session 例外。
- [x] 会话撤销使用 best-effort after-commit 语义；撤销失败不回滚离职，也不改变现有成功响应。
- [x] 用户不存在或任一事务阶段失败时不撤销会话。
- [x] 对现有用户重复执行离职仍成功，并在每次成功提交后重新尝试撤销会话。
- [x] REST、tRPC、输入、返回值和现有错误映射保持兼容。
- [x] 新增依赖由 User Resignation 消费方拥有的最窄端口表达，并由 production composition 连接到现有会话撤销能力。
- [x] 用例行为测试覆盖提交后时序、撤销参数、失败隔离和重复执行；架构守卫覆盖端口所有权与 composition 边界。
- [x] 受影响测试、lint、typecheck、文档检查和仓库规定的功能级验证通过。
- [x] Standards 与 Spec 双轴评审没有未解决问题。

## Resolution

- Commit: `46be78ffc34584793eea4c666411be5123882083`
- Runtime: Node `v24.14.0`, pnpm `11.5.0`
- Validation:
  - `pnpm --filter @iam/admin-api test -- src/use-cases/employment/resign-user/__tests__/resign-user.use-case.test.ts src/__tests__/architecture.test.ts src/__tests__/port-contracts.test.ts` — passed (20 tests)
  - `pnpm --filter @iam/admin-api lint` — passed
  - `pnpm --filter @iam/admin-api typecheck` — passed
  - `pnpm --filter @iam/admin-api test` — passed (113 tests)
  - `pnpm lint` — passed (13 packages)
  - `pnpm typecheck` — passed (13 packages)
  - `pnpm test` — passed (13 packages)
  - `pnpm check:docs` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
