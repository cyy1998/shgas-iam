## Why

当前 IAM 已提供统一登录和自定义 SSO 授权码流程，但第三方业务系统无法按标准 OIDC/OAuth2 client 接入，现有 `/sso` 的协议形态、redirect URI 匹配、明文 client secret 和局部 session 也不满足标准 OIDC 安全要求。

引入标准 OIDC Provider 时，不应再创建一套与现有应用、用户和权限体系平行的主数据。现有 `client` 已经代表业务应用并承载角色归属，现有 `user` 已经代表统一身份主体。因此本变更复用这两个主实体，只隔离 OIDC 专属配置、secret 摘要和协议运行时状态。

## What Changes

- 新增独立 `apps/oidc-provider` Node.js 服务，使用 `oidc-provider` v9 提供 Authorization Code Flow、PKCE、Discovery、JWKS、Token、UserInfo 和 RP-Initiated Logout。
- OIDC client 复用现有 `client`：`clientCode` 直接作为不可变 `client_id`，新增 `oidcEnabled`、`oidcConfig` JSONB、`oidcSecretHash` 和 `oidcConfigVersion`，不新增 OIDC client 主表。
- OIDC subject 复用现有 `user`：新增不可变、唯一的 `oidcSubject UUID`，采用单 issuer 下的 public subject，不新增 subject 映射表。
- OIDC 协议配置与 custom SSO 配置隔离：不复用 `extAttributes.validRedirectUrls` 或现有明文 `clientSecret`；OIDC redirect URI 始终精确匹配，OIDC secret 仅保存 bcrypt 摘要。
- 固定第一版协议能力：所有 client 强制 Authorization Code + PKCE S256，public client 使用 `none`，confidential client 使用 `client_secret_basic`，不支持 refresh token、implicit flow、dynamic registration 或 consent 页面。
- 新增 `iam:authorization` scope，通过 UserInfo 返回全部有效任职，以及按当前 client 过滤的 roles/privileges；授权数据不进入 ID Token。
- Authorization Code、Interaction、Grant、Access Token、登录回跳 handle 和反向撤销索引全部存储在 Redis，不新增 provider PostgreSQL storage 表。
- 将 `global_session` 统一升级为包含 `version`、`authTime` 和 `user` 的 envelope，并提取共享 session 基础设施供 API 与 provider 一致读取、续期和清理。
- signing key 不进入数据库，由 provider 安全配置提供 RS256 current/previous JWK key set，并由 JWKS 仅发布公钥。
- OIDC client 管理整合到现有 client 管理页面，通过专用 configure/enable/disable/remove/rotate-secret 操作维护，并记录独立审计事件。
- SSO portal 使用一次性 opaque login return handle 返回固定 provider resume endpoint，不接收任意 `returnTo` URL。
- 保留现有 `/sso` 自定义授权码流程及其行为，不将旧 `/sso/token` 改造成 OAuth token endpoint。

## Capabilities

### New Capabilities

- `oidc-provider`: 标准 OIDC Provider 协议端点、登录态桥接、token 签发、UserInfo、JWKS、退出、Redis adapter 和兼容性约束。
- `oidc-client-registry`: 基于现有 client 主体的 OIDC 配置维护、secret 治理、runtime 解析、配置版本失效和审计能力。

### Modified Capabilities

- `sso-login-experience`: 登录页新增 opaque OIDC login return handle 模式，同时保持现有 custom SSO 回跳行为。

## Impact

- `packages/db`: 修改 `user` 与 `client` 表并生成 migration；不新增 OIDC client、subject、signing key 或 provider state 表。
- `packages/contracts` / `packages/domain`: 新增 OIDC client 配置、scope、runtime DTO、UserInfo claims 和 global session envelope 契约；敏感字段不得进入通用 DTO。
- `packages/api-core`: 提取共享 global/local session Redis 协议和清理能力。
- `apps/admin-api` / `apps/admin`: 在现有 client 模块和页面中增加 OIDC 配置、状态筛选、secret 一次性显示和轮换操作。
- `apps/api` / `apps/sso`: 适配统一 global session envelope 和 opaque OIDC 登录回跳。
- `apps/oidc-provider`: 新增 Node.js 22 LTS ESM 服务、Redis adapter、动态 client resolver、account/claims resolver 和协议端点。
- `gateway/apisix` / Docker / Turbo: 增加同源 `/oidc` 路由、限流、容器和 workspace 编排。
- 发布时需要维护窗口清理全部旧 global/local session，强制所有用户重新登录；回滚只关闭 `/oidc` 路由并禁用 OIDC，不回滚新增数据库字段。
