# 测试与验证

选择验证方式时，先确定要观察的行为及其失败后果。运行、筛选和恢复命令见[测试与验证通道](commands.md#测试与验证通道)，交付前的检查见[验证节奏](../agents/workflow.md#验证节奏)。

## 验证选择

| 要验证的事实                       | 选择依据                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 类型兼容、包出口、依赖方向         | 由消费方 typecheck 验证类型与公开出口，用[架构守卫](#架构守卫)检查可静态表达的依赖边。                                              |
| 业务规则、DTO 裁剪                 | 通过模块公开接口验证输入、结果和副作用。进程内能观察到目标行为时选 Unit。                                                           |
| 事务、失败恢复、正式接线、进程关闭 | 依赖数据库提交、Redis 状态、网络或子进程退出的结论，用相应真实资源做 Integration。                                                  |
| 浏览器与平台能力                   | 构建前端，并在所需运行环境验证。Cookie 域隔离要经过不同 hostname、真实代理与浏览器，两个 loopback 端口只验证端点差异。              |
| 跨服务业务旅程                     | 需要同时验证真实前后端、网关、协议或后台处理时，经临时完整系统入口运行 E2E。正式协议套件另有[独立入口](commands.md#oidc-协议套件)。 |
| 目标环境恢复、放流                 | 按[对应运维手册](../releases/README.md)核验现场的配置、数据和入口。                                                                 |

跨模块变更要明确观察时点、哪些作用已经生效，以及谁负责恢复。共享能力的故障与恢复由所属模块集中验证，消费方验证正式接线和自己的差异。静态规则只能证明已检查的依赖关系，授权和事务原子性需用行为证据。进程停止由集成测试发送真实 POSIX 信号验证。

## 测试分类

| 层级            | 归类依据                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Unit            | 进程内完成。可使用多个真实模块、Hono 内存请求、jsdom 或无真实网络的 MSW。读取固定只读 fixture 也可归入此层。     |
| Integration     | 使用真实数据库、网络、监听端口、子进程、浏览器，或需要创建和清理文件系统状态。单个前端的真实浏览器测试属于此层。 |
| Full-system E2E | 启动完整临时系统，经真实入口完成业务旅程，并观察跨服务结果。                                                     |

先判断是否需要完整系统，再按实际资源依赖归类。同一行为可在不同层验证不同事实，例如前端验证权限变化后的交互，后端验证请求是否获得授权。

## 路径与命名

| Collection               | 位置                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Unit                     | workspace 模块对应层级的 `__tests__/*.test.ts[x]`                                              |
| Bun / Vitest Integration | workspace 的 `test-integration/<feature>/**/*.integration.test.ts[x]`                          |
| Playwright Integration   | 所属 workspace 的 `test-integration/<feature>/**/*.spec.ts`                                    |
| Full-system E2E          | `e2e/system/**/*.spec.ts`，由 [Playwright 配置](../../e2e/system/playwright.config.ts)实际选取 |

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
[ADR-0009](../adr/0009-adopt-canonical-test-collections.md#收集检查与-root-工具链) 规定根工具链通常采用一次性验证，[ADR-0059](../adr/0059-converge-sandcastle-afk-on-minimal-extractable-core.md) 为 Sandcastle 编排核心保留常驻单测。

1. 用实际命令或临时 fixture 验证正常结果及相关失败、退出码和清理。对只读守卫，分别验证应通过和应拒绝的输入。涉及 Git、进程或 Docker 时使用独立临时资源。
2. 涉及消费方接线或跨服务行为时，从[正式入口](commands.md#测试与验证通道)运行受影响的 Integration 或 E2E。
3. 交付时记录实际命令、结果与未验证范围，删除临时脚本和 fixture。需要保留的日志放在忽略的 `test-results/`。

### Sandcastle 验证

- **常驻单测**。根 `pnpm test:unit`（含在 `pnpm verify` 内）先执行 `pnpm test:unit:sandcastle`，再用 Turbo 执行各 workspace 的 Unit。独立入口收集 [core](../../scripts/sandcastle/core/__tests__/) 与 [adapters](../../scripts/sandcastle/adapters/__tests__/) 的 Bun 单测。高层编排用例驱动临时 Git 仓库和本地 bare remote，以执行器和 GitHub CLI 为外部替身，覆盖任务图、并行实施与串行集成、按 Git trailer 和 SHA 恢复、评审与幂等交付。适配器用例还覆盖共享凭据预检，锁用例验证内核 `flock` 互斥与强杀释放。
- **静态边界**。`pnpm check:architecture` 执行 [Sandcastle 核心依赖规则](#sandcastle-核心依赖边界)。`pnpm typecheck:root` 通过 [Sandcastle tsconfig](../../scripts/sandcastle/tsconfig.json) 收集核心、适配器、CLI 和仓库配置。
- **真实 Docker 冒烟**。`pnpm sandcastle:smoke` 使用本地探测 Provider 串行验证只读和可写沙箱。验证覆盖只读环境隔离、工作树、Git 元数据保护、锁定安装、容器内真实提交 Hook 与宿主 Git 配置，以及 socket、host network 和单执行器资源回收。准备、诊断与恢复见[运维手册](../../.sandcastle/README.md#启动与诊断)。

### 架构守卫

#### 观察范围

永久规则只根据生产源码路径、规范的静态 import/re-export（含类型或值、裸 side-effect import）、供 `consumer-owned-port` 使用的生产 `*.port.ts` 中直接 `Pick<T, ...>` 的未解析基类型名，Sandcastle 核心的字面量动态导入，以及 workspace 依赖闭包和 Dockerfile 字面量 `COPY` 建立。Specifier 按已支持的 alias、相对路径、扩展名和包子路径做词法归一化，裸 side-effect import 按值依赖处理，第三方依赖按包名或其子路径匹配。公共后端的包边界沿生产 workspace 清单检查传递依赖，包含 dependencies、optionalDependencies 和 peerDependencies。符号来源、第三方内部依赖、类型解析、计算所得的加载路径、控制流和数据流超出守卫范围。[规则与例外](../../scripts/architecture-guard.ts)

#### 永久规则准入与验证

新增永久规则须对应 `Current` 文档中的依赖或模块归属约束，能由上述事实完整表达，且现有包出口、类型或行为验证无法更直接地覆盖。例外限于明确路径或模块，退役路径或标识符的迁移检查随迁移结束移除。每个受影响的语义事实用允许和违规的临时 fixture 调用 `analyzeRepositoryArchitecture(repoRoot)` 验证，诊断须含稳定 rule ID、文件、行号及原因。工具性能单独观察，保留既有超时和重试策略。

#### Sandcastle 核心依赖边界

`sandcastle-core-dependency-boundary` 检查 `scripts/sandcastle/core/` 生产源码的静态导入、重导出及字符串字面量 `import()`，只允许核心目录内的相对路径、Node 内置模块和 `@ai-hero/sandcastle` 及其子路径。本仓配置和适配器依赖核心，仓库私有工具通过配置和生命周期契约接入。允许与违规的 fixture 由 Sandcastle 常驻集合验证。

#### Docker 依赖闭包

从镜像 workspace 及 Dockerfile 复制的 manifest 出发，沿 dependencies、devDependencies 和 optionalDependencies 展开。消费方满足 peerDependencies，通向受保护包的中间节点须复制 manifest，受保护包还须复制源码。实际构建验证 `RUN`、shell 和构建参数。

## 收集与编排

每个测试归属一个 workspace 的一个 collection。所属 workspace 维护 runner、收集目录、setup 和 fixture。Vitest 不跨 workspace 共用配置或 setup。非浏览器 Integration 在同一 workspace 选 Bun 或 Vitest，浏览器由 Playwright 收集。新增用例遵循[路径与命名](#路径与命名)。调整 include/exclude、Vitest projects 或脚本时，核对根入口能到达受影响集合并实际运行。一次成功运行只覆盖被收集的用例。

Unit 由 Turbo 跨 workspace 编排，通过 `transit` 传播依赖源码变化，允许有界并发，仅在输入、环境、时间和随机性均可复现时缓存。Integration 与 E2E 由各自的根入口编排，执行结果不缓存。[任务图与缓存配置](../../turbo.json)

根 Integration runner 根据 workspace 的 `iamTest.integration` 选择执行器和资源，以 `workspace:executor` 为单位直接运行包级脚本。筛选单个文件仍沿用所属执行器的完整资源声明。包级 runner 核验本次 run ID、记录的运行状态、该任务的资源 URL 和选中的文件。参数无效、无匹配或缺少资源时退出失败。[声明示例](../../apps/sso-api/package.json) · [收集与筛选](../../scripts/test-resources/integration-selection.mjs) · [运行及定向命令](commands.md#测试与验证通道)

`e2e/system` 的编排器 Integration 用独立入口收集，由各用例管理自己的测试环境。测试进程退出后，独立入口按本次登记回收未清理的项目。根 Integration 入口会拒绝对此 workspace 的筛选。[独立入口与路径门禁](commands.md#full-system-e2e)

## 并发、timeout 与清理

| 运行范围              | 失败后何时停止                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 聚合验证              | 当前命令启动失败或非零退出，后续命令不再启动。[基础验证](../../scripts/verify.mjs) · [CI 与发布验证](../../scripts/run-verification-gate.mjs)                                                                                                                                                                                                  |
| 根 Integration 任务   | 根 runner 优先启动耗时较长的任务，默认最多同时运行 3 个任务，允许不同执行器重叠。任一任务失败即取消在途进程树，停止新任务，并在回收资源前等待所有已启动任务收尾。[根 Integration runner](../../scripts/run-test-integration.mjs)                                                                                                               |
| 包级 Integration 用例 | Bun 与 Vitest 限制并发并启用首错停止。Playwright 零重试、失败上限为 1。带资源或 resource provider 的集合固定单 worker，无资源集合默认使用 `min(4, max(2, floor(cpus / 2)))` 个 worker。Admin 和 SSO 的 mock API 用例可在同一文件内并行。达到失败上限时停止调度，已启动的用例仍需收尾。[包级 runner](../../scripts/run-package-integration.mjs) |
| Full-system E2E       | 一次 Playwright 运行默认使用一个 worker、零重试，跑完全部选中用例。新文件开始前自动复位，按需用 `-x` 首错停止。[Playwright 配置](../../e2e/system/playwright.config.ts)                                                                                                                                                                        |

Timeout 用于限制悬挂。进程测试等待实际 readiness，同时观察启动错误与退出。成功、失败、超时或可捕获中断后均须尝试停止并等待所属进程树，再释放端口、连接及目录。清理有独立预算，失败时报告原因并保留原始错误。Linux 通过 `/proc` 中继承的进程归属标记回收后代。需要管道 stdin 的直接子进程由测试夹具单独创建进程组后按组回收。[进程生命周期](../../packages/runtime/src/process/owned-process-tree.mjs) · [进程 smoke harness](../../packages/test-support/src/process-smoke-harness.ts)

### 专用资源与隔离

- **命令隔离**。根 runner 先登记本次 run ID，子 Compose project 启动前登记在本轮记录旁。声明需要 PostgreSQL 或 Redis 时，根 runner 再以动态 loopback 端口启动所需服务。不同命令独占各自环境，浏览器服务器由所属 workspace 管理。测试使用专用资源及合成数据。
- **PostgreSQL 隔离**。临时 PostgreSQL 使用带 `1g` 上限的 `tmpfs`，关闭 `fsync`、`synchronous_commit` 和 `full_page_writes`。根 runner 在发布运行环境前迁移一次并封存模板库。普通业务 fixture 按文件克隆独立数据库，以标准 `public` schema 连接，动态清空业务表并保留迁移账本，文件结束后删除克隆。迁移专项用例从干净库或 schema 开始执行迁移。[模板 harness](../../packages/test-support/src/postgres-test-harness.ts)
- **Redis 隔离与重置**。根 runner 在 `test-environment.json` 为每个声明 Redis 的任务分配独占的逻辑 DB，依次使用 `/1` 至 `/31`，保留 `/0`。同一 workspace 的不同执行器各有自己的槽位。先完成业务观察，停止本例全部 consumer、子进程与连接，再对独占 DB 执行 `FLUSHDB`，最后关闭控制连接。任一停止失败即跳过重置，仍尝试其余收尾并汇总错误。禁止 `FLUSHALL`。非目标数据保护、生产连接关闭和只读作用须在重置前观察。[资源生命周期 helper](../../packages/test-support/src/external-test-resources.ts)
- **Gateway 子环境**。Gateway Integration 在本次运行内复用独立的 APISIX/etcd。用例成功收尾后才重置并回读空基线，失败即停止复用。包级 provider 收尾自己的子 project，保留按 APISIX 配置与 Dockerfile 内容打 tag 的本地镜像供后续运行复用。根 runner 按登记逆序处理剩余子 project，再处理主 project，某项清理失败仍尝试其余项。[Gateway fixture](../../apps/gateway/test-integration/support/apisix.fixture.ts)
- **人工恢复**。保留环境或强制中断后，先确认所属进程树已退出。若父记录旁有 `children.jsonl`，逐项清理已登记的子 project，最后按父记录清理主 project。手工清理只作用于传入的准确记录，禁止按前缀猜测或全局 prune。[手工清理入口](../../scripts/run-test-resource-cleanup.mjs) · [恢复命令](commands.md#测试与验证通道)
- **诊断与保留**。每个已启动任务的 stdout 和 stderr 完整写入 `test-results/integration/<run-id>/logs/<package>-<executor>.log`。终端汇总逐任务耗时、日志路径和本轮墙钟。正常通过后直接回收本次容器、网络和数据卷。执行失败、超时、中断、显式保留或清理失败时尝试保存 `containers.log` 和 `services.log`。容器诊断采集失败只告警，任务日志写入、进程关闭和资源清理失败均使命令失败。AFK 须先确认 sandbox 已停止，再按 registry 处理。[资源管理](../../scripts/test-resources/managed-resources.mjs) · [AFK 工作流](../agents/sandcastle-afk.md)

正常业务状态由生产模块建立，损坏变体和内部状态观察使用所属模块的 `/testing`。Unit 可使用事务替身，Admin 的正式事务接线和 Ops 的维护 CLI 由 Integration 验证。Worker 验证正式进程的周期恢复，Worker 与 Ops 使用各自的专用环境。API 协议浏览器测试使用候选 API、独立 RP 和专用资源。各通道分开保存产物，正式协议套件使用独立输出目录。[进程测试辅助](../../packages/test-support/src/process-smoke-harness.ts) · [OIDC 协议套件](commands.md#oidc-协议套件)

## Full-system E2E

九个业务 spec 通过真实 APISIX 双入口观察业务结果。Docker 运行 PostgreSQL、Redis、etcd 和 APISIX，Auth API、SSO API、Integration API、Admin API、Worker、Gateway API、Admin 和 SSO 在当前执行环境监听回环地址。浏览器通过两个 hostname 分别访问网关，以验证 Cookie 作用域和入口隔离。根命令直连 Playwright 包装入口，剥离 `--` 前的运行时开关，透传文件筛选、`-g`、`-x`、`--last-failed` 和 `--ui` 等参数。[E2E 命令](commands.md#full-system-e2e) · [运行时编排](../../e2e/system/src/hybrid-runtime.ts)

### 初始化与就绪

本地默认复用常驻中间件，互斥锁记录占用进程、工作树及开始时间。接管锁后，运行时先停止并等待旧运行登记的宿主进程，再访问模板或复位数据。回收失败时保留原进程记录，本轮停止。CI、Sandcastle AFK 和 `--fresh` 使用独占 Compose project 和动态端口。运行时按数据库迁移、seed 和 Worker 投影输入的指纹复用或重建模板，等待 Worker 发布并回读基础状态。前端默认使用独立的指纹缓存构建静态产物，`--dev-frontend` 启动 Vite。

E2E PostgreSQL 使用带 `1g` 上限的 `tmpfs`，关闭 `fsync`、`synchronous_commit` 和 `full_page_writes`。常驻 PostgreSQL 容器停止后会丢失数据，下一次启动重建模板。首次从使用 PostgreSQL 命名卷的常驻环境升级时，运行时按原 Compose 记录清理旧 project，再创建新环境。

Hybrid E2E 的 APISIX 使用 host network，通过 `127.0.0.1` 上的动态端口访问业务进程。中间件配置由 Compose 提供，无需宿主机路径 bind mount。网关路由发布后，从 APISIX 容器内探测上游，再检查真实双入口和企微 HTTPS 路由。

首次进入每个 spec 时，fixture 调用本轮鉴权控制端点，等待后端停止、PostgreSQL 克隆模板、Redis 复位和后端重新就绪，再读取最新运行上下文。同文件内的用例共用该基线。Worker 停启由控制端点负责，测试直接读取本轮目录中的短信投递文件。[运行时 fixture](../../e2e/system/src/gateway-test.ts) · [网关测试资源](../../e2e/system/test-assets/)

### 失败诊断与清理

Playwright 临时产物保存到 `e2e/system/test-results/<run-id>/playwright/`。失败摘要独立落在 `e2e/system/.reports/<run-id>/failure-summary.{md,json}`，末尾输出绝对路径，并更新 `.reports/last-failure.{md,json}`。摘要按用例聚合断言、浏览器错误、失败请求和同时间窗服务日志。APISIX 原始错误日志保留在容器内存中，Reporter 按时间窗读取并脱敏后写入摘要。原始 trace、截图和视频可能含合成凭据，按运行目录控制访问与保留期。

运行结束后停止本轮宿主进程，独占模式按本轮登记记录回收容器、卷、网络和本地镜像。指定 `--keep` 时，环境记录提供精确清理命令。常驻中间件通过 `pnpm test:e2e:down` 清理。强制中断后先确认所属进程树退出，再按[恢复命令](commands.md#full-system-e2e)处理准确记录。

## Container Smoke

`pnpm test:e2e:container-smoke` 在独占 Compose project 中按有界并发（默认 `2`，可通过 `IAM_CONTAINER_SMOKE_BUILD_CONCURRENCY` 调整，每镜像独立写入 `build-<service>.log` 并首错取消）构建八个生产镜像和 APISIX，等候全部容器健康。候选工作树在专用库执行迁移，经正式 Ops 初始化命令建立合成基线并验证 Worker 发布，随后通过真实 Gateway API 发布路由。Linux/AFK 下对 Compose bridge 服务的迁移、初始化与网关管理连接优先复用 `managedServiceEndpoint()` 直连容器 IP；单条 Chromium 用例仍经 APISIX 双域名验证 Worker 发布的 User Document、`/portal/login` 登录、Admin 与 SSO 的 Nginx SPA 和静态资源，以及三个公共后端和 Admin API 的真实响应。

命令按本次登记回收容器、网络、数据卷和本地构建镜像。失败或可捕获中断时先采集有限的容器状态和日志，清理本身出错时也尝试采集。诊断、浏览器失败产物与资源记录留在命令输出的运行目录。强制结束或清理失败时，按准确记录恢复。[命令与门禁](commands.md#container-smoke)

## 验证结果与交付

按改动选择实际需要的验证层级。[聚合验证](commands.md#聚合验证)说明各通道的组合，[工作流](../agents/workflow.md#验证节奏)规定何时执行或复用结果。交付摘要记录候选、实际命令、通过范围及未执行项，缺少必需的检查时标明缺口。环境是否已部署、恢复或可放流，须以目标环境的 runbook 检查为准。
