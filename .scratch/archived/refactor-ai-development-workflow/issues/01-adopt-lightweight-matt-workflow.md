# 01 — 切换到上游优先的轻量工作流

**What to build:** 维护者和 agent 可以直接使用上游 Matt skills 主流程，仓库只提供必要的本地适配；日常 lint、
提交和跨会话协作不再依赖 v2 证据状态机或 workflow checker。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 被仓库改写的四个 core skills 恢复为实施时核对的当前上游语义，不再引用 v2 gate、ledger 或 checkpoint。
- [x] 仓库入口、agent workflow、local Markdown tracker 和正式决策文档共同描述已经确认的薄适配边界，且不复制
  Matt 主流程。
- [x] 多会话 feature 的轻量 journal、ticket advisory 状态、fresh-context 协调和 tracker handoff 规则对下一会话
  足够清晰。
- [x] workflow checker、专用测试、根命令接线和 Husky 临时快照逻辑被移除，pre-commit 只保留 staged whitespace
  检查。
- [x] 根 lint、测试编排契约和开发命令说明反映新的可执行行为，不再要求 Validation Plan、Resolution 或 SHA 证据。
- [x] 既有 `.scratch/` 历史记录保持原样，冻结的 OpenSpec 历史没有被修改。
- [x] 相关根工具链测试、`pnpm lint`、`pnpm check:docs` 和 `git diff --check` 通过。
