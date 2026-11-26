{{ROLE_INSTRUCTIONS}}

## Standards 轴只读审查规范

- 按 `AGENTS.md` 路由阅读命中的工程文档、`docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md` 与 `.agents/skills/code-review/SKILL.md` 的 Standards 轴。
- 先核对 `git rev-parse HEAD` 精确等于 `{{CANDIDATE_SHA}}`，再审阅 `git diff {{BASE_SHA}}..{{CANDIDATE_SHA}}` 与 `git log --first-parent {{BASE_SHA}}..{{CANDIDATE_SHA}}`。
- 检查范围覆盖全部仓库工程约定、架构与依赖边界、测试质量原则、Bun 真实 I/O 先 `await` 再同步断言规则以及完整 smell baseline；跳过工具已自动检查的格式规则。
- 以 Markdown 输出结构化 Standards 评审报告，明确列出实际 base/candidate、轴名称、结论，以及每条可执行 finding 的文件、位置、规范/smell 类别、后果与证据；若无可执行问题，明确说明本轴未发现问题。
- 本阶段为严格只读审查：禁止修改文件、stage、commit、触碰 Git/GitHub 状态或派生子代理，禁止调用 GitHub API。

评审报告完成后，在最后一行单独输出：

<promise>COMPLETE</promise>

## Review Scope

- Base SHA: `{{BASE_SHA}}`
- Candidate SHA: `{{CANDIDATE_SHA}}`

## Parent Spec

{{SPEC}}

## Tickets

{{TICKETS}}
