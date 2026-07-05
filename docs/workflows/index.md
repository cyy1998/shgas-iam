# Workflow 索引与分流流程

本流程是 workflow 子目录入口，用来把一次需求定位到正确阶段：Explore、Clarify、Plan、Implement、Verify 或 Archive。仓库入口仍是
[AGENTS.md](../../AGENTS.md)，当前文档清单见 [docs/index.md](../index.md)。本文件只定义阶段索引、生命周期和入口分流；具体执行方法由各阶段文档说明。

阶段文档索引：

- [explore.md](explore.md)：调查问题空间、候选方案、未知项和影响面。
- [clarify.md](clarify.md)：收敛需求边界、领域术语、关键取舍和正确性标准。
- [plan.md](plan.md)：选择 Quick Change、OpenSpec change 或大型 OpenSpec umbrella change。
- [implement.md](implement.md)：实现、分支策略、TDD、范围漂移和委派。
- [verify.md](verify.md)：验证门禁、测试覆盖复核、验证矩阵、smoke 和失败记录。
- [archive.md](archive.md)：提交、合并、OpenSpec archive 和分支清理。

## 规范性语言与门禁

`docs/workflows/*.md` 是流程门禁，不是参考建议。`必须`、`不得` 是硬性要求；`默认`、`应` 表示必须执行，除非本次任务在行动前记录例外原因、替代验证和剩余风险；`可以` 表示可选。

执行顺序为：workflow 决定阶段门禁，skill 决定执行方法，OpenSpec 或任务清单决定本次范围。不能只完成 `tasks.md` 就跳过 workflow，也不能在触发 `$tdd`、`$openspec-*` 等技能时跳过对应技能说明。

非平凡任务的最终说明必须留下最小合规记录：采用的入口（Quick Change、OpenSpec change、OpenSpec umbrella change 或当前分支直改）、TDD 执行情况或例外、范围漂移处理、实际验证命令和结果，以及提交/合并/归档状态。

## Skill 前置门禁

阶段分流完成后、任何分支状态变更、写入动作或 OpenSpec artifact 创建前，必须先完成 skill preflight：

1. 根据用户请求、当前 workflow 阶段和任务影响面识别适用 skill。
2. 命中 skill 时，必须先完整读取对应 `SKILL.md`，并按该 skill 说明执行；不得用 workflow 文档替代 skill。
3. 如果阶段默认 skill 不适用，必须在行动前记录例外原因、替代流程和剩余风险。
4. 面向用户的阶段说明和最终说明必须记录本次使用的 skill；非平凡任务还应记录应使用但跳过的 skill 及原因。

默认 skill 门禁：

| 阶段或产物 | 默认 skill |
| --- | --- |
| Explore | 进入 [explore.md](explore.md) 时默认使用 `$openspec-explore`。 |
| Clarify | 进入 [clarify.md](clarify.md) 时默认使用 `$grill-with-docs`；需要沉淀已确认领域词汇时再使用 `$domain-modeling`。 |
| Plan - Quick Change | 选择 Quick Change 时必须使用 `$quick-change`。 |
| Plan - OpenSpec change 或 umbrella change | 创建或更新计划 artifacts 前必须使用 `$openspec-propose`，除非用户明确点名更具体的 `$openspec-*` 计划 skill。 |
| Implement | 实施 OpenSpec change 时使用 `$openspec-apply-change`；涉及 schema、Drizzle 或数据库约束时使用 `$db-schema`；用户要求 test-first 或集成测试时使用 `$tdd`。 |
| Verify | 验证 OpenSpec change 时使用 `$openspec-verify-change`。 |
| Archive | 归档单个 change 时使用 `$openspec-archive-change`；批量归档时使用 `$openspec-bulk-archive-change`。 |

## 文档维护

- 新增 `docs/**/*.md` 后必须更新 [docs/index.md](../index.md)；当前可作为依据的文档标记为 `Current`，历史快照标记为 `Historical`，已知过期内容标记为 `Stale`。
- 涉及发布、回滚、验证证据或运维操作的结果，应同步到 `docs/releases/` 或对应 feature 文档；文档变更的索引覆盖、新鲜度和本地 Markdown 链接验证方式由 [verify.md](verify.md) 统一定义。

## 生命周期

计划前后的状态流为：Idea -> Explore -> Clarify -> Plan -> Implement -> Verify -> Archive。不是每个状态都必须产生文档，但每次跳过状态都必须满足对应跳过条件；具体方法由对应阶段文档说明。

- Idea：初始想法、问题报告或改动请求；目标行为、影响范围和正确性标准不清楚时，不直接进入 Plan。
- Explore：[explore.md](explore.md) 调查问题空间、候选方案、未知项和影响面。
- Clarify：[clarify.md](clarify.md) 收敛需求边界、领域术语、关键取舍、非目标和正确性标准。
- Plan：[plan.md](plan.md) 选择 Quick Change、OpenSpec change 或大型 OpenSpec umbrella change。
- Implement：按 [implement.md](implement.md) 改代码、文档或 artifacts。
- Verify：按 [verify.md](verify.md) 证明正确性。
- Archive：处理提交、合并、OpenSpec archive 和分支清理；OpenSpec archive 仅在 change 完成、验证通过且用户明确要求归档时进入，方法见 [archive.md](archive.md)。

允许跳过 Explore 的条件：需求已经具体、影响面可从仓库事实直接判断、没有多个候选方向需要比较。

允许跳过 Clarify 的条件：需求边界、领域术语、关键取舍、非目标和正确性标准都能明确推断。只要其中任一项不清楚，就先进入 Clarify；不要靠猜测直接写 Plan 产物。

Explore 和 Clarify 的触发条件一旦命中，必须先进入对应阶段；不能用“改动很小”、“tasks 已列完”或“已有实现方向”作为跳过理由。

## 入口分流

入口分流只决定下一步进入哪个阶段或产物类型；具体写法和执行方法由对应阶段文档说明。判断依据是行为、契约和风险，而不是 diff 大小。

### 判断顺序

1. 需求是否仍处于想法、问题空间、方案比较或影响面调查阶段？如果是，进入 [explore.md](explore.md)。
2. 需求边界、领域术语、关键取舍、非目标或正确性标准是否无法从用户请求、代码、OpenSpec、docs 或既有测试中明确推断？如果是，进入 [clarify.md](clarify.md)。
3. 是否还没有选定计划产物，或需要判断 Quick Change、OpenSpec change、大型 OpenSpec umbrella change？如果是，进入 [plan.md](plan.md)。
4. 是否已经有足够的计划产物、失败信号或明确任务，且用户要实施改动？如果是，进入 [implement.md](implement.md)。
5. 是否已经完成实现，或用户要求运行测试、typecheck、lint、smoke、schema check、文档 guard 或其他正确性证明？如果是，进入 [verify.md](verify.md)。
6. 是否已经验证通过，并且用户明确要求提交、合并、归档 OpenSpec change 或清理分支？如果是，进入 [archive.md](archive.md)。

命中 OpenSpec 触发条件的改动，即使实现很小，也不能降级成 Quick Change；Plan 阶段负责选择并沉淀对应计划产物。
