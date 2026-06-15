## MODIFIED Requirements

### Requirement: 内部服务鉴权
系统 SHALL 对 `/auth/internal-authz` 和 `/internal/*` 使用统一 internal client 身份校验。系统 MUST 仅将 `apikey` header 作为当前 internal client secret 准入凭据，且认证出的 client MUST 存在、未软删除并且 `status` 为 `ClientStatus.Enable`。系统 MUST NOT 因 `IP-Chain` header 命中任何内网片段而放行请求。

#### Scenario: apikey 匹配 active client
- **WHEN** `/auth/internal-authz` 请求提供的 `apikey` 能解析到未软删除且状态为 `ClientStatus.Enable` 的 client
- **THEN** 系统 SHALL 返回准许
- **AND** 成功响应 SHALL 使用 boolean data 表示准许结果

#### Scenario: internal middleware 写入认证上下文
- **WHEN** `/internal/*` 请求通过统一 internal client 身份校验
- **THEN** 系统 SHALL 在 Hono context 中提供认证出的 `clientCode`
- **AND** 系统 SHALL 在 Hono context 中提供认证出的 `clientDto`

#### Scenario: IP-Chain 不产生准入效果
- **WHEN** `/auth/internal-authz` 请求携带包含 `192.168.93.` 或 `192.168.73.88` 的 `IP-Chain` header，但缺少有效 `apikey`
- **THEN** 系统 SHALL 拒绝请求

#### Scenario: 缺少或无效服务凭据
- **WHEN** `/auth/internal-authz` 或 `/internal/*` 请求缺少 `apikey`，或 `apikey` 不能解析到 client
- **THEN** 系统 SHALL 拒绝请求

#### Scenario: inactive client 不得通过内部服务鉴权
- **WHEN** `/auth/internal-authz` 或 `/internal/*` 请求提供的 `apikey` 解析到软删除 client、`ClientStatus.Maintance` client 或 `ClientStatus.Disable` client
- **THEN** 系统 SHALL 拒绝请求
