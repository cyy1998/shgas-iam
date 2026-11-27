{{PHASE_BOUNDARIES}}

## 集中修复、推前轻量验证与 PR 正文起草

- 按 `AGENTS.md` 路由阅读命中的工程文档、`docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md`、`GLOSSARY.md` 与 `.agents/skills/pr/SKILL.md`。
- 先核对 `git rev-parse HEAD` 精确等于 `{{CANDIDATE_SHA}}` 且工作树干净；通过 `git log --first-parent {{BASE_SHA}}..{{CANDIDATE_SHA}}` 查阅各票合并历史。父 Spec、全部 tickets 与双轴评审报告已由宿主注入下方。
- 集中处理下方双轴评审报告中的全部可执行 findings，保留全部已集成票的功能与提交历史，并在交接中逐项说明每个 finding 的处置结果。
- 提交聚焦修复并引用相关 issue 编号。
- 在最终干净候选上执行推 PR 前轻量门禁：
  - 运行 `pnpm check`（覆盖 `format:check`、`lint`、`typecheck`、`@iam/db db:check`、`check:architecture`、`check:docs`、`check:env-names`）；
  - 对本阶段评审修复涉及的改动，补跑受影响范围的定向 Unit 与定向 Integration（`pnpm test:integration -- --workspace <pkg>` 或 `--file <path>`）；
  - 运行 `git diff --check`。
- 输出 findings 处置摘要、实际命令与结果及未执行项。按 `.agents/skills/pr/SKILL.md` 与 `GLOSSARY.md` 起草 PR 正文，在 `<pr-body>...</pr-body>` 中输出 `## Summary`、`## Evidence`、`## Merge Danger`。

## Review Baseline & Candidate

- Base SHA: `{{BASE_SHA}}`
- Candidate SHA: `{{CANDIDATE_SHA}}`

## Dual-Axis Review Report

{{REVIEW_REPORT}}

## Parent Spec

{{SPEC}}

## Integrated Tickets

{{TICKETS}}
