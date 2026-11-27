# 测试与验证

选择验证方式时，先确定要观察的行为及其失败后果。运行、筛选和恢复命令见[测试与验证通道](commands.md#测试与验证通道)，交付前的检查见[验证节奏](../agents/workflow.md#验证节奏)，整体分层与 CI 决策见 [ADR-0060](../adr/0060-unify-test-architecture-sandbox-and-ci-gate.md)。

## 验证选择

| 要验证的事实                       | 选择依据                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 类型兼容、包出口、依赖方向         | 由消费方 typecheck 验证类型与公开出口，用[架构守卫](#架构守卫)检查可静态表达的依赖边。                                 |
| 业务规则、DTO 裁剪                 | 通过模块公开接口验证输入、结果和副作用。进程内能观察到目标行为时选 Unit。                                              |
| 事务、失败恢复、正式接线、进程关闭 | 依赖数据库提交、Redis 状态、网络或子进程退出的结论，用相应真实资源做 Integration。                                     |
| 浏览器与平台能力                   | 构建前端，并在所需运行环境验证。Cookie 域隔离要经过不同 hostname、真实代理与浏览器，两个 loopback 端口只验证端点差异。 |
| 跨服务业务旅程与生产镜像           | 需要同时验证真实前后端、生产 Dockerfile / Nginx、网关、协议或后台处理时，运行生产容器 Full-system E2E。                |
| 目标环境恢复、放流                 | 按[对应运维手册](../releases/README.md)核验现场的配置、数据和入口。                                                    |

跨模块变更要明确观察时点、哪些作用已经生效，以及谁负责恢复。共享能力的故障与恢复由所属模块集中验证，消费方验证正式接线和自己的差异。静态规则只能证明已检查的依赖关系，授权和事务原子性需用行为证据。进程停止由集成测试发送真实 POSIX 信号验证。合入 `main` 的权威门禁统一由 [GitHub Actions CI](commands.md#github-actions-ci) 的 `ci-gate` 承担。

## 测试分类

| 层级                  | 归类依据                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit（L1）            | 进程内完成。可使用多个真实模块、Hono 内存请求、jsdom 或无真实网络的 MSW。读取固定只读 fixture 也可归入此层。由 Turbo 编排并缓存。             |
| Integration（L2）     | 使用真实 PostgreSQL、Redis、APISIX、HTTP 服务或应用子进程，由 `pnpm test:integration` 统一收集与调度。                                        |
| Full-system E2E（L3） | 启动完整生产容器 Docker Compose 栈，经真实 APISIX 双入口完成 9 个跨服务业务旅程，并同时覆盖生产镜像、`nginx.conf` 与 `pnpm deploy` 依赖闭包。 |

先判断是否需要完整系统，再按实际资源依赖归类。同一行为可在不同层验证不同事实，例如前端验证权限变化后的交互，后端验证请求是否获得授权。

## 路径与命名

| Collection      | 位置                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Unit            | workspace 模块对应层级的 `__tests__/*.test.ts[x]`（以及 `.sandcastle/__tests__/*.test.ts`）          |
| Bun Integration | workspace 的 `test-integration/<feature>/**/*.integration.test.ts[x]`                                |
| Full-system E2E | `e2e/system/specs/**/*.spec.ts`，由 [Playwright 配置](../../e2e/system/playwright.config.ts)实际选取 |

Admin 和 SSO 的普通 Unit 使用 Node。依赖浏览器全局或 React DOM 的 `*.dom.test.ts[x]` 在同一 Unit runner 的 jsdom 环境加载兼容 setup。各文件按需注册 MSW 生命周期，复用所在应用的 Testing Library 和路由辅助代码。纯类型契约放在 typecheck 收集的 `*.type-contract.ts`，对允许和禁止的用法分别做正向约束和必要的 `@ts-expect-error` 断言。

## 测试质量原则

- 一个用例保护一个可命名行为，可同时断言其前后状态、结果和副作用。每例建立并清理自己的状态，用显式信号、可控 Promise 或时钟同步并发，真实到期和进程退出用真实资源验证。
- 仅替换外部依赖，保留被测模块的内部协作。断言应能识别错误实现，例如给正式 mapper 多余的输入以验证裁剪，通过可观察的写入验证禁止重放。顺序和次数只有属于契约时才固定，性能预算需直接测量。
- 共享 mapper 的完整输出由所属模块验证。消费方验证自己的转换和调用。通过行为验证业务规则，静态分析器才以路径和 import 文本作为测试输入。
- Admin 测试按功能组织。共同行为只覆盖一次，角色差异通过能力和范围输入表达。对权限拒绝、范围变化和失败恢复分别验证，mock API 的前端测试只证明前端行为。

### 当前契约与测试清理

按保护的行为判断是否删测试。删除仅检查历史名称缺席或重复验证相同结果的断言前，确认仍生效的契约已有等效证据。迁移、兼容和恢复能力保留历史输入及非目标数据保护的行为测试。临时迁移检查注明负责人、原因和移除日期。替代测试暴露缺陷时保留失败证据，清理退役测试时一并移除专用 fixture 和故障开关。测试清理本身不改变生产行为，也不引入断言扫描器。

### 禁止纯展示测试

删除只锁定静态文案、图标、样式、DOM 排列或 mock 回显的断言。权限、输入、状态或恢复引起的可见变化属于前端功能，协议文本、转义和脱敏也可构成独立契约。以行为判断保留范围，文案定位和 matcher 名称均不能单独作为删除依据。

完整系统里可用元素定位完成点击、输入和同步。旅程的结果通过真实请求、接口回读、持久状态、回调 URL 或 Cookie 断言。页面布局、按钮状态和提示文案的检查留给前端相应层级。

## Bun 异步断言

Bun 测试中的数据库、Redis、HTTP、子进程和 readiness 等真实 I/O，须先用普通 `await` 等待完成，再同步断言结果。失败路径先捕获 rejection，再断言错误。

```ts
const report = await gate.verify(validInput);
expect(report).toMatchObject(expectedReport);

let failure: unknown;
try {
  await gate.verify(invalidInput);
} catch (error) {
  failure = error;
}
expect(failure).toBeInstanceOf(ExpectedError);
```

真实 I/O 禁用 `.resolves`、`.rejects` 和 async `toThrow`，即使外层使用 `await expect(...)` 也一样。Bun 1.3.14 曾在异步 matcher 内重入事件循环，导致测试悬挂。升级后仍保留此规则，解除前须确认上游修复并完成真实 PostgreSQL、Redis 和进程回归。排查时保留现有超时与生产生命周期。此约束仅适用于 Bun。[上游跟踪](https://github.com/oven-sh/bun/issues/33261)

## Root 工具链的一次性验证

仓库级 runner、资源管理、Git hook、质量命令和静态守卫通常采用一次性行为验证。静态检查与显式诊断继续保留，各 app/package 及 `e2e/system` 维护各自的测试集合。
[ADR-0060](../adr/0060-unify-test-architecture-sandbox-and-ci-gate.md#收集分层与根工具链)规定根工具链通常采用一次性验证，[ADR-0059](../adr/0059-adopt-native-sandcastle-afk-orchestration.md) 为 Sandcastle AFK 保留窄范围常驻边界单测。

1. 用实际命令或临时 fixture 验证正常结果及相关失败、退出码和清理。对只读守卫，分别验证应通过和应拒绝的输入。涉及 Git、进程或 Docker 时使用独立临时资源。
2. 涉及消费方接线或跨服务行为时，从[正式入口](commands.md#测试与验证通道)运行受影响的 Integration 或 E2E。
3. 交付时记录实际命令、结果与未验证范围，删除临时脚本和 fixture。需要保留的日志放在忽略的 `test-results/`。

### Sandcastle 验证

- **窄范围常驻边界单测**。根 `pnpm test:unit`（含在 `pnpm verify` 内）先执行 `pnpm test:unit:sandcastle`（`bun test ./.sandcastle/__tests__`），再用 Turbo 执行各 workspace 的 Unit。[`.sandcastle/__tests__/boundaries.test.ts`](../../.sandcastle/__tests__/boundaries.test.ts) 聚焦覆盖：
  - GraphQL 过滤、分页溢出、`linkedBranches`、Spec 完整范围判据与同仓库 Open PR 复用；
  - 凭据预检、远端 URL、精确 Git ref、兼容后续修复提交的 `verifyMergeCommit`、末次闭合 `extractTag` 与 CLI 参数校验；
  - 方案 X 无特权只读/可写会话隔离（零 `/var/run/docker.sock`、零 `--network=host`、零额外 `groups`、可写阶段注入专用测试端点）与单向只读 `auth.json`；
  - 远端 `ci-gate` 闭环（严格 `head_sha === finalSha && name === 'ci-gate'` 匹配与分页、失败日志脱敏与尾部截断、最多 2 次自动修红、超限/超时/无前进提交/外部关闭 PR 暂停、`--draft` 立即交付、断线重启续接与取消授权软停止）。
    单实例互斥由根 `package.json` 的外部 `flock -n .sandcastle/runner.lock` 提供。
- **类型检查**。`pnpm typecheck:root` 通过 [Sandcastle tsconfig](../../.sandcastle/tsconfig.json) 与 [scripts tsconfig](../../scripts/tsconfig.json) 检查 `.sandcastle/` 及 `scripts/` 全部代码与测试。
- **方案 X 真实 Docker 冒烟**。`pnpm sandcastle:smoke`（经 `node .sandcastle/run.mts --smoke` 调用 [`.sandcastle/smoke.mts`](../../.sandcastle/smoke.mts)）在临时克隆仓库上用本地探测 Provider 串行验证两类无特权沙箱：
  - linked worktree 自洽只读评审沙箱（工作树与 `.git` 不可写、`auth.json` 单向只读、无 `/var/run/docker.sock` 与 `docker` CLI、无法访问宿主 loopback、无 `pnpm-store` / Turbo 缓存 / Docker registry / GitHub 凭据，且未设 `DOCKER_HOST`，未注入专用测试端点）；
  - 可写方案 X 实施沙箱（宿主独占 worktree + `head` 模式、零 `/var/run/docker.sock` / `docker` CLI / `--network=host`、`onSandboxReady` 安装依赖并启动专用测试服务、Turbo 跨次缓存落盘宿主、经 `core.hooksPath=.husky` 直接启用 `.husky/pre-commit` 且不改宿主 `.git/config`、容器内实跑原生 PostgreSQL + Redis + etcd + APISIX 集成测试并确认测试命令退出后服务仍可用）。准备、诊断与恢复见[运维手册](../../.sandcastle/README.md#启动与诊断)。

### 架构守卫

#### 观察范围

守卫通过[共享 workspace 图](../../scripts/workspace-graph.mjs)按 `pnpm-workspace.yaml` 发现 workspace。
清单无法读取或解析时，守卫报告路径并终止检查，修复清单后可重新运行。
生产源码扫描覆盖 `packages/*` 下的非测试支持包及 `apps/*` 下的非前端应用，排除 `iamWorkspace.kind` 为 `e2e` 的 workspace。
包名导入映射到非 E2E workspace 的 `src`，公共 API 与分层后端由 `iamWorkspace.architecture.tier` 标识，公共 API 同时属于分层后端。
公共 API 的相互隔离由该 tier 推导。传递生产依赖违规报告禁用依赖的声明行，并输出从公共 API 到该依赖的完整链。

永久规则只根据生产源码路径、规范的静态 import/re-export（含类型或值、裸 side-effect import）、供 `consumer-owned-port` 使用的生产 `*.port.ts` 中直接 `Pick<T, ...>` 的未解析基类型名，以及 workspace 依赖闭包和 Dockerfile 字面量 `COPY` 建立。Specifier 按已支持的 alias、相对路径、扩展名和包子路径做词法归一化，裸 side-effect import 按值依赖处理，第三方依赖按包名或其子路径匹配。公共后端的包边界沿生产 workspace 清单检查传递依赖，包含 dependencies、optionalDependencies 和 peerDependencies。符号来源、第三方内部依赖、类型解析、计算所得的加载路径、控制流和数据流超出守卫范围。[规则与例外](../../scripts/architecture-guard.ts)

#### 永久规则准入与验证

新增永久规则须对应 `Current` 文档中的依赖或模块归属约束，能由上述事实完整表达，且现有包出口、类型或行为验证无法更直接地覆盖。例外限于明确路径或模块，退役路径或标识符的迁移检查随迁移结束移除。每个受影响的语义事实用允许和违规的临时 fixture 调用 `analyzeRepositoryArchitecture(repoRoot)` 验证，诊断须含稳定 rule ID、文件、行号及原因。工具性能单独观察，保留既有超时和重试策略。

#### Docker 依赖闭包

从镜像 workspace 及 Dockerfile 复制的 manifest 出发，沿 dependencies、devDependencies 和 optionalDependencies 的 `workspace:` 边展开。
闭包内 `packages/*` 下未标记为 `test-support` 的包须分别 `COPY` 清单和包目录。通向受保护包的中间节点（例如 `test-support`）仅须复制清单。
镜像 app 须复制自己的清单和 app 目录，也可用 `src/` 代替 app 目录。消费方满足 peerDependencies，实际构建验证 `RUN`、shell 和构建参数。

## 收集与编排

每个测试归属一个 workspace 的一个 collection。所属 workspace 维护 runner、收集目录、setup 和 fixture。Vitest 不跨 workspace 共用配置或 setup。L2 Integration 由 Bun 执行，L3 Full-system E2E 由 Playwright 执行。新增用例遵循[路径与命名](#路径与命名)。调整 include/exclude、Vitest projects 或脚本时，核对根入口能到达受影响集合并实际运行。一次成功运行只覆盖被收集的用例。

Turbo 负责带缓存任务（`build`、`typecheck`、`test:unit`，通过 `transit` 传播依赖源码变化），`turbo.json` 不再维护闲置的 `test:integration:*` 配置。[任务图与缓存配置](../../turbo.json)

根 [Integration runner](../../scripts/run-test-integration.mjs) 收集 `apps/*` 与 `packages/*` 的集成测试文件。各包在 `package.json` 的 `iamTest.integration` 中以布尔值声明执行器所需的 `postgres` / `redis` 依赖。根入口先处理 `--workspace` / `--file` 筛选和资源预检，再在所属 workspace 直接启动执行器。Bun 只使用进程环境中的配置，关闭自动加载工作区 `.env`。定向到单文件时仍使用所属执行器的资源声明。[声明示例](../../apps/sso-api/package.json) · [收集与筛选](../../scripts/test-resources/integration-selection.mjs) · [运行及定向命令](commands.md#测试与验证通道)

Admin 与 SSO 的页面和路由行为在 L1 中通过 Vitest 的 jsdom project、React Testing Library 与 MSW 验证。应用级用例加载生产路由并在 HTTP 边界替换后端响应。SSO 开发代理由 Vitest Node project 启动 Vite 与 loopback 上游验证。跨服务旅程、浏览器 Cookie 与生产容器入口由 L3 Full-system E2E 验证。

`e2e/system` 仅保留进程内 Unit 测试（`src/__tests__/`，随 `pnpm test:unit` 执行）与 L3 生产容器 Full-system E2E（`pnpm test:e2e`）。SSO API 的独立 RP 场景通过进程内双入口 HTTP fixture 接入常规 Bun 集成测试。

## 并发、timeout 与清理

| 运行范围              | 失败后何时停止                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 聚合检查与验证        | 当前命令启动失败或非零退出，后续命令不再启动。[检查与验证入口](../../scripts/verify.mjs)                                                                                                                                         |
| 根 Integration 任务   | 根 runner 优先启动耗时较长的任务，默认最多同时运行 3 个任务。任一任务失败即取消在途进程树，停止新任务，并在回收资源前等待所有已启动任务收尾。[根 Integration runner](../../scripts/run-test-integration.mjs)                     |
| 包级 Integration 用例 | Bun 以 `--max-concurrency=1` 运行用例并启用首错停止。达到失败上限时停止调度，已启动的用例仍需收尾。[根 runner](../../scripts/run-test-integration.mjs)                                                                           |
| Full-system E2E       | 一次 Playwright 运行固定单个 worker（本地 0 重试、CI 1 次重试），跑完全部选中用例。每个 spec 文件边界（含 `retry` 与 `repeatEachIndex`）自动复位，按需用 `-x` 首错停止。[Playwright 配置](../../e2e/system/playwright.config.ts) |

Timeout 用于限制悬挂。进程测试等待实际 readiness，同时观察启动错误与退出。成功、失败、超时或可捕获中断后均须尝试停止并等待所属进程树，再释放端口、连接及目录。清理有独立预算，失败时报告原因并保留原始错误。Linux 通过 `/proc` 中继承的进程归属标记回收后代。需要管道 stdin 的直接子进程由测试夹具单独创建进程组后按组回收。[进程生命周期](../../packages/runtime/src/process/owned-process-tree.mjs) · [进程 smoke harness](../../packages/test-support/src/process-smoke-harness.ts)

### 专用资源与隔离

- **独占测试端点**。本地通过 [Compose](../../scripts/test-resources/compose.yaml) 启停，Sandcastle 可写沙箱和 CI 在执行前各自准备服务。根 runner 消费 `IAM_TEST_POSTGRES_URL`、`IAM_TEST_REDIS_URL`，以及真实 Gateway APISIX 文件需要的 `IAM_TEST_APISIX_ADMIN_URL` 和 `IAM_TEST_APISIX_ADMIN_KEY`。本地未指定的端点使用固定 loopback 端口。同一套端点每次仅供一条顶层 Integration 命令使用。
- **PostgreSQL 建模板前双保险守卫**。[模板准备脚本](../../scripts/test-resources/postgres-template.mjs) 在建库前校验基础库与模板库，要求库名包含测试标识，拒绝系统库及与 `DATABASE_URL` 或任意 `IAM_*_DATABASE_URL` 匹配的数据库。每轮迁移并封存 `iam_test_template`。[共享 harness](../../packages/test-support/src/postgres-test-harness.ts) 按文件克隆独立库，在第一次重置时缓存业务表与所属序列。重置通过实际行数据和序列状态选择表，执行 `TRUNCATE ... RESTART IDENTITY CASCADE` 并保留迁移日志。文件结束后删除克隆库。迁移专项用例可从 `template0` 克隆空库。
- **Redis 槽位与清理顺序**。根 runner 预检 `PING` 与 `SELECT 31`，为每个使用 Redis 的任务分配独占 `/1` 至 `/31` 槽位。`/0` 保留。用例结束先完成观察并停止已登记的执行者，再对独占 DB 执行 `FLUSHDB`，最后关闭控制连接。停止失败时跳过重置并报告失败。禁止 `FLUSHALL`。[共享 Redis harness](../../packages/test-support/src/external-test-resources.ts)
- **Gateway APISIX 预检与重置**。命中真实 APISIX 测试文件时，runner 探活 Admin API 并验证七类资源的空基线。[Gateway fixture](../../apps/gateway/test-integration/support/apisix.fixture.ts) 在用例成功收尾后重置并回读空基线，失败时停止复用。
- **诊断与恢复**。逐任务输出写入 `test-results/integration/<run-id>/logs/`，终端报告任务耗时与总墙钟。资源由供给环境回收。强制中断后确认任务进程树退出，再重新创建本地专用服务或使用一套干净的外部端点。[运行及恢复命令](commands.md#测试与验证通道)

正常业务状态由生产模块建立，损坏变体和内部状态观察使用所属模块的 `/testing`。Unit 可使用事务替身，Admin 的正式事务接线和 Ops 的维护 CLI 由 Integration 验证。Worker 通过进程内 composition 验证周期恢复，Ops 通过正式命令函数验证维护行为。独立进程 smoke 覆盖服务监听、就绪探测、环境装配、信号与退出码。API 协议集成测试使用进程内 API、独立 RP 和专用资源。[进程测试辅助](../../packages/test-support/src/process-smoke-harness.ts)

## Full-system E2E

全部 9 个跨服务业务 spec（`admin-custom-sso`、`application-admission`、`directory-custom-attributes`、`dual-entry`、`hr-admin-user-management`、`oidc-pkce`、`wecom-qr-binding`、`wecom-qr-oidc`、`wecom-qr`）统一在生产 Dockerfile 构建的独占 Docker Compose 容器栈上运行，天然覆盖 8 个生产应用镜像、`nginx.conf` 与 `pnpm deploy` 依赖闭包。浏览器经真实 APISIX 双入口（`external.iam.localhost` 与 `internal.iam.localhost`，以及企业微信扫码手机端 HTTPS 入口）观察跨服务业务结果、Cookie 作用域与入口隔离。根命令 `pnpm test:e2e` 直连 Playwright 包装入口，剥离 `--` 前的运行时开关（`--skip-build`、`--keep`），透传文件筛选、`-g`、`-x`、`--last-failed` 和 `--ui` 等参数。[E2E 命令](commands.md#full-system-e2e) · [运行时编排](../../e2e/system/src/runtime/e2e-runtime.ts) · [Compose 配置](../../e2e/system/docker-compose.e2e.yml)

### 初始化与就绪

- **独占生产容器栈**。每轮创建独立项目 `iam-e2e-<uuid>`。静态 Compose 配置声明服务、网络和数据卷，动态端点与测试凭据由资源记录注入。Compose 构建 10 个镜像（APISIX、桩服务与 8 个生产应用），并发由 `COMPOSE_PARALLEL_LIMIT` 控制，日志写入 `build.log`。启用 GHA 缓存时，仅构建命令叠加 [缓存配置](../../e2e/system/docker-compose.e2e.gha-cache.yml)。镜像构建成功后标记为 `iam-e2e-<service>:local`，供 `--skip-build` 校验并复用。
- **四合一桩服务**。[容器 `e2e-stubs`](../../e2e/system/src/stubs/e2e-stubs-server.ts) 使用网络别名 `qyapi.weixin.qq.com` 和仅挂载给 `auth-api` 的测试 CA 承接企业微信 HTTPS 请求，通过 `IAM_AUTH_API_SMS_URL` 接收短信并供测试轮询，托管 RP 回调终端页 `/portal/e2e-rp.html`，并通过鉴权端点 `POST /_stubs/reset` 清空企业微信与短信状态。
- **一次性初始化与快照**。基础设施健康后迁移 PostgreSQL，启动 Worker，在运行时进程中执行 seed 并等待 User Documents 发布。PostgreSQL 快照 `seed-data.sql` 包含 `public` 表的截断与数据恢复语句，保留 `drizzle` schema。Redis 快照 `seed-redis.json` 保存非 `bull:*` 键的值和剩余有效期。随后启动其余应用，通过 Gateway API 发布 APISIX 路由并探测双入口和企业微信手机端 HTTPS 路由。Worker 保持运行。
- **按 spec 边界原地复位**。首个 spec 直接使用已初始化的数据。[Playwright fixture](../../e2e/system/src/runtime/gateway-test.ts) 在切换 spec、重试或重复执行时检查 Worker 是否运行，必要时启动同一容器。接着在单个 PostgreSQL 事务中恢复快照，在同一 Redis 事务中执行 `FLUSHDB` 和 `RESTORE`，最后重置桩状态。全程使用该轮独占的数据库和 Redis，已运行的容器及 APISIX 路由继续服务。需要验证 Worker 恢复的 spec 可显式停启 Worker。[复位实现](../../e2e/system/src/runtime/e2e-context.ts)

### 失败诊断与清理

运行目录为 `test-results/e2e/<project>/`，包含资源记录 `run.json`、运行上下文 `runtime-context.json`、种子快照及日志。Playwright 使用 `list` reporter，失败时保留截图、trace 和视频于 `playwright/`。失败或保留现场时，E2E Compose 运行时采集 `containers.log` 与 `services.log`。CI 失败时上传 `test-results/e2e/**/*.log`，保留 7 天。
运行结束后按 `run.json` 精确回收本轮容器、网络与数据卷（保留 `iam-e2e-*:local` 本地镜像供后续运行与 `--skip-build` 复用）。指定 `--keep` 时保留容器栈并输出精确清理命令；强制中断后先确认所属进程树退出，再按[恢复命令](commands.md#full-system-e2e)清理准确记录或 project。

## 验证结果与交付

按改动选择实际需要的验证层级。[核心检查与验证](commands.md#聚合验证)说明本地核心命令组合，[GitHub Actions CI](commands.md#github-actions-ci) 定义远端 `ci-gate` 权威门禁，[工作流](../agents/workflow.md#验证节奏)规定何时执行或复用结果。交付摘要记录候选、实际命令、通过范围及未执行项，缺少必需的检查时标明缺口。环境是否已部署、恢复或可放流，须以目标环境的 runbook 检查为准。
