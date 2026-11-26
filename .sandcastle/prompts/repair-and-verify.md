{{ROLE_INSTRUCTIONS}}

## 集中修复、最终验证与 PR 正文起草

- 按 `AGENTS.md` 路由阅读命中的工程文档、`docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md`、`GLOSSARY.md` 与 `.agents/skills/pr/SKILL.md`。
- 先核对 `git rev-parse HEAD` 精确等于 `{{CANDIDATE_SHA}}` 且工作树干净；通过 `git log --first-parent {{BASE_SHA}}..{{CANDIDATE_SHA}}` 查阅各票合并历史。父 Spec、全部 tickets 与双轴评审报告已由宿主注入下方，不要在沙箱内调用 GitHub API。
- 集中处理下方双轴评审报告中的全部可执行 findings，保留全部已集成票的功能与提交历史，并在交接中逐项说明每个 finding 的处置结果。
- Bun 真实 I/O 测试先用普通 `await` 完成（失败路径先捕获 rejection），再做同步断言；禁止使用 `.resolves`、`.rejects` 或 async `toThrow`。真实资源测试从根入口 `pnpm test:integration` 或 `pnpm test:e2e` 运行。
- 保留提交 Hook（禁止 `--no-verify`），核对 Hook 修复并提交聚焦修复（引用相关 issue 编号），对失效范围重跑检查。
- 在最终干净候选上，以固定评审基线 `{{BASE_SHA}}` 按 `docs/agents/workflow.md` 与 `docs/agents/sandcastle-afk.md` 执行完整最终验证：
  - 纯文档差异运行 `pnpm verify:docs --base {{BASE_SHA}}`，其余改动运行 `pnpm verify` 并按 Spec 与风险补齐所需的 Integration、E2E、Gateway 检查；
  - 修复提交后运行 `pnpm verify:container-smoke --base {{BASE_SHA}}` 与 `pnpm verify:e2e-runtime --base {{BASE_SHA}}`（若同一最终候选已通过 `pnpm verify:release`，可复用其结果）；
  - 运行 `git diff --check`。
- 禁止执行 `git push`、创建 PR 或修改 GitHub 议题；保持远端分支与议题状态不变。
- 按 `.agents/skills/pr/SKILL.md` 与 `GLOSSARY.md` 基于最终 diff 与真实证据起草简洁的 PR 正文（包含 `## Summary`、`## Evidence`、`## Merge Danger`）。

仅当全部 findings 已妥善处理、全部必需验证通过且最终工作树干净时：

1. 输出 findings 处置摘要、实际命令与结果及未执行项（如有）；
2. 在 `<pr-body>...</pr-body>` 中给出非空 PR 正文草稿；
3. 在最后一行单独输出：

<promise>COMPLETE</promise>

若未完成或存在阻塞失败，报告具体错误与安全恢复点，且不要输出 `<promise>COMPLETE</promise>`。

## Review Baseline & Candidate

- Base SHA: `{{BASE_SHA}}`
- Candidate SHA: `{{CANDIDATE_SHA}}`

## Dual-Axis Review Report

{{REVIEW_REPORT}}

## Parent Spec

{{SPEC}}

## Integrated Tickets

{{TICKETS}}
