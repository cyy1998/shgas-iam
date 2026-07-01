## MODIFIED Requirements

### Requirement: Backend app raw env SHALL use app-prefixed contracts
后端 app SHALL 只接受 app 专属前缀的 raw runtime env 作为配置输入，并 SHALL NOT 继续接受旧的无 app 前缀 env 名称。

#### Scenario: API app 使用 IAM_API 前缀
- **WHEN** `apps/api` 解析 runtime env
- **THEN** raw env schema SHALL 使用 `IAM_API_*` 配置 `databaseUrl`、Redis、port、logging、session、CAP、human verification、login credential、SMS、ORCAS、Wechat、SSO endpoint 和 user-profile worker/backfill 配置
- **AND** raw env schema MUST NOT 接受 `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`SESSION_*`、`CAP_*`、`WX_*`、`USER_PROFILE_*` 或其他旧裸变量名作为 fallback

#### Scenario: Admin API app 使用 IAM_ADMIN_API 前缀
- **WHEN** `apps/admin-api` 解析 runtime env
- **THEN** raw env schema SHALL 使用 `IAM_ADMIN_API_*` 配置 `databaseUrl`、Redis、port、logging、admin client codes、admin role codes 和 Session Kernel 配置
- **AND** raw env schema MUST NOT 接受 `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`ADMIN_CLIENT_CODES`、`ADMIN_ROLE_CODES` 或 `SESSION_*` 作为 fallback

#### Scenario: OIDC provider app 使用 IAM_OIDC_PROVIDER 前缀
- **WHEN** `apps/oidc-provider` 解析 runtime env
- **THEN** raw env schema SHALL 使用 `IAM_OIDC_PROVIDER_*` 配置 `databaseUrl`、Redis、port、logging、OIDC issuer/origin/signing key/token TTL/client protection 和 Session Kernel 配置
- **AND** raw env schema MUST NOT 接受 `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`OIDC_*` 或 `SESSION_*` 作为 fallback

### Requirement: Backend app env boundary SHALL export grouped runtime config
后端 app 的 `env.ts` SHALL 在边界解析大写 raw env，并 SHALL 向应用代码导出 camelCase 或分组 runtime config，避免部署变量名在业务代码和 composition wiring 中扩散。

#### Scenario: Raw env key 只留在配置边界
- **WHEN** 后端 app 需要创建 Redis、logger、Session Kernel、user-profile worker 或业务 integration runtime
- **THEN** app code SHALL 使用 `env.redis.host`、`env.log.format`、`env.sessionKernel.lookupHmacCurrentSecret`、`env.userProfile.workerConcurrency` 等 runtime config 字段
- **AND** app code outside `env.ts` and env tests MUST NOT reference raw env variable keys such as `IAM_API_REDIS_HOST` or `IAM_API_USER_PROFILE_WORKER_CONCURRENCY`

#### Scenario: env parser 输出语义字段
- **WHEN** `parseApiEnv`、`parseAdminApiEnv` 或 `parseOidcProviderEnv` 返回配置对象
- **THEN** 返回值 SHALL 使用 camelCase 字段表达应用配置语义
- **AND** 返回值 MUST NOT expose a flat object whose property names are raw environment variable names
