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

## `login_log` 已退役

新登录事件只写入 `audit_log`，`packages/db` 不再导出 legacy `login_log` schema 或 relations。删除 `login_log` 的数据库迁移属于破坏性迁移；生产执行前必须确认历史登录记录已经迁移到 `audit_log`，或确认当前环境没有需要保留的 legacy 登录记录。

仓库当前不再包含当时 `migrate:login-log-audit` 命令所需的一次性迁移实现。原始发布顺序和验收项保留在
[Historical 退役记录](../../releases/audit-login-log-retirement-release.md) 中，仅供追溯，不可作为当前可执行命令。

若仍有早于该退役版本的环境，升级前必须基于现有 `audit_log` schema 单独制定迁移方案：先备份并盘点 legacy 数据，
验证 actor、target、action、outcome 与脱敏 details 的映射，再确认待迁移数量归零。不得假设当前分支仍包含旧 schema
或旧迁移实现；即使旧 script key 仍出现在某个历史 package 配置中，也不得把它视为可运行入口。
