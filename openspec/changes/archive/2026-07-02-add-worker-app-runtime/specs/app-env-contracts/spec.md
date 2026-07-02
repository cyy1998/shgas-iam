## MODIFIED Requirements

### Requirement: Backend app raw env SHALL use app-prefixed contracts
后端 app SHALL 只接受 app 专属前缀的 raw runtime env 作为配置输入，并 SHALL NOT 继续接受旧的无 app 前缀 env 名称或已迁移到其它 app 的 retired env 名称。

#### Scenario: API app 使用 IAM_API 前缀
- **WHEN** `apps/api` 解析 runtime env
- **THEN** raw env schema SHALL 使用 `IAM_API_*` 配置 `databaseUrl`、Redis、port、logging、session、CAP、human verification、login credential、SMS、ORCAS、Wechat、SSO endpoint 和 user-profile DSL limit
- **AND** raw env schema MUST NOT 接受 `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`SESSION_*`、`CAP_*`、`WX_*`、`USER_PROFILE_*` 或其他旧裸变量名作为 fallback
- **AND** raw env schema MUST NOT 接受 `IAM_API_USER_PROFILE_WORKER_CONCURRENCY`、`IAM_API_USER_PROFILE_REBUILD_BATCH_SIZE` 或 `IAM_API_USER_PROFILE_BACKFILL_BATCH_SIZE`

#### Scenario: Admin API app 使用 IAM_ADMIN_API 前缀
- **WHEN** `apps/admin-api` 解析 runtime env
- **THEN** raw env schema SHALL 使用 `IAM_ADMIN_API_*` 配置 `databaseUrl`、Redis、port、logging、admin client codes、admin role codes 和 Session Kernel 配置
- **AND** raw env schema MUST NOT 接受 `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`ADMIN_CLIENT_CODES`、`ADMIN_ROLE_CODES` 或 `SESSION_*` 作为 fallback

#### Scenario: OIDC provider app 使用 IAM_OIDC_PROVIDER 前缀
- **WHEN** `apps/oidc-provider` 解析 runtime env
- **THEN** raw env schema SHALL 使用 `IAM_OIDC_PROVIDER_*` 配置 `databaseUrl`、Redis、port、logging、OIDC issuer/origin/signing key/token TTL/client protection 和 Session Kernel 配置
- **AND** raw env schema MUST NOT 接受 `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`OIDC_*` 或 `SESSION_*` 作为 fallback

#### Scenario: Worker app 使用 IAM_WORKER 前缀
- **WHEN** `apps/worker` 解析 runtime env
- **THEN** raw env schema SHALL 使用 `IAM_WORKER_*` 配置 `databaseUrl`、Redis、logging、enabled modules、HTTP health、BullMQ dashboard 和 user-profile worker/backfill 配置
- **AND** raw env schema MUST NOT 接受 `IAM_API_*` worker-only env、`DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`WORKER_*`、`BULL_BOARD_*` 或 `USER_PROFILE_*` 作为 fallback

### Requirement: Backend app env boundary SHALL export grouped runtime config
后端 app 的 `env.ts` SHALL 在边界解析大写 raw env，并 SHALL 向应用代码导出 camelCase 或分组 runtime config，避免部署变量名在业务代码和 composition wiring 中扩散。

#### Scenario: Raw env key 只留在配置边界
- **WHEN** 后端 app 需要创建 Redis、logger、Session Kernel、user-profile DSL validator、worker module 或业务 integration runtime
- **THEN** app code SHALL 使用 `env.redis.host`、`env.log.format`、`env.sessionKernel.lookupHmacCurrentSecret`、`env.userProfile.dslMaxLimit`、`env.modules.enabled` 或 `env.userProfile.concurrency` 等 runtime config 字段
- **AND** app code outside `env.ts` and env tests MUST NOT reference raw env variable keys such as `IAM_API_REDIS_HOST`、`IAM_API_USER_PROFILE_DSL_MAX_LIMIT` or `IAM_WORKER_USER_PROFILE_CONCURRENCY`

#### Scenario: env parser 输出语义字段
- **WHEN** `parseApiEnv`、`parseAdminApiEnv`、`parseOidcProviderEnv` 或 `parseWorkerEnv` 返回配置对象
- **THEN** 返回值 SHALL 使用 camelCase 字段表达应用配置语义
- **AND** 返回值 MUST NOT expose a flat object whose property names are raw environment variable names

### Requirement: Docker env files SHALL separate third-party, IAM shared, and app contracts
Docker compose 和 env example SHALL 区分第三方容器原生变量、IAM 共享部署变量和 app 内部变量映射。

#### Scenario: 第三方容器保留原生前缀
- **WHEN** compose configures PostgreSQL、APISIX、Grafana、Loki 或 Alloy containers
- **THEN** compose SHALL preserve their native prefixes such as `POSTGRES_*`、`APISIX_*`、`GRAFANA_*`、`LOKI_*` and `ALLOY_*`
- **AND** these native variables SHALL NOT be treated as backend app raw env contracts

#### Scenario: IAM 共享部署变量由 compose fan-out
- **WHEN** multiple IAM backend apps share Redis、logging or Session Kernel values
- **THEN** `.env.*.example` SHALL define shared source variables such as `IAM_REDIS_*`、`IAM_LOG_*` and `IAM_SESSION_*`
- **AND** compose SHALL map those shared variables into each container's `IAM_<APP>_*` raw env keys, including `IAM_WORKER_*` when worker needs the value

#### Scenario: App-specific deployment variables use canonical app prefixes
- **WHEN** `.env.*.example` defines app image、published port、database override、worker dashboard or frontend build variables
- **THEN** those variables SHALL use `IAM_API_*`、`IAM_ADMIN_API_*`、`IAM_OIDC_PROVIDER_*`、`IAM_WORKER_*`、`IAM_ADMIN_*`、`IAM_SSO_*`、`UMI_APP_ADMIN_*` or `UMI_APP_SSO_*` as appropriate
- **AND** dev and prod examples SHALL use the same canonical app prefix for the same concept

### Requirement: Env naming guard SHALL prevent old config names from returning
仓库 SHALL 提供 root-level env naming guard，用静态检查阻止旧配置变量名、无 app namespace 前端变量和裸 backend app env 重新进入代码与 Docker 配置。

#### Scenario: Guard detects backend raw env regressions
- **WHEN** 开发者运行 `pnpm check:env-names`
- **THEN** guard SHALL fail if backend app env schemas contain old raw keys such as `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`SESSION_*`、`ADMIN_CLIENT_CODES`、`OIDC_ISSUER`、`WORKER_*`、`BULL_BOARD_*` or `USER_PROFILE_*`
- **AND** guard SHALL allow app-prefixed keys and ecosystem variables explicitly documented by the rule

#### Scenario: Guard detects retired API worker env names
- **WHEN** 开发者运行 `pnpm check:env-names`
- **THEN** guard SHALL fail if `IAM_API_USER_PROFILE_WORKER_CONCURRENCY`、`IAM_API_USER_PROFILE_REBUILD_BATCH_SIZE` or `IAM_API_USER_PROFILE_BACKFILL_BATCH_SIZE` appears in backend env schemas、Docker compose or env examples
- **AND** equivalent worker-only settings SHALL use `IAM_WORKER_USER_PROFILE_*`

#### Scenario: Guard detects frontend namespace regressions
- **WHEN** 开发者运行 `pnpm check:env-names`
- **THEN** guard SHALL fail if frontend config reads non-namespaced `UMI_APP_*` variables or `SSO_UMI_APP_*`
- **AND** guard SHALL allow only `UMI_APP_ADMIN_*` and `UMI_APP_SSO_*` frontend build variables

#### Scenario: Guard detects Docker contract regressions
- **WHEN** 开发者运行 `pnpm check:env-names`
- **THEN** guard SHALL fail if Docker compose or env examples use retired app config variables such as `OIDC_PUBLISHED_PORT`、`SSO_UMI_APP_*`、retired API worker env names or un-namespaced frontend build variables
- **AND** guard SHALL allow documented third-party native prefixes and IAM shared deployment variables
