## ADDED Requirements

### Requirement: 管理端会话撤销输出结构化系统日志
系统 SHALL 为 admin-api 触发的 Session Kernel 主动撤销输出结构化系统日志，使 revoke summary、cleanup failure 和 afterCommit best-effort failure 可被 Loki/Grafana 检索。

#### Scenario: 用户会话撤销记录 summary
- **WHEN** admin-api 用户状态、删除或重置密码 afterCommit 撤销任务完成
- **THEN** 系统 SHALL 输出 `event="admin.session_revoke.user"` 的 JSON system log
- **AND** 日志 SHALL 包含 `sourceApp="iam-admin-api"`、requestId、traceId、actorUserId、targetUserId、reason 和 RevokeSummary counters
- **AND** 日志 SHALL NOT 包含 password、password hash、cookie、Authorization 或 external token

#### Scenario: client protocol 撤销记录 summary
- **WHEN** admin-api client 或 OIDC 配置变更 afterCommit 撤销任务完成
- **THEN** 系统 SHALL 输出 `event="admin.session_revoke.client_protocol"` 或 `event="admin.session_revoke.client_all_protocols"` 的 JSON system log
- **AND** 日志 SHALL 包含 clientCode、protocol、reason、revoke counters 和 cleanup counters
- **AND** 日志 SHALL NOT 包含 clientSecret、OIDC secret hash、local session token、access token 或完整 cleanup payload

#### Scenario: cleanup failure 单独可检索
- **WHEN** RevokeSummary cleanup failed 计数大于 0
- **THEN** 系统 SHALL 输出 `event="admin.session_revoke.cleanup_failed"` 的 warning system log
- **AND** 日志 SHALL 包含 protocol、kind、ref 计数、failure message 摘要、requestId 和 clientCode 或 targetUserId
- **AND** 日志 MUST NOT 把 cleanup payload、token、secret 或 cookie 写入日志

#### Scenario: afterCommit revoke 失败可观测
- **WHEN** best-effort afterCommit revoke task 抛出未被 RevokeSummary 捕获的异常
- **THEN** 系统 SHALL 保留现有 afterCommit warning log
- **AND** 系统 SHALL 输出或关联稳定 afterCommit task name，例如 `admin.session_revoke.user` 或 `admin.session_revoke.client_protocol`
- **AND** 管理端业务响应 SHALL 不因该 best-effort failure 改为失败

#### Scenario: 系统日志测试覆盖敏感字段
- **WHEN** 执行 admin-api session revocation logger 单元测试
- **THEN** 测试 SHALL 验证 summary 日志包含 counters、actor、target、reason 和 protocol 字段
- **AND** 测试 SHALL 验证日志不会包含 password、clientSecret、Authorization、Cookie、external token 或 secret hash
