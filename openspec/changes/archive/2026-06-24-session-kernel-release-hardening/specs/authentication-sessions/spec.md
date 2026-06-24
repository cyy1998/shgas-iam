## ADDED Requirements

### Requirement: custom SSO 发布文档必须覆盖 Session Kernel 切换
系统 SHALL 在 custom SSO 接入或发布文档中说明 Session Kernel 切换后的运行边界、兼容风险和 smoke 验收要求。

#### Scenario: 文档说明 opaque token 与 legacy bearer 风险
- **WHEN** 维护者查看 custom SSO 接入或发布文档
- **THEN** 文档 SHALL 说明 PrincipalSession token、auth code 和 local session sid 都是 opaque bearer
- **AND** 文档 SHALL 说明 `Authorization` header 或 query `token` 作为 PrincipalSession 来源仅为 legacy 兼容路径
- **AND** 文档 MUST NOT 鼓励新 client 通过 URL query 传递 PrincipalSession token

#### Scenario: 文档说明旧 key 清理范围
- **WHEN** 维护者准备发布 custom SSO Session Kernel 版本
- **THEN** 文档 SHALL 列出必须清理的旧 custom SSO Redis namespace，包括 `global_session:*`、`auth_code:*`、`local_*_session:*`、`local_session_reverse:*` 和 `local_session_set:*`
- **AND** 文档 SHALL 说明清理后所有用户和 custom SSO client 都需要重新登录或重新发起授权

#### Scenario: 文档说明回滚前置条件
- **WHEN** 发布需要回滚到旧 custom SSO session 实现
- **THEN** 文档 SHALL 要求停止登录、authorize、callback、token 和 authz 流量
- **AND** 文档 SHALL 要求清理新版本 `sess:v2:` 相关 active/lookup/revoked/index key 以及 custom SSO 私有 payload key
- **AND** 文档 SHALL 要求回滚后重新执行 custom SSO 登录与网关鉴权 smoke

### Requirement: custom SSO Session Kernel smoke 必须覆盖网关鉴权主路径
系统 SHALL 在发布前验证 custom SSO 通过 Session Kernel 生成、兑换、鉴权和撤销 local session 的完整路径。

#### Scenario: Gateway 模式 smoke 成功
- **WHEN** smoke test 使用 Gateway 模式 client 完成登录、`/sso/authorize` 和 `/sso/callback`
- **THEN** 系统 SHALL 创建 custom SSO ClientBinding 和 local session IssuedCredential
- **AND** `/auth/authz` SHALL 使用 local session opaque token 返回兼容的 `X-User-Info`
- **AND** Redis 中 SHALL NOT 出现旧 `local_<client>_session:*` authority key

#### Scenario: Independent 模式 smoke 成功
- **WHEN** smoke test 使用 Independent 模式 client 完成登录、`/sso/authorize` 和 `/sso/token`
- **THEN** 响应 SHALL 返回兼容的 `sid`、`ttl` 和 `userInfo`
- **AND** local session sid SHALL 通过 Session Kernel credential lookup 校验
- **AND** Redis 中 SHALL NOT 出现旧 `local_session_reverse:*` 或 `local_session_set:*` authority key

#### Scenario: auth code 重放 smoke 被拒绝
- **WHEN** smoke test 第二次提交已经成功兑换的 custom SSO auth code
- **THEN** 请求 SHALL 被拒绝
- **AND** 系统 SHALL 命中 `reason=consumed` 的 artifact tombstone
- **AND** 系统 SHALL NOT 创建新的 ClientBinding、IssuedCredential 或 local session payload

#### Scenario: logout smoke 撤销派生对象
- **WHEN** smoke test 对已登录 PrincipalSession 调用 `/sso/logout`
- **THEN** 系统 SHALL 通过 Session Kernel 撤销该 PrincipalSession 下的 custom SSO binding、credential 和 artifact
- **AND** 后续 `/auth/authz` 使用旧 local session token SHALL 被拒绝
- **AND** cleanup failure 如发生 SHALL 只影响系统日志和 revoke summary，不得恢复已撤销 token

### Requirement: legacy PrincipalSession bearer source 必须可观测且不泄密
系统 SHALL 保留 custom SSO legacy PrincipalSession token 来源的兼容观测，并 SHALL 禁止在日志中输出 bearer 明文。

#### Scenario: Authorization header 来源被记录
- **WHEN** `/sso/authorize` 通过 `Authorization` header 解析到 PrincipalSession token
- **THEN** 系统 SHALL 输出稳定 system log event
- **AND** 日志 SHALL 包含 source、clientCode、requestId 和 sourceApp
- **AND** 日志 MUST NOT 包含 Authorization header 值、PrincipalSession token、Cookie 或完整 query

#### Scenario: query token 来源被记录
- **WHEN** `/sso/authorize` 通过 query `token` 解析到 PrincipalSession token
- **THEN** 系统 SHALL 输出稳定 system log event
- **AND** 日志 SHALL 标识该来源为 legacy query token
- **AND** 日志 MUST NOT 包含 query token 明文或完整 redirect URL query
