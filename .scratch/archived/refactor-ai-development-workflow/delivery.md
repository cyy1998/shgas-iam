# 轻量化 AI 开发工作流开发记录

## 当前状态

- 正式规格已经完成并通过文档检查，见 [spec.md](./spec.md)。
- 两张 tracer-bullet tickets 已发布：
  [01 — 切换到上游优先的轻量工作流](./issues/01-adopt-lightweight-matt-workflow.md) 与
  [02 — 提供显式 feature 归档与收尾](./issues/02-add-feature-archive-closeout.md)。
- Ticket 01 已完成实现、聚焦验证和 Standards/Spec 双轴评审，状态为 `resolved`。
- Ticket 02 已完成实现、聚焦验证和 Standards/Spec 双轴评审，状态为 `resolved`，见
  [02 — 提供显式 feature 归档与收尾](./issues/02-add-feature-archive-closeout.md)。
- 功能分支为 `codex/refactor-ai-development-workflow`，目标分支为 `main`。
- 两张 tickets 均已解决，实现阶段完成。下一安全动作是用一个明确问题请求本地收尾授权，默认建议 squash，并列明
  目标漂移处理、一次 `pnpm verify`、归档、merge、可达性确认和本地分支删除；push 与远端删除不在该范围内。
- 当前 feature 尚未归档，也未运行完整 `pnpm verify`、merge、push 或删除分支。

## 验收与验证计划

- 每张 ticket 在全新上下文中运行与其交付行为直接相关的聚焦检查，并在 committed diff 上完成一次双轴 review。
- agent 配置和文档变化运行 `pnpm check:docs` 与 `git diff --check`。
- 根命令、Husky 和测试编排变化运行相关 Bun 测试与根 lint。
- `archive-feature` 运行结构校验，并在一次性临时 Git fixture 中前向测试成功路径和安全停止路径。
- 准备 merge 时，在处理目标分支漂移后的最终实现内容上运行一次 `pnpm verify`。

## 事件

- 2026-07-24 Decision — 维护者确认以 Matt skills 为流程主体，仓库只保留薄适配；正式设计见
  [spec.md](./spec.md)。
- 2026-07-24 Decision — 所有进入 `/to-tickets` 的 feature 使用一份轻量 `delivery.md`，每张 ticket 在全新上下文
  中顺序实现。
- 2026-07-24 Decision — 正式需求、设计和测试范围写入 spec/ticket/ADR；本文件只记录过程状态、验证、评审、授权和
  修复事件。
- 2026-07-24 Authorization — 维护者批准本 feature 使用新轻量流程完成 bootstrap，并授权进入 `/to-spec`；尚未授权
  merge、push 或远端分支操作。
- 2026-07-24 Validation — `pnpm check:docs` 与 `git diff --check` 通过，正式 spec 可以作为拆票基线。
- 2026-07-24 Authorization — 维护者批准两票拆分及发布，并明确要求发布后暂停，实施仍等待下一次确认。
- 2026-07-24 Authorization — 维护者批准当前任务按 [spec.md](./spec.md) 的 Bootstrap 轻量规则实施 ticket 01；
  不创建 v2 claim checkpoint 或 SHA 证据链，也不包含 ticket 02、merge、push、部署或远端分支操作。
- 2026-07-24 Validation — 四个 core `SKILL.md` 与实施时当前上游内容在归一化换行后完全一致；
  `bun test scripts/__tests__/test-orchestration.test.ts` 8/8 通过，Ticket 01 直接涉及的 root guard 与 tooling
  root-lint 契约定向测试 2/2 通过。
- 2026-07-24 Validation — `pnpm lint` 的 16 个任务通过（仅既有前端 warnings），`pnpm check:docs` 通过并索引
  30 篇文档，`git diff --check` 通过；按 ticket 验证节奏未运行完整 `pnpm verify`。
- 2026-07-24 Validation — 首次合并运行两个根工具链测试文件时，test orchestration 全部通过，tooling performance
  的三个既有非本票断言因 Windows 路径、现有 timeout 基线和 Bun 的 TypeScript wrapper 解析失败；本票修改的两项
  契约已独立重跑并通过。
- 2026-07-24 Review — 首轮 Standards 无 finding；Spec 发现测试架构尾部残留旧 “feature/merge gate” 表述。
- 2026-07-24 Repair — 已用 focused fix commit 将残留措辞改为“实现与本地交付规则”，相关文档与 whitespace 检查
  通过。
- 2026-07-24 Review — 对同一完整范围重新并行执行 Standards 与 Spec 评审，两轴均无 finding；ticket 01 可以
  handoff。
- 2026-07-24 Authorization — 维护者批准在 fixed point `b23bf1df732fe32f4c4e86456ae2359c7bc44f4c`
  之后实施 ticket 02，包括创建并前向测试 `archive-feature` skill，以及核对本地收尾提示；本次不实际归档当前
  feature，不运行完整 `pnpm verify`，也不包含 merge、push、部署、远端操作或分支删除。
- 2026-07-24 Decision — `archive-feature` 允许由 `$archive-feature` 或无歧义的自然语言归档请求触发；implicit
  invocation 不能把 feature 已完成、ticket 已 `resolved` 或 merge/closeout 讨论推断为归档授权。
- 2026-07-24 Validation — 使用 UTF-8 模式运行 skill-creator `quick_validate.py`，最终 `archive-feature` 结构校验
  通过；`pnpm check:docs` 通过并索引 30 篇文档，`git diff --check` 与 staged whitespace 检查通过。
- 2026-07-24 Repair — 首次成功路径 forward-test 暴露 `.scratch/archived` 父目录不存在时 `git mv` 会失败；skill
  已补充固定父目录的安全创建与路径占用检查，并重新通过结构校验。
- 2026-07-24 Validation — 全新上下文的隔离 Git fixture retry 成功移动 tracker、更新受版本控制引用并创建单父
  focused commit，同时保留无关 untracked 文件且未发生 merge；另一 fixture 在发现未 resolved ticket 后零修改停止。
- 2026-07-24 Validation — 按 ticket 节奏未运行完整 `pnpm verify`，当前 feature 未实际归档。
- 2026-07-24 Review — 首轮 Standards 发现 skill 触发描述与 UI policy 不一致，Spec 无 finding；维护者随后明确
  允许 implicit invocation，并保留只有明确归档意图才构成授权的边界，已用 focused fix commit 对齐。
- 2026-07-24 Review — 对同一 fixed point 到最新 `HEAD` 的完整范围重新并行评审，Standards 与 Spec 均无 finding；
  ticket 02 可以 handoff。
