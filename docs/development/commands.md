# 构建、测试与开发命令

根工具链要求 Node.js 24 与仓库 `packageManager` 声明的 pnpm 版本。优先使用 workspace script 和
`pnpm --filter`，让 Turborepo 与 package-local tooling 负责执行细节。

## 实现内循环

按当前 ticket 的受影响范围选择命令：

```bash
pnpm --filter <workspace> test
pnpm --filter <workspace> lint
pnpm --filter <workspace> typecheck
pnpm check:architecture
pnpm check:docs
git diff --check
```

根工具链变化的聚焦 Bun 测试：

```bash
bun test scripts/__tests__/architecture-guard.test.ts
bun test scripts/__tests__/test-orchestration.test.ts
bun test scripts/__tests__/tooling-performance.test.ts
bun test scripts/__tests__/eslint-config-equivalence.test.ts
```

Canonical collection 与编排变化还应运行：

```bash
pnpm check:test-collection
pnpm test:unit
pnpm test:integration:<component|process|redis|postgres|composition|browser>
```

完整 `pnpm verify` 只在准备 merge、release 或用户明确要求时运行一次；ticket 实现内循环不重复运行。

## Workspace 命令

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:integration:<component|process|redis|postgres|composition|browser>`
- `pnpm typecheck`
- `pnpm verify`
- `pnpm e2e:install`
- `pnpm e2e:install:browsers`
- 后端 Architecture Guard（唯一静态架构入口）：`pnpm check:architecture`
- 文档索引与 freshness guard：`pnpm check:docs`
- Env naming guard：`pnpm check:env-names`
- Test Collection Guard：`pnpm check:test-collection`

`pnpm lint` 调度各 workspace 的 lint 与根 ESLint；根 lint 范围为 `scripts/` 和三个根 ESLint/Stylelint 配置。

## 测试与验证通道

Root 与 package 已切换到以下长期 collection commands：

```bash
pnpm test:unit
pnpm test:integration
pnpm test:integration:component
pnpm test:integration:process
pnpm test:integration:redis
pnpm test:integration:postgres
pnpm test:integration:composition
pnpm test:integration:browser
```

`test:unit` 通过 Turbo 运行 package Unit，并精确加入四个 root tooling tests。各 profile command 只运行同名 package task。
聚合 `test:integration` 在任何 profile 启动前一次性列出全部缺失的 caller-owned PostgreSQL/Redis 环境变量；其中包括
`IAM_API_CORE_CLEANUP_TEST_REDIS_URL`，且任何专用 URL 都不得回退 runtime 或其他 test URL。资源 tasks 在 Turbo strict
env 下显式透传对应 owner URL 并保持 `cache:false`。
`pnpm test` 永久代理 `pnpm test:unit`；有 Unit collection 的 package 使用同一代理，没有 Unit collection 的 package
不发布空 `test`。旧 `test:smoke`、`test:external`、package-local `test:postgres`/`test:redis` 与 frontend `e2e`
collection aliases 已删除。

`pnpm check:test-collection` 通过 Vitest/Playwright 机器 list、Bun 窄目录与 Turbo dry-run 验证每个当前候选的唯一收集、
路径/命名归属和 root task 可达性。它与 production Architecture Guard 分离，不分析测试断言、资源调用或 AST/data flow。

`pnpm test:unit` 以 Turbo concurrency 2 运行可缓存的 Unit。Package-local Vitest Unit 使用 25% workers，Bun
Unit 使用 `--max-concurrency=2`。Architecture Guard 不进入 package `test`，由根级
`pnpm check:architecture` 单独执行。

真实进程/端口行为由 `test:integration:process` 以 Turbo concurrency 1 运行，并禁用任务缓存：

```bash
pnpm --filter @iam/api-core test:integration:process
pnpm --filter @iam/api test:integration:process
pnpm --filter @iam/admin-api test:integration:process
pnpm --filter @iam/worker test:integration:process
pnpm --filter @iam/oidc-provider test:integration:process
```

`@iam/api-core` 已作为 collection migration 的 Bun tracer bullet 发布 package-local canonical commands：

```bash
pnpm --filter @iam/api-core test:unit
pnpm --filter @iam/api-core test:integration:component
pnpm --filter @iam/api-core test:integration:process
pnpm --filter @iam/api-core test:integration:redis
```

`@iam/api` 已发布完整的六个 package-local canonical commands：

```bash
pnpm --filter @iam/api test:unit
pnpm --filter @iam/api test:integration:component
pnpm --filter @iam/api test:integration:process
pnpm --filter @iam/api test:integration:composition
pnpm --filter @iam/api test:integration:postgres
pnpm --filter @iam/api test:integration:redis
```

`@iam/oidc-provider` 已发布五个 package-local canonical commands：

```bash
pnpm --filter @iam/oidc-provider test:unit
pnpm --filter @iam/oidc-provider test:integration:component
pnpm --filter @iam/oidc-provider test:integration:process
pnpm --filter @iam/oidc-provider test:integration:composition
pnpm --filter @iam/oidc-provider test:integration:redis
```

`@iam/admin-api` 已发布 Unit、component、process 与 redis package-local canonical commands；`@iam/worker` 已发布
Unit、component、process 与 postgres commands：

```bash
pnpm --filter @iam/admin-api test:unit
pnpm --filter @iam/admin-api test:integration:component
pnpm --filter @iam/admin-api test:integration:process
pnpm --filter @iam/admin-api test:integration:redis
pnpm --filter @iam/worker test:unit
pnpm --filter @iam/worker test:integration:component
pnpm --filter @iam/worker test:integration:process
pnpm --filter @iam/worker test:integration:postgres
```

Admin 的 `test-smoke/client-cache-invalidation.runtime-smoke.ts` 是 Redis test 使用的 production runtime entry
fixture，不是测试候选。client cache 的 invalidation、update 与 mutation completion 已由真实 Redis profile 验证；API
legacy cleanup 的精确删除边界由 API Core 的真实 Redis profile 在独占 cleanup 资源上验证；process profile 不再运行 RESP
compatibility case。

Database、Role Assignment 与 User Profile Read Model 已发布以下 package-local canonical commands：

```bash
pnpm --filter @iam/db test:unit
pnpm --filter @iam/db test:integration:postgres
pnpm --filter @iam/role-assignment-resolution test:integration:component
pnpm --filter @iam/role-assignment-resolution test:integration:postgres
pnpm --filter @iam/user-profile-read-model test:unit
pnpm --filter @iam/user-profile-read-model test:integration:component
pnpm --filter @iam/user-profile-read-model test:integration:postgres
pnpm --filter @iam/user-profile-read-model test:integration:redis
```

Role Assignment 没有空的 Unit profile。User Profile 近规模 rehearsal 使用测试模型外的
`subject-projection:rehearsal` 操作入口，不形成第七个 profile。

Pure shared packages、ESLint config、Client Subject Projection 与 Gateway 已发布以下 package-local canonical commands：

```bash
pnpm --filter @iam/contracts test:unit
pnpm --filter @iam/domain test:unit
pnpm --filter @iam/eslint-config test:unit
pnpm --filter @iam/jobs test:unit
pnpm --filter @iam/client-subject-projection test:unit
pnpm --filter @iam/client-subject-projection test:integration:component
pnpm --filter @iam/gateway-apisix test:unit
pnpm --filter @iam/gateway-apisix test:integration:component
```

ESLint config 的 Unit command 显式收集 `test/` 下唯一 MJS test。Canonical tasks 只依赖 Turbo `transit`，不会通过
`^test` 扩大执行拓扑。

Admin 与 SSO frontend 已发布 Unit、component 与 mock-browser package-local canonical commands：

```bash
pnpm --filter @iam/admin test:unit
pnpm --filter @iam/admin test:integration:component
pnpm --filter @iam/admin test:integration:browser
pnpm --filter @iam/sso test:unit
pnpm --filter @iam/sso test:integration:component
pnpm --filter @iam/sso test:integration:browser
```

Browser Integration 保留原 API mocks、package-local `webServer`、base URL 与单 Chromium project，不是 Full-system E2E。

`pnpm verify` 通过 `scripts/verify.mjs` 按以下顺序 fail-fast：

1. static：`pnpm lint`、`pnpm check:docs`、`pnpm check:env-names`、`pnpm check:architecture`；
2. typecheck：`pnpm typecheck`；
3. test:unit：`pnpm test:unit`；
4. build：`pnpm build`。

外部资源检查不进入 `pnpm verify`，需要时显式运行：

```bash
# API/OIDC 真实 production entry 联合 PG/Redis 验证；普通资源与 cleanup Redis 必须彼此独立，
# 且全部指向调用方独占、非生产、可销毁的资源
IAM_API_CORE_CLEANUP_TEST_REDIS_URL=<exclusive-disposable-url> \
IAM_API_TEST_DATABASE_URL=<dedicated-url> IAM_API_TEST_REDIS_URL=<dedicated-url> \
IAM_OIDC_PROVIDER_TEST_DATABASE_URL=<dedicated-url> IAM_OIDC_PROVIDER_TEST_REDIS_URL=<dedicated-url> \
pnpm test:integration:composition

# 也可按 package 单独运行；缺少该 package 的任一 URL 会 fail fast，不会 skip 或回退
pnpm --filter @iam/api test:integration:composition
pnpm --filter @iam/oidc-provider test:integration:composition

# Database migration contract（guard、raw rollback、Drizzle journal replay、普通索引锁；需专用 IAM_DB_TEST_DATABASE_URL）
pnpm --filter @iam/db db:check
pnpm --filter @iam/db test:integration:postgres

# Worker Subject Projection Client cutover contract（需专用 IAM_WORKER_TEST_DATABASE_URL）
pnpm --filter @iam/worker test:integration:postgres

# Role assignment PostgreSQL contract（需由调用方提供专用 IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL）
pnpm --filter @iam/role-assignment-resolution test:integration:postgres

# API Purveyor contact 并发 contract（需由调用方提供专用 IAM_API_TEST_DATABASE_URL）
pnpm --filter @iam/api test:integration:postgres

# API Custom SSO Client runtime Redis contract（需由调用方提供专用 IAM_API_TEST_REDIS_URL）
pnpm --filter @iam/api test:integration:redis

# Admin API Custom SSO Client cache mutation contract（需由调用方提供专用 IAM_ADMIN_API_TEST_REDIS_URL）
pnpm --filter @iam/admin-api test:integration:redis

# OIDC Provider Session binding Redis contract（需专用 IAM_OIDC_PROVIDER_TEST_REDIS_URL）
pnpm --filter @iam/oidc-provider test:integration:redis

# User Profile publication/cutover backfill 与 verify contract（需专用 IAM_USER_PROFILE_TEST_DATABASE_URL）
pnpm --filter @iam/user-profile-read-model test:integration:postgres

# User Profile Subject Facts 单条/CAS/batch prewarm contract（需专用 IAM_USER_PROFILE_TEST_REDIS_URL）
pnpm --filter @iam/user-profile-read-model test:integration:redis

# API Core 普通 Redis contracts 与 legacy cleanup 精确边界（需两个彼此独立的专用 URL）
IAM_API_CORE_TEST_REDIS_URL=<namespace-isolated-url> \
IAM_API_CORE_CLEANUP_TEST_REDIS_URL=<exclusive-disposable-url> \
pnpm --filter @iam/api-core test:integration:redis

# Mock-browser Integration
pnpm --filter @iam/admin test:integration:browser
pnpm --filter @iam/sso test:integration:browser

# APISIX
pnpm gateway:apisix:validate -- <environment-arguments>
```

`IAM_API_CORE_CLEANUP_TEST_REDIS_URL` 必须指向初始为空、调用方独占且可销毁的 logical DB/instance；URL 所使用的 ACL user
必须允许测试所需的 `ACL DRYRUN`、inventory、fixture 与 cleanup 命令，同时由 `ACL DRYRUN` 证明其不能执行
`FLUSHDB`/`FLUSHALL`。Cleanup 测试不会把 `IAM_API_CORE_TEST_REDIS_URL` 或 runtime Redis 用作 fallback；它会在连接前
比较去除 credential 后的 host/port/logical DB identity，并拒绝与任一可见普通测试或 runtime Redis identity 相同的资源。
Caller-owned 对照集合与 `turbo.json` 的 `test:integration:redis.passThroughEnv` 及
`test:integration:composition.passThroughEnv` 中 Redis URL 集合一致，包含 Admin API、API Core、API、OIDC Provider 与 User
Profile 的专用 Redis URL，明确排除正在验证的 cleanup URL 自身。任何 Redis URL 出现 query 参数时也会在
连接前失败，避免 `?db=`、`?port=` 等产生第二种 connection identity 表示。测试不会启动 Docker。

Ticket 12 不提供根级一键 rehearsal。维护者或 agent 按
[Custom SSO Subject Projection 硬切换与回滚手册](../releases/custom-sso-subject-projection-release.md)，在调用方拥有的临时
PostgreSQL/Redis 环境组合本节已有的 Worker backfill/verify、cleanup、API/OIDC external entry、hermetic process smoke、
数据库 rollback 和
下列近规模性能 lane 手动走完；只在 Historical 记录中保存候选 commit、实际命令、聚合计数/延迟、通过/失败和资源清理结果：

```bash
pnpm --filter @iam/user-profile-read-model subject-projection:rehearsal
```

不生成或提交 JSONL receipt、机器 evidence manifest/transcript。Client cutover manifest 与一次性 Secret 输出仍按下文作为
backfill 的业务输入处理，且不得把 URL credential、Token、Subject、完整 Redis key 或 Secret 写入验收记录。

Subject Projection tightening migration 通过 Drizzle 应用后，rollback 必须在 authentication traffic 与 user/client writes
均已停止的 maintenance freeze 内运行下列命令。命令读取显式 `DATABASE_URL`，默认精确补偿
`drizzle.__drizzle_migrations` 中 `20260801144944_sturdy_landau` 的 name、timestamp 与本地 migration SHA-256；identity
不一致时 fail closed，且 DDL 与 journal delete 位于同一 transaction。未通过 Drizzle migrator 的 raw-SQL rehearsal
没有 journal row，可直接执行 migration 目录内的幂等 `rollback.sql`。

```bash
pnpm --filter @iam/db subject-projection:rollback
```

## 工具链性能入口

```bash
# 绕过 Turbo task cache 的强制执行
pnpm exec turbo typecheck --force --concurrency=3
pnpm exec turbo test:unit --force --concurrency=2

# ESLint profile 交错采样
node scripts/benchmark-eslint-config.mjs --rounds 5

# 手动核对 ESLint 文件集合与诊断快照；不属于 pnpm verify
pnpm test:eslint-diagnostic-baseline
```

`--force` 不会清空操作系统文件缓存。性能比较应使用相同命令和 runner，记录墙钟、CPU 与最大 RSS，一次只调整一个
并行层。

TypeScript CLI 与兼容 API 的版本检查：

```bash
pnpm exec tsc --version
node -e "const wrapper=require('typescript/package.json'); const api=require('typescript'); console.log(wrapper.name, wrapper.version, api.version)"
```

## Commit 前检查

`pnpm install` 的 `prepare` 生命周期安装版本化 Husky hook。pre-commit 只运行：

```bash
git diff --cached --check
```

Hook 不运行 lint、typecheck、test、build 或 tracker checker。按改动范围在 commit 前显式运行本页“实现内循环”中的
相关命令。

## Workspace 入口

- API backend：`pnpm --filter @iam/api <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:composition|test:integration:postgres|test:integration:redis|typecheck>`
- Admin API backend：`pnpm --filter @iam/admin-api <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:redis|typecheck>`
- OIDC provider：`pnpm --filter @iam/oidc-provider <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:composition|test:integration:redis|typecheck>`
- API Core：`pnpm --filter @iam/api-core <lint|test|test:unit|test:integration:component|test:integration:process|test:integration:redis|typecheck>`
- Client Subject Projection：`pnpm --filter @iam/client-subject-projection <lint|test|test:unit|test:integration:component|typecheck>`
- User Profile Read Model：`pnpm --filter @iam/user-profile-read-model <lint|test|test:unit|test:integration:component|test:integration:postgres|test:integration:redis|subject-projection:rehearsal|typecheck>`
- Worker：`pnpm --filter @iam/worker <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:postgres|typecheck|user-profile:backfill|user-profile:repair|subject-projection:backfill|subject-projection:verify>`
- 仅处理 Subject Access indexed backlog：
  `pnpm --filter @iam/worker run user-profile:repair -- --subject-access-only --limit <positive-integer>`
- Subject Projection cutover：
  `pnpm --filter @iam/worker subject-projection:backfill -- --manifest <path> --secret-output <new-path> [--batch-size <positive-integer>] [--after-user-id <safe-cursor>]`
- Subject Projection 独立只读 gate：
  `pnpm --filter @iam/worker subject-projection:verify -- --manifest <path> [--batch-size <positive-integer>]`
- Custom SSO hard cutover 旧会话清理：
  `pnpm --filter @iam/api-core session:cleanup-custom-sso-cutover -- --dry-run --batch-size 500`；核对摘要后把
  `--dry-run` 改为 `--verify`，有残留时必须非零退出；确认门禁有效后改为 `--apply`，完成后再以
  `--verify` 零退出收尾。
- Admin frontend：`pnpm --filter @iam/admin <dev|build|lint|test|test:unit|test:integration:component|test:integration:browser|typecheck|format>`
- SSO frontend：`pnpm --filter @iam/sso <dev|build|lint|test|test:unit|test:integration:component|test:integration:browser|typecheck|format>`
- Database：`pnpm --filter @iam/db <lint|test|test:unit|test:integration:postgres|typecheck|db:push|db:generate|db:migrate|db:check>`
- Role Assignment：`pnpm --filter @iam/role-assignment-resolution <lint|test:integration:component|test:integration:postgres|typecheck>`
- Gateway：`pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|test:unit|test:integration:component|typecheck>`

共享 packages 使用相同的 filtered 模式，例如：

```bash
pnpm --filter @iam/domain test
pnpm --filter @iam/domain lint
pnpm --filter @iam/domain typecheck
```

Cutover manifest 必须显式列出全部启用中的 legacy Custom SSO client。Independent client 的新 secret 只生成一次，
`--secret-output` 使用 exclusive create 和 `0600` mode；不得把文件内容或 secret 写入日志。delivery 为 `pending` 时
client 保持 disabled，operator 完成外部交付后将 manifest 标记为 `confirmed` 并重跑 backfill。若输出文件已创建但 DB
apply 失败，保留该文件用于审计、改用新的 exclusive 路径重跑，确认旧 secret 未生效后再按操作规程销毁。Client apply
会在同一 SQL update 中删除六个 legacy Custom SSO `ext_attributes` key 并保留其他属性；独立 verify 检测到任一残留时
以 `legacy-attributes-not-removed` 阻断切换。

正式执行顺序为：maintenance freeze、backfill（可从最后 safe cursor 恢复）、独立 `verify`。只有 verify 返回 passed
才可继续 migration 收紧与流量切换；failed report 返回非零退出码。收紧 migration 使用普通唯一索引，必须保持 freeze，
不得在仍有 `user_profile` writer 时执行。

`session:cleanup-custom-sso-cutover` 固定使用仓库内建 allowlist，只覆盖旧 `global_session:*` Principal Session、Custom
SSO grant/local-session/reverse/set 与 `custom-sso:local-session-payload:*`。该命令不会扫描或删除任何 `oidc:*` key，且不
接受外部 `--pattern`。原 `session:cleanup-legacy-keys` 仍保持包含 OIDC legacy key 的完整默认范围，供既有 Session Kernel
与 OIDC 迁移手册使用；Custom SSO hard cutover 不得改用该完整命令。完整维护窗口顺序、四类 smoke 与回滚边界见
[Custom SSO Subject Projection 硬切换与回滚手册](../releases/custom-sso-subject-projection-release.md)。
