# 02 — 对齐 spec、拆票、实施与评审 skills

**What to build:** 让生成 spec、拆分 tickets、实施和双轴评审的 skills 服从仓库级 v2 状态机，使 agent 在调用任何一个入口时都遵守中文文档、独立阶段授权、已提交候选范围和固定评审基线，而不会由通用 skill 指令绕过本地流程。

**Blocked by:** 01

**Status:** resolved

- [x] Spec skill 生成并提交 draft spec 后停止，不在 ticket 方案获批前把 spec 标为 implementation-ready。
- [x] Ticketing skill 仅在拆分方案获批后发布 tickets、把 spec 提升为 approved，并在输出 implementation brief 后停止。
- [x] Ticketing skill 不因 tickets 已成为 `ready-for-agent` 而自动调用 implementation，也不把拆票批准继承为实施授权。
- [x] Implementation skill 首先读取仓库 workflow 和 delivery ledger，并把 ticket/feature 验证频率交给已记录的 Validation Plan。
- [x] Implementation skill 在聚焦验证后创建已提交候选范围，再调用双轴评审；findings 通过额外 focused commits 修复并重新评审。
- [x] Review skill 接受用户或调用 workflow 提供的 fixed point，仍要求引用可解析、提交范围非空且工作区满足 gate 要求。
- [x] 相关 skills 遵守项目文档语言规则，而不是机械复制通用英文模板；机器字段和技术标识符保持稳定。
- [x] TDD 与 domain-modeling skills 的核心方法不变，外层 workflow 负责首次写入前的分支和授权门禁。
- [x] Skill 指令只保留必要的通用衔接，不复制仓库级状态机全文或建立第二份生命周期事实来源。
- [x] 文档检查、whitespace 检查及针对 skill 变更的 Standards/Spec 评审没有未解决 findings。

## Resolution

- Ticket base: `677f03125a55e9986277b65411478885a2afc870`
- Reviewed content head: `bb3093e601daaa32bc4f8b3405b4841fb4f777a5`
- Candidate commits: `b31464c67dd745cfa729039a17ab5712734d5812`, `bb3093e601daaa32bc4f8b3405b4841fb4f777a5`
- Final squash commit: `9b2b2656d25969a197de90a596991b7da822e9cc`
- Validation:
  - `python -X utf8 .../quick_validate.py <skill-dir>` — passed for all four skills
  - `pnpm check:docs` — passed，索引覆盖 28 篇文档
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.

## Reopen 2026-07-19

- Reason: 最终 feature review 发现 `to-spec` 与 `to-tickets` 模板没有精确服从 tracker 的 spec 和 blocker 格式契约。
- Previous reviewed content head: `bb3093e601daaa32bc4f8b3405b4841fb4f777a5`
- Remediation base: `350ebf85971386d94f449d33b2c88bb4ec2d384e`
- Status transition: resolved -> claimed

## Resolution 2026-07-19

- Ticket base: `350ebf85971386d94f449d33b2c88bb4ec2d384e`
- Reviewed content head: `f902a527d82d40508df6e430abed59198abc4576`
- Candidate commits: `f902a527d82d40508df6e430abed59198abc4576`
- Final squash commit: `9b2b2656d25969a197de90a596991b7da822e9cc`
- Validation:
  - `python -X utf8 .../quick_validate.py <skill-dir>` — passed，四个 workflow skills
  - `pnpm check:workflow` — passed，1 个 v2 feature 与 4 个 legacy feature
  - `pnpm check:docs` — passed，共检查 28 篇索引文档
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
