## Context

当前配置命名同时存在三类边界：后端 runtime env、前端 Umi build env、Docker compose/env-file 编排变量。现状中 dev compose 已部分使用 `API_*` / `ADMIN_API_*` / `OIDC_*` 作为外层变量再映射到容器内旧变量，但 prod compose 和各 app 内部仍大量读取 `DATABASE_URL`、`REDIS_URL`、`PORT`、`LOG_LEVEL`、`SESSION_*`、`UMI_APP_*` 等裸变量。结果是 app 之间容易撞名，dev/prod 默认值和必填策略难以对齐，业务代码也会直接暴露部署命名。

这次变更是 breaking config contract rename，不保留旧变量 fallback。目标是在同一个变更里更新 app env schema、Docker compose、env examples、Dockerfile build args、tests、docs 和静态命名 guard，避免长期维护两套命名。

## Goals / Non-Goals

**Goals:**
- 后端 app raw env contract 统一为 `IAM_API_*`、`IAM_ADMIN_API_*`、`IAM_OIDC_PROVIDER_*`。
- 后端 `env.ts` 只在边界读取大写 raw env，并导出 camelCase / 分组 runtime config，减少部署变量名在业务代码中扩散。
- 前端 build env 统一为 `UMI_APP_ADMIN_*` 与 `UMI_APP_SSO_*`，保持 Umi 公开 env 机制，同时消除 admin/sso 变量撞名。
- Docker dev/prod compose 和 `.env.*.example` 使用一致的命名边界：第三方容器保留原生前缀，IAM 共享部署变量由 compose fan-out 到 app 内部变量。
- 删除旧变量名，不提供兼容 fallback，并用 root-level guard 防止回归。

**Non-Goals:**
- 不引入 secret manager、dotenv 加载框架或运行时配置服务。
- 不改动数据库 schema、REST/tRPC API、路由路径、登录协议或前端页面功能。
- 不把前端静态包改为运行时可变配置；前端仍是 build-time env 注入。
- 不重命名 APISIX sync CLI 自身的 `APISIX_*` 变量；gateway manifest 的环境变量只在与 IAM app env contract 冲突时调整。

## Decisions

### 1. 后端 raw env 使用 app 专属前缀

后端 raw env schema SHALL 使用 app 专属前缀：

- `apps/api`: `IAM_API_*`
- `apps/admin-api`: `IAM_ADMIN_API_*`
- `apps/oidc-provider`: `IAM_OIDC_PROVIDER_*`

`NODE_ENV` 保留为 Node ecosystem 约定。`HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 仍作为运行时生态变量处理，不纳入 app runtime config contract。`PORT` 不再作为 app 内部输入，改为 `IAM_<APP>_PORT`。

替代方案是继续让 app 内部读取 `DATABASE_URL`、`REDIS_URL` 和 `PORT`，只在 Docker 层做映射。该方案改动小，但不能解决 app 内部变量撞名和业务代码传播裸环境变量的问题，因此不采用。

### 2. `env.ts` 导出 camelCase / 分组 runtime config

每个后端 app 的 `env.ts` 应拆分 raw schema 与 runtime config 输出：

```ts
const RawEnvSchema = z.object({
  IAM_API_DATABASE_URL: z.string().min(1),
  IAM_API_REDIS_HOST: z.string().min(1),
});

export function parseApiEnv(source: NodeJS.ProcessEnv): ApiEnv {
  const raw = RawEnvSchema.parse(source);
  return {
    databaseUrl: raw.IAM_API_DATABASE_URL,
    redis: {
      host: raw.IAM_API_REDIS_HOST,
    },
  };
}
```

composition、logger、Redis 和 session wiring 使用 `env.redis.host`、`env.sessionKernel.lookupHmacCurrentSecret` 等 camelCase 字段。这样大写 raw env 名只出现在 `env.ts`、tests、Docker 和 docs。

### 3. 前端保留 `UMI_APP_`，但必须加 app namespace

Umi Max build-time env 继续使用 `UMI_APP_` 前缀；在该前缀后添加 app namespace：

- `apps/admin`: `UMI_APP_ADMIN_*`
- `apps/sso`: `UMI_APP_SSO_*`

admin 的 client code 命名为 `UMI_APP_ADMIN_CLIENT_CODE`，表达“admin frontend 作为 SSO/OIDC client 的 code”，不再使用容易误解的 `UMI_APP_SSO_CLIENT_CODE`。前端源码中只有 `src/constants/config.ts` 和 `src/types/env.d.ts` 接触 `process.env`，调用方继续使用现有 config constants，避免扩大前端改动面。

### 4. Docker 编排层保留共享源变量并 fan-out

Docker `.env.*.example` 允许存在编排层共享变量，但它们不得成为 app 内部读取契约：

- 第三方容器和工具保留原生前缀：`POSTGRES_*`、`APISIX_*`、`GRAFANA_*`、`LOKI_*`、`ALLOY_*`。
- IAM 共享部署值使用具体域前缀，例如 `IAM_REDIS_*`、`IAM_SESSION_*`、`IAM_LOG_*`。
- app 镜像、端口和 app-specific override 使用 app 前缀，例如 `IAM_API_IMAGE`、`IAM_ADMIN_API_PUBLISHED_PORT`、`IAM_OIDC_PROVIDER_DATABASE_URL`。
- compose 将共享值映射到每个 app 内部变量，例如 `IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: ${IAM_SESSION_LOOKUP_HMAC_CURRENT_SECRET:?set IAM_SESSION_LOOKUP_HMAC_CURRENT_SECRET}`。

该设计允许部署文件保持低重复，同时保证容器内 app contract 仍然是 `IAM_<APP>_*`。

### 5. 轻量语义重命名

本变更不只机械添加前缀，也会修正明显含糊的旧名：

- `WX_CORPID` / `WX_CORPSECRET` → `IAM_API_WECHAT_CORP_ID` / `IAM_API_WECHAT_CORP_SECRET`
- `REDIS_EXPIRE_TIME` → `IAM_API_SESSION_DEFAULT_TTL_SECONDS`
- `AUTH_CODE_EXPIRE_TIME` → `IAM_API_AUTH_CODE_TTL_SECONDS`
- `ADMIN_CLIENT_CODES` / `ADMIN_ROLE_CODES` → `IAM_ADMIN_API_ADMIN_CLIENT_CODES` / `IAM_ADMIN_API_ADMIN_ROLE_CODES`

清楚的业务域名段保持稳定，例如 `CAP_*`、`HUMAN_VERIFICATION_*`、`LOGIN_CREDENTIAL_*`、`SMS_*`、`ORCAS_*`、OIDC provider 的协议配置段。

### 6. root-level env naming guard

新增 `scripts/check-env-names.ts` 和 root `check:env-names` 脚本。guard 使用静态扫描即可，不需要 AST 或外部依赖。它应覆盖：

- 后端 raw env schema 中不得出现旧裸变量名。
- 前端 `process.env` 只允许 app namespaced `UMI_APP_ADMIN_*` / `UMI_APP_SSO_*`。
- Docker compose/env examples 不得出现旧 app 配置名，如 `SSO_UMI_APP_*`、`OIDC_PUBLISHED_PORT`、无 app namespace 的 `UMI_APP_API_PREFIX`。

guard 作为显式验证命令运行，不在本设计中强制改写 root `pnpm test` 行为。

## Risks / Trade-offs

- [Risk] 本地和生产 `.env` 立即失效。→ Mitigation: 同步更新 `.env.dev.example`、`.env.prod.example`、README 和 release/runbook，明确这是 breaking rename，并提供新命名分组。
- [Risk] raw env 改名导致 tests 或 runtime wiring 漏改。→ Mitigation: 更新 env unit tests、运行后端 typecheck、执行 `pnpm check:env-names` 和 focused tests。
- [Risk] Docker 共享变量 fan-out 让 compose 文件更长。→ Mitigation: 使用 YAML anchors 复用 backend common env，保持 app-specific env 块可读。
- [Risk] 前端 build-time env 改名后旧 CI/CD 配置无法构建。→ Mitigation: 更新 Dockerfile ARG/ENV、`.env.*.example` 和文档；不提供 fallback 以避免长期双写。
- [Risk] guard 误伤第三方工具变量。→ Mitigation: 明确 allowlist 第三方原生前缀和 Node/proxy 生态变量，仅检查 app config contract。

## Migration Plan

1. 在工作分支中一次性更新后端 raw env schema、runtime config 输出和所有引用。
2. 更新前端 config/types/Dockerfile build args 到 `UMI_APP_<APP>_*`。
3. 更新 Docker compose anchors、prod/dev env examples 和相关文档。
4. 新增并运行 `pnpm check:env-names`。
5. 运行受影响 app 的 env tests、typecheck，以及 Docker compose config 渲染检查。
6. 发布前要求部署方按新的 `.env.*.example` 迁移本地/生产 env 文件。

Rollback 策略是回滚该变更提交并恢复旧 env 文件；由于不保留 fallback，不支持新旧变量混用回滚。

## Open Questions

无。命名边界、迁移策略、前后端 app prefix、Docker 共享映射和 guard 位置均已在设计讨论中确定。
