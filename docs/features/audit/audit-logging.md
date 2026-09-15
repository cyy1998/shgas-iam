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

## 管理端单会话撤销

`admin.session.revoke` 记录管理员对一个 Principal Session 的精确撤销意图。审计 target 使用
`targetType: principal_session` 和内部 `principalSessionId`；details 只允许保存 scope、是否发生变化、各类撤销数量、
当前根会话例外/保护状态和 cleanup 失败数量。成功、幂等无变化和当前会话保护 failure 都需要审计。

该动作不得保存外部 token、lookup/HMAC 值、目标 Session Origin、任意 metadata、cleanup ref、cleanup failure 内容、
actor Principal Session ID 或原始异常。Redis 撤销作用先于 PostgreSQL 审计；若作用后的审计写入失败，系统使用
`ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` 明确状态可能已经变化，调用方刷新确认且不得自动重试撤销。

## 管理端用户级会话撤销

#191 统一会话候选的固定集合继续使用 `admin.session.revoke`，目标类型为 `session_batch`，不编造根会话 targetCode。
Details 保留新代实际 userSessions/clientSessions 终止数、排除/失败/未知，以及 alreadyTerminated/missing/expired/replaced
数量；不保存原集合 ID、instance、主体 context 或 actor 当前根。可重试 identity 只交付在管理响应中。
仅 unknown 而无确认变化时，之后的审计失败仍归 `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，不能误报无作用。

`admin.session.revoke_user` 记录管理员对一个用户执行点式 Session Revocation 的意图。审计 target 必须是
`targetType: user` 与目标用户 ID；details 只允许保存 scope、`changed`、各类 IAM 对象的脱敏撤销数量、
`currentPrincipalSessionExcluded` / `currentPrincipalSessionProtected` 当前根例外或保护状态，以及
`cleanupFailedCount`。成功、幂等无变化和因缺失服务端当前会话 ID 而触发的保护 failure 都需要审计。

该动作不得保存 actor 当前 Principal Session ID、目标 Session Origin、cleanup ref 或 error、原始异常、外部 token、
cookie、credential 标识或内容、lookup/HMAC 值或任意 session metadata；credential 只允许记录上述脱敏撤销数量。
`changed:true` 后审计写入失败沿用
`ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`：Redis 作用不回滚，调用方刷新确认且不得自动重试撤销。

## 管理端解除临时登录限制

`admin.login_restriction.release` 记录管理员对一个用户解除 Temporary Login Restriction 的意图。审计 target 使用
`targetType: user` 与 numeric user ID；details 只允许保存规范 cause `too_many_login_failures`、最后
`password` / `mobile` / `unknown` Trigger Method、`changed` 和 `failureStateCleared:true`。成功与幂等无变化都
必须记录；限制已自然过期或已由另一管理员处理时仍以 success outcome 记录 `changed:false`。

该动作不得保存失败成员、失败时间、Redis key、阈值/窗口配置、密码、验证码、token、cookie、session identifier、
actor Principal Session ID、原始异常或其他 provider 细节。Redis 原子清理先于 PostgreSQL 审计；
`changed:true` 后审计失败沿用 `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，作用不回滚，调用方刷新确认且不得
自动重试解除。解除不产生 Session Revocation 审计，因为它不影响任何已有 Principal Session。

## 历史 action 规范化

历史 `audit_log.action` 的八类登录别名由独立 Worker `audit:actions` 工具规范化，只修改 action，不改变 outcome 或其他审计事实。
当前代码候选已移除运行时别名：Admin API 合并去重单 action/多 actions 后精确查询，outcome 独立筛选；展示直接使用规范中文标签，未知 action 原文回退，不解释旧后缀。部署前须按[规范化与恢复手册](../../releases/audit-action-canonicalization.md)完成目标环境旧 writer 退出、迁移、独立 verify 与查询验收。
恢复迁移前备份同样需要重复门禁；迁移失败继续使用兼容候选。工具票与无别名票关闭均不表示目标数据已经迁移。

## `login_log` 已退役

新登录事件只写入 `audit_log`，`packages/db` 不再导出 legacy `login_log` schema 或 relations。删除 `login_log` 的数据库迁移属于破坏性迁移；生产执行前必须确认历史登录记录已经迁移到 `audit_log`，或确认当前环境没有需要保留的 legacy 登录记录。

仓库当前不再包含当时 `migrate:login-log-audit` 命令所需的一次性迁移实现。原始发布顺序和验收项保留在
[Historical 退役记录](../../releases/audit-login-log-retirement-release.md) 中，仅供追溯，不可作为当前可执行命令。

若仍有早于该退役版本的环境，升级前必须基于现有 `audit_log` schema 单独制定迁移方案：先备份并盘点 legacy 数据，
验证 actor、target、action、outcome 与脱敏 details 的映射，再确认待迁移数量归零。不得假设当前分支仍包含旧 schema
或旧迁移实现；失效的 `migrate:login-log-audit` script 注册也已移除。
