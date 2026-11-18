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

跨模块变更要明确观察时点、哪些作用已经生效，以及谁负责恢复。共享能力的故障与恢复由所属模块集中验证，消费方验证正式接线和自己的差异。静态规则只能证明已检查的依赖关系，授权和事务原子性需用行为证据。同样，Windows 进程内触发信号监听器只验证接到信号后的处理，POSIX 信号投递须在对应环境验证。

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

仓库级 runner、资源管理、Sandcastle、Git hook、质量命令和静态守卫采用一次性行为验证。静态检查与显式诊断继续保留。各 app/package 及 `e2e/system` 继续维护自己的测试集合，根工具链不另建或借用 workspace 常驻集合。[取舍见 ADR-0009](../adr/0009-adopt-canonical-test-collections.md#收集检查与-root-工具链)

1. 用实际命令或临时 fixture 验证正常结果及相关失败、退出码和清理。对只读守卫，分别验证应通过和应拒绝的输入。涉及 Git、进程或 Docker 时使用独立临时资源。
2. 涉及消费方接线或跨服务行为时，从[正式入口](commands.md#测试与验证通道)运行受影响的 Integration 或 E2E。
3. 交付时记录实际命令、结果与未验证范围，删除临时脚本和 fixture。需要保留的日志放在忽略的 `test-results/`。

### 架构守卫

#### 观察范围

永久规则只根据生产源码路径、规范的静态 import/re-export（含类型或值、裸 side-effect import）、供 `consumer-owned-port` 使用的生产 `*.port.ts` 中直接 `Pick<T, ...>` 的未解析基类型名，以及 workspace 依赖闭包和 Dockerfile 字面量 `COPY` 建立。Specifier 按已支持的 alias、相对路径、扩展名和包子路径做词法归一化，裸 side-effect import 按值依赖处理，第三方依赖按包名或其子路径匹配。符号来源、类型解析、动态加载、控制流和数据流超出守卫范围。[规则与例外](../../scripts/architecture-guard.ts)

#### 永久规则准入与验证

新增永久规则须对应 `Current` 文档中的依赖或模块归属约束，能由上述事实完整表达，且现有包出口、类型或行为验证无法更直接地覆盖。例外限于明确路径或模块，退役路径或标识符的迁移检查随迁移结束移除。每个受影响的语义事实用允许和违规的临时 fixture 调用 `analyzeRepositoryArchitecture(repoRoot)` 验证，诊断须含稳定 rule ID、文件、行号及原因。工具性能单独观察，保留既有超时和重试策略。

#### Docker 依赖闭包

从镜像 workspace 及 Dockerfile 复制的 manifest 出发，沿 dependencies、devDependencies 和 optionalDependencies 展开。消费方满足 peerDependencies，通向受保护包的中间节点须复制 manifest，受保护包还须复制源码。实际构建验证 `RUN`、shell 和构建参数。

## 收集与编排

每个测试归属一个 workspace 的一个 collection。所属 workspace 维护 runner、收集目录、setup 和 fixture。Vitest 不跨 workspace 共用配置或 setup。非浏览器 Integration 在同一 workspace 选 Bun 或 Vitest，浏览器由 Playwright 收集。新增用例遵循[路径与命名](#路径与命名)。调整 include/exclude、Vitest projects 或脚本时，核对根入口能到达受影响集合并实际运行。一次成功运行只覆盖被收集的用例。

Turbo 负责跨 workspace 编排。Unit 通过 `transit` 传播依赖源码变化，允许有界并发，仅在输入、环境、时间和随机性均可复现时缓存。Integration 与 E2E 禁用缓存。Strict env 只透传所需资源地址、记录、筛选和工具路径，进程归属标记不计入 hash。[任务图与缓存配置](../../turbo.json)

根 Integration runner 根据 workspace 的 `iamTest.integration` 选择执行器和资源。筛选单个文件仍沿用所属执行器的完整资源声明，对声明了 PostgreSQL 或 Redis 的任务，包级 runner 核验本次 run ID、资源记录及内部 URL。资源测试通过根入口使用本次环境，参数无效、无匹配或缺少资源时退出失败。[声明示例](../../apps/api/package.json) · [收集与筛选](../../scripts/test-resources/integration-selection.mjs) · [运行及定向命令](commands.md#测试与验证通道)

## 并发、timeout 与清理

| 运行范围                     | 失败后何时停止                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 聚合验证                     | 当前命令启动失败或非零退出，后续命令不再启动。[基础验证](../../scripts/verify.mjs) · [CI 与发布验证](../../scripts/run-verification-gate.mjs)                                                                                                                                                                      |
| Integration 阶段与 workspace | 根 runner 顺序运行被选中的执行器阶段，每阶段由 Turbo 串行调度 workspace。任务失败会停止剩余任务，当前阶段非零退出就不再启动后续阶段。[根 Integration runner](../../scripts/run-test-integration.mjs)                                                                                                               |
| 包级 Integration 用例        | Bun 与 Vitest 限制并发并启用首错停止。Playwright 零重试、失败上限为 1。默认单 worker，Admin 的无专用资源 mock API 集合可用两个 worker 并行不同文件。达到上限时停止调度，已启动的用例仍需收尾。[包级 runner](../../scripts/run-package-integration.mjs) · [Admin 浏览器配置](../../apps/admin/playwright.config.ts) |
| Full-system E2E              | 单次 Playwright 调用使用一个 worker、零重试，未设累计失败数上限，普通用例失败后同旅程仍可调度其他用例。外层逐个等待完整旅程，Playwright 非零退出或旅程后置核验失败，都会阻止下一旅程启动。[Playwright 调用](../../e2e/system/src/playwright-journey.ts) · [旅程编排](../../e2e/system/src/full-system-journey.ts)  |

Timeout 用于限制悬挂。进程测试等待实际 readiness，同时观察启动错误与退出。成功、失败、超时或可捕获中断后均须尝试停止并等待所属进程树，再释放端口、连接及目录。清理有独立预算，失败时报告原因并保留原始错误。Windows 使用 Job，Linux 按继承的进程归属标记回收后代。[进程生命周期](../../packages/runtime/src/process/owned-process-tree.mjs)

### 专用资源与隔离

- **命令隔离**。当选中的任务需要 PostgreSQL 或 Redis 时，根 runner 先登记本次 run ID 和准确的 Compose project，再以动态 loopback 端口启动所需服务。不同命令独占各自环境，浏览器服务器由所属 workspace 管理。测试使用专用资源及合成数据。
- **Fixture 重置**。PostgreSQL 使用随机 schema、专用连接和整体清理。Redis 先完成业务观察，停止本例全部 consumer、子进程与连接，再对独占 DB 执行 `FLUSHDB`，最后关闭控制连接。任一停止失败即跳过重置，仍尝试其余收尾并汇总错误。禁止 `FLUSHALL`。非目标数据保护、生产连接关闭和只读作用须在重置前观察。[资源生命周期 helper](../../packages/test-support/src/external-test-resources.ts)
- **Gateway 子环境**。Gateway Integration 在本次运行内复用独立的 APISIX/etcd。用例成功收尾后才重置并回读空基线，失败即停止复用。包级 provider 收尾自己的子 project。根 runner 按登记逆序处理剩余子 project，再处理主 project，某项清理失败仍尝试其余项。[Gateway fixture](../../apps/gateway/test-integration/support/apisix.fixture.ts)
- **人工恢复**。保留环境或强制中断后，先确认所属进程树已退出。若父记录旁有 `children.jsonl`，逐项清理已登记的子 project，最后按父记录清理主 project。手工清理只作用于传入的准确记录，禁止按前缀猜测或全局 prune。[手工清理入口](../../scripts/run-test-resource-cleanup.mjs) · [恢复命令](commands.md#测试与验证通道)
- **诊断与保留**。默认移除本次容器、网络和数据卷，保留运行记录及日志。辅助日志采集失败只告警，进程关闭、资源清理或测试所需证据失败均使命令失败。显式保留的资源按记录恢复。AFK 须先确认 sandbox 已停止，再按 registry 处理。[资源管理](../../scripts/test-resources/managed-resources.mjs) · [AFK 工作流](../agents/sandcastle-afk.md)

正常业务状态由生产模块建立，损坏变体和内部状态观察使用所属模块的 `/testing`。Unit 可使用事务替身，Admin 的正式事务接线和 Ops 的维护 CLI 由 Integration 验证。Worker 验证正式进程的周期恢复，Worker 与 Ops 使用各自的专用环境。API 协议浏览器测试使用候选 API、独立 RP 和专用资源。各通道分开保存产物，正式协议套件使用独立输出目录。[进程测试辅助](../../packages/test-support/src/process-smoke-harness.ts) · [OIDC 协议套件](commands.md#oidc-协议套件)

## Full-system E2E

完整 E2E 集合中的各旅程共用本次独立的双入口 Compose project，以真实前后端、Worker 和 APISIX 观察业务结果。当前收集哪些场景查 [Playwright 配置的 `testMatch`](../../e2e/system/playwright.config.ts)，执行顺序见[旅程编排](../../e2e/system/src/full-system-journey.ts)，定向运行和显式恢复见[E2E 命令](commands.md#full-system-e2e)。

### 初始化与就绪

前置检查在独立期限内确认 Chromium 和 Docker 条件，再创建并持久化 descriptor、初始化迁移 receipt。以上步骤失败时尚未启动运行资源。进入运行阶段后，从空卷迁移并启动正式 runtime，用合成数据 seed，等待 Worker 发布并回读 Document、Facts 版本及访问屏障。必要的 seed receipt 缺失、入口配置不符或路由 readiness 失败都会阻止旅程启动。[CLI 接线](../../e2e/system/src/cli.ts) · [生命周期顺序](../../e2e/system/src/lifecycle.ts)

通过正式 Gateway 发布本次测试路由并检查真实代理后的协议入口。两个 hostname 在测试环境解析到 loopback，以便检验浏览器的 Cookie 作用域与入口隔离。镜像携带本次所需配置，业务旅程通过正式系统建立和观察状态，人工 Ops 命令由独立 Integration 验证。[完整系统配置](../../e2e/system/compose.yaml) · [网关测试资源](../../e2e/system/test-assets/)

### 失败诊断与清理

进入运行阶段后，无论成功、失败、超时或收到可捕获信号，均先尝试有界的辅助诊断，再用独立预算清理本次 project（显式保留除外）。辅助诊断失败只告警，必要输入、断言证据或清理失败则返回失败。运行和清理均失败时保留两者。收尾期间收到信号仍完成清理尝试并报告失败。[生命周期验证](../../e2e/system/src/__tests__/lifecycle.test.ts)

清理失败时保留 descriptor，供按准确 project 重试。清理限于该 Compose project，不另行扫描全机镜像或资源。诊断和浏览器产物限制数量、大小和路径，原始 trace、截图、视频可能含合成凭据，按运行目录控制访问与保留期。显式恢复只接受一份 descriptor 或一个完整 project 名。[诊断采集](../../e2e/system/src/diagnostics.ts) · [产物归档](../../e2e/system/src/playwright-evidence.ts) · [恢复入口](../../e2e/system/src/recovery.ts)

## 验证结果与交付

按改动选择实际需要的验证层级。[聚合验证](commands.md#聚合验证)说明各通道的组合，[工作流](../agents/workflow.md#验证节奏)规定何时执行或复用结果。交付摘要记录候选、实际命令、通过范围及未执行项，缺少必需的检查时标明缺口。环境是否已部署、恢复或可放流，须以目标环境的 runbook 检查为准。
