## 1. DB Schema Reorganization

- [x] 1.1 创建 `packages/db/src/schema/log/` 和 `index.ts`，将 `audit-logs.ts` 从 `schema/core` 移到 `schema/log`。
- [x] 1.2 更新 `packages/db/src/schema/core/index.ts` 和 `packages/db/src/schema/index.ts`，移除 core 中的 `audit-logs` 导出，并继续从 `@iam/db/schema` 导出 `auditLogs` 及相关 Zod schema。
- [x] 1.3 删除 `packages/db/src/schema/core/login-logs.ts`，确保 `loginLogs` 和登录日志 Zod schema 不再从 `@iam/db/schema` 导出。

## 2. DB Relations Cleanup

- [x] 2.1 新增 `packages/db/src/relations/log/index.ts`，并在 `packages/db/src/relations/index.ts` 中注册日志域 relations。
- [x] 2.2 删除 `packages/db/src/relations/core/login-logs.ts`，并从 `coreRelations` 中移除 `loginLogsRelations`。
- [x] 2.3 从 `packages/db/src/relations/core/users.ts` 移除 `users.loginLogs` relation，确保 relations 类型不再依赖 `r.loginLogs`。

## 3. Application References

- [x] 3.1 删除或重构 `apps/api/src/services/session/session.repository.ts` 中直接写入 `login_log` 的 legacy `loginLog` 方法。
- [x] 3.2 使用 `rg` 检查 `apps/`、`packages/` 中 `loginLogs`、`selectLoginLogSchema`、`insertLoginLogSchema`、`updateLoginLogSchema` 和运行时 `login_log` 引用，清理除历史迁移/文档外的残留引用。
- [x] 3.3 确认密码、手机、SSO、OA 和微信登录流程仍通过统一 audit service 写入 `audit_log`。

## 4. Migration

- [x] 4.1 运行 `pnpm --filter @iam/db db:generate` 生成 Drizzle migration。
- [x] 4.2 审查新 migration SQL，确认只删除 legacy `login_log` 表及其索引/约束，不删除或重建 `audit_log`。
- [x] 4.3 在迁移说明或文档中记录执行前置条件：历史 `login_log` 数据已迁移到 `audit_log`，或当前环境没有需要保留的 legacy 登录记录。

## 5. Documentation And Specs

- [x] 5.1 更新 `docs/features/audit/audit-logging.md`，将 `login_log` 退役计划改为已退役说明，并保留历史迁移验收要求。
- [x] 5.2 检查 OpenSpec delta 与实现一致，必要时同步补充任务或 spec 细节。

## 6. Verification

- [x] 6.1 运行 `pnpm --filter @iam/db typecheck`。
- [x] 6.2 运行受影响 app 的 focused typecheck/test，至少覆盖 `@iam/api`；如 admin 审计查询类型受影响，同时运行 `@iam/admin-api`。
- [x] 6.3 运行 `openspec status --change reorganize-db-log-schema`，确认 proposal、design、specs 和 tasks 全部完成且变更 apply-ready。
