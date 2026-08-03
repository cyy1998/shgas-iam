# 代码调查子代理

本仓库提供项目级 `code_researcher`，用于隔离跨文件搜索、调用链追踪和证据收集产生的中间噪声。Agent 定义位于
`.codex/agents/code-researcher.toml`，固定使用 `gpt-5.6-luna`、`max` 推理和 `read-only` sandbox。

## 调用策略

满足以下任一情况时，主代理应把一个边界明确的只读问题交给 `code_researcher`：

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

## 委派约束

1. 每个 `code_researcher` 只接收一个调查问题，并明确 included scope、excluded scope 和 completion condition。
2. 默认最多并行启动三个调查 agent；按独立 subsystem 或 concern 拆分，不按任意文件数量拆分。
3. 调查 agent 不修改 production code、测试、文档、tracker 或配置，也不递归委派其他 agent。
4. 主代理等待所有必要调查完成后再综合，只针对冲突或缺口做聚焦补充调查，不重复已完成的扫描。
5. 主代理负责最终判断、冲突消解、实现决策和任何需要落盘的调查记录。

## 仓库调查顺序

调查从 [仓库地图](../architecture/repository-map.md) 和最小相关入口开始。当前行为的证据优先级为：实现与可执行测试、
[文档索引](../index.md) 中标为 `Current` 的维护文档、其他历史线索。`openspec/`、`Historical` 和 `Stale` 文档不得单独
证明当前行为。

后端调用链默认按以下边界追踪：

```text
protocol entry
  -> use case / application service
  -> domain or package seam
  -> repository / external adapter
  -> composition wiring
```

与问题相关时，同时确认 transaction boundary、`UnitOfWork`/`afterCommit`、error path、retry、同步/异步副作用和测试证据。
先用 `rg`、`rg --files`、package manifest、public export、entry point 与 composition root 缩小范围，避免无目标全库遍历、
重复完整读取文件或把原始命令日志带回主线程。

## 返回契约与外置记忆

调查结果必须包含：

1. `Conclusion`：直接结论与置信度；
2. `Execution or data flow`：有序的符号与边界；
3. `Evidence`：仓库相对路径、符号名称以及每条证据证明的内容；
4. `Inferences`：有依据但未被直接证明的判断；
5. `Unknowns`：未确认项与下一步最小调查动作。

结果只返回压缩后的证据摘要，不返回原始搜索日志或大段源码。`code_researcher` 使用硬只读 sandbox，因此需要跨上下文恢复
时，由主代理把摘要、已排除假设、无需重读的文件和下一步动作写入当前 feature 的 `.scratch/` journal，或用户明确指定的
调查报告路径；恢复后优先读取该记录，不重新扫描已完成范围。
