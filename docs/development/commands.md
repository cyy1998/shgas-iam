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

每票每轮交接前统一运行 `pnpm verify:static`，再确认完整受影响范围的 typecheck、行为测试和 `git diff --check`
通过；具体责任与失败处理见[开发工作流](../agents/workflow.md#验证节奏)。

根工具链变化的聚焦 Bun 测试：

```bash
bun test scripts/__tests__/architecture-guard.test.ts
bun test scripts/__tests__/test-orchestration.test.ts
bun test scripts/__tests__/tooling-contracts.test.ts
bun test scripts/__tests__/eslint-config-ownership.test.ts
```

Canonical collection 与编排变化还应运行：

```bash
pnpm check:test-collection
pnpm test:unit
pnpm test:integration:<component|process|redis|postgres|composition|browser>
```

完整 root Gate 只在准备 merge、release 或用户明确要求时运行；ticket 实现内循环不重复运行。按需要选择基础
`pnpm verify`、全资源 `pnpm verify:ci` 或包含 Full-system E2E 的 `pnpm verify:release`。

## Workspace 命令

Spec #178 的维护入口为 Worker `online-auth:state`、`client-snapshot:repair`、`client-snapshot:verify`。
它们与 `client-sso:upgrade` 均通过 `bun run` 默认读取 `apps/worker/.env`，已有进程环境变量优先。
资源变量、source/unified 布局、namespace、停流/排空、退出码和完整命令见
[统一维护手册](../releases/unified-session-maintenance.md)。旧 `client-runtime`/Provider 命令的去向也在该页逐项登记；
代码候选通过不授权目标环境维护。

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:integration:<component|process|redis|postgres|composition|browser>`
- `pnpm test:e2e`
- `pnpm typecheck`
- `pnpm verify:static`
- `pnpm verify`
- `pnpm verify:ci`
- `pnpm verify:release`
- `pnpm e2e:install`
- `pnpm e2e:install:browsers`
- Full-system runtime lifecycle（workspace-local）：`pnpm --filter @iam/e2e-system runtime:lifecycle`
- Full-system Admin Custom SSO journey（workspace-local）：`pnpm --filter @iam/e2e-system admin:journey`
- Full-system HR Admin User Management journey（workspace-local）：`pnpm --filter @iam/e2e-system hr-admin:journey`
- Full-system OIDC Authorization Code + PKCE journey（workspace-local）：`pnpm --filter @iam/e2e-system oidc:journey`
- Full-system exact-project recovery（workspace-local）：
  `pnpm --filter @iam/e2e-system runtime:cleanup -- --descriptor <run-descriptor.json>` 或
  `pnpm --filter @iam/e2e-system runtime:cleanup -- --project <exact-project>`
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
Integration 资源由调用方负责：维护者可以提供现有 URL，agent 也可以先启动临时 Docker 容器。聚合
`test:integration` 本身不启动 Docker，而是在任何 profile 启动前一次性列出全部缺失的 PostgreSQL/Redis 环境变量；
任何专用 URL 都不得回退 runtime 或其他 test URL。资源 tasks 在 Turbo
strict env 下显式透传对应 owner URL 并保持 `cache:false`。
`pnpm test` 永久代理 `pnpm test:unit`；有 Unit collection 的 package 使用同一代理，没有 Unit collection 的 package
不发布空 `test`。旧 `test:smoke`、`test:external`、package-local `test:postgres`/`test:redis` 与 frontend `e2e`
collection aliases 已删除。

`pnpm check:test-collection` 通过 Vitest/Playwright 机器 list、Bun 窄目录与 Turbo dry-run 验证每个当前候选的唯一收集、
路径/命名归属和 root task 可达性。它与 production Architecture Guard 分离，不分析测试断言、资源调用或 AST/data flow。

`pnpm test:unit` 以 Turbo concurrency 2 运行可缓存的 Unit。Admin 与 SSO 的 package-local Vitest Unit 固定使用 4 个
workers，其他 Vitest Unit 使用 25% workers，Bun Unit 使用 `--max-concurrency=2`。Architecture Guard 不进入 package
`test`，由根级 `pnpm check:architecture` 单独执行。

真实进程/端口行为由 `test:integration:process` 以 Turbo concurrency 1 运行，并禁用任务缓存：

```bash
pnpm --filter @iam/api-core test:integration:process
pnpm --filter @iam/api test:integration:process
pnpm --filter @iam/admin-api test:integration:process
pnpm --filter @iam/worker test:integration:process
```

`@iam/api-core` 已作为 collection migration 的 Bun tracer bullet 发布 package-local canonical commands：

```bash
pnpm --filter @iam/api-core test:unit
pnpm --filter @iam/api-core test:integration:component
pnpm --filter @iam/api-core test:integration:process
pnpm --filter @iam/api-core test:integration:redis
```

`@iam/api` 已发布以下 package-local canonical commands：

```bash
pnpm --filter @iam/api test:unit
pnpm --filter @iam/api test:integration:component
pnpm --filter @iam/api test:integration:process
pnpm --filter @iam/api test:integration:composition
pnpm --filter @iam/api test:integration:postgres
pnpm --filter @iam/api test:integration:redis
pnpm --filter @iam/api test:integration:browser
```

OIDC 完整协议由 `@iam/oidc` Redis collection 与 `@iam/api` 的 HTTP/process/composition/browser collection 验证。

`@iam/admin-api` 已发布 Unit、component、process、postgres、composition 与 redis package-local canonical commands；`@iam/worker` 已发布
Unit、component、process、postgres 与 redis commands：

```bash
pnpm --filter @iam/admin-api test:unit
pnpm --filter @iam/admin-api test:integration:component
pnpm --filter @iam/admin-api test:integration:process
pnpm --filter @iam/admin-api test:integration:postgres
pnpm --filter @iam/admin-api test:integration:composition
pnpm --filter @iam/admin-api test:integration:redis
pnpm --filter @iam/worker test:unit
pnpm --filter @iam/worker test:integration:component
pnpm --filter @iam/worker test:integration:process
pnpm --filter @iam/worker test:integration:postgres
pnpm --filter @iam/worker test:integration:redis
```

Admin 的 `test-smoke/client-cache-invalidation.runtime-smoke.ts` 是 Redis test 使用的 production runtime entry
fixture，不是测试候选。legacy client cache 仅以真实 Redis profile 验证通用 invalidation/update；Custom SSO 与 Traffic Gate
通过 production `clientRuntimeInvalidation` seam 和真实 service mutation 验证 required Snapshot invalidation，Traffic Gate acquisition
另由 canonical Snapshot Adapter/Reader、共享真实 Redis 与 production composition contracts 覆盖；API
legacy cleanup 的精确删除边界由 API Core 的真实 Redis profile 在独占 cleanup 资源上验证；process profile 不再运行 RESP
compatibility case。

Database、Role Assignment、Organization Responsibility Resolution 与 User Profile Read Model 已发布以下
package-local canonical commands：

```bash
pnpm --filter @iam/db test:unit
pnpm --filter @iam/db test:integration:postgres
pnpm --filter @iam/organization-responsibility-resolution test:integration:component
pnpm --filter @iam/organization-responsibility-resolution test:integration:postgres
pnpm --filter @iam/role-assignment-resolution test:integration:component
pnpm --filter @iam/role-assignment-resolution test:integration:postgres
pnpm --filter @iam/user-profile-read-model test:unit
pnpm --filter @iam/user-profile-read-model test:integration:component
pnpm --filter @iam/user-profile-read-model test:integration:postgres
pnpm --filter @iam/user-profile-read-model test:integration:redis
```

两个 resolution package 都没有空的 Unit profile。旧 Subject Projection V1 rehearsal 已随 strict V2 激活撤销；
受控数据准备统一由 Worker 的版本无关 `user-profile:*` maintenance 命令拥有。

Pure shared packages、ESLint config、Client Subject Projection 与 Gateway 已发布以下 package-local canonical commands：

```bash
pnpm --filter @iam/contracts test:unit
pnpm --filter @iam/domain test:unit
pnpm --filter @iam/eslint-config test:unit
pnpm --filter @iam/jobs test:unit
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

`@iam/e2e-system` 通过 root `pnpm test:e2e` 发布完整 Full-system collection：受独立 60 秒 deadline 约束的 preflight 通过后才创建唯一 Compose
project，以动态 Gateway host port 等待 PostgreSQL、Redis、etcd 与 APISIX healthy，在空 volumes 上执行真实 Drizzle migrations，
再启动 API、Admin API、Worker、Admin 与 SSO。Runtime healthy 后命令校验 rendered Compose 的 canonical origin 合同，
通过 production owner 建立固定 synthetic scenario 并写安全 seed receipt，依次运行 production Worker 的
`user-profile:verify-postgres` 与 `user-profile:verify-redis`；两道 gate 均通过后才渲染 repo-owned Gateway routes，并从
canonical origin 完成 protocol readiness；OIDC
discovery 会精确核对 issuer、authorization endpoint、token endpoint 与 JWKS URI，而不是只接受 HTTP 200。
它还核对 UserInfo `/oidc/me` 与 RP-initiated logout `/oidc/session/end`。普通 lifecycle command 不回显 child stdout/stderr；
Descriptor 落盘后、diagnostic tool build 与资源创建前先原子写入安全的 `not-attempted` migration receipt；初始化失败不会创建资源。
真正 migration 前更新为 `attempted`，随后写 `applied` 或不含命令、环境及原始错误的 `failed`。Compose/runtime 只使用 feature
固定或 run-generated synthetic data/credentials，不接受 production endpoint、production credential 或真实 PII。
服务日志只保留有界完整行，超长单行整行标记为 `[TRUNCATED]`；diagnostics 原样保留有界 source 内容，不做 JSON/YAML/JWK/PEM/
credential 分类或脱敏。Run-scoped Playwright staging 的 raw trace/PNG/WebM 安全移动到 artifact directory 并保留；metadata 只辅助枚举。
Intake 受独立 source deadline 约束，最多接受 128 个文件、单文件 16 MiB、合计 64 MiB，并拒绝路径越界与 symlink。任一 required
diagnostic source 失败时，已取得的 artifacts、unavailable placeholder 与 index 仍先写完，然后 run 在 cleanup 尝试后非零退出。
Preflight 发生在 descriptor/resource 之前；其失败直接非零退出，不运行不存在 project 的 diagnostics/cleanup。Descriptor
落盘后的 runtime setup/readiness/seed failure、timeout 与可捕获 signal 都先尽量保存有界原始诊断再尝试 best-effort cleanup；cleanup failure
保持非零。`admin:journey` 复用同一 lifecycle，在 protocol readiness 后用真实 Chromium 登录 Admin，通过真实 Admin UI 创建跨树
Organization Responsibility，轮询 Internal Detail/DSL 与 Custom SSO UserInfo 验证 Profile/Facts 发布，并证明 Gateway/authorization
裁剪责任；随后通过真实状态 mutation 将独立目标 client 切入 Maintenance，在维护中配置并启用 Gateway Custom SSO。公开
authorize/user-info 验证维护阻断，恢复正常后复用未变更的 Local Session，再以维护中的真实 disable/enable mutation 验证旧 Session
经显式捕获会话撤销后永久失效，并由同一有效 UserSession 重新授权。该命令固定
单 project、单 worker、零 retry；浏览器启动 preflight 失败时在资源创建前退出，journey 失败时则保留 raw trace/PNG/WebM 并进入统一
diagnostics 与 exact-project cleanup。`hr-admin:journey` 使用真实 `iam-admin` Client、普通 `iam:hr-admin` Role、Role Assignment、
两棵一级根组织及跨根普通任职，通过真实 Worker 发布后经 SSO 登录 Admin；它证明四模块 UI、全局只读 Position、User/Employment
范围导航、一个范围内 User 编辑，以及范围外 Organization REST mutation 的 `404`。Playwright 后、cleanup 前的 production Drizzle
verifier 同时证明 User、成功 audit、`user-updated` invalidation/Profile 收敛与范围外无写入；有界 Admin API 日志 capture 证明
denial security log 不包含 scope/root 集合，并写入安全的 `hr-admin-outcome-receipt.json`。`oidc:journey` 以相同的单 project、单 worker、零 retry 与 evidence/cleanup 边界运行独立
OIDC browser slice；真实 Admin UI 在 Maintenance 中完成 OIDC disable/enable，test-owned RP helper 只生成 S256 verifier/challenge 并接收
registered callback，真实 repo-owned authorize、登录、resume、token 与 `/oidc/me` 负责协议行为。该 slice 从 canonical origin 验证
暂态阻断与恢复、interaction Cookie、PKCE mismatch、成功兑换、code replay、`iam:employments` responsibility snapshot、Employment
Pause cascade 后的 authorization-time replay、ID Token 排除、discovery/JWKS/health 及维护中 logout 永久失效。Root command 在同一个
exact-project lifecycle 中固定按 Admin → HR Admin → OIDC 运行，任一失败都进入统一
diagnostics 与 cleanup；cleanup failure 传播为 root command 非零。Workspace-local 单 journey 命令只用于聚焦调试：

```bash
pnpm test:e2e
pnpm --filter @iam/e2e-system runtime:lifecycle
pnpm --filter @iam/e2e-system admin:journey
pnpm --filter @iam/e2e-system hr-admin:journey
pnpm --filter @iam/e2e-system oidc:journey

# 宿主异常后只按一个明确恢复目标清理；不接受 glob/prefix scan
pnpm --filter @iam/e2e-system runtime:cleanup -- --descriptor e2e/system/test-results/<run-id>/run-descriptor.json
pnpm --filter @iam/e2e-system runtime:cleanup -- --project iam-e2e-<run-id>
```

Explicit recovery 的 cleanup 有独立 120 秒 deadline，对 exact project 执行一次
`compose down -v --remove-orphans --rmi local`，不使用 prefix、glob 或 prune，也不查询/删除额外 image IDs 或把四类 inventory=0
作为成功硬门禁。SIGINT/SIGTERM 与 timeout 对当前 child/tree 做一次 best-effort 终止并短暂有界等待；Windows 最多调用一次
`taskkill /T /F`，不记录 PID CreationDate、不使用 CIM fallback 或 typed termination gate。Cleanup failure 非零并保留 descriptor，
允许残留，由显式 recovery 重试同一 exact target。

`pnpm verify` 通过 `scripts/verify.mjs` 按以下顺序 fail-fast：

1. static：`pnpm lint`、`pnpm check:docs`、`pnpm check:env-names`、`pnpm check:architecture`、`pnpm check:test-collection`；
2. typecheck：`pnpm typecheck`；
3. test:unit：`pnpm test:unit`；
4. build：`pnpm build`。

`pnpm verify:static` 使用同一 runner 的 `--static` 参数，仅运行上述 static 阶段；默认 `verify` 复用该阶段，
不重复运行 Collection Guard。未知参数、启动失败和子进程异常均非零退出。各单项检查命令保留用于排查。

`pnpm verify:ci` 固定顺序执行 `verify -> test:integration`；`pnpm verify:release` 固定顺序执行
`verify:ci -> test:e2e`。两者都是 provider-neutral 的浅组合：任一 owner command 非零即停止并透传失败，不另行解释资源、
diagnostics 或 cleanup。命令名不表示已经接入 CI provider，也不授予 merge、发布或部署权限。Integration 资源与 Full-system
E2E lifecycle 的详细契约分别由本页后续专用资源说明和 [测试编排架构](../architecture/testing-architecture.md) 持有。

统一 Snapshot 通过 Core Redis、Admin composition 和 Worker CLI 验证；最终 schema/数据门禁分别使用 DB/Worker PostgreSQL。
维护命令与固定旧工具迁移顺序见[统一维护手册](../releases/unified-session-maintenance.md)，测试不提供目标环境操作授权。

当前 Windows 本地聚合 evidence 与平台 adoption 状态见
[测试编排架构的“默认验证与交付”](../architecture/testing-architecture.md#默认验证与交付)；Linux/真实 CI 尚未验收。

外部资源检查不进入 `pnpm verify`，需要时显式运行：

```bash
# API/OIDC 真实 production entry 联合 PG/Redis 验证；全部资源由调用方独占、非生产且可销毁
IAM_API_TEST_DATABASE_URL=<dedicated-url> IAM_API_TEST_REDIS_URL=<dedicated-url> \
pnpm test:integration:composition

# 也可按 package 单独运行；缺少该 package 的任一 URL 会 fail fast，不会 skip 或回退
pnpm --filter @iam/api test:integration:composition

# Database migration contract（guard、raw rollback、Drizzle journal replay、普通索引锁；需专用 IAM_DB_TEST_DATABASE_URL）
pnpm --filter @iam/db db:check
pnpm --filter @iam/db test:integration:postgres

# Worker Client Protocol epoch 与 User Profile maintenance contracts（需专用 IAM_WORKER_TEST_DATABASE_URL）
pnpm --filter @iam/worker test:integration:postgres

# Worker Client Runtime targeted/full repair 与独立 full verify production wiring（需 owner-specific 专用 URL）
IAM_WORKER_TEST_REDIS_URL=<dedicated-non-production-url> \
pnpm --filter @iam/worker test:integration:redis

# Role assignment PostgreSQL contract（需由调用方提供专用 IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL）
pnpm --filter @iam/role-assignment-resolution test:integration:postgres

# Organization Responsibility resolver PostgreSQL contract（需专用 IAM_ORGANIZATION_RESPONSIBILITY_TEST_DATABASE_URL）
pnpm --filter @iam/organization-responsibility-resolution test:integration:postgres

# API Purveyor contact 并发 contract（需由调用方提供专用 IAM_API_TEST_DATABASE_URL）
pnpm --filter @iam/api test:integration:postgres

# Admin API 组织责任任命事务/并发 contract（需由调用方提供专用 IAM_ADMIN_API_TEST_DATABASE_URL）
pnpm --filter @iam/admin-api test:integration:postgres

# API Custom SSO Client runtime Redis contract（需由调用方提供专用 IAM_API_TEST_REDIS_URL）
pnpm --filter @iam/api test:integration:redis

# Admin API Custom SSO Client cache mutation contract（需由调用方提供专用 IAM_ADMIN_API_TEST_REDIS_URL）
pnpm --filter @iam/admin-api test:integration:redis


# User Profile V3 publication、readiness 与查询 contracts（需专用 IAM_USER_PROFILE_TEST_DATABASE_URL）
pnpm --filter @iam/user-profile-read-model test:integration:postgres

# User Profile Subject Facts 单条/CAS/batch prewarm contract（需专用 IAM_USER_PROFILE_TEST_REDIS_URL）
pnpm --filter @iam/user-profile-read-model test:integration:redis

# Session Kernel Redis contracts（需专用 owner URL）
IAM_SESSION_KERNEL_TEST_REDIS_URL=<namespace-isolated-url> \
pnpm --filter @iam/session-kernel test:integration:redis

# API Core Redis contracts（需专用 owner URL；当前 Snapshot inventory 测试串行运行）
IAM_API_CORE_TEST_REDIS_URL=<namespace-isolated-url> \
pnpm --filter @iam/api-core test:integration:redis

# Mock-browser Integration
pnpm --filter @iam/admin test:integration:browser
pnpm --filter @iam/sso test:integration:browser

# APISIX
pnpm gateway:apisix:validate -- <environment-arguments>
```

测试命令和 harness 不负责启动 Docker。Agent 按开发工作流提供临时资源、等待 ready 并记录准确 container ID，
测试结束只按该 ID 清理，不使用 glob、prefix scan 或 prune。

维护者决定 #69 的 Client Runtime full repair contract 与 #68 targeted repair 共用
`IAM_WORKER_TEST_REDIS_URL` owner resource，不新增 cleanup-specific env，也不跨其他可见环境推断 Redis identity。Worker harness
只登记本次 Client/restore fixture 与 non-owner sentinel，测试后精确 `UNLINK` 并验证当前 Module-owned inventory 无残留。
API Core full restore contract 使用现有 `IAM_API_CORE_TEST_REDIS_URL`，写 fixture 前证明当前 Snapshot inventory 为空；七条旧 Runtime pattern 对应的测试 key 只是 non-owner fixture，
用于证明当前 repair 保留它们且 verify 不以其残留失败。测试仅精确清理自己登记的 fixture，维护命令不拥有旧 key。

旧 Ticket 12 的 V1 rehearsal/backfill/verify 入口已随 strict V2 激活撤销。维护者只使用本页列出的
User Profile maintenance、API/OIDC external entry、hermetic process smoke 与数据库 rollback seams；不得把 URL credential、
Token、Subject、完整 Redis key 或 Secret 写入验收记录。

Subject Projection tightening migration 通过 Drizzle 应用后，rollback 必须在 authentication traffic 与 user/client writes
均已停止的 maintenance freeze 内运行下列命令。命令读取显式 `DATABASE_URL`，默认精确补偿
`drizzle.__drizzle_migrations` 中 `20260801144944_sturdy_landau` 的 name、timestamp 与本地 migration SHA-256；identity
不一致时 fail closed，且 DDL 与 journal delete 位于同一 transaction。未通过 Drizzle migrator 的 raw-SQL rehearsal
没有 journal row，可直接执行 migration 目录内的幂等 `rollback.sql`。

```bash
pnpm --filter @iam/db subject-projection:rollback
```

## 工具链强制执行

```bash
# 绕过 Turbo task cache 的强制执行
pnpm exec turbo typecheck --force --concurrency=3
pnpm exec turbo test:unit --force --concurrency=2
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

- OIDC：`pnpm --filter @iam/oidc <lint|typecheck|test:integration:redis>`；Redis 使用独立 `IAM_OIDC_TEST_REDIS_URL`。
  本包的完整授权 HTTP 组合由 API Redis profile 收集，生产已由 API 默认装配，旧 Provider app 已删除。
  退出浏览器回归为 `pnpm --filter @iam/api test:integration:browser`，使用专用 `IAM_API_TEST_REDIS_URL` 和已安装 Chromium；
  单 worker、零重试，由 fixture 启动动态 loopback 候选 API/测试 RP，不创建 Docker 或使用运行环境。

- Full-system E2E lifecycle：
  root `pnpm test:e2e`；workspace-local
  `pnpm --filter @iam/e2e-system <test:e2e|runtime:lifecycle|admin:journey|hr-admin:journey|oidc:journey|runtime:cleanup|lint|test|test:unit|typecheck>`。
  当前只完成 Windows 本地验收，未宣称 Linux/CI adoption
- API backend：`pnpm --filter @iam/api <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:composition|test:integration:postgres|test:integration:redis|typecheck>`
- Admin API backend：`pnpm --filter @iam/admin-api <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:postgres|test:integration:composition|test:integration:redis|typecheck>`
- Session Kernel：`pnpm --filter @iam/session-kernel <lint|test:integration:redis|typecheck>`
- API Core：`pnpm --filter @iam/api-core <lint|test|test:unit|test:integration:component|test:integration:process|test:integration:redis|typecheck>`
- Custom SSO：`pnpm --filter @iam/custom-sso <lint|test|test:unit|typecheck>`；完整 HTTP/Redis 在 API collection。
- Client Subject Projection：`pnpm --filter @iam/client-subject-projection <lint|test:integration:component|typecheck>`
- User Profile Read Model：`pnpm --filter @iam/user-profile-read-model <lint|test|test:unit|test:integration:component|test:integration:postgres|test:integration:redis|typecheck>`
- Worker：`pnpm --filter @iam/worker <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:postgres|test:integration:redis|typecheck|employment:verify|user-profile:backfill|user-profile:repair|user-profile:verify-postgres|user-profile:verify-redis|client-sso:upgrade|client-snapshot:repair|client-snapshot:verify|online-auth:state>`
- Employment 全库只读诊断：
  `IAM_WORKER_DATABASE_URL=<target-url> pnpm --filter @iam/worker employment:verify`
- 历史审计 action 一次性规范化：显式 `IAM_WORKER_DATABASE_URL` 下运行
  `pnpm --filter @iam/worker audit:actions -- inventory`、
  `pnpm --filter @iam/worker audit:actions -- apply --writers-stopped` 和独立
  `pnpm --filter @iam/worker audit:actions -- verify`。固定映射、退出码、事务锁及发布/恢复门禁见
  [操作手册](../releases/audit-action-canonicalization.md)；当前代码候选已移除运行时别名，工具继续独立保留；代码交付不证明目标环境已迁移。
- Client 单协议一次性升级：显式 `IAM_WORKER_DATABASE_URL` 下运行 Worker `client-sso:upgrade`。
  `inventory --writers-stopped` 输出安全库存；`apply --writers-stopped --manifest <path>` 只处理明确 scope；
  新进程 `verify --writers-stopped --manifest <path>` 核验该范围，另加 `--all` 才作为收缩旧列前的全量数据 gate。
  执行前完整读取[现有发布流程中的 Client 升级](../releases/online-auth-redis-time-cutover.md#client-单协议业务数据升级)，
  使用停写盘点的原摘要、协议选择、实际部署回调和固定新凭据 ID；不提供 Secret 输出、Snapshot repair 或线上迁移。
- Subject Access 恢复：
  `pnpm --filter @iam/worker run user-profile:repair -- --subject-access-only --limit <positive-integer>`。
  该模式依次执行 PostgreSQL stale pending transition intent 回收、Redis transition recovery 与 authority repair，
  不执行 User Profile maintenance。它会更新 PostgreSQL transition intent，不局限于 Redis indexed backlog；所需权限、
  stale threshold 与调度责任见[Subject Access Barrier](../architecture/backend-architecture.md#subject-access-barrier)。
- User Profile 全量重建与版本无关 readiness：先运行
  `pnpm --filter @iam/worker user-profile:backfill` 派发既有 versioned rebuild jobs；批量大小通过
  `IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE=<positive-integer>` 配置。
  等待 Worker 收敛并按需运行 `user-profile:repair` 后，依次运行
  `pnpm --filter @iam/worker user-profile:verify-postgres -- [--batch-size <positive-integer>]` 和
  `pnpm --filter @iam/worker user-profile:verify-redis -- [--batch-size <positive-integer>]`。Backfill 的 `enqueued`
  只表示已派发，不表示 readiness 已通过；两个 gate 任一失败都必须修复并重跑。
- 统一 Snapshot repair/verify 与 source/unified 状态维护：使用 Worker `client-snapshot:repair`、`client-snapshot:verify`、
  `online-auth:state`，完整停流/资源/参数/失败重跑边界见[统一维护手册](../releases/unified-session-maintenance.md)。
  旧 `client-runtime:*`、Provider 维护和 epoch 命令已退役；`client-sso:upgrade` 必须在固定扩展期旧制品与旧 schema 下先完成。
- Admin frontend：`pnpm --filter @iam/admin <dev|build|lint|test|test:unit|test:integration:component|test:integration:browser|typecheck|format>`
- SSO frontend：`pnpm --filter @iam/sso <dev|build|lint|test|test:unit|test:integration:component|test:integration:browser|typecheck|format>`
- Database：`pnpm --filter @iam/db <lint|test|test:unit|test:integration:postgres|typecheck|db:push|db:generate|db:migrate|db:check>`
- Role Assignment：`pnpm --filter @iam/role-assignment-resolution <lint|test:integration:component|test:integration:postgres|typecheck>`
- Organization Responsibility Resolution：`pnpm --filter @iam/organization-responsibility-resolution <lint|test:integration:component|test:integration:postgres|typecheck>`
- Gateway：`pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|test:unit|test:integration:component|typecheck>`

`employment:verify` 只在运维人员显式调用时扫描 Employment，不属于 Worker 启动或请求路径。它在 PostgreSQL
`READ ONLY` transaction 中检查非墓碑未知状态、Open Position/Organization 完整性、Employment Period、Open `endTime`、
Ended `endTime`、未来 Open `startTime`、重复 Open 组合和多个 Open Primary。报告 `passed` 时退出 0；存在任一阻断项时
报告 `failed` 并退出 1，按稳定分类列出全部相关 Employment ID。Legacy Employment Tombstone 单独计数且不因缺少可信
`endTime` 阻断。命令不解释 `updateTime`、不生成修复 SQL，也不修改数据；管理员必须依据真实业务通过正式入口修正后重跑。

共享 packages 使用相同的 filtered 模式，例如：

```bash
pnpm --filter @iam/domain test
pnpm --filter @iam/domain lint
pnpm --filter @iam/domain typecheck
```
