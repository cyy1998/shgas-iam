## Why

当前统一审计日志模型已经有 `outcome = "success" | "failure"`，但登录事件仍把成功和失败编码进
`action`，形成 `auth.login.password.success` / `auth.login.password.failure` 这类双重事实来源。随着
OIDC client 审计动作继续扩展，审计动作定义也开始分散在规格、后端 helper 和前端展示映射中，容易造成筛选、统计和展示语义不一致。

## What Changes

- 统一审计动作语义：`action` SHALL 表达业务动作本身，`outcome` SHALL 表达执行结果，失败原因和差异化上下文保存在 `details`。
- 将新写入的登录审计动作从 `auth.login.<type>.<outcome>` 规范化为 `auth.login.<type>`，覆盖 password、mobile、local、oa 和 wechat 登录。
- 保留历史登录 action 的兼容查询和展示能力，不批量覆写既有审计记录。
- 建立应用内可复用的审计动作目录/标签来源，减少后端写入、规格和管理端 action 选项之间的漂移。
- 补齐 OIDC client 审计动作在主审计日志能力和管理端展示中的规范名称。
- 不改变 `audit_log` 表结构，不改变 `outcome`、actor、target、request context 或敏感信息脱敏模型。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `audit-logging`: 规范审计动作与结果的职责边界，规范化登录 action，要求兼容历史登录 action，并要求管理端 action 过滤/展示来自同一动作目录。
- `oidc-client-registry`: 将 OIDC client 管理审计动作精确对齐到规范 action 名称。

## Impact

- 后端写入：`apps/api/src/services/audit/events/auth.audit.ts` 登录事件 helper 及相关测试。
- 管理端查询：`apps/admin-api/src/services/audit` 的 action 查询兼容逻辑和测试。
- 管理端展示：`apps/admin/src/pages/audit-logs` 的 action 标签、选项和 legacy action 展示策略。
- 共享契约：可在 `packages/domain/src/audit` 增加审计动作常量、元数据或 helper，供后端和管理端复用。
- OpenSpec：更新 `audit-logging` 和 `oidc-client-registry` 的 delta specs。
