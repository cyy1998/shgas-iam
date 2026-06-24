## ADDED Requirements

### Requirement: 管理端 client 变更撤销 Session Kernel 会话
系统 SHALL 在管理端 client 状态、删除、secret 和 custom SSO 会话相关配置变化后，通过 Session Kernel 主动撤销受影响 client 的会话对象。

#### Scenario: client 被禁用后撤销全部协议对象
- **WHEN** 管理员将 client status 变更为 `Disable`
- **THEN** 系统 SHALL 在 client 事务成功提交且 client cache 同步任务注册后，注册 best-effort Session Kernel 撤销任务
- **AND** 撤销任务 SHALL 调用 admin-api Session Revocation port 撤销该 `clientCode` 下全部协议对象
- **AND** revocation reason SHALL 为 `client_disabled`
- **AND** 撤销范围 SHALL 包含该 client 的 custom SSO ClientBinding、IssuedCredential、ProtocolArtifact 和 OIDC protocol 对象

#### Scenario: client 被软删除后撤销全部协议对象
- **WHEN** 管理员软删除 client 且事务成功提交
- **THEN** 系统 SHALL 继续删除该 client code 和 secret 的 runtime cache
- **AND** 系统 SHALL 注册 best-effort Session Kernel 撤销任务撤销该 `clientCode` 下全部协议对象
- **AND** revocation reason SHALL 为 `client_deleted`

#### Scenario: custom SSO 会话相关配置变化后撤销 custom-sso 对象
- **WHEN** 管理员更新 client 且 `clientSecret`、`extAttributes.validRedirectUrls`、`extAttributes.callbackEndpoint`、`extAttributes.logoutEndpoint`、`extAttributes.managementLevel` 或 `extAttributes.requireOrcas` 发生变化
- **THEN** 系统 SHALL 在事务成功提交后注册 best-effort Session Kernel 撤销任务
- **AND** 撤销任务 SHALL 只撤销该 `clientCode` 下 `protocol=custom-sso` 的 active ClientBinding、IssuedCredential 和 ProtocolArtifact
- **AND** revocation reason SHALL 为 `client_config_changed`
- **AND** 系统 SHALL NOT 因该 custom SSO 配置变化撤销其他 client 的会话对象

#### Scenario: custom SSO maintenance 不主动撤销 local session
- **WHEN** 管理员将 client status 变更为 `Maintance`
- **THEN** 系统 SHALL 保持 custom SSO maintenance 的运行时拒绝语义
- **AND** 系统 SHALL NOT 仅因 custom SSO maintenance 主动撤销该 client 的 custom-sso local session credential
- **AND** OIDC protocol 对象撤销 SHALL 由 `oidc-client-registry` 能力处理

#### Scenario: 非会话相关 client 字段变化不触发 custom-sso 撤销
- **WHEN** 管理员只更新 clientName、description、url、orderNum 或其他不影响会话有效性的展示字段
- **THEN** 系统 SHALL 继续同步 client runtime cache
- **AND** 系统 SHALL NOT 注册 custom-sso Session Kernel 撤销任务

#### Scenario: client 撤销失败不阻断 cache 同步和业务结果
- **WHEN** client 更新或删除事务已经提交
- **AND** Session Kernel revoke 或 adapter cleanup 失败
- **THEN** 系统 SHALL 保持 client cache required afterCommit 语义
- **AND** 管理端操作 SHALL 不因 best-effort session revoke failure 回滚或改为业务失败
- **AND** 系统 SHALL 记录包含 RevokeSummary 的 system log

#### Scenario: client 服务测试覆盖撤销触发
- **WHEN** 执行 admin-api client 服务单元测试
- **THEN** 测试 SHALL 覆盖 status Disable、soft delete、clientSecret rotation 和 custom SSO 会话相关 extAttributes 变化触发撤销
- **AND** 测试 SHALL 覆盖 status Maintance 不主动撤销 custom-sso local session
- **AND** 测试 SHALL 覆盖非会话字段更新不触发撤销
