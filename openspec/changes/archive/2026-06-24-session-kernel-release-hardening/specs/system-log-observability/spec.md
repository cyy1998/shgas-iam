## ADDED Requirements

### Requirement: Session Kernel release hardening logs must be structured
系统 SHALL 为 Session Kernel 发布硬化输出稳定 JSON system log，使 legacy cleanup、schema corruption、tombstone replay 和 cleanup failure 可被 Loki/Grafana 检索。

#### Scenario: legacy key cleanup 完成
- **WHEN** 旧 Redis session key cleanup dry-run 或 apply 完成
- **THEN** 系统 SHALL 输出 `event="session_kernel.cleanup_legacy_keys.completed"` 的 JSON system log
- **AND** 日志 SHALL 包含 sourceApp、mode、patternCounts、deletedCounts、durationMs 和 result
- **AND** 日志 MUST NOT 包含完整 Redis key、session token、authorization code、access token、cookie 或 secret

#### Scenario: legacy key cleanup 失败
- **WHEN** 旧 Redis session key cleanup dry-run 或 apply 失败
- **THEN** 系统 SHALL 输出 `event="session_kernel.cleanup_legacy_keys.failed"` 的 warning 或 error system log
- **AND** 日志 SHALL 包含 sourceApp、mode、failedPattern、errorName、errorMessage 和已完成的 pattern summary
- **AND** 日志 MUST NOT 包含 Redis password、完整 Redis URL、完整 key、token 或 secret

#### Scenario: Kernel schema corrupted
- **WHEN** Session Kernel resolve、consume、renew 或 revoke 读取到不符合 Zod schema 的 lifecycle payload
- **THEN** 系统 SHALL 输出 `event="session_kernel.schema_corrupted"` 的 warning system log
- **AND** 日志 SHALL 包含 sourceApp、objectType、protocol、clientCode、reason、requestId 或 traceId 中可用字段
- **AND** 日志 MUST NOT 包含 corrupted payload 原文、external bearer token 或完整 Redis key

#### Scenario: tombstone replay detected
- **WHEN** Session Kernel 检测到已消费 artifact 或已撤销 credential/principal/binding 的 replay
- **THEN** 系统 SHALL 输出 `event="session_kernel.tombstone_replay.detected"` 的 info 或 warning system log
- **AND** 日志 SHALL 包含 sourceApp、objectType、protocol、credentialType 或 artifactType、clientCode、reason 和 requestId 中可用字段
- **AND** 日志 MUST NOT 包含被重放的 token、code、sid、Authorization header 或 Cookie

#### Scenario: runtime cleanup failure 可检索
- **WHEN** Session Kernel revoke summary 包含 cleanup failed 计数
- **THEN** 系统 SHALL 输出稳定 cleanup failure system log
- **AND** 日志 SHALL 包含 sourceApp、protocol、kind、refType、failure count、reason、clientCode 或 targetUserId 中可用字段
- **AND** 日志 MUST NOT 包含 cleanup payload、adapter 私有 payload、external token、clientSecret 或 cookie

### Requirement: Session Kernel 日志敏感字段必须有测试覆盖
系统 SHALL 为 Session Kernel 发布硬化日志提供敏感字段测试，证明系统日志不会泄露 bearer token、secret、cookie 或私有 payload。

#### Scenario: cleanup 日志不泄露 key 明文
- **WHEN** 执行 cleanup logging 测试
- **THEN** 测试 SHALL 构造包含 token-like Redis key 的 dry-run/apply 结果
- **AND** 输出日志 SHALL 包含 pattern summary 和 count
- **AND** 输出日志 MUST NOT 包含 token-like key 明文

#### Scenario: runtime 日志不泄露 bearer
- **WHEN** 执行 Session Kernel runtime logging 测试
- **THEN** 测试 SHALL 覆盖 schema corrupted、tombstone replay 和 cleanup failure 日志
- **AND** 输出日志 MUST NOT 包含 PrincipalSession token、custom SSO auth code、local session sid、OIDC authorization code、access token、Authorization header 或 Cookie

#### Scenario: admin revoke 日志保留 summary
- **WHEN** 执行 admin-api session revoke logger 测试
- **THEN** 输出日志 SHALL 包含 revoke counters、cleanup counters、actor、target、clientCode、protocol 和 reason 中适用字段
- **AND** 输出日志 MUST NOT 包含 password、clientSecret、secret hash、external token 或 cleanup payload

### Requirement: Session Kernel release smoke logs must be queryable
系统 SHALL 在发布 smoke 期间产生可用于验收记录的系统日志证据，并 SHALL 保持 event name 稳定。

#### Scenario: custom SSO smoke 日志可查询
- **WHEN** custom SSO smoke 使用 legacy bearer source、auth code replay 或 logout cleanup failure 路径
- **THEN** Loki/Grafana SHALL 能通过稳定 event name、sourceApp、clientCode、requestId 和时间范围查询到对应系统日志
- **AND** 查询结果 MUST NOT 暴露 bearer token、auth code、sid 或 cookie

#### Scenario: OIDC smoke 日志可查询
- **WHEN** OIDC smoke 使用 authorization code replay、UserInfo tombstone 或 logout cleanup failure 路径
- **THEN** Loki/Grafana SHALL 能通过稳定 event name、sourceApp、clientCode、requestId 和时间范围查询到对应系统日志
- **AND** 查询结果 MUST NOT 暴露 authorization code、access token、ID Token、PKCE verifier、clientSecret 或 cookie

#### Scenario: admin revoke smoke 日志可查询
- **WHEN** admin 用户或 client 变更触发 Session Kernel revoke
- **THEN** Loki/Grafana SHALL 能通过 `admin.session_revoke.*` event、sourceApp、targetUserId 或 clientCode、reason 和时间范围查询到 revoke summary
- **AND** 查询结果 SHALL 包含 cleanup counters
- **AND** 查询结果 MUST NOT 暴露 external token、secret 或 cleanup payload
