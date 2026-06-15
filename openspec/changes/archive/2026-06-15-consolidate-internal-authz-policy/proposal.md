## Why

当前内部服务鉴权存在两套行为：`/internal/*` 使用共享 internal middleware，而 `/auth/internal-authz` 手写 `apikey` 校验并信任 `IP-Chain` header 白名单。`IP-Chain` 在仓库内没有可信注入证据，继续作为应用层绕过条件会让内部认证策略分叉，并保留可伪造 header 绕过风险。

## What Changes

- 移除 `/auth/internal-authz` 对 `IP-Chain` 的准入语义，内部服务鉴权统一只依赖 client secret。
- 将 `/auth/internal-authz` 与 `/internal/*` 收敛到同一个 internal client 身份校验原语。
- internal client 必须存在、未软删除且状态为 `ClientStatus.Enable`；维护中、停用和软删除 client 均不得通过。
- 认证成功后在 Hono context 中提供 `clientCode` 与 `clientDto`，供后续 internal route、日志或审计复用。
- 收窄 tender dev/prod gateway `forward-auth` 到 `/auth/internal-authz` 的请求头契约，只转发 `apikey`。
- 修正 `/auth/internal-authz` 的 OpenAPI 成功响应 schema，使其与 `resp.ok(true)` 一致。
- **BREAKING**: 依赖 `IP-Chain` 白名单且不提供有效 `apikey` 的旧调用方将无法通过 `/auth/internal-authz`。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `authentication-sessions`: 内部服务鉴权从 `IP-Chain` 或 `apikey` 二选一，改为仅接受有效 client secret，并要求 active client。
- `gateway-configuration-management`: 仓库管理的 tender internal forward-auth route 只向 IAM internal authz endpoint 转发 `apikey`。

## Impact

- 影响 `packages/api-core` 的 internal authentication helper、middleware 类型和测试。
- 影响 `apps/api` 的 `/auth/internal-authz` handler、OpenAPI route schema 和相关测试。
- 影响 `gateway/manifests/dev/tender/routes.yaml` 与 `gateway/manifests/prod/tender/routes.yaml` 的 `forward-auth.request_headers`。
- 影响 OpenSpec 主规格中的 `authentication-sessions` 与 `gateway-configuration-management` requirements。
