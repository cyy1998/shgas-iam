# 测试与验证

新增用例先确定[验证层级](#验证选择)与[测试位置](#路径与命名)。改 runner、fixture、资源或清理流程时查
[收集与编排](#收集与编排)、[专用资源与隔离](#专用资源与隔离)和[完整系统测试](#full-system-e2e)。
运行参数见[开发命令](commands.md)，交付时机见[工作流](../agents/workflow.md#验证节奏)。

## 验证选择

选择能直接观察目标行为的层级；测试存在或相邻测试通过，都不代表本次要求已得到验证。

| 要验证的事实                       | 方式                                               |
| ---------------------------------- | -------------------------------------------------- |
| 类型兼容、公开出口                 | 消费方 typecheck、package exports 和 type contract |
| 稳定依赖方向与 owner 路径          | [架构守卫](#架构守卫)覆盖范围内的静态检查          |
| 业务规则、DTO 裁剪、事务与失败作用 | 模块公开接口的行为测试，按需使用真实资源           |
| 浏览器运行环境与平台能力           | 前端构建及相关环境下执行                           |
| 正式接线、readiness、进程关闭      | 正式进程的 Integration                             |
| 跨服务关键旅程                     | Full-system E2E                                    |
| 目标环境恢复与放流                 | 对应 runbook 的现场检查                            |

静态守卫不证明运行时授权或事务原子性；类型正确不证明字段裁剪或浏览器可加载。
两个 loopback 端口只证明协议入口差异，不证明 Cookie 域隔离；后者需要不同 hostname 的真实代理与浏览器。
Windows 用例通过进程内事件进入 signal listener 时，只证明监听后的处理，不证明 POSIX 信号投递。
固定 OIDC 协议套件独立执行，普通组合测试不能替代它，见[协议套件入口](commands.md#oidc-协议套件)。

共享资源管理模块变更时集中验证故障与恢复，消费方验证真实接线及自身差异，不复制完整故障矩阵；
root 工具链适用下文的一次性验证约定。
新增跨模块行为时，明确观察时点、失败作用和恢复责任，再选择相应测试；普通内部用例增删不维护文档覆盖清单。

## Root 工具链的一次性验证

Root 工具链包括仓库级测试编排与资源管理、Sandcastle、质量命令与提交 hook、架构／文档／环境变量守卫、
Docker 配置检查等开发维护工具。它们不保留常驻 Unit 或 Integration 集合，也不迁移到其他 workspace 继续收集。
各 app/package 及 `e2e/system` 自有测试仍按原有通道维护；根聚合命令继续运行这些 workspace 的测试。

修改 root 工具链时，按本次改动进行一次性验证：

1. 选择能观察受影响行为的真实命令、临时脚本或 fixture，验证正常结果及涉及的失败、退出码和清理行为。
   只读规则检查器用临时允许／违规输入验证；进程、Git、Docker 等行为使用独立临时资源。
2. 涉及 app/package 接线或完整系统行为时，通过正式根入口运行受影响的现有 Integration 或 E2E。
3. 在交付摘要记录实际命令、结果和未验证范围；完成后删除临时测试脚本与 fixture，所需日志可留在忽略的
   `test-results/` 中，不加入常驻测试集合或新增自动测试门禁。

Root 的类型检查、格式与 lint、架构／文档等静态检查，以及显式调用的诊断命令继续保留。
该取舍减少日常测试耗时与维护成本，接受 root 工具链不再由常驻行为测试持续检测回归；后续工具链改动均执行上述验证。

### 架构守卫

`pnpm check:architecture` 检查稳定的模块归属、依赖方向和 Docker 构建依赖。扫描范围、规则 ID 与路径例外见
[分析器](../../scripts/architecture-guard.ts)。按[验证选择](#验证选择)判断应由静态规则、类型检查还是行为测试保护目标。

#### 观察范围

永久规则只使用以下仓库事实：

1. 生产源码的仓库相对路径。
2. 规范的静态 `import` 与 re-export，包括 module specifier、type/value 和 import/re-export 分类。裸 side-effect import 按值依赖处理。
3. 生产 `*.port.ts` 中直接 `Pick<T, ...>` 的未解析基类型名，专供 `consumer-owned-port`。
4. workspace manifest 声明的 workspace 依赖闭包，以及 Dockerfile 字面量 `COPY` 的源路径。

Specifier 按已支持的 alias、相对路径和扩展名做词法归一化。登记的 workspace subpath 可按 source root 映射。
第三方包按包名或 `/` 子路径匹配，例如 `hono/http` 匹配 `hono`，`honorable` 独立匹配。

规则保持在上述范围内。symbol 及其来源、成员访问、其他标识符或字面量、注释、barrel 依赖图、模块和类型解析、
调用与绑定、控制流与数据流、动态 import/require、非规范写法、factory 形状和方法清单都由其他验证方式处理。
依赖边无法从路径表达时，优先收缩 package exports、提供职责单一的公开 subpath、明确模块接口，或选择合适的验证层。
非规范语法由编码约定、lint 与评审处理。

#### 永久规则准入与验证

新增或扩展规则须对应 `Current` 文档中的架构约束，防止真实的跨模块依赖或归属回退，能完全用上面的事实表达，
且类型检查、package exports、行为测试、进程 smoke 或专用验证通道都无法更直接覆盖。
例外应能用少量路径或模块表达。仅保护已退役路径或标识符的迁移检查随迁移结束收尾。
违规诊断须提供稳定 rule ID、文件、行号和原因。

按本节的一次性验证流程，通过 `analyzeRepositoryArchitecture(repoRoot)` 为每个受影响的语义事实提供至少一个允许和一个违规的临时 fixture。
共享 import/re-export 提取、type/value 分类和 alias 归一化用少量规范 fixture 集中验证。业务规则按各自的 owner 或依赖边验证。
以公开诊断为断言，性能作为观测项。保持原有超时和重试约定。

#### Docker 依赖闭包

从镜像 workspace 的 `dependencies`、`devDependencies`、`optionalDependencies` 和 Dockerfile 字面量 `COPY`
涉及的 workspace manifest 出发，沿同样的依赖段展开。`peerDependencies` 由消费方满足。
通向受保护包的中间 workspace 须复制 manifest，受保护包须复制 manifest 和源码。守卫依据字面量 `COPY` 检查，实际构建验证
`RUN`、shell、构建参数和包管理器行为。

## 测试分类

先判断是否属于完整系统 E2E，再按真实资源依赖区分：

| 层级        | 归类依据                                                                   |
| ----------- | -------------------------------------------------------------------------- |
| Unit        | 进程内完成，可有多个真实模块、Hono 内存请求、jsdom 和无真实网络的 MSW      |
| Integration | 真实数据库、网络或监听端口、子进程、浏览器，或需要创建和清理的文件系统状态 |
| E2E         | 启动完整临时系统，经真实入口验证业务旅程                                   |

读取固定只读 fixture 或框架加载源码不单独构成 Integration。模块数量、执行器和工具所属 workspace 不决定层级；
真实浏览器也不自动成为完整系统 E2E。Integration 按功能组织，不强制划分其他 profile。

## 路径与命名

| Collection               | 位置                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| Unit                     | workspace 模块对应层级的 `__tests__/*.test.ts[x]`                     |
| Bun / Vitest Integration | workspace 的 `test-integration/<feature>/**/*.integration.test.ts[x]` |
| Playwright Integration   | owner 的 `test-integration/<feature>/**/*.spec.ts`                    |
| Full-system E2E          | `e2e/system/**/*.spec.ts`                                             |

Admin/SSO 普通 Unit 使用 Node，确需浏览器全局或 React DOM 的用例使用 `*.dom.test.ts[x]` 并进入 jsdom。
Node/DOM 是同一 Unit runner 内的环境，不增加公开层级或命令；只有 DOM 加载浏览器兼容 setup。
各文件按需注册 MSW lifecycle，MSW 本身不决定环境。优先复用 app-local Testing Library、MSW 和既有路由测试辅助代码。
纯类型用例放入 typecheck 收集的 `*.type-contract.ts`，使用正向约束和必要的 `@ts-expect-error`，不构造恒真的运行时断言。

## 测试质量原则

测试应在行为被破坏时失败，在内部重构未改变行为时继续通过。

- 一个用例保护一个可命名行为；该行为的前后状态、结果和副作用可以一起断言，独立变体使用独立或参数化案例。
- Admin 测试按用户、任职、组织等功能归属组织，不按 HR 等管理员角色重复建立业务流程集合。角色差异通过服务端 capability、allowedActions 和可见范围作为用例输入；通用行为只保留一份覆盖，权限拒绝、范围选择与权限变化后的恢复保留独立验证。浏览器验证真实路由与组件接线，组件测试承接表单和权限组合；mock API 的前端测试不替代后端授权验证。
- 每例建立并清理自己的状态，不依赖顺序；并发通过显式信号、受控 Promise 或时钟同步，真实到期与进程退出使用真实资源。
- 只替换模块的外部依赖，保留内部协作。仅当顺序或次数属于契约时才锁定它，禁止重放、零写入和脱敏可直接观察。
- 断言必须能区分正确与错误实现：固定返回值不能证明缓存命中，mock 加密不能证明真实加密安全。
- DTO 裁剪提供额外输入并调用正式解析或 mapper；手写 fixture 的序列化不能证明生产输出安全。
- 不扫描其他源文件的变量名、注释或调用文本来推断业务行为；静态分析工具自己的路径/import fixture 属于公开输入。
- 性能预算使用直接证据，不把一次实现的完整调用数或 socket 回调次数固定成永久契约。

共享 mapper 的完整结果由所属模块验证，消费方只验证自己的转换和调用。测试数、mock 数、matcher 名称和覆盖率不替代行为判断，
也不为这些原则增加断言扫描器。

### 当前契约与测试清理

按保护目标清理，不能按 legacy、版本号或 removed 等关键词批量删除。

| 类型                                     | 处理                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| 只有历史名称或目录缺席，没有独立当前要求 | 删除检查与专用 helper                                    |
| 完整结果已覆盖的冗余检查                 | 删除；冻结、裁剪等独立约束仍保留                         |
| 当前要求使用历史表达                     | 改为当前结果、公开解析、类型兼容或实际行为验证           |
| 仍使用的迁移、兼容和恢复能力             | 保留真实行为验证，包括历史输入和非目标保护               |
| 临时迁移检查                             | 记录 owner、原因和移除日期，到期核对；不纳入永久架构规则 |

删除前确认原目标是否仍成立及替代证据；缺少证据时在同一提交补齐，或先验证替代测试再删除。
同时清理无用 fixture、故障开关与登记。不把旧成员黑名单换成完整 factory 方法白名单；未被消费的新方法不普遍构成失败。
测试清理不授权改变生产行为。替代测试暴露缺陷时保留失败证据并报告，不能降低断言换取通过。

### 禁止纯展示测试

各层均不保留只锁定静态文案、图标、样式、固定 DOM 排列或静态 mock 回显的测试。混合用例只移除这些断言。
权限、输入、状态、错误恢复和操作导致的显示变化属于功能行为，可以保留；协议文本、转义和敏感信息保护也有独立要求。

定位用的文案和 `getByText` 等 API 不是删除依据。只有措辞本身属于功能契约时才锁定精确文字；整页快照不替代行为断言。
不通过改名、无关点击或移动 collection 保留纯展示测试，也不新增 matcher 黑名单或快照计数门禁。

Full-system E2E 专注完整业务流程，通过浏览器执行操作，以真实请求响应、接口回读、持久状态及协议结果判断成败。
页面标题、菜单、提示文案、布局以及元素的可见性、数量和按钮状态不作为该层的结果断言；权限范围、生命周期及错误恢复
通过服务端事实和后续操作效果验证，展示与组件交互由对应前端的 Unit／Integration 覆盖。
元素定位仍可用于点击、输入和必要同步；回调 URL、跨入口导航、Cookie 与协议安全约束继续由 E2E 验证。

## Bun 异步断言

Bun 1.3.14 的 async matcher 曾因 event-loop 重入使真实 I/O 悬挂，升级运行时后仍保留约束：
数据库、Redis、HTTP、subprocess、readiness 等 Promise 先普通 await，再同步断言。

```ts
const report = await databaseOperation();
expect(report).toMatchObject(expectedReport);
```

失败路径先捕获 rejection，再同步断言错误。真实 I/O 不传入 `.resolves`、`.rejects` 或 async `toThrow`；
外层 `await expect(...)` 无法规避。不得用增大 timeout、重试或修改生产生命周期掩盖问题。
上游修复并完成真实 PG/Redis/process 回归后方可解除，跟踪见
[oven-sh/bun#33261](https://github.com/oven-sh/bun/issues/33261)。Vitest 不受这条 Bun 专用约束影响。

## 验证结果与交付

按改动选择真实资源 Integration 或 E2E，基础 verify 覆盖的通道见[聚合验证](commands.md#聚合验证)。
命令成功只证明实际收集的用例通过，不证明磁盘候选全部收集、全部约束覆盖或目标环境已经部署。
缺少运行条件、必需检查失败或未执行时，按工作流处理，不能记为通过。

实际候选、命令、结果和未执行项留在 issue 或交付摘要；历史结果只在代码、依赖、配置和环境未使其失效时复用。
目标环境操作另按 runbook 执行，文档不要求维护逐次验收或截图清单。

## 收集与编排

Collection 是 runner 拥有的测试集合，owner 是维护它的 app、package 或 `e2e/system` workspace。
每个测试候选只由一个 collection 收集。各 owner 持有 runner、窄目录配置、fixture 和 setup，仓库不建立跨 package 的
Vitest workspace 或共享 setup。同一 owner 的非浏览器 Integration 只选 Bun 或 Vitest，浏览器由 Playwright 收集。
Admin/SSO 的 Node 与 DOM 环境共用各自的 [Unit runner](#路径与命名)。

正常业务状态由生产模块建立，破坏变体与状态观察使用 owner 的 `/testing`；消费方不手写协议 key、Lua 或序列化。
维护命令属于生产操作，不因存在测试就成为 collection。真实命令行为由子进程 Integration 验证。

### Root 与 package commands

Turbo 是唯一跨 package 编排器。Root 聚合 Unit，统一准备 Integration 资源，并把完整 E2E 交给 `e2e/system`。
根 Integration 编排器与 package runner 共用 workspace manifest 的 `iamTest.integration` 声明，以 workspace 和执行器选择资源。
单文件筛选仍使用所属执行器的完整资源声明，空对象表示无需 PostgreSQL/Redis。内部 runner 只消费本次环境，校验 run ID、记录和完整内部 URL。

以 API 的声明为例：

```json
{
  "iamTest": {
    "integration": {
      "bun": {
        "postgres": "IAM_API_TEST_DATABASE_URL",
        "redis": "IAM_API_TEST_REDIS_URL"
      },
      "playwright": {
        "redis": "IAM_API_TEST_REDIS_URL"
      }
    }
  }
}
```

Workspace 内部 `test:integration:bun|vitest|playwright` 由[包级 runner](../../scripts/run-package-integration.mjs)消费已准备的资源。
runner 的可选 preflight、资源 provider 与浏览器 worker 设置由所属 workspace 声明。

资源测试只从正式根入口运行，不接入任意外部 URL 或另建第二套环境。每条命令独立创建环境，可与其他命令并行，
不跨命令复用数据。错误参数、无匹配、缺少条件或首个失败均非零退出，不 skip、自动 retry 或回退环境。
聚合验证按顺序组合 owner 命令，首错停止，复用各通道的资源与清理逻辑。执行入口见[命令页](commands.md#测试与验证通道)。

### 测试收集维护

新增用例维护路径、命名和唯一归属，不登记逐文件清单。修改 include/exclude、Vitest projects 或 workspace scripts 时，
核对 root Turbo 接线并运行受影响 owner 的测试。收集成功不自动证明没有漏收或重复，取舍见
[ADR-0009](../adr/0009-adopt-canonical-test-collections.md)。

### Turbo task graph 与缓存

测试通过 `transit` 传播依赖源码变化，不用 `^test` 执行依赖包的测试。Unit 仅在输入、环境、fixture、时间和随机性可重现时缓存；
Integration 与 E2E 禁用缓存。仓库配置、runner 和资源工具的变化须进入相关输入。
Gateway Unit 使用包内合成 manifest 样例，由默认 workspace inputs 跟踪，不读取调用方部署配置。

Strict env 仅透传 owner 所需的内部地址、run ID、记录、筛选及工具路径；进程归属 marker 只透传、不计入 hash。
Root typecheck 检查工具源码。任务定义见[turbo.json](../../turbo.json)。

## 并发、timeout 与清理

预算由根入口与 runner 统一执行，不在各 manifest 重复填写。Unit 允许有界并发；同一真实资源 Integration 环境的套件和用例串行、首错停止。
Admin 的 mock API 浏览器 Integration 使用两个 Chromium worker，按文件并行、文件内串行，共用本次开发服务器；每例独立的 browser context、路由 mock 和浏览器存储隔离状态。
其 package script 显式选择内部 runner 的 `--browser-workers 2`；该选项仅允许无 PostgreSQL/Redis 声明、无资源 provider 的 Playwright collection，最多两个 worker。
其余浏览器 Integration 与 E2E 使用单 worker。浏览器均零 retry，首个失败后停止调度后续用例并结束在途执行，所属进程树与 web server 按原生命周期收尾。
用例内部为验证竞态而建立的并发保留。当前数值以 runner 配置为准。

Timeout 防止挂起，不作为性能 SLA。进程使用真实 readiness，并同时观察退出与错误；输出有界，在成功、失败、超时和中断时清理所属进程树、端口和临时目录。
不能以放宽全局 timeout、重试或吞掉 cleanup 错误换取通过。

### 专用资源与隔离

Root 资源管理模块用 Compose 创建可销毁环境，按声明只启动需要的 PG/Redis，通过动态 loopback 端口访问。
创建前登记唯一 run ID、准确 project、配置与产物位置，记录路径相对仓库解析；浏览器 web server 仍由 package harness 管理。
正式测试不使用开发或生产资源。

首个断言、setup、teardown、重置失败或 timeout 后停止启动后续用例。先终止并等待所属测试进程树，再用独立有界预算采集诊断、
清理准确 project。部分初始化失败和可捕获中断走同一出口，原始与清理失败均保留。
默认清理容器、网络及数据卷，保留日志和记录；显式 keep 或异常残留按记录恢复，不按前缀猜测目标或全局 prune。

辅助诊断采集失败只告警并继续清理；初始化、readiness、必需输入、断言证据、进程关闭、数据重置或环境清理失败均使命令非零。
资源生命周期变更按[一次性验证约定](#root-工具链的一次性验证)检查涉及的故障与恢复，
消费方另证真实接线。

AFK 使用同一根入口和每命令生命周期。外层须确认 sandbox 已停止，再按 registry 清理，尊重 keep；无法确认时保留恢复记录。
宿主访问与恢复操作见[AFK 工作流](../agents/sandcastle-afk.md)。

### Fixture 与数据重置

测试代码通过 `@iam/test-support/external-test-resources` 读取专用地址、登记和关闭资源，并重置独占 Redis 数据库。
该包使用 `@iam/runtime/redis/config` 校验生产连接配置形态，独立声明真实 Redis 测试资源。通用 Redis harness 管理连接和清理。
Runtime 的 Redis Integration 通过常驻与离线连接的公开 factory 验证 ACL 和连接策略，使用本次资源声明与自身配置解析。
Login Restriction 与 Subject Access 分别由 `@iam/login-restriction` 和 `@iam/subject-access` 收集 Unit 与 Redis Integration。
各自声明专用 Redis 地址，其测试 fixture 持有业务构造、状态种入与观察。
`@iam/test-support/process-smoke-harness` 管理 smoke 用例的端口、readiness、有界输出和清理，使用 `@iam/runtime/process` 启动所属进程。
根 runner 与 E2E 执行器直接使用 Runtime 的进程所有权接口。

Unit 用例通过 `@iam/unit-of-work/testing` 使用事务 fake，生产接线在消费方 Integration 中验证。
PostgreSQL 使用随机 schema、专用连接及整体删除，Admin 始终注入生产 UnitOfWork 的事务绑定连接。
Redis 完成业务观察后先停止本例全部 consumer、子进程和连接，再对本次独占 DB 执行 `FLUSHDB`，控制连接最后关闭。
任一停止失败都禁止 reset，继续尝试其他收尾并汇总失败；禁止 `FLUSHALL`。

在 reset 前断言非目标数据保护、只读作用和生产连接关闭。环境销毁只负责收尾。普通 fixture 按专用资源整体重置。
Worker 与 Ops 各自保留生产连接防误用检查，不另设 cleanup URL 或跨环境推断 Redis 身份。共享连接的取消只能作用于本次 owner，不能影响并行任务。
Ops 通过正式 CLI 子进程验证命令输入、配置、报告、退出及资源作用；Worker 通过正式进程验证周期恢复。
共享维护生命周期和完整领域编排分别在基础设施与领域 owner 集中验证，消费方只补实际接线及自身差异。

Gateway Integration 由 package runner 的资源 provider 持有本次 APISIX/etcd，首次租用才启动，跨文件串行复用。
每例先结束 Gateway 进程、调用连接、故障代理及在途转发，再直连 Admin 按依赖顺序删除七类完整资源并回读空基线。
用例或收尾失败后停止 collection，不重建环境继续；父 runner 结束后清理准确 project，root 在所属命令的子资源登记中兜底恢复。
测试只使用一套固定配置，不承担调用方 dev/prod 部署配置验收。

### 浏览器 harness 与产物

API 协议浏览器测试使用真实候选 API、动态 RP 和专用资源，不 mock IAM 协议请求。
父进程等待 HTTP server、子进程与连接结束后再重置资源，启动失败也收尾。
不同通道使用独立产物目录；固定协议套件使用调用方指定目录，避免被浏览器 runner 清空。

## Full-system E2E

`e2e/system` 拥有独立 project，从空卷开始执行 migrations、正式 runtime、合成 seed、Gateway 发布、旅程与清理。
镜像包含当前候选的测试配置和脚本，不依赖 daemon 挂载调用方 checkout。仅使用固定测试或本次生成的数据与凭据，不接入生产端点或真实 PII。
APISIX 启动配置与 IAM 路由由 `e2e/system/test-assets/` 独立维护，通过正式 Gateway API 发布，
不读取调用方的部署目录，也不将测试配置视为生产部署验收。

### 初始化与就绪

1. Preflight 使用独立 deadline，在资源与 descriptor 创建前失败退出。
2. Descriptor 落盘后先写未尝试迁移的 receipt，再准备 project 内诊断工具与资源；诊断阶段不临时构建，不公开 APISIX Admin host port。
3. Migration receipt 区分未尝试、已尝试、完成与安全失败，不保存原始错误或环境。
4. Seed 通过生产领域能力建立状态，经真实 Worker 收敛，回读本次六个用户的 Document、Facts 版本与预期访问屏障状态，确认一致后才进入 Gateway 发布与业务旅程。
   核对 rendered Compose 中各入口的 canonical origin；导出必要 seed receipt 后才删除 seed 容器，缺失或导出失败阻断旅程。
   业务 E2E 不调用人工维护 CLI；Ops 命令的行为由其专属 Integration 验证，维护制品与恢复流程按对应验收执行。
5. 协议 readiness 校验 discovery 各端点及 issuer 的 canonical origin，Custom SSO 两入口配置也须匹配；随后执行浏览器 preflight。

Receipt 只含阶段、时间、安全失败类别或本次公开引用，不保存凭据。具体流程见[e2e/system](../../e2e/system/)。

### 旅程编排

完整 collection 只创建一个双入口 project，依次运行 Admin、HR、OIDC 主流程与双入口协议场景。
各旅程经正式前后端观察行为，不用 `page.route` 替代仓库核心服务。
任一失败先采集诊断再清理，cleanup 失败同样阻断通过。

### 双入口验收与产物隔离

完整 collection 在一套环境中使用两个不同 hostname，共用 migrations、seed、readiness 与正式 APISIX。
OIDC selector 同时收集主流程与双入口文件；同源配置的独有边界由轻量配置及协议测试保护，不重复完整旅程。
通过正式发布接口设置并回读受控 Host rewrite，再验证两协议、Cookie 域隔离及伪造入口拒绝。
Chromium 与 Node 请求器均只将测试专用 hostname 解析到 loopback，保留真实 URL、Host 和原生 Cookie 作用域；
Node 映射由每个 Playwright worker 安装并在收尾时还原。
测试不改生产 manifest，独立 RP 与固定套件的职责见[验证选择](#验证选择)。

### 失败诊断与清理

Descriptor 建立后的失败、timeout 和可捕获 signal 统一进入诊断与 cleanup。各诊断源有独立期限，收集已有产物和失败说明；
必需 seed 输入与断言证据不属于可忽略的辅助诊断。
日志和浏览器产物有数量与大小限制，路径越界、symlink 或移动失败告警。原始 trace、截图和视频保留，metadata 不替代原文件。
诊断可能包含合成凭据，以产物目录的访问权限和保留期保护，不宣称内容已经脱敏。

Cleanup 对准确 project 执行清理，禁止模糊扫描、全局 prune 或另行枚举 image IDs。
失败保留 descriptor，显式恢复沿同一记录。进程管理在 Windows 使用 Job，在 Linux 按继承的归属 marker 回收含 detached 后代的进程。
退出与清理均有界，异常收尾不以全部资源 inventory 为零作为硬门禁。命令见
[E2E 入口](commands.md#full-system-e2e)。
