---
status: accepted
---

# 采用 Canonical Test Collections

仓库以 Unit、Integration、E2E 作为公开测试语言，按被测行为及 fixture 的真实资源依赖归类。
每个候选测试由唯一 collection 收集，root 命令可达所属 workspace；Integration 以功能组织目录，以 workspace 声明执行器与资源，
不再以六个强制 profile 绑定目录、公开命令、资源注入、缓存和并发。

## 理由与代价

旧普通/smoke/external 划分混淆测试意图、资源和执行入口。统一命名与入口后，package 保留 runner 所有权，Turbo 负责
跨包编排，不把 package 依赖图自动当作测试执行拓扑。

基础 verify 依次执行 static、typecheck、Unit、build 并快速失败；Integration 和 Full-system E2E 显式追加。
真实资源由正式测试命令创建和销毁，不回退到开发或运行资源。代价是基础通过不能代替真实数据库、进程、浏览器和
完整系统证据，执行这些通道仍需满足其 Docker、工具链和浏览器前提。

测试由 owner-local 窄目录自动收集；root Unit 使用 `scripts/<module>/__tests__/`，保留 Turbo task 与并发预算。
不再维护独立 Collection Guard：其 runner list 与 Turbo dry-run 子进程增加检查耗时，专属 adapter、fixtures 和文档增加
维护成本，而检查通过仍不能证明测试断言实际执行或通过。

唯一 collection 归属、路径与命名、root task 可达仍是工程约定，由配置评审和实际测试运行核对。代价是 include/exclude
错配、新 workspace 缺少测试命令或前端 project 重复收集可能未被自动发现；目录收集不保证消除这些风险。
接受这项代价，不以新的收集扫描器、逐文件清单或覆盖率门禁替代 Guard，也不把其他测试入口重构作为删除前置条件。

保留 Guard 或优化其子进程启动可以继续自动检查收集，但仍需维护独立观察模型；仅从默认 static 阶段跳过会保留专属实现
与文档成本，因此采用完整删除。

## 受管理的临时测试环境

正式资源测试采用编排器管理的一次性环境，每次命令负责创建、使用和销毁自己的资源。
手动与 AFK 使用同一入口和生命周期，同环境资源测试串行复用；PostgreSQL 保留 schema 隔离，Redis 允许整体重置。
资源测试遇到首个失败即结束命令；辅助诊断失败只告警，初始化、测试与清理失败仍阻断通过。
详细流程及验证边界见[专用资源与隔离](../architecture/testing-architecture.md#专用资源与隔离)。

该模式取代调用方任意提供外部 URL、fixture 逐项保护共享环境的正式运行方式，减少资源所有权判断、逐 job/key 清理与
残留锁等待。代价是独立命令需要启动服务，同环境测试让出并行度，且一次失败只报告当时已执行的范围。
运行内复用服务控制启动成本；显式保留环境用于调试，成功与失败默认自动清理。

AFK 直接接入共享宿主 Docker，并采用 host networking；运行前核对平台、网络与非 root socket 访问条件。接受宿主
Docker 管理权限和宿主网络访问范围，以减少另一套 daemon、地址转换或代理的维护。条件不满足时报告环境要求，
不自动切换 DinD。E2E 静态文件进入测试镜像，seed 结果及时导出，使手动和 AFK 使用相同的容器输入输出方式。
私有 registry 认证需要调用者显式提供受支持的单 registry 配置；执行器使用私有只读副本，默认不继承宿主凭据，
只有确认创建者停止后才回收副本。配置前提和恢复操作见[AFK 命令](../development/commands.md#sandcastle-afk)。

共享能力的完整故障证明放在其 owner，调用方保留接线与业务差异验证。环境整体销毁之前，仍需观察生产命令的退出、
连接关闭和非目标数据保护；资源清理成功不能替代这些业务证明。

共享 daemon、host networking、容器输入输出和并行 project 隔离由实际 sandbox smoke 验证；配置检查不能代替运行证据。

## 以真实资源归类并由 workspace 声明运行需求

统一资源准备与清理降低了六类 profile 的组织价值；仅删除名称仍会保留资源注入、并发与缓存分支。
因此把资源决策移入 workspace manifest，按层级统一并发和缓存。完整迁移范围与候选验收见
[Spec #240](https://github.com/cyy1998/shgas-iam/issues/240)，当前执行契约由测试编排文档维护。

- 取消 `component`、`process`、`redis`、`postgres`、`composition`、`browser` 六个强制分类作为目录和公开命令的组织依据。
  资源集合由 workspace 与执行器共同声明，保留原有内部连接变量名。
- 全仓现有测试的重新归类属于同一次重构，覆盖 Unit、Integration、E2E，以及 root tooling 和测试 harness 自身的测试。
  调查中已发现的 Integration 迁移候选只是起点，不是最终迁移范围。

### 分类与执行取舍

测试按真实运行资源依赖归类。先判断是否属于 E2E，再按资源依赖区分 Unit 与 Integration；被测行为及 fixture 一并判断。

| 层级        | 判断标准                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | 被测行为及 fixture 在测试进程内完成，不依赖真实外部运行资源。允许多个模块真实协作；Hono 内存请求、jsdom、由 MSW 拦截且不产生真实网络连接的测试均属于 Unit。 |
| Integration | 依赖真实数据库、网络连接或监听端口、子进程、浏览器，或需要创建、修改、清理的真实文件系统状态。                                                              |
| E2E         | 启动完整系统，通过真实入口验证关键业务旅程。                                                                                                                |

读取固定的只读 fixture 不单独构成 Integration；测试框架加载源码等基础活动也不计入资源依赖。模块数量、文件数量、
是否使用 HTTP adapter、是否保留真实进程内接线都不单独决定层级。单模块边界与多模块真实协作均使用同一资源口径。

运行配置按 workspace 与执行器声明所需资源集合；运行其中一个文件也使用该集合，接受启动部分该文件不需要的服务，
以减少资源分类、细分集合和逐文件标记的维护成本。资源准备不再以六个 profile 名称推导。

Unit 可缓存并采用受控并行；Integration 与 E2E 不缓存、默认串行。测试内部用于验证竞态的并发保留。
原 component 中实际依赖子进程或可变文件系统的用例归入 Integration 后也不再缓存或并行；
后续只有实际耗时证明需要时，才考虑范围明确的例外。

公开入口一次切换，删除旧 profile 命令与 `--profile` 参数，不保留旧别名；仓库内脚本、AFK 和文档同步迁移。
保留 `test:unit`、`test:integration`、`test:e2e` 日常入口，定向执行以 workspace 和文件为主。

### 目录、配置与迁移边界

Unit 统一放在被测模块对应层级的 `__tests__/` 目录，保留普通 `*.test.ts[x]` 与 DOM Unit 的
`*.dom.test.ts[x]` 后缀；不再将 Unit 文件直接散放在生产模块旁。Root tooling 使用对应的
`scripts/<module>/__tests__/`。Integration 放在所属 owner 的 `test-integration/`，内部按功能组织，Root tooling
使用 `scripts/test-integration/`；不再要求六类 profile 子目录。E2E 放在仓库 `e2e/` 下，现有完整系统 workspace
仍由 `e2e/system/` 承担。该 workspace 的工具测试也按实际资源分别进入对应的 `__tests__/` 或 `test-integration/`。
执行器所需的文件后缀继续保留；使用 Playwright 本身不使测试成为 E2E。

每个 workspace 在自己的 `package.json` 中声明测试执行器及资源需求，root 统一读取并编排。
Bun、Vitest、Playwright 保留各自必要的原生配置；root 与 package runner 消费同一份运行声明，
不再维护 owner 与 profile 到资源的分支表，也不增加逐测试文件清单。配置保持为少量数据，不扩展成新的测试框架。

迁移以保留现有行为证明为原则。混合文件拆出能独立运行的进程内用例，真实资源用例保留实际资源并归入 Integration；
真实资源场景中的局部计算断言仍跟随该场景。不为增加 Unit 数量而将真实资源证明改成 mock，也不为归类新增生产接口。
迁移数量不作为验收目标。

聚合验证保持 `verify = static -> typecheck -> Unit -> build`、`verify:ci = verify -> Integration`、
`verify:release = verify:ci -> E2E`。真实临时目录或 Git 子进程测试迁出 Unit 后进入 `verify:ci`，
不额外加入基础 `verify`；`check:architecture` 等静态命令本身继续属于 static。

### 统一入口与运行声明

根命令是唯一受支持的资源测试入口。Integration 支持按 workspace 或文件选择；root 负责选择测试、
准备本次资源、通过 Turbo 调度以及最终清理，package 内部 runner 只消费已经准备好的环境，
不另行创建环境，也不接受任意外部数据库地址。Unit 继续支持 package-local 执行。

运行声明只列出执行器及统一编排器负责的 PostgreSQL、Redis 需求，保留现有内部连接变量名，
把资源与变量的映射移入所属 package 的声明。浏览器启动、临时 HTTP server、子进程和临时目录仍由对应 harness 管理；
分类标准涉及的资源不必全部成为配置中的资源类型。并发与缓存使用已确认的层级默认策略，不在各 package 重复填写。

每命令独占环境、首错停止、先停止执行者再清理、显式保留环境及按准确记录恢复，继续遵守现有生命周期契约。
运行声明替换 profile 决策来源，不另建一套资源生命周期。

### 全仓迁移的完成标准

全仓逐文件核对被测行为及 fixture，记录迁移、拆分或保留的依据，确保原有有效场景都有明确去向，
实际收集唯一且完整。以一次性的迁移对照辅助评审核对遗漏和重复收集，不增加常驻逐文件登记表或新的 Collection Guard。
同步核对 typecheck、测试收集、当前文档及 AFK 调用；冻结的历史材料继续遵守既有只读约束。

最终执行完整 `verify:release`，覆盖 Unit、Integration 和完整系统 E2E，记录实际运行结果及未执行范围。
全量验证通过才满足完成标准；文件位置、测试数量变化、静态扫描或历史通过记录本身不能替代行为验证。

## 当前契约与历史

完整分类、资源预算与生命周期见[测试编排架构](../architecture/testing-architecture.md)，执行入口见
[命令页](../development/commands.md#测试与验证通道)。旧通道决定仅保留在 Git 历史。

历史来源：[ADR-0003 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0003-adopt-layered-test-lanes-and-resource-budgets.md)、[ADR-0009 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0009-adopt-canonical-test-collections.md)。原始决定与后续修订按各版本追溯。
