## ADDED Requirements

### Requirement: 管理端 OIDC client 变更撤销 OIDC protocol 对象
系统 SHALL 在管理端 OIDC 配置、secret、启用状态、全局状态和删除变化后，通过 Session Kernel 主动撤销受影响 client 的 OIDC protocol 对象，并继续使 OIDC runtime cache 失效。

#### Scenario: OIDC configure 后撤销旧协议对象
- **WHEN** 管理员为 client configure OIDC 配置且事务成功提交
- **THEN** 系统 SHALL 继续更新 `oidcConfigVersion` 并使 OIDC runtime cache 失效
- **AND** 系统 SHALL 注册 best-effort Session Kernel 撤销任务
- **AND** 撤销任务 SHALL 撤销该 `clientCode` 下 `protocol=oidc` 的 active ClientBinding、IssuedCredential 和 ProtocolArtifact
- **AND** revocation reason SHALL 为 `client_config_changed`

#### Scenario: OIDC secret 轮换后撤销旧协议对象
- **WHEN** 管理员为 confidential OIDC client 轮换 secret 且新 secret hash 已保存
- **THEN** 系统 SHALL 继续只在本次响应返回新明文 secret
- **AND** 系统 SHALL 注册 best-effort Session Kernel 撤销任务撤销该 client 的 OIDC protocol 对象
- **AND** revocation reason SHALL 为 `client_config_changed`
- **AND** 系统日志和 RevokeSummary MUST NOT 包含新旧 secret 明文或 secret hash

#### Scenario: OIDC 禁用或移除后撤销协议对象
- **WHEN** 管理员 disable OIDC 或 remove OIDC 配置且事务成功提交
- **THEN** 系统 SHALL 注册 best-effort Session Kernel 撤销任务
- **AND** 撤销任务 SHALL 撤销该 `clientCode` 下 `protocol=oidc` 的 active 对象
- **AND** revocation reason SHALL 为 `client_protocol_disabled`
- **AND** 后续 OIDC authorize、token 或 UserInfo 请求 SHALL 因 runtime 配置不可用或 tombstone 被拒绝

#### Scenario: OIDC 启用后撤销旧版本对象
- **WHEN** 管理员 enable 已配置 OIDC client 且事务成功提交
- **THEN** 系统 SHALL 继续校验 client 全局状态为 Enable
- **AND** 系统 SHALL 注册 best-effort Session Kernel 撤销任务撤销旧 `oidcConfigVersion` 相关 OIDC protocol 对象
- **AND** revocation reason SHALL 为 `client_config_changed`

#### Scenario: client 全局状态影响 OIDC protocol
- **WHEN** 管理员将 client 全局 status 变更为 `Disable`、`Maintance` 或软删除该 client
- **THEN** 系统 SHALL 使 OIDC runtime cache 失效
- **AND** 对 `Disable` 或软删除，系统 SHALL 撤销该 client 的 OIDC protocol 对象
- **AND** 对 `Maintance`，系统 SHALL 撤销该 client 的 OIDC protocol 对象
- **AND** revocation reason SHALL 分别反映 `client_disabled`、`client_deleted` 或 `client_config_changed`

#### Scenario: OIDC invalidation 与 Session Kernel 撤销统一记录
- **WHEN** OIDC client 变更触发 runtime cache invalidation、pubsub invalidation 和 Session Kernel revoke
- **THEN** 系统 SHALL 通过同一个 admin-api Session Revocation port 编排这些副作用
- **AND** 系统 SHALL 为该 afterCommit task 记录一次统一 summary system log
- **AND** 重复收到 provider 侧 invalidation 时，Kernel revoke SHALL 保持幂等

#### Scenario: OIDC client 服务测试覆盖撤销触发
- **WHEN** 执行 admin-api client 服务单元测试
- **THEN** 测试 SHALL 覆盖 configure、enable、disable、remove、rotate-secret、global status change 和 delete 触发 OIDC protocol revoke
- **AND** 测试 SHALL 覆盖 OIDC runtime cache invalidation failure 或 Kernel cleanup failure 进入 best-effort summary
