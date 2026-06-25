## Why

当前 app runtime、frontend build 与 Docker compose 的环境变量命名混用无前缀、短前缀和框架前缀，导致 dev/prod 配置不一致、不同 app 变量容易撞名，也让配置边界在业务代码中扩散。现在需要把配置契约一次性收敛，避免后续部署和维护继续积累隐性差异。

## What Changes

- **BREAKING**: 后端 app 内部 raw env contract 改为 app 专属前缀：`IAM_API_*`、`IAM_ADMIN_API_*`、`IAM_OIDC_PROVIDER_*`，旧的 `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`SESSION_*`、`ADMIN_*`、`OIDC_*` 等裸 runtime env 名称不再作为 app 内部输入。
- **BREAKING**: 前端公开构建变量改为 `UMI_APP_ADMIN_*` 与 `UMI_APP_SSO_*`，旧的共享 `UMI_APP_API_PREFIX`、`UMI_APP_SSO_CLIENT_CODE`、`SSO_UMI_APP_*` 等名称下线。
- 后端 `env.ts` 作为配置边界，校验 app-prefixed raw env 后导出 camelCase / 分组 runtime config，业务、composition、logger、Redis 和 session wiring 不再直接传播环境变量名。
- Docker dev/prod compose 与 `.env.*.example` 统一命名边界：第三方容器保留原生前缀，IAM 共享部署值使用 `IAM_<DOMAIN>_*`，再由 compose 映射到各 app 的 `IAM_<APP>_*` 内部变量。
- 明显含糊的变量名同步整理，例如 `WX_*` 改为 `WECHAT_*`、`REDIS_EXPIRE_TIME` 改为 session TTL 语义名称、`AUTH_CODE_EXPIRE_TIME` 改为 auth code TTL 语义名称。
- 新增 root-level `check:env-names` guard，用静态检查防止旧变量名和无 app namespace 的 frontend/backend env 重新出现。
- 更新 README、Docker env examples、相关 release/runbook docs 和 env tests，确保 breaking rename 有可执行迁移参考。

## Capabilities

### New Capabilities
- `app-env-contracts`: 定义后端、前端、Docker 编排层的环境变量命名、映射、校验和 guard 规则。

### Modified Capabilities
- `session-kernel-core`: Session Kernel 发布配置从裸 `SESSION_*` env 名称迁移到 app-prefixed runtime contract 与 Docker 共享映射。
- `oidc-provider`: OIDC provider runtime env contract 迁移到 `IAM_OIDC_PROVIDER_*`，并保持 OIDC 协议配置语义清晰。
- `system-log-observability`: 后端 logger 配置从裸 `LOG_LEVEL` / `LOG_FORMAT` env 名称迁移到 app-prefixed runtime contract 与 Docker 共享映射。
- `authorization-model`: Admin API 允许 client/role 配置从裸 `ADMIN_CLIENT_CODES` / `ADMIN_ROLE_CODES` env 名称迁移到 `IAM_ADMIN_API_*` contract。

## Impact

- Affected apps: `apps/api`, `apps/admin-api`, `apps/oidc-provider`, `apps/admin`, `apps/sso`.
- Affected deployment files: `docker/docker-compose-dev.yml`, `docker/docker-compose-prod.yml`, `docker/docker-compose-frontend-prod.yml`, `docker/.env.dev.example`, `docker/.env.prod.example` and related local env migration guidance.
- Affected tests/docs: backend env tests, frontend env type declarations, Docker compose validation, README and release/runbook references to renamed env variables.
- Existing local and production `.env` files must be migrated to the new names; this change intentionally does not provide fallback compatibility for old variable names.
