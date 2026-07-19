# Git LF 换行规范交付记录

Workflow-Version: 2
Feature-Slug: enforce-lf
Workflow-Kind: quick
Stage: merge-ready
Feature-Branch: codex/quick-enforce-lf
Target-Branch: main
Target-Base: 2853365c79371a677b6a79fcaa4f97b32e2cd82d
Ticketing-Authorization: not-applicable
Implementation-Authorization: granted
Authorized-Implementation-Scope: 添加仓库级 LF 属性规则，关闭本仓库的自动 CRLF 转换，并规范化现有工作区换行
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config,code
Affected-Workspaces: root
Validation-Plan: declared
Content-Head: e033258eb4447aec2be82dc91c783f29c58c9872
Verified-Content-Head: e033258eb4447aec2be82dc91c783f29c58c9872
Reviewed-Content-Head: e033258eb4447aec2be82dc91c783f29c58c9872
Merge-Target-Tip: 2853365c79371a677b6a79fcaa4f97b32e2cd82d
Final-Squash-Commit: pending

## 范围与验收

- [x] 仓库通过 `.gitattributes` 明确要求文本文件使用 LF。
- [x] 本仓库的 `core.autocrlf` 配置为 `false`，不再把检出的文本转换为 CRLF。
- [x] 已跟踪文本在 Git 索引和当前工作区中均不含 CRLF 或 mixed 换行。
- [x] 二进制文件继续由 Git 按二进制内容处理，不参与文本换行转换。

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| feature | agent-config,code | root | `pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm build`<br>`pnpm check:workflow`<br>`git diff --check`<br>`powershell -NoProfile -Command "$rows = @(git ls-files --eol); $invalid = @($rows -match 'i/crlf') + @($rows -match 'i/mixed') + @($rows -match 'w/crlf') + @($rows -match 'w/mixed'); $binary = @($rows -match '\.png$') + @($rows -match '\.jpg$') + @($rows -match '\.wasm$'); $misclassified = @($binary -notmatch 'i/-text\s+w/-text'); if ($invalid.Count -or $misclassified.Count) { exit 1 }"` |

## 阶段证据

- `G1 Branch Ready` — 已从目标分支 `main` 的固定基线创建 `codex/quick-enforce-lf`，范围、验收和验证计划已声明。
- `G4 Implementing` — LF 规则候选提交已创建；Content-Head: `5b855649d1aace6e15d4c4191527a800dcf5d8d1`；进入功能级验证与双轴评审。
- `G4 Implementing` — Standards finding 修复提交已创建；Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；重新执行功能级验证与完整双轴评审。
- `G5 Feature Verified` — Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；功能级验证全部通过，最终 Standards 与 Spec 双轴评审清零。

## 验证记录

- `pnpm lint` — passed；Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；仅报告既有 warning，无 error。
- `pnpm typecheck` — passed；Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；14 个 workspace task 全部通过。
- `pnpm test` — passed；Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；14 个 workspace task 与 workflow CLI tests 全部通过。
- `pnpm build` — passed；Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；Admin 与 SSO 构建通过。
- `pnpm check:workflow` — passed；Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；2 个 v2 feature 与 4 个 legacy feature 格式检查通过。
- `git diff --check` — passed；Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；未发现 whitespace error。
- `powershell -NoProfile -Command "$rows = @(git ls-files --eol); $invalid = @($rows -match 'i/crlf') + @($rows -match 'i/mixed') + @($rows -match 'w/crlf') + @($rows -match 'w/mixed'); $binary = @($rows -match '\.png$') + @($rows -match '\.jpg$') + @($rows -match '\.wasm$'); $misclassified = @($binary -notmatch 'i/-text\s+w/-text'); if ($invalid.Count -or $misclassified.Count) { exit 1 }"` — passed；Content-Head: `e033258eb4447aec2be82dc91c783f29c58c9872`；索引与工作区异常数为 0，15 个现有二进制均保持 `-text`。

## 评审记录

- Feature — fixed point: `2853365c79371a677b6a79fcaa4f97b32e2cd82d`；reviewed head: `b3fcbf81f4bb56aea92b23af150ce022afa38179`；Standards: passed；Spec: passed；首轮 Standards finding 已修复，随后从原 fixed point 完整复审清零。

## 授权记录

- 2026-07-19 — 用户明确授权实施上述 LF 规范化快速改动；未授权 merge、push 或远端分支操作。

## Waivers

- 无。

## 重开与修复

- 2026-07-19 — Standards 评审发现 Validation Plan 未显式断言索引换行与现有二进制分类；已扩展 LF 验证命令覆盖 `i/crlf`、`i/mixed` 及 PNG/JPG/WASM 的 `-text` 状态。

## Merge brief

- Feature branch: `codex/quick-enforce-lf`
- Target branch: `main`
- Target base: `2853365c79371a677b6a79fcaa4f97b32e2cd82d`
- Target tip: `2853365c79371a677b6a79fcaa4f97b32e2cd82d`
- Content head: `e033258eb4447aec2be82dc91c783f29c58c9872`
- Verified content head: `e033258eb4447aec2be82dc91c783f29c58c9872`
- Reviewed content head: `e033258eb4447aec2be82dc91c783f29c58c9872`
- Delivery summary: 通过仓库级 `.gitattributes` 统一文本文件为 LF，完成现有工作区规范化并保留二进制分类，同时把本仓库 `core.autocrlf` 设为 `false`。
- Commit range: `2853365c79371a677b6a79fcaa4f97b32e2cd82d...e033258eb4447aec2be82dc91c783f29c58c9872`
- Validation: passed
- Review: passed
- Waivers and risks: none
- Local transaction:
  1. 再次确认 `main` tip 仍为 `2853365c79371a677b6a79fcaa4f97b32e2cd82d`，若变化则停止。
  2. 切换到 `main`，对 `codex/quick-enforce-lf` 执行 `git merge --squash`，创建一个 focused delivery commit。
  3. 将最终 squash SHA 回填到交付记录，创建 tracker-only 元数据提交。
  4. 运行 `pnpm check:workflow`、`git diff --check` 与 LF 状态检查，确认无残留 `pending`。
  5. 删除本地功能分支 `codex/quick-enforce-lf`。

## Delivery receipt

- 无。
