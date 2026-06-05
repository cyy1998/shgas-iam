## Why

当前 IAM 已提供统一登录和自定义 SSO 授权码流程，但第三方业务系统无法按标准 OIDC/OAuth2 客户端方式接入，接入文档也明确现有 `/sso` 不是标准协议。引入标准 OIDC Provider 可以让 IAM 成为可被通用中间件、网关、SaaS 与内部应用直接信任的身份源，同时保留现有登录、风控、审计和旧 SSO 接入能力。

## What Changes

- 新增标准 OIDC Provider 能力，提供 Authorization Code Flow + PKCE、Discovery、JWKS、Token、UserInfo 和基础退出能力。
- 新增独立 `apps/oidc-provider` 微服务，作为 IAM 的标准协议出口，复用现有 `global_session` 登录态、用户目录、Redis 和 PostgreSQL。
- 新增 OIDC client 注册与管理能力，使用独立配置模型维护 `client_id`、redirect URI、scope、grant 类型、token endpoint 认证方式和密钥摘要。
- 扩展 SSO portal 登录成功回跳能力，使 OIDC authorize 能在未登录时借用现有登录页并在登录后回到 OIDC provider。
- 保留现有 `/sso` 自定义授权码流程，不将旧 `/sso/token` 行为改造成 OAuth token endpoint。
- 建立 OIDC 协议安全基线：redirect URI 精确匹配、authorization code 一次性消费、PKCE 校验、client secret 不进 URL query、签名密钥可轮换。

## Capabilities

### New Capabilities

- `oidc-provider`: 标准 OIDC Provider 协议端点、登录态桥接、token 签发、UserInfo、JWKS、退出和兼容性约束。
- `oidc-client-registry`: OIDC client 的管理端维护、密钥治理、redirect URI/scope 配置和 provider 运行时读取能力。

### Modified Capabilities

- `sso-login-experience`: 登录页新增 OIDC `returnTo` 回跳模式，但现有自定义 `/sso` 登录回跳和失败提示保持兼容。

## Impact

- 新增后端应用：`apps/oidc-provider`，建议使用 Node runtime 承载成熟 OIDC Provider 库，并接入 monorepo/Turbo/Docker 本地开发与部署流程。
- 新增数据库 schema 与 migration：OIDC client、client secret 摘要、redirect URI、scope/claims 策略、签名 key metadata，以及 provider storage adapter 所需持久化表或 Redis key 约定。
- 新增管理端能力：`apps/admin-api` 与 `apps/admin` 需要支持 OIDC client 的创建、查看、更新、禁用、删除和密钥轮换。
- 调整 SSO portal：登录页识别并校验 OIDC `returnTo` 参数，登录成功后直接回到 provider，而非强制进入 `/sso/authorize`。
- 新增配置：OIDC issuer、外部访问 origin、token TTL、JWKS key material、provider cookie/session 配置、登录入口回跳地址。
- 新增验证：协议端点 smoke test、PKCE/redirect/client auth/code replay 单元或集成测试、admin-api/admin 类型检查，以及新 provider 服务的 lint/typecheck/test。
