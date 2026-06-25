## ADDED Requirements

### Requirement: OIDC provider 不得构造旧会话 Redis stores
OIDC provider SHALL 使用 Session Kernel adapter 管理 global session resolution、provider session binding 和 return handle，生产 composition SHALL NOT 构造迁移前旧 Redis stores 作为运行时依赖。

#### Scenario: Provider composition 注入 Session Kernel adapter
- **WHEN** OIDC provider runtime、services、interaction handler、claims service 或 redis adapter 需要 global session、provider session binding 或 return handle 能力
- **THEN** composition SHALL 注入 `oidcSession` 或等价 Session Kernel-backed port
- **AND** composition SHALL NOT 注入旧 `global-session.store`、`provider-session-binding.store` 或 `return-handle.store`

#### Scenario: Provider session binding 不使用 legacy bindingId
- **WHEN** OIDC provider 将 provider session uid 绑定到 IAM PrincipalSession
- **THEN** provider SHALL 通过 Session Kernel 创建 `protocol=oidc` 的 ClientBinding
- **AND** provider SHALL NOT 生成 `legacy:<sessionUid>` 或 `legacy:pending` bindingId 作为运行时 provider session binding

#### Scenario: Return handle 使用 Kernel artifact
- **WHEN** OIDC provider 需要在 SSO portal 与 provider interaction 之间创建登录返回 handle
- **THEN** provider SHALL 创建 `protocol=oidc`、`artifactType=login_return_handle` 的 Session Kernel ProtocolArtifact
- **AND** provider SHALL 通过 Session Kernel 原子消费该 artifact
- **AND** provider SHALL NOT 写入或读取旧 `oidc:login-return:*` store key 作为 return handle 权威来源

#### Scenario: 旧 store 模块不可被生产代码引用
- **WHEN** 执行 `@iam/oidc-provider` typecheck 或架构测试
- **THEN** 生产代码 SHALL NOT import 旧 `stores/global-session.store.ts`、`stores/provider-session-binding.store.ts` 或 `stores/return-handle.store.ts`
- **AND** 只覆盖旧 store 的测试 SHALL 被删除或迁移到 Session Kernel adapter 行为测试
