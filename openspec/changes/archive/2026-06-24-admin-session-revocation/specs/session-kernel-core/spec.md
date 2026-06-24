## ADDED Requirements

### Requirement: Session Kernel 支持管理端带排除项的批量撤销
系统 SHALL 为管理端调用方提供稳定的批量撤销语义，使其可以撤销 user sessions、client protocol、client all protocols，并在需要时保留当前 PrincipalSession 本体。

#### Scenario: 按 user 撤销并保留当前 PrincipalSession
- **WHEN** 管理端调用方按 `principalType=user`、`subjectId` 撤销 sessions，并提供 `exceptPrincipalSessionId`
- **THEN** Session Kernel SHALL 撤销该 user 除 `exceptPrincipalSessionId` 以外的 active PrincipalSession
- **AND** Session Kernel SHALL 撤销被排除 PrincipalSession 下的 active ClientBinding、IssuedCredential 和 ProtocolArtifact
- **AND** Session Kernel SHALL NOT 为被排除 PrincipalSession 本体写入 revoked tombstone
- **AND** RevokeSummary SHALL 区分被撤销对象与被排除对象

#### Scenario: 按 user 撤销不提供排除项
- **WHEN** 管理端调用方按 `principalType=user`、`subjectId` 撤销 sessions 且不提供排除项
- **THEN** Session Kernel SHALL 撤销该 user 的所有 active PrincipalSession
- **AND** Session Kernel SHALL 级联撤销这些 PrincipalSession 下的 ClientBinding、IssuedCredential 和 ProtocolArtifact

#### Scenario: 按 client protocol 撤销
- **WHEN** 管理端调用方按 `clientCode` 和 `protocol` 撤销对象
- **THEN** Session Kernel SHALL 撤销该 client + protocol 索引下的 active ClientBinding、IssuedCredential 和 ProtocolArtifact
- **AND** Session Kernel SHALL NOT 撤销同一 client 下其他 protocol 的对象
- **AND** RevokeSummary SHALL 聚合 revoked、alreadyRevoked、missing 和 cleanup 计数

#### Scenario: 按 client 撤销全部协议
- **WHEN** 管理端调用方按 `clientCode` 撤销全部协议对象
- **THEN** Session Kernel SHALL 撤销该 client 索引下的 active ClientBinding、IssuedCredential 和 ProtocolArtifact
- **AND** Session Kernel SHALL NOT 撤销其他 client 的对象

#### Scenario: cleanup adapter 缺失进入 summary
- **WHEN** 被撤销对象包含 cleanupRefs
- **AND** 当前 Kernel 实例未配置匹配的 cleanup adapter
- **THEN** Session Kernel SHALL 保持 tombstone 已写入
- **AND** RevokeSummary SHALL 将这些 cleanupRefs 计入 cleanup attempted 和 failed
- **AND** failure detail SHALL 标识 protocol、kind 和受控 ref，不得包含 external token 明文

#### Scenario: 管理端撤销 API 测试覆盖
- **WHEN** 执行 `@iam/api-core` Session Kernel 测试
- **THEN** 测试 SHALL 覆盖 user revoke with except current、client protocol revoke、client all protocols revoke 和 cleanup adapter missing summary
- **AND** 测试 SHALL 验证重复撤销保持幂等且不覆盖既有 tombstone reason
