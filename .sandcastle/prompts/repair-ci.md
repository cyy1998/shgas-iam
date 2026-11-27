{{ROLE_INSTRUCTIONS}}

## 远端 CI 失败自动诊断与修复

- 按 `AGENTS.md` 路由阅读命中的工程文档、`docs/agents/workflow.md`、`docs/agents/sandcastle-afk.md` 与 `GLOSSARY.md`。
- 先核对 `git rev-parse HEAD` 精确等于 `{{FAILED_SHA}}` 且工作树干净；不要在沙箱内调用 GitHub API，也禁止执行 `git push`、修改 PR 或操作 GitHub 议题。
- 仔细阅读下方宿主注入的脱敏 CI 失败尾部日志（覆盖 `doc-check`、`fast`、`integration`、`e2e` 或 `ci-gate`），定位真正的根因并最小化修复，禁止通过删减功能、绕过检查或削弱断言来掩盖问题。
- 沙箱采用无特权方案 X（无 `docker.sock`、会话就绪时启动专用测试服务）：
  - Bun 真实 I/O 测试先用普通 `await` 完成（失败路径先捕获 rejection），再做同步断言；禁止使用 `.resolves`、`.rejects` 或 async `toThrow`；
  - 集成测试从根入口 `pnpm test:integration`（`--workspace` / `--file`）使用沙箱内专用端点运行；
  - 不要在沙箱内运行 `pnpm test:e2e`；若远端失败来自 `e2e` job，请结合失败日志与对应源码、Dockerfile 及 `e2e/system` 规格定位根因，并在本地以 `pnpm check`、相关 Unit/Integration 与必要的 `pnpm build` 验证修复。
- 完成修复后在最终提交前运行：
  - `pnpm check`；
  - 针对失败范围的定向 Unit 与定向 Integration（若失败在构建阶段，同时运行 `pnpm build`）；
  - `git diff --check`。
- 保留提交 Hook（禁止 `--no-verify`），在 `{{FAILED_SHA}}` 之上创建新的聚焦修复提交（禁止 amend、rebase 或 reset 已有历史，确保新 `HEAD` 严格前进且 `{{FAILED_SHA}}` 仍为祖先），保持最终工作树干净。
- 若经排查确认为纯外部/基础设施偶发故障或无法在代码仓内安全修复，清楚报告诊断结果与恢复建议，且**不要**输出 `<promise>COMPLETE</promise>`。

仅当根因已修复、本地验证全部通过、已产生严格前进的新提交且工作树干净时，在最后一行单独输出：

<promise>COMPLETE</promise>

## CI Failure Context

- Pull Request: `{{PR_URL}}`
- Base SHA: `{{BASE_SHA}}`
- Failed Head SHA: `{{FAILED_SHA}}`
- Auto-Repair Attempt: `{{REPAIR_ATTEMPT}} / {{MAX_REPAIRS}}`
- `ci-gate` Conclusion: `{{CI_CONCLUSION}}`
- Check URL: `{{CI_CHECK_URL}}`

### Redacted CI Failure Tail Logs

```text
{{CI_FAILURE_LOGS}}
```

## Parent Spec

{{SPEC}}

## Integrated Tickets

{{TICKETS}}
