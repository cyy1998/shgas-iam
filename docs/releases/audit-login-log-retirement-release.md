# 统一审计日志与 login_log 退役发布手册

Type: runbook
Status: Current
Last verified: 2026-07-03
Next review: 2026-10-31

## 适用范围

本手册用于发布统一 `audit_log` 审计日志和 legacy `login_log` 退役。事实来源包括
`docs/features/audit/audit-logging.md`、`openspec/specs/audit-logging/spec.md`、
`packages/db/package.json`、`packages/db/scripts/migrate-login-log-to-audit.ts`、
`packages/db/src/schema/log/audit-logs.ts` 和 `packages/db/src/migrations/20260605081527_sour_bill_hollister/migration.sql`。

新登录安全事件只写入 `audit_log`。删除 `login_log` 是破坏性数据库变更，生产执行前必须完成历史迁移验收，或确认环境中没有需要保留的 legacy 登录记录。

## 发布前置条件

- 已备份 PostgreSQL，备份至少覆盖 `login_log`、`audit_log` 和相关用户/client 维度数据。
- 已确认 `packages/db` 仍提供迁移脚本：

```bash
pnpm --filter @iam/db migrate:login-log-audit -- --dry-run --batch-size 500 --sample-size 5
```

- 已确认 `audit_log.details` 敏感字段规则：不得保存密码、验证码、token、cookie、authorization header、
  client secret、完整敏感个人信息或可认证派生值。
- 已确认 admin 审计日志页面和 admin-api 查询支持 action、outcome、actor、target、requestId 和 traceId 筛选。

## 发布顺序

1. 执行 dry-run，记录待迁移数量和样例映射：

```bash
pnpm --filter @iam/db migrate:login-log-audit -- --dry-run --batch-size 500 --sample-size 5
```

2. 核对样例中 `actor`、`target`、`action`、`outcome`、request context 和脱敏 details 是否正确。
3. 执行历史迁移：

```bash
pnpm --filter @iam/db migrate:login-log-audit -- --execute --batch-size 500
```

4. 再次执行 dry-run，确认 pending 数量为 `0`。脚本会通过 `details.migrationSource = "login_log"` 和
   `details.legacyLoginLogId` 跳过已迁移记录。
5. 只有 pending 为 `0`，或确认该环境没有需要保留的 legacy 登录记录后，才应用删除 `login_log` 的 Drizzle migration。
6. 部署只写 `audit_log` 的 API/admin-api 版本。

## Smoke 验收

- 密码登录、手机验证码登录、custom SSO、OA 或微信登录产生的安全事件只写入 `audit_log`，不再写 `login_log`。
- admin 审计日志页面可以按时间范围、规范 action、outcome、actor、target、requestId 和 traceId 查询。
- 审计详情页展示脱敏 `details`、requestId、traceId 和错误摘要，不暴露敏感原文。
- 如保留 Grafana deep link，链接参数只包含 requestId、traceId、service、env 和时间范围。
- 数据库检查确认 `audit_log` 未被删除或重建，既有审计记录仍保留。

## 敏感字段检查

抽查迁移样例和新增登录事件，确认 `audit_log.details` 不包含：

- password、password hash、temporary password。
- SMS code、captcha、one-time code。
- token、cookie、session、authorization header。
- client secret、新旧 secret 或可认证 secret 摘要。
- 完整手机号、完整身份证类个人信息或完整请求/响应 body。

需要表达变化时，只记录 `passwordReset: true`、`mobileMasked`、`changedFields` 或等价安全摘要。

## 回滚窗口

| 阶段 | 回滚方式 | 边界 |
|---|---|---|
| dry-run 前 | 无需回滚 | 未写入数据。 |
| execute 后、删除 `login_log` 前 | 可保留已迁移 `audit_log` 记录并暂停发布 | 迁移脚本可重复执行；不要修改已写入的审计事实。 |
| 删除 `login_log` 后 | 需要从数据库备份恢复旧表，或接受只保留 `audit_log` | 不能仅靠应用回滚恢复已删除表。 |
| 新登录只写 `audit_log` 后 | 回滚应用前先确认是否仍需要 legacy 表 | 旧应用如果尝试写 `login_log`，在表已删除环境会失败。 |

回滚后必须重新验证登录事件写入、admin 审计查询、pending=0 和敏感字段检查。
