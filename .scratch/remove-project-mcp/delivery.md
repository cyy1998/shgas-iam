# 移除项目级开发工具集成交付记录

Workflow-Version: 2
Feature-Slug: remove-project-mcp
Workflow-Kind: quick
Stage: delivered
Feature-Branch: codex/quick-remove-project-mcp
Target-Branch: main
Target-Base: 8fa3d37bbf0e8c3669b9ac89ff91bb20124115ec
Ticketing-Authorization: not-applicable
Implementation-Authorization: granted
Authorized-Implementation-Scope: 删除用户指定的项目级开发工具集成及其配置、工作目录、文档入口、忽略项与文字残留
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config,code,docs
Affected-Workspaces: root
Validation-Plan: declared
Content-Head: 426072018ab411acf65d562a67e2506943107fa5
Verified-Content-Head: 426072018ab411acf65d562a67e2506943107fa5
Reviewed-Content-Head: 426072018ab411acf65d562a67e2506943107fa5
Merge-Target-Tip: 8fa3d37bbf0e8c3669b9ac89ff91bb20124115ec
Final-Squash-Commit: 8f7d18ebd05894b8916866714076d5cf75f18633

## 范围与验收

- [x] 删除该项目级开发工具的专属配置、工作目录和启动指南。
- [x] 清理共享配置、仓库指引、文档索引、忽略规则和历史交付记录中的相关文字。
- [x] 全仓文件名与文本扫描不再发现该工具名称、专属端点或服务标识。
- [x] 文档、工作流和仓库级验证全部通过。

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| feature | agent-config,code,docs | root | `pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm build`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |

## 阶段证据

- `G1 Branch Ready` — 已从固定 `main` 基线创建快速改动分支，并声明实施范围、验收条件与验证计划。
- `G4 Implementing` — Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；已创建项目级集成清理候选提交并完成内容头同步。
- `G5 Feature Verified` — Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；残留扫描、静态检查、类型检查和构建通过，全量测试中的既有启动时限抖动已由用户接受。
- `G6 Merge Ready` — target tip 仍为 `8fa3d37bbf0e8c3669b9ac89ff91bb20124115ec`；content、verified 与 reviewed head 一致，双轴评审清零，等待维护者授权本地 squash 事务。
- `G7 Delivered` — 已在 `main` 创建 squash 交付提交 `8f7d18ebd05894b8916866714076d5cf75f18633`，并回填最终交付元数据。

## 验证记录

- `pnpm lint` — passed；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；16 个 workspace task 通过，仅报告既有前端 warning。
- `pnpm typecheck` — passed；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；首次调用超过工具时限，持续等待方式复跑后 15 个 workspace task 全部通过。
- `pnpm test` — waived；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；全量并发运行触发既有启动 smoke 的固定时限抖动，用户明确接受本次测试。
- `pnpm --filter @iam/role-assignment-resolution test` — passed；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；7 个用例全部通过。
- `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/entry.smoke.test.ts` — passed；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；定向启动 smoke 复跑通过。
- `pnpm build` — passed；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；Admin 与 SSO 生产构建通过。
- `pnpm check:docs` — passed；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；27 篇文档索引检查通过。
- `pnpm check:workflow` — passed；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；8 个 v2 feature 与 4 个 legacy feature 格式检查通过。
- `git diff --check` — passed；Content-Head: `426072018ab411acf65d562a67e2506943107fa5`；未发现 whitespace error。

## 评审记录

- Feature — fixed point: `8fa3d37bbf0e8c3669b9ac89ff91bb20124115ec`；reviewed head: `ddd1e28a4621ee14db96c74c493bb914ed9bbb3c`；Standards: passed；Spec: passed；Standards 初审对 legacy 定点文字维护提出疑问，结合维护者“移除所有相关内容”的明确授权复核后撤回，两个评审轴均无 finding。

## 授权记录

- 2026-07-24 — 用户明确要求移除该项目中的指定集成，授权覆盖项目内相关配置、目录、文档和文字残留；未授权 merge、push 或远端分支操作。
- 2026-07-24 — 用户明确表示本次全量测试按通过处理，接受既有启动 smoke 时限抖动；仍未授权 merge、push 或远端分支操作。
- 2026-07-24 — 用户明确授权按 Merge brief 合并到 `main`，覆盖本地 squash、最终 SHA 回填和本地功能分支清理；未授权 push 或其他远端操作。

## Waivers

- 2026-07-24 — Command: `pnpm test`；Reason: 全量运行时既有启动 smoke 偶发超过固定就绪时限，且定向复跑通过；Scope: 本功能的全量测试 gate；Risk: 资源竞争环境仍可能出现同类测试抖动，本次改动未触及对应运行时代码；Approved by: 用户

## 重开与修复

- 无。

## Merge brief

- Feature branch: `codex/quick-remove-project-mcp`
- Target branch: `main`
- Target base: `8fa3d37bbf0e8c3669b9ac89ff91bb20124115ec`
- Target tip: `8fa3d37bbf0e8c3669b9ac89ff91bb20124115ec`
- Content head: `426072018ab411acf65d562a67e2506943107fa5`
- Verified content head: `426072018ab411acf65d562a67e2506943107fa5`
- Reviewed content head: `426072018ab411acf65d562a67e2506943107fa5`
- Delivery summary: 删除指定项目级开发工具的专属工作目录、缓存、连接配置、启动指南、仓库入口、忽略项和文字残留，同时保留其他共享配置与历史记录主体。
- Commit range: `8fa3d37bbf0e8c3669b9ac89ff91bb20124115ec...426072018ab411acf65d562a67e2506943107fa5`
- Validation: passed-with-waivers
- Review: passed
- Waivers and risks: 用户接受全量测试中既有启动 smoke 的固定时限抖动；对应定向用例已实际通过，本次改动未触及运行时代码。
- Local transaction:
  1. 再次确认 `main` tip 仍为 `8fa3d37bbf0e8c3669b9ac89ff91bb20124115ec`，若变化则停止。
  2. 切换到 `main`，对 `codex/quick-remove-project-mcp` 执行 `git merge --squash`，创建一个 focused delivery commit。
  3. 将最终 squash SHA 回填到交付记录，创建 tracker-only 元数据提交。
  4. 运行 `pnpm check:workflow`、`pnpm check:docs` 与 `git diff --check`，确认最终字段已全部回填。
  5. 删除本地功能分支 `codex/quick-remove-project-mcp`。

## Delivery receipt

- Target branch: `main`
- Squash commit: `8f7d18ebd05894b8916866714076d5cf75f18633`
- Tracker metadata: planned
- Final checks:
  - `pnpm check:workflow` — passed
  - `pnpm check:docs` — passed
  - `git diff --check` — passed
- Local feature branch: deleted
