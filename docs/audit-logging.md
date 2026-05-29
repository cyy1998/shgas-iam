# 统一审计日志

统一审计日志记录安全敏感业务事件，用于追责、复盘和合规查询。它和普通系统日志边界不同：

- 审计日志写入 PostgreSQL `audit_log`，保存 actor、target、action、outcome、请求来源和脱敏 details，要求可长期检索。
- 普通系统日志继续由应用输出结构化运行时日志，主要用于排障、性能和链路观测，不替代审计证据。
- 管理端审计日志页面只展示后端已脱敏的数据，不从原始请求体重建或补充敏感内容。

## 敏感字段禁入

`audit_log.details` 不得保存以下明文或可直接认证的派生值：

- 密码、密码哈希、临时密码。
- 短信验证码、图片验证码、一次性口令。
- token、cookie、session、authorization header。
- client secret、旧 secret、新 secret 或可用于认证的 secret 摘要。
- 完整敏感个人信息；需要定位时使用用户 ID、用户名、脱敏手机号或安全摘要。

需要表达敏感字段变化时，只记录字段发生变化、脱敏值或安全摘要，例如 `passwordReset: true`、`mobileMasked`、`changedFields`。

## `login_log` 退役计划

新登录事件已经写入 `audit_log`。旧 `login_log` 仅作为历史来源保留，迁移完成并验收后，后续独立变更再移除旧表和相关兼容逻辑。

生产迁移必须先 dry-run：

```bash
pnpm --filter @iam/db migrate:login-log-audit -- --dry-run --batch-size 500 --sample-size 5
```

确认待迁移数量和样例映射后再执行：

```bash
pnpm --filter @iam/db migrate:login-log-audit -- --execute --batch-size 500
```

迁移脚本通过 `details.migrationSource = "login_log"` 和 `details.legacyLoginLogId` 跳过已迁移记录，可重复执行；执行完成后应确认 pending 数量为 0。
