# Monorepo 测试编排

**Status:** approved

**Created:** 2026-07-24

**Approved:** 2026-07-24

## Problem Statement

根目录 `pnpm test` 当前以 Turbo concurrency 2 调度 package，但 package 内 Vitest/Bun 仍拥有自己的并行层。普通单元、契约和
纯内存测试因此会与真实进程 smoke 同时争用 CPU。OIDC entry smoke 会生成 RSA key、启动 `node --import tsx src/index.ts`、
占用端口并等待服务就绪：定向运行连续通过，放入全仓测试后却会偶发耗尽固定 15 秒 readiness 或 25 秒用例 timeout；同一调查中，
5 秒超时也会转移到 Admin 测试。这说明失败来自嵌套并发和资源通道混合，而不是稳定可复现的 OIDC 功能缺陷。

当前 `turbo.json` 还用 `test.dependsOn: ["^test"]` 把 package 依赖图当作测试执行拓扑。它可以传播依赖变化，却同时强制先运行
依赖 package 的测试，扩大调度和资源竞争。测试缓存、timeout、进程清理和命名也没有统一资源契约：真正的 process smoke 与进程内
OpenAPI HTTP 检查都使用 `*.smoke.test.ts`，无法通过收集规则安全分流。

维护者需要一套可长期作为设计依据的测试编排：日常测试稳定且快速，部署入口 smoke 可单独执行，完整验证有固定顺序，外部资源
测试不会偷偷依赖开发者环境。仓库目前没有 CI 平台，因此首期必须先在 Windows 本地建立可信基线，同时保留跨平台脚本契约，
不能宣称未经验证的 Linux/CI 能力。

## Solution

实施 [ADR-0003](../../docs/adr/0003-adopt-layered-test-lanes-and-resource-budgets.md) 和
[测试编排目标架构](../../docs/architecture/testing-architecture.md)：

- 把环境无关、可缓存的普通测试留在 `test`，把真实进程/端口/runtime entry 检查移入 `test:smoke`。
- 新增根 `pnpm test:smoke` 和顺序执行 static、typecheck、test、smoke、build 的 `pnpm verify`。
- 由 Turbo 负责跨 package 调度，由 package-local runner 配置负责收集、worker 和 timeout；不建立 root Vitest workspace。
- 用 transit task 传播内部 workspace 变化，移除普通 `test` 对 `^test` 的执行拓扑依赖。
- 普通测试使用保守双层并行预算并允许缓存；smoke 单 package、单 worker且禁用缓存。
- 重构 OIDC process smoke 的端口、真实 readiness、提前退出诊断、输出保留和进程树清理。
- 将 API/Admin API 的进程内 OpenAPI HTTP 测试改为普通测试命名，防止被 smoke selector 误收集。
- 保留 PostgreSQL、E2E、Gateway 等显式通道，由 workflow Validation Plan 按改动类型追加，不自动启动外部服务。

## User Stories

1. 作为开发者，我希望 `pnpm test` 不启动真实应用进程或依赖本机服务，以便日常运行稳定、可缓存并能快速定位失败。
2. 作为开发者，我希望能用 `pnpm test:smoke` 单独验证部署入口，以便普通逻辑失败与 runtime 启动失败不会混在一起。
3. 作为维护者，我希望 `pnpm verify` 使用固定阶段顺序，以便高成本阶段不相互争抢资源，失败位置具有明确含义。
4. 作为 package 维护者，我希望 runner 配置归 package 所有，以便 Vitest、Bun 和 Playwright 可以保留各自合适的边界。
5. 作为 monorepo 维护者，我希望依赖源码变化会让消费者测试 cache 失效，但不会强制执行依赖 package 的测试。
6. 作为排障者，我希望 process smoke 在 timeout、提前退出和 cleanup 失败时保留诊断，以便一次失败就能调查。
7. 作为数据库测试维护者，我希望外部测试缺少专用环境时明确失败，而不是自动连接开发服务或静默跳过。
8. 作为跨平台维护者，我希望正式 scripts 不依赖某个 shell，以便未来可以在 Windows 和 Linux runner 使用同一入口。
9. 作为交付维护者，我希望当前 Windows 验收与未来 Linux/CI 状态分开记录，以便没有证据的能力不会被误报为已支持。
10. 作为未来 backend app 维护者，我希望 runtime entry 发生实质修改时必须补齐 package smoke，以便 adoption 债务不会继续增长。

## Acceptance Criteria

1. 根 `pnpm test` 只调度普通测试；OIDC entry smoke 不在其 Turbo dry-run、runner collection 或真实执行结果中。
2. 根 `pnpm test:smoke` 只调度声明该 script 的 package；首期只收集 OIDC `*.smoke.test.ts`，不执行普通 OIDC tests。
3. `pnpm verify` 通过跨平台脚本按 static → typecheck → test → smoke → build 串行执行；阶段失败立即停止，阶段内部仍由 Turbo
   按已声明预算调度。
4. Static 阶段覆盖 lint、文档索引、env naming 和 workflow 格式 guards，且一次 verify 中每项只运行一次。
5. Turbo 普通 `test` 的 package concurrency 为 2；Vitest 普通测试 worker 上限为 25%；Bun 普通测试并发上限为 2。
   Smoke 的 Turbo concurrency 和 runner worker 均为 1。
6. `test` 使用 transit task 而不是 `^test`。自动化结构测试证明内部依赖源码变化会改变消费者 `test` hash，同时定向运行一个
   package 的 `test` 不会仅因依赖边执行依赖 package 的 `test`。
7. 普通 `test` 保持可缓存；`test:smoke`、`test:postgres`、E2E 和外部资源任务明确 `cache: false`。Coverage 如存在，
   使用独立 task 和 `coverage/**` output，不改变普通测试缓存。
8. 所有 package-local Vitest 普通测试统一使用 10 秒 timeout；Bun 普通测试保留运行器默认 5 秒。明确的 hermetic
   integration 可以局部使用 15 秒，但不得继续提高全局 timeout 解决抖动。
9. OIDC smoke 使用最多 30 秒的独立 readiness deadline 和有界 cleanup deadline；以 OIDC discovery HTTP 响应作为就绪证据，
   并与 child `error`/`exit` 竞争，不能只等待 “listening” 日志。
10. OIDC smoke 在成功、断言失败、readiness timeout、子进程提前退出和 runner cleanup 路径都回收完整进程树；失败报告包含退出码、
    readiness 错误和有界 stdout/stderr。Cleanup 失败本身使测试失败。
11. OIDC smoke 使用运行级唯一端口和临时资源，不依赖固定端口、开发数据库或 Redis。端口策略不得保留现有明显的
    reserve-close-spawn 竞争而不提供冲突检测。
12. `apps/api` 与 `apps/admin-api` 的进程内 OpenAPI HTTP 测试改为普通 `*.test.ts` 名称，仍由 package `test` 执行；
    首期不把它们伪装成真实 entry smoke。
13. Package scripts 与编排实现只使用 Node.js/Bun/Turbo/runner 的跨平台能力，不使用 Bash、PowerShell 或 `cmd.exe`
    专有链式命令；缺少外部环境的专用测试快速失败且不自动启动 Docker/services。
14. 自动化测试锁定普通与 smoke 收集互斥、Turbo task graph、cache flags、并发预算、verify 顺序和 failure propagation。
15. Windows 本地验收中，OIDC `test:smoke` 连续 20 次通过，完整 `pnpm verify` 连续 3 次通过；记录每轮结果，且没有 timeout、
    retry、flaky waiver 或残留 OIDC 子进程。
16. Linux 与 CI 验收保持 `pending`；实现不得把尚未运行的平台写成已验证。
17. 实施提交原子更新 `docs/development/commands.md`、`docs/agents/workflow.md`、目标测试架构和文档索引，使 Current 文档与
    实际 scripts、gate 和 adoption 状态一致。
18. 其他 deployable backend app 的真实 process smoke 保留显式 adoption 状态；从本架构生效起，新建或实质修改 runtime
    entry/composition 必须添加或更新对应 `test:smoke`。

## Implementation Decisions

- 根脚本只暴露稳定意图：`test`、`test:smoke`、`verify`。复杂顺序编排放入版本化的跨平台脚本，不在 `package.json`
  拼接 shell 运算符。
- Turbo 只做跨 package 调度；Vitest/Bun/Playwright 的 include、exclude、worker 和 timeout 由 package 配置持有。
- 首期为 OIDC 建立互斥的普通与 smoke runner 配置。共享 preset 只承载一致默认值，package 必须显式引用。
- Transit task 是无业务输出的 hash 传播节点。普通和 smoke 测试可以依赖 transit；真正消费 build artifact 的 package
  单独声明 build 依赖。
- OIDC smoke harness 负责端口、child lifecycle、readiness probe、输出捕获和进程树清理；测试用例只表达“真实 entry
  启动并提供正确 discovery”这一行为。
- Windows 进程树清理必须有显式实现；不能假设向父进程发送一个 POSIX signal 就会回收 loader/runtime 的全部后代。
- API/Admin API OpenAPI tests 只做命名迁移，不在首期扩展为 process smoke。Worker 和其他 backend app 的 smoke 是后续
  adoption，不阻塞首期基础设施。
- External resource tests 仍由调用方准备专用环境。未来可以提供独立 setup command，但测试本身不接管服务生命周期。
- Required gates 不配置 retry-to-green；flaky quarantine 的 owner、原因、ticket、expiry 和风险治理留给后续具体缺陷记录。

## Testing Decisions

- 为根脚本和 Turbo config 增加结构测试，直接断言命令、阶段顺序、failure propagation、task dependencies、cache flags 和预算。
- 使用 Turbo dry-run 验证 package selection 与 transit 图；测试不能仅通过字符串快照掩盖错误任务图。
- 分别运行 OIDC 普通测试和 smoke，证明 include/exclude 互斥。
- 对 smoke harness 注入快速失败 child、永不就绪 child 和 cleanup failure，覆盖错误分支而不依赖真实 30 秒等待。
- 用真实 OIDC entry 完成 20 次连续 smoke 验收；每轮禁用任务缓存，不重试失败轮次。
- 用正式入口完成 3 次连续 `pnpm verify`；任一轮失败则保留首次失败证据，修复后从连续样本 1 重新计数。
- 每轮后检查与 OIDC entry 匹配的残留进程和占用资源。验收脚本只检查自己启动/标记的进程，不能误杀开发者的其他 Node 进程。
- 受影响 package 执行各自 lint、typecheck 和普通测试；文档、workflow checker 与 `git diff --check` 进入每个相关 ticket
  的 Validation Plan。

## Proposed Delivery Slices

以下切片已于 G3 获批并发布，但不代表 implementation 已授权：

1. [`01`](issues/01-establish-test-orchestration-graph.md)：建立 root verify/test:smoke、Turbo transit/task graph 和结构测试。
2. [`02`](issues/02-separate-test-lanes-and-worker-budgets.md)：固化 Vitest/Bun 普通测试预算与收集边界，改正 API/Admin API OpenAPI 测试分类。
3. [`03`](issues/03-harden-oidc-process-smoke.md)：重构 OIDC process smoke harness，并接入 package-local `test:smoke`。
4. [`04`](issues/04-validate-and-document-test-orchestration.md)：执行 Windows 连续验收，原子更新 Current commands/workflow/testing docs 与 adoption 状态。

## Out of Scope

- 为 API、Admin API 或 Worker 新增真实 process smoke；首期只改正两个 OpenAPI 测试的分类。
- 建立或选择 CI 平台、Linux runner、Remote Cache 服务或分布式测试基础设施。
- 自动启动 Docker、PostgreSQL、Redis、APISIX、浏览器服务或其他外部依赖。
- 把 PostgreSQL、E2E、Gateway 检查无条件并入环境无关的 `pnpm verify`。
- 新增覆盖率阈值或把 coverage 提升为 merge gate。
- 统一 JUnit、runner metrics、flaky 趋势或测试历史看板。
- 为性能测试建立 SLA；本功能只把 timeout 与性能职责分离。
- 修改 OIDC 协议行为、claims、session、数据库 schema 或 Redis contract。
- 通过继续提高已声明的全局 timeout、增加 required-gate retry 或永久 skip 掩盖既有不稳定。

## Further Notes

- ADR 与本 spec 均已获批准；tickets 01–04 已发布。任何实现工作仍需维护者单独授权。
- 当前命令行为仍由代码与 `docs/development/commands.md` 描述。目标架构在实现和连续验收完成前保持 `Needs Review`。
- 当前没有 CI 平台不是跳过验证的理由；它意味着证据必须准确标注为 Windows local，未来平台需重新校准并发预算。
- 如果实施调查证明 runner 不支持某个预期配置形式，可以调整实现 seam，但不得改变通道隔离、资源预算、缓存、无 retry 和连续验收
  这些已确认的行为契约；实质改变必须先回到设计确认。
