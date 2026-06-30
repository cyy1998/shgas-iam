## ADDED Requirements

### Requirement: Human Verification Logs Carry Request Observability
人机校验相关安全日志 SHALL 携带请求观测字段，使安全事件可与 HTTP request log、audit log 和 gateway access log 关联。

#### Scenario: Verification required log includes observability fields
- **WHEN** 风险策略判定某个 action 需要 Cap 人机校验
- **THEN** 后端 SHALL 输出稳定 `human_verification.required` 系统日志
- **AND** 日志 SHALL 包含 action、requestId、traceId、ip 和 subject 中可用字段
- **AND** 日志 MUST NOT 包含 Cap token 明文或 challenge solution 明文

#### Scenario: Token validation logs include observability fields
- **WHEN** Cap token 缺失、action 不匹配、校验失败或校验成功
- **THEN** 对应 `human_verification.token.*` 系统日志 SHALL 包含 action、requestId、traceId、ip 和 subject 中可用字段
- **AND** 缺少请求上下文时 requestId 和 traceId SHALL 记录为 null
- **AND** 日志 MUST NOT 包含 Cap token 明文

#### Scenario: Human verification context is derived from request context
- **WHEN** auth 或 open route 调用人机校验服务
- **THEN** route SHALL 从请求上下文派生 HumanVerificationContext
- **AND** service 层 SHALL NOT 直接依赖 Hono context 获取 requestId 或 traceId
