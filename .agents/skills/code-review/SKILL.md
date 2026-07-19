---
name: code-review
description: 从固定比较点沿 Standards 与 Spec 两轴评审已提交变更，并由两个并行子代理分别报告结果。用户要求评审分支、PR、WIP 或从某个 SHA 开始 review 时使用。
---

# 双轴代码评审

评审固定比较点与 `HEAD` 之间的 committed diff：

- **Standards**：变更是否遵守仓库已记录的工程规范？
- **Spec**：变更是否忠实实现来源 issue、PRD 或 spec？

两个轴必须由并行子代理独立完成，避免互相污染判断，再由主代理并列汇总。分支、ticket/feature gate、评审新鲜度和文档语言遵守仓库 Engineering workflow。

## 1. 固定比较点

Fixed point 可以来自用户，也可以来自调用本 skill 的仓库 workflow。Ticket review 通常使用 claim checkpoint，feature review 通常使用已固定 target tip。只有两者都没有提供时才询问用户，不要覆盖调用 workflow 已固定的 SHA。

一次性记录：

```bash
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

继续前必须确认：

- `git rev-parse <fixed-point>` 成功；
- committed diff 非空；
- 工作区满足调用 gate 的要求，至少不能存在未提交 content change；仓库 workflow 要求干净时必须完全干净。

引用无效、diff 为空或工作区不满足 gate 时立即失败，不把错误留给子代理。

## 2. 确定 Spec 来源

按以下顺序查找：

1. Commit message 引用的 issue；按 `docs/agents/issue-tracker.md` 获取。
2. 用户或调用 workflow 传入的 ticket/spec 路径。
3. 与分支或 feature 匹配的 `docs/`、`specs/` 或 `.scratch/` 规格。
4. 标准 ticket review 同时使用当前 ticket 与 approved spec；快速路径使用 delivery ledger 的范围和验收项。

没有独立 spec 文件时，把用户请求、对话中确认的验收行为或快速路径 delivery scope 固定为 Spec 来源。仍无法确定预期行为时停止并询问用户；不得跳过 Spec 子代理或把单轴评审报告成双轴通过。

## 3. 确定 Standards 来源

读取仓库中约束当前变更的 `AGENTS.md`、Current 架构/开发文档和相关 skill。仓库明文规范优先于以下 smell baseline；tooling 已确定性强制的事项不重复报告。Smell 始终是 judgement call，不是 hard violation：

- **Mysterious Name**：名称不能揭示用途；重命名，无法诚实命名时重新澄清设计。
- **Duplicated Code**：相同逻辑形状重复；提取共享形状。
- **Feature Envy**：方法更多依赖其他对象数据；把行为移动到拥有数据的对象。
- **Data Clumps**：相同字段或参数总是成组出现；形成一个类型。
- **Primitive Obsession**：primitive/string 替代了明确领域概念；引入小型领域类型。
- **Repeated Switches**：对同一类型重复 switch/if cascade；使用多态或共享映射。
- **Shotgun Surgery**：一个逻辑变化迫使多处散改；把共同变化收拢到一个模块。
- **Divergent Change**：同一模块因互不相关的原因变化；按职责拆分。
- **Speculative Generality**：增加 spec 未需要的抽象、参数或 hook；删除或内联。
- **Message Chains**：调用者依赖长导航链；由首个对象隐藏导航。
- **Middle Man**：类或函数主要只做委托；直接调用真实目标。
- **Refused Bequest**：子类或实现忽略大部分继承契约；改用组合。

## 4. 并行启动两个子代理

一次并行启动 Standards 与 Spec 子代理，二者都只读，不修改文件。

Standards prompt 必须包含 diff 命令、commit 列表、标准来源文件，以及上面的完整 smell baseline。要求按文件/hunk 报告明文规范违反与 smell，引用规则，区分 hard violation 和 judgement call，跳过 tooling 已覆盖事项，中文不超过 400 字。

Spec prompt 必须包含 diff 命令、commit 列表和完整需求来源。要求报告：缺失或部分实现的要求、未被要求的 scope creep、看似实现但语义错误的要求；每项引用具体需求，中文不超过 400 字。

## 5. 并列汇总

分别在 `## Standards` 与 `## Spec` 下原样或轻量整理两个报告，不合并、不跨轴重排 findings。最后用一行分别统计两轴 finding 数量和各轴最严重问题，不选跨轴“总冠军”。

存在 finding 时，调用 workflow 负责验证、创建额外 focused commit、同步 content HEAD，并对原 fixed point 到新 HEAD 的完整范围重新运行本 skill。两轴清零才可记录 review gate 通过。
