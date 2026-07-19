# 01 — 固化 v2 状态机与 tracker 契约

**What to build:** 建立一份可直接执行的仓库级 AI 开发工作流契约，使维护者和 agent 能从同一中文事实来源确定标准/快速路径、状态转换、授权边界、分支与提交时机、验证和评审新鲜度、重开与修复、交付事务及 legacy adoption，而无需在多个说明中推断遗漏步骤。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Engineering workflow 使用稳定 Gate ID 完整定义 `G0–G7` 与 `T1–T4`，并明确每个状态的进入条件、必需证据、自动动作和人工 checkpoint。
- [x] 目标分支只读边界、首次受版本控制写入前创建分支、工作区异常处理、一个 feature 一个分支及目标漂移集成规则均有唯一且无歧义的定义。
- [x] 标准路径和快速路径分别说明产物、允许跳过的阶段和不可跳过的分支、验证、评审、merge 与 push 门禁。
- [x] 阶段授权、当前任务内授权有效期、新任务恢复确认、范围扩大以及 merge/push 独立授权均有明确规则。
- [x] 阶段 checkpoint、ticket claim、候选/修复提交、resolution 元数据提交和最终 squash/回填提交的时机与内容边界均已定义。
- [x] Issue tracker 契约定义 v2 delivery ledger 的规范字段、ticket 生命周期、`resolved → claimed → resolved` 重开路径、remediation ticket 和最终 SHA 回填规则。
- [x] 验证矩阵、content HEAD 新鲜度、tracker-only 证据例外、waiver、merge brief 和失败恢复行为均可由后续 checker 实现而无需二次决策。
- [x] Agent 新建或实质修改的文档正文统一使用中文，同时保留命令、路径、代码标识符、API/skill 名称、Gate ID、机器字段和引用原文的原语言。
- [x] Legacy features 保持历史原貌；只有新建或显式 adoption 的 feature 才进入 v2 强校验。
- [x] 文档索引检查和 whitespace 检查通过，Current 文档之间不存在相互矛盾的生命周期描述。

## Resolution

- Ticket base: `dd3f9add69936de23f759fe326d97172232b364c`
- Reviewed content head: `938f0550ae7d6804b375c22ef759c44d62ea802e`
- Candidate commits: `50a35b36c0a46e2b82c7242be7243deff4ca4d96`, `938f0550ae7d6804b375c22ef759c44d62ea802e`
- Final squash commit: `pending`
- Validation:
  - `pnpm check:docs` — passed，索引覆盖 28 篇文档
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.

## Reopen 2026-07-19

- Reason: 最终 feature review 发现 spec 文件契约未在 tracker 文档中定义，且 G5 的进入时机与 approved spec 不一致。
- Previous reviewed content head: `938f0550ae7d6804b375c22ef759c44d62ea802e`
- Remediation base: `1c985a3f417dd1a30f45ce63f33587d25b5d2858`
- Status transition: resolved -> claimed

## Resolution 2026-07-19

- Ticket base: `1c985a3f417dd1a30f45ce63f33587d25b5d2858`
- Reviewed content head: `008ea5e582919fceba5a31051c97cf87c1374263`
- Candidate commits: `e9f551f995a02e8a89659a3ac63b492193325550`, `008ea5e582919fceba5a31051c97cf87c1374263`
- Final squash commit: `pending`
- Validation:
  - `pnpm check:docs` — passed，共检查 28 篇索引文档
  - `pnpm check:workflow` — passed，1 个 v2 feature 与 4 个 legacy feature
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
