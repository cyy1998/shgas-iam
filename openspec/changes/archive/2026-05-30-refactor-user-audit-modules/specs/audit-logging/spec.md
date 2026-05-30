## ADDED Requirements

### Requirement: Business Audit Event Encapsulation
系统 SHALL 将业务审计事件的 action、target 和领域 details 拼装封装在 app 内的审计事件 helper 中；业务 service SHALL 调用这些 helper 写入审计日志，而不是在核心业务流程中重复内联完整审计 payload。底层 `audit.service.ts` SHALL 继续只负责 app 默认上下文、actor 规范化、request context、details 脱敏和持久化。

#### Scenario: API self-service audit event uses centralized helper
- **WHEN** public API 用户自助改密、找回密码或绑定手机号流程写入审计日志
- **THEN** 系统 SHALL 通过 `apps/api/src/services/audit/events` 下的 self-service audit helper 构造审计事件
- **AND** 生成的审计记录 SHALL 保持既有 action、outcome、actor、target 和 details 语义

#### Scenario: API auth and internal audit events use centralized helpers
- **WHEN** API 认证、短信验证码、SSO、internal 权限委派或供应商注册流程写入审计日志
- **THEN** 系统 SHALL 通过 `apps/api/src/services/audit/events` 下的业务 audit helper 构造审计事件
- **AND** 路由或业务 service SHALL NOT 重复实现相同手机号脱敏和基础 target/details 拼装逻辑

#### Scenario: Admin mutation audit events use centralized helpers
- **WHEN** admin-api 用户、客户端、组织、岗位或任职 mutation 写入审计日志
- **THEN** 系统 SHALL 通过 `apps/admin-api/src/services/audit/events` 下的业务 audit helper 构造审计事件
- **AND** 生成的审计记录 SHALL 保持既有 `admin.*` action、targetType 和 details 语义

### Requirement: Shared Audit Masking Helpers
系统 SHALL 为审计日志中重复使用的敏感字段摘要提供共享 helper；手机号审计脱敏 SHALL 使用统一函数输出，避免各 service 和 route 重复定义正则替换逻辑。

#### Scenario: Mobile number masking is reused by audit events
- **WHEN** 审计事件 details 或 targetCode 需要记录手机号摘要
- **THEN** 系统 SHALL 使用共享手机号审计脱敏 helper
- **AND** 完整手机号 MUST NOT 以明文写入审计日志

#### Scenario: Audit service still redacts sensitive details
- **WHEN** 业务 audit helper 传入 details
- **THEN** `audit.service.ts` SHALL 继续调用 `redactAuditDetails`
- **AND** 密码、验证码、token、cookie 和 client secret 等敏感字段 MUST NOT 以明文持久化
