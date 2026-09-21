# 统一审计日志

安全敏感业务事件写入 PostgreSQL audit_log，保存 actor、target、action、outcome、请求来源与脱敏 details，
用于追责和长期检索。结构化运行日志用于排障/观测，不能替代业务审计。
管理页面只展示后端安全数据，不从原请求重建敏感内容。

## 敏感字段禁入

details 不保存密码/哈希/临时密码、验证码、Token、Cookie、Authorization、Secret 或可直接认证的摘要。
需要定位时使用业务 ID、用户名、脱敏手机号或安全摘要；字段变化使用 passwordReset、mobileMasked、changedFields 等事实。
Session Origin、任意 metadata、Redis key、lookup/HMAC、context、captured identity、原始异常和 cleanup error
不进入会话管理审计。传入 auditContext 的 actor principalSessionId、旧 details 与 target 也不透传。

## 会话管理审计

`principal_session` 是保留的审计分类字符串，当前操作对象为 UserSession，不表示旧 Kernel 模型。

| 操作 | action | target |
|---|---|---|
| 单根撤销 | admin.session.revoke | targetType=principal_session，targetCode=principalSessionId。 |
| 固定 UserSession/ClientSession 集合 | admin.session.revoke | targetType=session_batch，无 targetCode/targetId。 |
| 用户级撤销 | admin.session.revoke_user | targetType=user，targetId 为 numeric user ID。 |

通用 details 只包含：

```ts
{
  scope: "session" | "user", // captured 使用 session
  changed,
  sessions: {
    userSessionsTerminated,
    clientSessionsTerminated,
    excluded,
    failed,
    unknown,
  },
  currentPrincipalSessionExcluded,
  // 仅保护拒绝时存在：
  currentPrincipalSessionProtected: true,
}
```

固定集合另含顶层 alreadyTerminated、missing、expired、replaced 数量。
管理响应里的 generation、batch.results/unfinished、artifactCleanup 不进入审计，
也不保留旧 Credential/Artifact 数量或 cleanupFailedCount。

changed 只由实际两类 terminated 数量决定；unknown 不改为已确认变化。
failed 或 unknown 非零时 outcome=failure，否则包括合法 no-op 均为 success。
单根当前根/缺当前 ID，以及本人用户级缺当前 ID，会先审计 protected failure 再拒绝；
captured 缺当前 ID 则直接保护拒绝，不写这条审计，不能概括为所有保护失败都留审计。

## 作用后审计失败

Redis 会话作用先于 PostgreSQL 审计，审计失败不回滚 Redis。
当 changed=true **或 unknown>0** 时，审计失败返回 HTTP 500、ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT；
unknown-only 即使确认终止数为零也表示作用可能已发生。
changed=false 且无 unknown 的审计失败仍为普通 AdminLoginStateAuditFailedError / INTERNAL_ERROR，
不把 failed-only 当作已确认作用。

页面刷新确认、保留修复提示，不自动重放；刷新成功不证明审计已补齐。
本人改密复用用户级撤销，外层以 ADMIN_MUTATION_COMMITTED 表达密码提交后的失败，
见[写入结果契约](../admin/admin-mutation-contract.md)。

## 解除临时登录限制

admin.login_restriction.release 的 target 为 user/numeric ID，details 只含
cause=too_many_login_failures、triggerMethod（password/mobile/unknown）、changed、failureStateCleared=true。
成功和幂等无变化均记 success；已经自然过期或被他人解除时 changed=false。

不保存失败成员/时间、阈值/窗口、会话标识或 provider 细节。
Redis 原子清理先于审计，changed=true 后审计失败使用作用后失败错误；解除不影响已有 UserSession，
因此不产生 Session Revocation 审计。完整页面及结果见[会话管理](../admin/session-management.md)。

## Secret 与历史 action

SSO Secret 轮换和读取使用独立安全审计，读取提交未确认时不交付原文，
见[Client Secret 管理](../admin/client-sso-configuration.md#管理权限与-secret)。

历史八类登录 action 别名由 Worker audit:actions 规范化，只修改 action。
当前查询合并去重单 action/多 actions 后精确筛选，outcome 独立；展示规范标签，未知 action 原文回退。
旧 writer、迁移、独立 verify、查询验收及旧备份恢复遵守[规范化手册](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/audit-action-canonicalization.md)。

## login_log 退役来源

新登录事件只写 audit_log，DB 不再导出旧 login_log schema/relations。
当前仓库没有旧 migrate:login-log-audit 的一次性实现；
[历史退役记录](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/audit-login-log-retirement-release.md)只供追溯，不可执行。
升级此类旧环境时，先备份并盘点，按当前 audit_log 另行制定 actor/target/action/outcome 与脱敏映射，
确认需保留记录完成迁移后再执行破坏性删除；不能假定当前分支能直接运行旧工具。
