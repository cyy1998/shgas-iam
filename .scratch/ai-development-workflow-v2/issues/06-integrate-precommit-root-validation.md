# 06 — 接入轻量 pre-commit 与根验证链

**What to build:** 把只校验记录格式的 workflow checker 接入版本化轻量 hook 和仓库标准验证入口，使格式缺失或错误的 v2 文档能在本地提交或全仓验证时被发现，并用当前 feature 证明该结构检查可以端到端自举。

**Blocked by:** 02, 04, 05

**Status:** resolved

- [x] Version-controlled Husky pre-commit hook 只运行 staged whitespace 检查和全局 workflow 记录格式检查，不运行全仓 lint、typecheck、test 或 build。
- [x] Hook 不检查当前分支、提交历史或 staged diff 分类，也不承担 content/tracker-only、状态转换或目标分支策略判断。
- [x] 目标分支只读、claim/resolution 顺序和 merge 事务继续由 workflow、agent preflight 与评审负责，文档明确 checker 通过不能替代 gate 通过。
- [x] 维护者保留显式 `--no-verify` 逃生口，文档明确该 bypass 不是 agent 的常规路径，也不构成阶段授权。
- [x] 不引入统一 staged Prettier 或改变仓库现有 formatter 边界；hook 安装依赖和 prepare 生命周期与 pnpm workspace 兼容。
- [x] 无参数记录格式检查接入根 lint，workflow CLI tests 接入根 test，同时保留可单独运行的 checker/test 命令。
- [x] 构建、测试与开发命令文档说明 hook、全局格式检查、workflow gate 的责任边界、测试命令和故障恢复入口，不宣称存在 gate-specific 历史校验。
- [x] 当前 v2 feature 的 spec、tickets 和 delivery ledger 能通过已实现的格式检查，bootstrap 限制得到真实记录而非补造证据。
- [x] Frozen-lockfile 安装、workflow CLI tests、根 lint/typecheck/test/build、文档检查和 whitespace 检查全部通过。
- [x] 最终 Standards 与 Spec 双轴评审确认 hook 只作为格式 guardrail，显式 gates、实际验证和人工授权仍是 workflow 权威。

## Resolution

- Ticket base: `b10d9cb8f66b036525955284575710adb36ac032`
- Reviewed content head: `a8f2a629b48da1cd17f5ad5925b69d2375a19e82`
- Candidate commits: `a8f2a629b48da1cd17f5ad5925b69d2375a19e82`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed，15 个 workspace projects，Husky prepare 完成
  - `pnpm test:workflow` — passed，98 个 CLI tests、507 个 expectations
  - `pnpm lint` — passed，14 个 workspace tasks，根 workflow checker 已执行，仅有仓库既有 warning
  - `pnpm typecheck` — passed，14 个 workspace tasks
  - `pnpm test` — passed，14 个 workspace tasks 与 98 个 workflow CLI tests
  - `pnpm build` — passed，2 个 build tasks
  - `pnpm check:workflow` — passed，1 个 v2 feature 与 4 个 legacy feature
  - `pnpm check:docs` — passed，共检查 28 篇索引文档
  - `git diff --check` — passed，候选提交的 hook 亦通过
- Review: Standards and Spec review passed with no unresolved findings.

## Reopen 2026-07-19

- Reason: 最终 feature Standards review 发现 pre-commit 从工作树读取 workflow 记录，部分暂存时可能让非法 staged 记录进入本地历史或误阻止合法 index。
- Previous reviewed content head: `a8f2a629b48da1cd17f5ad5925b69d2375a19e82`
- Remediation base: `a67c389279ebc9b6c06fc38820a1781279f11d8f`
- Status transition: resolved -> claimed

## Resolution 2026-07-19

- Ticket base: `a67c389279ebc9b6c06fc38820a1781279f11d8f`
- Reviewed content head: `85ad60e169bb924ccec9fb4322436ac921073249`
- Candidate commits: `f2f29602271e41d0665056196cdba6a9c51c0392`, `85ad60e169bb924ccec9fb4322436ac921073249`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed，15 个 workspace projects
  - `pnpm test:workflow` — passed，101 个 CLI/hook tests、514 个 expectations
  - `pnpm lint` — passed，14 个 workspace tasks，根 workflow checker 已执行，仅有仓库既有 warning
  - `pnpm typecheck` — passed，14 个 workspace tasks
  - `pnpm test` — passed，14 个 workspace tasks 与 101 个 workflow CLI/hook tests
  - `pnpm build` — passed，2 个 build tasks
  - `pnpm check:workflow` — passed，1 个 v2 feature 与 4 个 legacy feature
  - `pnpm check:docs` — passed，共检查 28 篇索引文档
  - `git diff --check` — passed，候选提交的 staged snapshot hook smoke 亦通过
- Review: Standards and Spec review passed with no unresolved findings.
