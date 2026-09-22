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

## Sandcastle AFK

本机 Docker + Codex CLI 执行全仓 `ready-for-agent` backlog；选票、评审、合并和关票权限见
[AFK 工作流](../agents/workflow.md#sandcastle-afk-批量实施)。`pnpm sandcastle` 会调用模型、修改代码和 GitHub issues，
并把通过验收的 ticket 分支普通合并到启动时的调用分支；运行前选定该分支。

首次使用时，按 `.sandcastle/.env.example` 创建未跟踪的 `.sandcastle/.env`，填写 `GH_TOKEN`。
默认认证为 ChatGPT/Codex 账号：先执行 `codex login`，并确保 Codex 使用文件凭据存储；runner 会把本次运行的
`auth.json` 复制到临时目录后挂载进 Docker。退出前把 CLI 刷新后的凭据写回来源文件，再删除暂存目录；
检测到来源登录状态已变化或保存失败时，不覆盖该状态，报错并保留启动时打印的恢复目录。
此同步不提供跨进程登录锁，运行期间避免在宿主同时刷新或重新登录同一份凭据；强制结束进程后也应核对该恢复目录。
需要 API 计费时显式设置 `CODEX_AUTH=api-key` 并填写
`CODEX_API_KEY`；`CODEX_AUTH_FILE` 可指定登录凭据文件。GitHub 固定为 `cyy1998/shgas-iam`。
宿主需要仓库工具链、Git、GitHub CLI 和运行中的 Docker；镜像内版本与依赖以 `.sandcastle/Dockerfile` 为准。

```bash
pnpm sandcastle:build
pnpm sandcastle:check
pnpm sandcastle:smoke
pnpm sandcastle
pnpm sandcastle --iterations 2 --parallel 2 --model <model>
```

`sandcastle:build` 构建执行镜像；`sandcastle:check` 只预检工具、镜像和认证配置。
`sandcastle:smoke` 创建可销毁的 sandbox 与 PostgreSQL/Redis，验证工具链、Merger 依赖挂载和连接，并用本地桩程序
让 Planner、Implementer、Merger 三份真实 prompt 经过 SDK 的参数校验与展开，检查 Codex 生效角色配置及评审事件接线；不调用模型或访问 GitHub，
也不证明真实 Codex 模型已执行双轴子代理评审。
运行参数默认 10 批、最多 2 张 ticket 并行；`--iterations`、`--parallel` 只调整本次运行。
`--model`（优先）或 `SANDCASTLE_MODEL` 只覆盖 Planner/Merger 的模型，两者默认 `gpt-6-astra`、思考程度 `high`。

Planner 从仓库 `.codex/agents/implementer-{light,standard,deep}.toml` 定义的实施者中选择，
实施者的模型、思考程度与职责以这些角色文件为准。当前 light 为 `gpt-5.6-luna` / `medium`，
standard 为 `gpt-5.6-sol` / `high`，deep 为 `gpt-6-astra` / `xhigh`。
双轴评审使用 `.codex/agents/standards-reviewer.toml` 与 `.codex/agents/spec-reviewer.toml`，
两轴均为 `gpt-6-astra` / `high`，不随实施者档位降低。Runner 为容器内 CLI 提供子代理配置，
不修改用户宿主 Codex 配置；会话内评审和十轮上限见[双轴评审流程](../agents/workflow.md#sandcastle-afk-批量实施)。

Codex CLI 0.154 的角色 override 忽略 `sandbox_mode`，因此评审角色的只读要求属于职责约束，不能保证子代理在
操作系统层面只能读取。Runner 检查原始事件中的实际 spawn、新子代理 ID，以及绑定 review base/candidate 的两轴
completed 结果；事件不提供 `agent_type`，这些检查不能机器证明角色身份或评审质量。

普通失败和 Ctrl+C 会清理本次测试资源；若宿主被强制终止，按 `.sandcastle/resources/` 中对应记录的准确
container/network ID 恢复清理。`run.lock` 记录进程与目标分支，确认旧进程已结束后才移除该文件。
已有 ticket 分支可重新进入评审和合入交接，包括代码已合入、GitHub 关票尚未完成的情况。
队列耗尽前还有一次父 Spec 收尾核对。锁定的 Sandcastle 0.12.0 使用 `patches/` 中的 signal 补丁，允许此 runner
通过 AbortSignal 等待清理，避免 SDK 提前 `process.exit`；升级依赖时须重新验证普通与 provisioning 中断路径。

宿主 runner 为每个执行器提供独占 PostgreSQL、Redis 与网络，等待 ready 后注入 owner-specific test URLs，
结束时按记录的准确资源 ID 清理。Linux sandbox 内独立安装 workspace 依赖，不复用 Windows `node_modules`。
当前 sandbox 不提供 Docker-in-Docker，Full-system E2E 等额外环境要求可能无法满足；这些检查属于 ticket 或 Spec 的
必需验收时，应保留 open 并记录缺失条件，不能以 `pnpm verify` 通过代替。

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

## OIDC 协议套件

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

## 历史数据维护工具

`audit:actions` 仍用于旧审计 action 或旧备份规范化，显式提供 `IAM_WORKER_DATABASE_URL`：

```bash
pnpm --filter @iam/worker audit:actions -- <inventory|apply|verify>
```

apply 要求 `--writers-stopped`；冲突拒绝、事务锁、独立 verify 与未知提交恢复按
[审计规范化手册](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/audit-action-canonicalization.md)执行。

b648、managed-callback 配置升级、`online-auth:state --layout source` 及配套旧版本演练已退役。
历史来源升级须恢复[固定历史版本的工具与流程](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases)，
不能在当前 checkout 调用这些入口。当前状态维护只接受显式 `--layout unified`，历史结果不构成当前候选通过声明。

## 工具链强制执行

#200 后 `pnpm test:e2e` 在原同 origin 全系统基线之后，再启动独立 exact project 执行两个不同 hostname 的
`dual-entry.spec.ts`；不需要另设环境变量选择第二阶段。workspace-local journey 仍只服务聚焦调试。
双入口协议的命令与资源见[OIDC 协议套件](#oidc-协议套件)。

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
