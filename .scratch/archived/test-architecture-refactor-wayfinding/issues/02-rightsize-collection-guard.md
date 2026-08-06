# 决定 Collection Guard 的最小职责与退出策略

Type: grilling

Status: resolved

Blocked by: 01 — 收敛公开测试语言与最小命令面

## Question

Collection Guard 最少需要观察什么事实、长期保留什么能力，才能在迁移期间证明 canonical collections 不漏收、不重收，
同时避免演变成理解测试语义、资源生命周期或源码结构的第二套 Architecture Guard？

本 ticket 需要与维护者共同决定：

- 基线是从现有 runner collection/dry-run 派生，还是维护一份人工清单；
- 永久检查是否只验证路径、命名和唯一 collection，其他覆盖映射是否只保留在迁移 tracker；
- `check:test-architecture` 是否确有长期调用方，或者应拆成迁移期证据与极小的长期 orchestration contract test；
- Bun、Vitest、Playwright 和 Turbo 的观察方式是否能通过少量 adapter 完成，不能完成时是否应缩小目标；
- 迁移期 no-regression 数据、例外和兼容映射的 owner、更新规则与删除条件。

不允许扫描断言含义、推断外部资源使用、建立 AST/data-flow analyzer，或让维护者同时维护 runner 配置和等价的 257 行手写 manifest。

## Answer

维护者确认把 Collection Guard 定位为文件级的 collection contract，而不是第二套 Architecture Guard 或测试语义分析器。

### 永久职责

长期规则只观察仓库相对路径、文件命名、canonical package command 的声明以及 runner 可直接提供的 collection/task 输出，
并验证：

1. 每个符合测试路径与命名约定的候选文件都被一个 canonical collection 收集；
2. 每个候选文件只被一个 canonical collection 收集；
3. 文件路径、命名与其唯一的 Unit、Integration profile 或 E2E 归属一致；
4. root command 经 Turbo task graph 能到达持有该 collection 的 package task。

长期入口命名为 `pnpm check:test-collection`，并进入 `pnpm verify` 的静态阶段。它不并入
`pnpm check:architecture`；后者继续只保护 production module seam、owner 和依赖方向。

任何漏收、重收、路径/命名不一致、canonical task 不可达、adapter 执行失败或机器输出无法解析都必须非零退出，不能
silent skip、退回旧快照或降级为 warning。诊断至少给出仓库相对文件、期望归属和实际 collection；adapter 级故障给出
runner、workspace/task 和失败原因。

### Runner 观察方式

使用少量 runner-specific adapter，不建立统一 runner framework：

- Turbo dry-run 只观察 root command 到 package task 的编排，不声称列举测试文件；
- Vitest 使用其 list/files-only 机器输出观察实际 collection；
- Playwright 使用其 list 能力观察实际 collection；
- Bun 当前没有只列出测试文件的正式模式，因此只依据 canonical package command 明确指定的目录以及窄文件命名规则枚举
  候选与归属，不复制 Bun 的完整测试发现逻辑。

若未来 runner 无法通过稳定输出或窄声明观察某项事实，应缩小 Collection Guard 的承诺或修正 command/config seam，不能通过
执行测试、解析断言、AST/type/data-flow 分析、拦截 runner 内部行为或扫描资源调用来伪造精确性。

### 迁移期基线与退出

迁移前 collection 基线由现有 runner collection、Turbo dry-run 和 Bun 窄 adapter 自动生成并经一次人工确认；不维护与
runner 配置等价的手写文件 manifest。基线、新旧覆盖映射和例外只属于未来负责测试 collection/目录迁移的 feature tracker，
不进入 Current 架构文档、Architecture Guard 或永久 Collection Guard。

基线不能在出现差异时无条件整体刷新。每次变化必须明确属于新增、删除或移动；临时例外必须记录原因、负责清除它的
implementation ticket 和清除条件。业务场景覆盖映射可以作为迁移审查资料存在，但不成为永久机器规则。

当所有现有测试都由唯一 canonical collection 收集、迁移例外归零且旧 collection 配置已移除后，自动生成的旧基线、
新旧映射和迁移期对照逻辑必须整体删除。永久保留的只有当前 collection contract。

Collection Guard 永久不判断断言是否正确，不推断测试实际使用 Redis、PostgreSQL、浏览器或子进程，不管理资源生命周期，
也不保存历史 command 兼容映射。删除测试表明：当前唯一 collection 规则若移除，漏收与重收风险会重新分散到各 runner 和
package；迁移基线若在迁移结束后移除，则不会丢失任何当前架构保护，因此前者长期保留、后者按条件退出。
