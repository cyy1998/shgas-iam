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

当前会话和 Snapshot 维护入口为 Worker `online-auth:state`、`client-snapshot:repair`、`client-snapshot:verify`。
同名 scripts 通过 `bun run` 默认读取 `apps/worker/.env`，已有进程环境变量优先。
资源、当前布局、namespace、停流/排空与失败处理见[统一维护手册](../releases/unified-session-maintenance.md)。
Profile 重建及 Subject Access 恢复见[Profile 维护手册](../releases/user-profile-maintenance.md)；
一次性升级工具集中在[历史数据维护工具](#历史数据维护工具)，不用于当前代日常恢复。

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

各 profile command 只运行同名 package task；`pnpm test` 代理 Unit。命名、唯一收集、缓存与并发预算统一见
[测试编排架构](../architecture/testing-architecture.md#root-与-package-commands)。

Integration 所需的 owner-specific URL 由调用方提供；agent 可先创建任务独占临时资源。
聚合 `test:integration` 在启动任何 profile 前检查全部 URL，缺失即失败，不启动 Docker，也不回退 runtime 或其他 test URL。

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

### Full-system E2E

`pnpm test:e2e` 由 `@iam/e2e-system` 管理完整临时系统：Docker 与浏览器 preflight、迁移、seed、
readiness、同 origin 旅程及独立双 hostname 阶段。完整行为和诊断契约见
[测试编排架构](../architecture/testing-architecture.md#root-与-package-commands)与
[双入口验收](../architecture/testing-architecture.md#双入口验收与产物隔离)。

只使用测试生成的数据与凭据，不接入生产端点、生产凭据或真实 PII。产物位于 `e2e/system/test-results/`；
workspace-local 单 journey 命令用于聚焦调试：

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

显式恢复有独立 120 秒 cleanup deadline，只清理给定 descriptor 或 exact project；不接受 glob、prefix 或 prune。
Cleanup 失败会非零退出并保留 descriptor，可使用同一目标重试。生命周期和进程终止规则见
[测试编排架构](../architecture/testing-architecture.md#root-与-package-commands)。

### 聚合验证

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
当前维护步骤见[统一维护手册](../releases/unified-session-maintenance.md)，旧工具操作见[历史数据维护工具](#历史数据维护工具)；测试不提供目标环境操作授权。

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
User Profile maintenance、API/OIDC external entry、hermetic process smoke；不得把 URL credential、
Token、Subject、完整 Redis key 或 Secret 写入验收记录。

## OIDC 协议套件与旧来源演练

正式 fixture 位于 [oidc-suite.fixture.ts](../../apps/api/test-integration/composition/oidc-suite.fixture.ts)，
独立 RP 位于 [oidc-rp.integration.test.ts](../../apps/api/test-integration/composition/oidc-rp.integration.test.ts)。
它们不是普通浏览器旅程，也不由基础 verify 自动运行。

### 固定套件与运行配置

复现使用 OpenID conformance-suite release-v5.2.4，固定提交
`ab35a8df4864da35b49eff11483e204e01aa7961`。在对应源码目录应用
[S256 补丁](../features/oidc/conformance-suite-s256.patch)，以 Java 21.0.4、Maven 3.9.11 构建：

```bash
git apply --unidiff-zero <iam-checkout>/docs/features/oidc/conformance-suite-s256.patch
mvn -B -Dmaven.test.skip -Dpmd.skip clean package
```

这些参数跳过套件自身构建测试/PMD，不表示已执行 IAM 协议验证。
补丁仅在 Code Flow 且 iam_s256_required=true 时增加 S256 sequence/verifier，默认关闭；
仓库 suite runner 为本用途显式启用，专用 PKCE 正负用例仍保持原构造，不修改官方断言。

调用方准备任务独占的 IAM_API_TEST_DATABASE_URL、IAM_API_TEST_REDIS_URL，
固定套件及其 MongoDB 6.0.13、Java 原生 HTTPS 与合成 PKCS12、loopback 端口和
fintechlabs.devmode=true。Node/tsx/Playwright 使用仓库锁定依赖。
API 候选由 fixture 启动，TLS 代理不改协议参数，NODE_EXTRA_CA_CERTS 只传给任务 Node 子进程，
不修改机器 trust store。

config.json 示例（填写本次真实路径与候选 SHA）：

```json
{
  "suiteOrigin": "https://localhost:<suite-port>",
  "outputDirectory": "<absolute-task-evidence-directory>",
  "candidate": "<candidate-sha>",
  "issuerMode": "dual",
  "tls": { "keyPath": "<key.pem>", "certPath": "<cert.pem>" }
}
```

issuerMode 默认 dual；需要指定主机时使用 fixture 的 hostnames 配置。
可选 plans/modules 仅用于聚焦重跑，未选择项必须作为未执行记录。
outputDirectory 使用独立任务目录，不放在会被 API Browser 清理的默认产物根。

```bash
pnpm --filter @iam/api exec bun run test-integration/composition/oidc-suite.fixture.ts <config.json>
pnpm --filter @iam/api test:integration:composition
pnpm --filter @iam/api test:integration:redis
```

fixture 负责候选 API、TLS 代理、随机 PG schema、Redis owner 和 Node 进程树，
driver 负责浏览器与官方模块；信号/失败仍逐项尝试清理，超时不冒称清理完成。
官方 REVIEW 使自动 driver 非零，必须独立完成图像判读并保留官方结果，不把它改写为套件 PASSED。
不同 loopback 端口只证明两 issuer 协议；hostname/Cookie 隔离须由真实 APISIX/browser 验证，
见[验证归属](../architecture/architecture-verification.md#行为资源与系统验证)。

### 旧无 issuer 来源演练

固定旧 workspace 为 `5c6707efbf2069649f2c3ea4396bffbd28dcab96`，使用其完整源码与冻结 lockfile，
由调用方准备独占 API PostgreSQL/Redis。它是无 issuer unified 来源，不与精确 b648 的来源工具混用：

```bash
pnpm --filter @iam/api exec bun run test-integration/composition/dual-entry-upgrade.fixture.ts --source-directory <fixed-old-workspace>
```

演练运行固定旧 HTTP writer、全部相关 Worker owner 清理及新服务拒绝/非目标保留检查。
此命令用于历史来源演练；目标环境的一次性切换须核对[固定旧版 OIDC 流程](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/oidc-release-runbook.md)。
历史候选矩阵与本机结果仅通过[固定文档快照](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/features)追溯。

## 历史数据维护工具

以下工具仍在仓库中，面向特定旧数据/备份的一次性操作；当前维护文档的删减不表示工具或兼容能力退役。
先确定实际来源、固定工具及原流程，再按匹配版本执行，不能把表中的入口拼成当前发布步骤。
原 manifest、receipt、恢复文件及失败重跑约束均以链接的固定历史手册为准。

| 历史用途 | 保留入口 | 操作规程 |
|---|---|---|
| b648 默认范围无人值守离线迁移 | `pnpm --filter @iam/worker b648-upgrade`；支持 `--state-dir`、`--migrations-schema` | [无人值守](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/b648-unattended-upgrade.md)；自动路径的默认 namespace、单 Redis DB 和无双协议歧义限制不能省略。 |
| b648 分阶段 Client 数据库迁移 | `bun --no-env-file run apps/worker/scripts/b648-upgrade/index.ts <mode> --writers-stopped`；模式及其余参数按原流程选择 | [数据库步骤](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/b648-client-database-upgrade.md)、[整链升级](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/b648-managed-callback-upgrade.md)；连接用 `DATABASE_URL`。 |
| managed 固定地址转 origin 推导 | `pnpm --filter @iam/worker client-managed-callback:upgrade <inventory\|apply\|verify> --writers-stopped` | [同代保留升级](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/managed-callback-origin-preserving-upgrade.md)；配置命令不完成状态/Snapshot/正式迁移与放流。 |
| 旧审计 action 或旧备份规范化 | `pnpm --filter @iam/worker audit:actions -- <inventory\|apply\|verify>`；显式 `IAM_WORKER_DATABASE_URL`，apply 要求 `--writers-stopped` | [审计规范化](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/audit-action-canonicalization.md)；保留冲突拒绝、事务锁、独立 verify 与未知提交恢复。 |
| 旧在线状态 source 布局 | `pnpm --filter @iam/worker online-auth:state` 的 `--layout source` | [历史维护](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/unified-session-maintenance.md)；不同旧 schema 的 decoder/namespace 不混用。 |

固定旧 Provider writer 的隔离依赖、资源变量与复现入口见[历史证据说明](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/unified-session-maintenance.md#自动化与人工证据)。
这些历史结果不构成当前候选通过声明。现存 b648 composition 验证入口为 Worker
`test:integration:composition`，显式提供独占 `IAM_WORKER_TEST_DATABASE_URL` 和 `IAM_WORKER_TEST_REDIS_URL`。

## 工具链强制执行

#200 后 `pnpm test:e2e` 在原同 origin 全系统基线之后，再启动独立 exact project 执行两个不同 hostname 的
`dual-entry.spec.ts`；不需要另设环境变量选择第二阶段。workspace-local journey 仍只服务聚焦调试。
双入口协议和固定旧状态演练的命令与资源见[OIDC 协议套件与旧来源演练](#oidc-协议套件与旧来源演练)。

#206 的精确 b648 直升演练由调用方提供空的任务独占 Redis DB、PostgreSQL 及冻结依赖的旧源码目录，
显式执行 `bun --no-env-file run apps/api/test-integration/composition/b648-upgrade.fixture.ts <fixed-source-dir> [evidence-dir]`。
不在普通 collection 中隐式安装旧版本。真实 writer、正式 CLI 顺序及不同来源的证据见
[跨代手册](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/b648-managed-callback-upgrade.md)。
API Browser 的输出固定到 `test-results/browser`；suite 的 outputDirectory 应选择独立任务目录，不能依赖
其他 runner 的可清理输出根保存跨通道验收材料。

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
  `pnpm --filter @iam/e2e-system <test:e2e|runtime:lifecycle|admin:journey|hr-admin:journey|oidc:journey|runtime:cleanup|lint|test|test:unit|test:integration:process|typecheck>`。
  当前只完成 Windows 本地验收，未宣称 Linux/CI adoption
- API backend：`pnpm --filter @iam/api <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:composition|test:integration:postgres|test:integration:redis|typecheck>`
- Admin API backend：`pnpm --filter @iam/admin-api <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:postgres|test:integration:composition|test:integration:redis|typecheck>`
- Session Kernel：`pnpm --filter @iam/session-kernel <lint|test:integration:redis|typecheck>`
- API Core：`pnpm --filter @iam/api-core <lint|test|test:unit|test:integration:component|test:integration:process|test:integration:redis|typecheck>`
- Custom SSO：`pnpm --filter @iam/custom-sso <lint|test|test:unit|typecheck>`；完整 HTTP/Redis 在 API collection。
- Client Subject Projection：`pnpm --filter @iam/client-subject-projection <lint|test:integration:component|typecheck>`
- User Profile Read Model：`pnpm --filter @iam/user-profile-read-model <lint|test|test:unit|test:integration:component|test:integration:postgres|test:integration:redis|typecheck>`
- Worker：`pnpm --filter @iam/worker <dev|serve|lint|test|test:unit|test:integration:component|test:integration:process|test:integration:postgres|test:integration:redis|typecheck|employment:verify|user-profile:backfill|user-profile:repair|user-profile:verify-postgres|user-profile:verify-redis|client-snapshot:repair|client-snapshot:verify|online-auth:state>`
- Employment 全库只读诊断：
  `IAM_WORKER_DATABASE_URL=<target-url> pnpm --filter @iam/worker employment:verify`
- Subject Access 恢复：
  `pnpm --filter @iam/worker run user-profile:repair -- --subject-access-only --limit <positive-integer>`。
  该模式依次执行 PostgreSQL stale pending transition intent 回收、Redis transition recovery 与 authority repair，
  不执行 User Profile maintenance。它会更新 PostgreSQL transition intent，不局限于 Redis indexed backlog；所需权限、
  stale threshold、调度与失败恢复见[Profile 维护手册](../releases/user-profile-maintenance.md#subject-access-恢复与外部调度)。
- User Profile 全量重建与版本无关 readiness：先运行
  `pnpm --filter @iam/worker user-profile:backfill` 派发既有 versioned rebuild jobs；批量大小通过
  `IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE=<positive-integer>` 配置。
  等待 Worker 收敛并按需运行 `user-profile:repair` 后，依次运行
  `pnpm --filter @iam/worker user-profile:verify-postgres -- [--batch-size <positive-integer>]` 和
  `pnpm --filter @iam/worker user-profile:verify-redis -- [--batch-size <positive-integer>]`。Backfill 的 `enqueued`
  只表示已派发，不表示 readiness 已通过；窗口、两 gate 和放流见[Profile 维护手册](../releases/user-profile-maintenance.md#全量重建与恢复)。
- 当前 Snapshot repair/verify 与 unified 状态维护：使用 Worker `client-snapshot:repair`、`client-snapshot:verify`、
  `online-auth:state`，完整停流/资源/参数/失败重跑边界见[统一维护手册](../releases/unified-session-maintenance.md)。
  旧 `client-runtime:*`、Provider 维护、epoch 和扩展期 Client 升级命令已退役。
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
