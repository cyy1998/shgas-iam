## Why

OIDC claims 模块直接实现 `oidc-provider` 的 protocol hooks，却仍以 `*Service` 命名；同时 composition 的 `services` 聚合混装 provider、security 与 session 组件，掩盖了真实 ownership。现在需要校正命名和 wiring 分类，以便后续 consumer-owned port 收敛建立在清晰的协议边界上。

## What Changes

- 将 `createOidcClaimsService`、`OidcClaimsService` 及其 deps 命名改为 Claims Adapter 语义，继续保留在 `provider/claims.ts`。
- 移除异构的 `composition/services` 聚合，按 provider、security、session ownership 组织 claims、interaction policy、client auth rate limiter、client secret verifier 与 global session resolver wiring。
- 让 provider/interaction wiring 直接消费 session composition 提供的 resolver，不再通过 `services.globalSessionResolver` 二次分类。
- 增强 characterization tests 与 architecture guards，锁定 claims snapshot、token extra、binding/config validation、invalid credential revocation 和 provider wiring，并阻止 `*Service` 命名或混合 services 聚合回退。
- 保持 discovery metadata、OIDC/OAuth flows、claims/token/session 行为、Redis/provider storage、issuer endpoints 与部署拓扑不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `backend-functional-di`: 明确 OIDC claims protocol adapter 的注入边界、provider/security/session composition ownership 与对应 architecture guard。
- `backend-structure-conventions`: 规定 Claims Adapter 命名和位置、OIDC composition 分类，并要求迁移保持现有协议与运行时契约。

## Impact

- 影响 `apps/oidc-provider/src/provider/claims.ts`、provider configuration/runtime wiring 和相关 type imports。
- 影响 `apps/oidc-provider/src/composition/{provider,security,session}` 及移除的 `composition/services` 聚合。
- 影响 OIDC claims、configuration、provider wiring、session security、token flow 与 architecture tests。
- 不改变 public issuer endpoints、OIDC metadata、supported flows、claims shape、token/session lifetime、数据库 schema、Redis keyspace、workspace dependencies 或部署拓扑。
