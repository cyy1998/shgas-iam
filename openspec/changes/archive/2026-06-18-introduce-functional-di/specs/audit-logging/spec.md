## MODIFIED Requirements

### Requirement: Business Audit Event Encapsulation
系统 SHALL 将业务审计事件的 action、target 和领域 details 拼装封装在 app 内的审计事件 helper 中；这些 helper SHALL be pure payload builders and MUST NOT directly persist audit logs. 业务 service SHALL 通过注入的 root 或 tx `AuditLogWriterPort` 写入 helper 构造的审计 payload，而不是在核心业务流程中重复内联完整审计 payload。底层 audit writer SHALL 继续负责 app 默认上下文、actor 规范化、request context、details 脱敏和持久化。

#### Scenario: API self-service audit event uses centralized helper
- **WHEN** public API 用户自助改密、找回密码或绑定手机号流程写入审计日志
- **THEN** 系统 SHALL 通过 `apps/api/src/services/audit/events` 下的 self-service audit helper 构造审计事件 payload
- **AND** 业务 service SHALL pass that payload to an injected `AuditLogWriterPort`
- **AND** 生成的审计记录 SHALL 保持既有 action、outcome、actor、target 和 details 语义

#### Scenario: API auth and internal audit events use centralized helpers
- **WHEN** API 认证、短信验证码、SSO、internal 权限委派或供应商注册流程写入审计日志
- **THEN** 系统 SHALL 通过 `apps/api/src/services/audit/events` 下的业务 audit helper 构造审计事件 payload
- **AND** route 或业务 service SHALL write the payload through injected audit writer behavior
- **AND** 路由或业务 service SHALL NOT 重复实现相同手机号脱敏和基础 target/details 拼装逻辑

#### Scenario: Admin mutation audit events use centralized helpers
- **WHEN** admin-api 用户、客户端、组织、岗位或任职 mutation 写入审计日志
- **THEN** 系统 SHALL 通过 `apps/admin-api/src/services/audit/events` 下的业务 audit helper 构造审计事件 payload
- **AND** admin mutation service SHALL write the payload through tx-bound `AuditLogWriterPort` when the mutation is inside a transaction
- **AND** 生成的审计记录 SHALL 保持既有 `admin.*` action、targetType 和 details 语义
