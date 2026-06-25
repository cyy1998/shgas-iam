## ADDED Requirements

### Requirement: OIDC provider runtime env 使用 IAM_OIDC_PROVIDER contract
`apps/oidc-provider` SHALL 使用 `IAM_OIDC_PROVIDER_*` raw env contract 配置 provider runtime，并 SHALL 在 `env.ts` 中转换为 camelCase runtime config。

#### Scenario: OIDC 协议配置使用 app-prefixed raw env
- **WHEN** OIDC provider 解析 issuer、public origin、SSO login path、cookie keys、signing JWK、token TTL、client cache TTL、bcrypt cost、client auth failure limit 或 trust proxy 配置
- **THEN** raw env schema SHALL use `IAM_OIDC_PROVIDER_*` keys for those values
- **AND** raw env schema MUST NOT accept legacy `OIDC_*` keys as fallback

#### Scenario: OIDC runtime code 使用 camelCase config
- **WHEN** provider configuration、HTTP server、interaction handler、stores、session composition 或 logger 需要 OIDC runtime config
- **THEN** runtime code SHALL read camelCase config fields exported by `env.ts`
- **AND** runtime code outside `env.ts` and env tests MUST NOT reference raw `IAM_OIDC_PROVIDER_*` key names

## MODIFIED Requirements

### Requirement: OIDC 发布回滚手册必须覆盖 Session Kernel runtime
系统 SHALL 更新 OIDC 发布与回滚手册，使其覆盖 Session Kernel namespace、HMAC lookup、旧 runtime key 清理和强制重新登录。

#### Scenario: 发布前提包含 Session Kernel 配置
- **WHEN** 维护者查看 OIDC 发布前提
- **THEN** 手册 SHALL 要求配置 Docker shared `IAM_SESSION_*` values or the resulting `IAM_OIDC_PROVIDER_SESSION_*` app raw env values for namespace、principal TTL、tombstone TTL、tombstone grace、current HMAC key id 和 current HMAC secret
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
