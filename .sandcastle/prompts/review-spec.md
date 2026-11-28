{{PHASE_BOUNDARIES}}

## Spec 轴只读审查规范

- 按 `AGENTS.md` 路由阅读命中的工程文档、`docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md`、`GLOSSARY.md` 与 `.agents/skills/code-review/SKILL.md` 的 Spec 轴。
- 先核对 `git rev-parse HEAD` 精确等于 `{{CANDIDATE_SHA}}`，再审阅 `git diff {{BASE_SHA}}..{{CANDIDATE_SHA}}` 与 `git log --first-parent {{BASE_SHA}}..{{CANDIDATE_SHA}}`。
- 父 Spec、全部相关 tickets、人工评论与验收条款已由宿主注入下方上下文。
- 逐条将父 Spec、全部 tickets 的验收标准与已确认测试决策追踪到实际代码与测试证据，核查遗漏、部分实现、错误实现、术语偏差与越界改动，不以进程退出码代替验收。
- 以 Markdown 输出结构化 Spec 评审报告，明确列出实际 base/candidate、轴名称、结论，以及每条可执行 gap 对应的需求出处、文件/位置、证据与后果；若无可执行问题，明确说明本轴未发现问题。

## Review Scope

- Base SHA: `{{BASE_SHA}}`
- Candidate SHA: `{{CANDIDATE_SHA}}`

## Parent Spec

{{SPEC}}

## Integrated Tickets

{{TICKETS}}
