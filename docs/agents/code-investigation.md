# 代码调查与双引擎编排

本页统一维护 T3 Code 双引擎角色分工、评审编排，以及项目级只读调查子代理的调用策略与返回契约。
仓库的 7 个角色契约定义统一维护在 `.codex/agents/*.toml`（供 Codex 原生子代理与 Sandcastle AFK 直接加载）。

## 双引擎角色与评审编排

在 T3 Code 交互阶段，Antigravity 与 Codex 按下表分工：

| 角色                                                                | 适用场景                                                                | 引擎与模型                                                                                                                 | 思考档位                                                                                             | 调用方式与隔离                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`code_researcher`](../../.codex/agents/code-researcher.toml)       | 跨文件入口定位、调用链追踪、隔离搜索噪声                                | 同引擎原生优先：Antigravity 用 `research`（默认 `inherit`，轻扫可选 `flash`）；Codex 用 `code_researcher`（`gpt-6.2-sol`） | Antigravity 默认 `high`；Codex `reasoningEffort: "high"`                                             | 同引擎原生子代理，`shared`（硬只读沙箱）                                     |
| [`deep_researcher`](../../.codex/agents/deep-researcher.toml)       | 事务边界、并发/幂等、安全边界、证据冲突反证、AFK 难解失败定位           | 默认 Codex `gpt-6.2-sol`（Codex 主会话需异构复核时可选 Antigravity `gemini-4-neon`）                                       | Codex `reasoningEffort: "xhigh"`（极端疑难可由用户指定 `max`）；Antigravity `thought_level: "xhigh"` | 跨引擎走 `delegate_task`（`isolation: "shared"`）；同引擎走原生              |
| `ready-for-agent` 轻量门禁                                          | Spec 与 tickets 标记 `ready-for-agent` 交接 AFK 前的四项独立核查        | **固定** Codex `gpt-6.2-astra`                                                                                             | `reasoningEffort: "xhigh"`                                                                           | 独立 `delegate_task`（`role: "review"`、`isolation: "shared"`，只读限定）    |
| [`standards_reviewer`](../../.codex/agents/standards-reviewer.toml) | 显式 `code-review` 的 Standards 轴（仓库规范 + Fowler smell baseline）  | **固定** Codex `gpt-6.2-astra`                                                                                             | `reasoningEffort: "xhigh"`                                                                           | 与 `spec_reviewer` 并发走 `delegate_task`（`isolation: "shared"`）           |
| [`spec_reviewer`](../../.codex/agents/spec-reviewer.toml)           | 显式 `code-review` 的 Spec 轴（完整 Spec、tickets、验收与 scope creep） | **固定** Codex `gpt-6.2-astra`                                                                                             | `reasoningEffort: "xhigh"`                                                                           | 与 `standards_reviewer` 并发走 `delegate_task`（`isolation: "shared"`）      |
| 浏览器与 UI 视觉验收（按需）                                        | 仅用户明确要求页面检查、交互验证、截图或可视化原型时                    | **固定** Antigravity `gemini-4-neon`                                                                                       | `thought_level: "high"`                                                                              | Antigravity 主会话或独立 `delegate_task`（使用 `preview_*` / `html_render`） |

`implementer_light`、`implementer_standard`、`implementer_deep`（见 `.codex/agents/implementer-*.toml`）由 Sandcastle AFK
按票风险自动调度；T3 Code 下的 Fast Track 轻量直改由主会话单线完成。

编排约定：

1. **能力探测与阻塞上报** 每条线程首次调用 `delegate_task` 前先调用一次 `orchestrator_capabilities`。
   目标 provider 或模型不可用时直接报告阻塞并交由用户决策。
2. **跨引擎角色契约与只读核验** 通过 `delegate_task` 委派角色时，`task` 传递稀疏上下文指针（对应 `.codex/agents/<role>.toml`、
   `AGENTS.md`、issue/spec 编号、固定 base/candidate SHA 与范围）。经 `delegate_task` 执行的只读角色
   （`deep_researcher`、`ready-for-agent` 轻量门禁、`standards_reviewer`、`spec_reviewer`）在 `task` 中明确限定为只读范围，返回后由主会话核对 `git status` 干净。
3. **显式双轴评审** 调用 `code-review` 时提供起始基线、固定候选 SHA 和已确认需求来源，评审期间保持候选固定。
   两轴并发启动两个独立的 Codex `gpt-6.2-astra`（`reasoningEffort: "xhigh"`）`delegate_task`；每轮复审均新建独立
   `delegate_task`，评审 findings 由主会话直接修复并验证。
4. **T3 Code 工作树与子任务管理** 主会话需要脱离主目录隔离工作时使用 `t3_worktree_handoff`。
   用户显式要求在 T3 Code 派发独立工作树子任务时，先提交父分支基线，再由父会话通过 `delegate_task(isolation: "worktree")`
   创建隔离 checkout；异步任务等待系统通知推进，需要停止时调用 `task_cancel`。

## 调用策略

满足以下任一情况时，主代理应把一个边界明确的只读问题交给 `code_researcher`（Antigravity 主会话优先用原生硬只读 `research`）：

- 相关入口或实现位置未知；
- 需要跨 app、package 或 infrastructure boundary 追踪 request、event、transaction 或 data flow；
- 在设计或实现前需要带路径和符号的证据；
- 预计搜索、日志或中间判断会明显干扰主线程；
- 存在可按独立 subsystem 或 concern 并行调查的切片。

以下情况由主代理直接处理：

- 答案位于一个已知文件或符号；
- 任务是局部小改、常规测试执行或已进入实现阶段；
- 主代理已有足够证据；
- 问题还无法收敛为一个有停止条件的调查切片；
- 相同范围已经由其他 agent 调查完成。

## 深度调查升级策略

默认先用 `code_researcher` 建立地图和证据索引。满足以下任一条件时，把一个更窄的裁决问题升级给
`deep_researcher`：

- 需要证明 transaction boundary、rollback、`UnitOfWork`/`afterCommit` 或 failure atomicity；
- 涉及 concurrency、ordering、retry、idempotency 或跨 runtime 的状态一致性；
- 涉及 authorization bypass、安全边界或敏感数据流；
- 控制流依赖 composition、configuration、cache、queue 或隐式 framework lifecycle；
- `code_researcher` 的证据相互矛盾，或事实与 `Current` 架构文档声明不一致；
- 需要主动寻找反例才能确认关键 invariant。

问题本身已明确属于上述高风险范围时，可以直接使用一个 `deep_researcher`。不要默认让两个 agent 调查同一范围，也不要
并行启动多个 `deep_researcher`；升级时必须把已有 evidence index、未决问题和无需重读的范围一并交给它。

## 委派约束

1. 每个调查 agent 只接收一个问题，并明确 included scope、excluded scope 和 completion condition。
2. 按独立 subsystem 或 concern 拆分调查任务，不按任意文件数量拆分。
   `deep_researcher` 默认只启动一个，负责范围更窄的复杂裁决。
3. 调查 agent 不修改 production code、测试、文档、tracker 或配置，也不递归委派其他 agent。
4. 主代理等待所有必要调查完成后再综合，只针对冲突或缺口做聚焦补充调查，不重复已完成的扫描。
5. 主代理负责最终判断、冲突消解、实现决策和任何需要落盘的调查记录。

## 仓库调查顺序

调查从[仓库地图](../engineering/repository-map.md)和最小相关入口开始。
证据优先级与目标区分统一遵守[当前事实与修改目标](../index.md#当前事实与修改目标)；发生冲突时，
分别报告已观察行为、文档声明和差异。

后端调用链默认按以下边界追踪：

```text
protocol entry
  -> use case / application service
  -> domain or package seam
  -> repository / external adapter
  -> composition wiring
```

与问题相关时，同时确认 transaction boundary、`UnitOfWork`/`afterCommit`、error path、retry、同步/异步副作用和测试证据。
先用 `rg` / `rg --files`（本机未安装 `rg` 时改用 `git grep` / `git ls-files`）、package manifest、public export、entry point 与 composition root 缩小范围，避免无目标全库遍历、
重复完整读取文件或把原始命令日志带回主线程。

## 返回契约与外置记忆

调查结果必须包含：

1. `Conclusion`：直接结论与置信度；
2. `Execution or data flow`：有序的符号与边界；
3. `Evidence`：仓库相对路径、符号名称以及每条证据证明的内容；
4. `Inferences`：有依据但未被直接证明的判断；
5. `Unknowns`：未确认项与下一步最小调查动作。

`deep_researcher` 还必须返回关键 `Invariants and failure modes`，以及用于挑战主假设的 `Counterevidence`。

结果只返回压缩后的证据摘要，不返回原始搜索日志或大段源码。需要跨上下文恢复时，由主代理把摘要、已排除假设、已覆盖文件和下一步动作写入当前 GitHub issue 的评论，或用户明确指定的调查报告路径；恢复后优先沿该记录继续。
