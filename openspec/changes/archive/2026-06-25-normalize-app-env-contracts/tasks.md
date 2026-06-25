## 1. 命名映射与变更边界

- [x] 1.1 建立旧变量到新变量的映射表，覆盖 `apps/api`、`apps/admin-api`、`apps/oidc-provider`、`apps/admin`、`apps/sso` 和 Docker env examples。
- [x] 1.2 明确不迁移真实本地 secret 文件，只更新 tracked examples、compose、docs、tests 和 app code。

## 2. 后端 runtime env contract

- [x] 2.1 将 `apps/api/src/env.ts` 改为校验 `IAM_API_*` raw env，并导出 camelCase / grouped runtime config。
- [x] 2.2 更新 `apps/api` 中 logger、Redis、composition runtime、routes/services wiring 对新 runtime config 的引用。
- [x] 2.3 将 `apps/admin-api/src/env.ts` 改为校验 `IAM_ADMIN_API_*` raw env，并导出 camelCase / grouped runtime config。
- [x] 2.4 更新 `apps/admin-api` 中 logger、Redis、admin authentication、composition runtime 对新 runtime config 的引用。
- [x] 2.5 将 `apps/oidc-provider/src/env.ts` 改为校验 `IAM_OIDC_PROVIDER_*` raw env，并导出 camelCase / grouped runtime config。
- [x] 2.6 更新 `apps/oidc-provider` 中 logger、Redis、provider configuration、HTTP server、interaction、stores、session composition 对新 runtime config 的引用。
- [x] 2.7 更新后端 env tests 和相关 test fixtures，移除旧裸 env 名称输入。

## 3. 前端 build env contract

- [x] 3.1 将 `apps/admin/src/constants/config.ts` 和 `src/types/env.d.ts` 改为读取 `UMI_APP_ADMIN_*`。
- [x] 3.2 将 `apps/sso/src/constants/config.ts` 和 `src/types/env.d.ts` 改为读取 `UMI_APP_SSO_*`。
- [x] 3.3 更新 `apps/admin/Dockerfile` 与 `apps/sso/Dockerfile` 的 build args 和 ENV 注入。
- [x] 3.4 确认前端除 config boundary 外没有新增 direct `process.env` 读取。

## 4. Docker compose 与 env examples

- [x] 4.1 更新 `docker/docker-compose-dev.yml` backend env anchors，使共享 `IAM_REDIS_*`、`IAM_LOG_*`、`IAM_SESSION_*` fan-out 到 `IAM_<APP>_*`。
- [x] 4.2 更新 `docker/docker-compose-prod.yml` backend env blocks，移除硬编码 API proxy，统一 app image、published port、database、Redis、logging、session 和 app-specific 变量名。
- [x] 4.3 更新 `docker/docker-compose-frontend-prod.yml` 和 dev compose frontend build args 为 `UMI_APP_ADMIN_*` / `UMI_APP_SSO_*`。
- [x] 4.4 更新 `docker/.env.dev.example` 和 `docker/.env.prod.example`，保持 dev/prod 同概念同前缀，并标注 breaking rename。
- [x] 4.5 保留第三方容器原生前缀，避免把 `POSTGRES_*`、`APISIX_*`、`GRAFANA_*`、`LOKI_*`、`ALLOY_*` 当作 app raw env contract。

## 5. Guard 与文档

- [x] 5.1 新增 root-level `scripts/check-env-names.ts`，覆盖后端 raw env、前端 `UMI_APP_<APP>_*`、Docker retired names 的静态检查。
- [x] 5.2 在 root `package.json` 添加 `check:env-names` 脚本。
- [x] 5.3 更新 README、Docker 使用说明、OIDC/session release runbooks、system log docs 中引用的 env 变量名。
- [x] 5.4 更新 OpenSpec 或附近文档中会与新 env contract 冲突的旧变量名说明。

## 6. 验证

- [x] 6.1 运行 `pnpm check:env-names`。
- [x] 6.2 运行 `pnpm --filter @iam/api test`、`pnpm --filter @iam/admin-api test`、`pnpm --filter @iam/oidc-provider test` 中与 env/runtime config 相关的测试。
- [x] 6.3 运行 `pnpm --filter @iam/api typecheck`、`pnpm --filter @iam/admin-api typecheck`、`pnpm --filter @iam/oidc-provider typecheck`。
- [x] 6.4 运行 `pnpm --filter @iam/admin typecheck` 和 `pnpm --filter @iam/sso typecheck`。
- [x] 6.5 使用 dev/prod env examples 执行 Docker compose config 渲染检查，确认 required env、anchors 和 build args 可解析。
- [x] 6.6 使用 `rg` 检查旧配置名不再作为 app env contract 出现在 app code、Docker examples 和更新后的 docs 中。
