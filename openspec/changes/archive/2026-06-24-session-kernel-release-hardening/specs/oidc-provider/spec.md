## ADDED Requirements

### Requirement: OIDC 发布回滚手册必须覆盖 Session Kernel runtime
系统 SHALL 更新 OIDC 发布与回滚手册，使其覆盖 Session Kernel namespace、HMAC lookup、旧 runtime key 清理和强制重新登录。

#### Scenario: 发布前提包含 Session Kernel 配置
- **WHEN** 维护者查看 OIDC 发布前提
- **THEN** 手册 SHALL 要求配置 `SESSION_KERNEL_NAMESPACE`、principal TTL、tombstone TTL、tombstone grace、`SESSION_LOOKUP_HMAC_CURRENT_ID` 和 `SESSION_LOOKUP_HMAC_CURRENT_SECRET`
- **AND** 手册 SHALL 说明 previous HMAC key 只用于平滑 lookup rotation
- **AND** 生产环境 SHALL NOT 使用开发默认 HMAC secret

#### Scenario: 发布步骤包含旧 key cleanup
- **WHEN** 维护者按 OIDC 发布手册执行 Session Kernel 版本上线
- **THEN** 手册 SHALL 要求在维护窗口内停止 authorize、token、UserInfo、logout、login return handle 和 session refresh/renewal 流量
- **AND** 手册 SHALL 要求清理旧 `global_session:*`、custom SSO local session key 和旧 OIDC provider runtime/index key
- **AND** 手册 SHALL 要求清理完成后所有用户重新登录

#### Scenario: 回滚步骤包含新 key cleanup
- **WHEN** OIDC provider 需要回滚到不理解 Session Kernel 的旧版本
- **THEN** 手册 SHALL 要求先关闭 APISIX `/oidc` 路由或停止 OIDC 流量
- **AND** 手册 SHALL 要求清理 `sess:v2:` active/lookup/revoked/index key 和 OIDC adapter 私有 payload key
- **AND** 手册 SHALL 要求回滚后重新执行 custom SSO 与 OIDC smoke test

### Requirement: OIDC Session Kernel smoke 必须覆盖核心协议路径
系统 SHALL 在发布前验证 OIDC provider 通过 Session Kernel 完成登录判断、code 登记、token 签发、UserInfo 校验和 logout 撤销。

#### Scenario: authorize 和 token smoke 成功
- **WHEN** smoke test 使用合法 OIDC client 完成 Authorization Code Flow
- **THEN** provider SHALL 通过 Session Kernel PrincipalSession 判断登录
- **AND** provider SHALL 为 authorization code 登记 Kernel ProtocolArtifact ref
- **AND** token endpoint SHALL 消费 code 并为 opaque access token 登记 Kernel IssuedCredential

#### Scenario: UserInfo smoke 使用 Kernel credential 校验
- **WHEN** smoke test 使用 token endpoint 返回的 access token 调用 UserInfo
- **THEN** provider SHALL 先通过 Session Kernel credential lookup 校验 tombstone、credential、binding、PrincipalSession、user、client 和 config version
- **AND** UserInfo SHALL 只在校验通过后返回 scope 控制的 claims

#### Scenario: authorization code 重放 smoke 被拒绝
- **WHEN** smoke test 第二次提交已经成功兑换的 authorization code
- **THEN** token endpoint SHALL 拒绝请求
- **AND** 已消费 code SHALL 命中 `reason=consumed` 的 artifact tombstone
- **AND** provider SHALL NOT 签发新的 access token 或 ID Token

#### Scenario: RP-Initiated Logout smoke 撤销当前 PrincipalSession
- **WHEN** smoke test 调用 OIDC RP-Initiated Logout
- **THEN** provider SHALL 通过 Session Kernel 撤销当前浏览器 PrincipalSession
- **AND** 后续使用关联 access token 调用 UserInfo SHALL 被拒绝
- **AND** cleanup failure 如发生 SHALL 被记录但不得恢复已写 tombstone

### Requirement: OIDC runtime 不得接受旧 session envelope
系统 SHALL 在 Session Kernel 发布后拒绝旧 global session envelope 和旧 OIDC runtime token index 作为有效登录或 token 状态来源。

#### Scenario: 旧 global_session envelope 存在
- **WHEN** Redis 中仍存在旧 `global_session:*` envelope 或裸用户 DTO session
- **THEN** OIDC provider SHALL 将其视为未登录或无效 session
- **AND** provider SHALL NOT 将旧 payload 迁移为 PrincipalSession

#### Scenario: 旧 OIDC token index 存在
- **WHEN** Redis 中仍存在旧 OIDC access token user/client/global-session index
- **THEN** UserInfo、logout 和 active revoke SHALL NOT 以旧 index 作为权威来源
- **AND** 发布 cleanup SHALL 删除这些旧 index，避免运维误判 token 仍有效
