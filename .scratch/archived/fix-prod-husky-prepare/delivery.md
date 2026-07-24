# 修复生产依赖安装中的 Husky 生命周期失败交付记录

Workflow-Version: 2
Feature-Slug: fix-prod-husky-prepare
Workflow-Kind: quick
Stage: delivered
Feature-Branch: codex/quick-fix-prod-husky-prepare
Target-Branch: main
Target-Base: d58ff96e0a45f91d9c5b5358e50a35453f0dc40d
Ticketing-Authorization: not-applicable
Implementation-Authorization: granted
Authorized-Implementation-Scope: 修复 Docker Compose 应用镜像执行 pnpm 生命周期时根 prepare 找不到 Husky 的构建失败
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config,code,dependencies,frontend
Affected-Workspaces: @iam/admin,@iam/admin-api,@iam/api,@iam/oidc-provider,@iam/sso,@iam/worker
Validation-Plan: declared
Content-Head: 8e3bff9620bd9ec6582d875ccd23317ac6ad30e3
Verified-Content-Head: 8e3bff9620bd9ec6582d875ccd23317ac6ad30e3
Reviewed-Content-Head: 8e3bff9620bd9ec6582d875ccd23317ac6ad30e3
Merge-Target-Tip: d58ff96e0a45f91d9c5b5358e50a35453f0dc40d
Final-Squash-Commit: f2958aea4b80422c13ad8353eebee5031230f2b3

## 范围与验收

- [x] `pnpm install --prod` 不再因根 `prepare` 找不到 Husky 而失败。
- [x] 本地完整依赖安装仍会通过 Husky 配置版本化 Git hooks。
- [x] API、Admin API、OIDC Provider 与 Worker 的 Docker 依赖阶段均显式跳过 Husky 安装。
- [x] `docker compose build` 成功完成。

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| feature | agent-config,code,dependencies,frontend | @iam/admin,@iam/admin-api,@iam/api,@iam/oidc-provider,@iam/sso,@iam/worker | `powershell -NoProfile -Command "$env:HUSKY='0'; node .husky/install.mjs"`<br>`pnpm prepare`<br>`pnpm install --frozen-lockfile`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm build`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`pnpm --filter @iam/admin e2e`<br>`pnpm --filter @iam/sso e2e`<br>`docker compose -f docker/docker-compose-dev.yml build`<br>`git diff --check` |

## 阶段证据

- `G1 Branch Ready` — 已从 `main` 的固定基线创建快速修复分支，实施范围、验收条件与验证计划已声明。
- `G4 Implementing` — 已创建生产安装生命周期修复候选提交；Content-Head: `3c6bb620ce7fb932978570b13522a66cfadf5116`；OIDC Docker 依赖阶段与仓库级候选验证已通过。
- `G4 Implementing` — compose 复验发现 deploy 阶段仍会执行根 `prepare`，已把 `HUSKY=0` 提升为后端 deps stage 环境并创建修复提交；Content-Head: `3ac9502f1383470ac7299a833b3263feceeb3860`；Worker builder 完整链路通过。
- `G4 Implementing` — 完整 compose 复验发现前端 `pnpm rebuild` 同样触发根 `prepare`，已让 Admin 与 SSO deps stage 继承 `HUSKY=0` 并复制安装脚本；Content-Head: `1f36fff20f11c79dffb5bd40af4e7a5aec702619`；定向构建与完整 compose 构建均通过。
- `G4 Implementing` — 已根据首轮 Standards finding 校正完整 Compose 授权范围、受影响 workspace 和 frontend 验证计划；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`。
- `G5 Feature Verified` — Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；完整验证矩阵通过，最终 Standards 与 Spec 双轴评审清零。
- `G6 Merge Ready` — target tip 仍为 `d58ff96e0a45f91d9c5b5358e50a35453f0dc40d`；content、verified 与 reviewed head 一致，等待维护者授权本地 squash 事务。
- `G7 Delivered` — 已在 `main` 创建 squash 交付提交 `f2958aea4b80422c13ad8353eebee5031230f2b3`，并回填最终交付元数据。

## 验证记录

- `powershell -NoProfile -Command "$env:HUSKY='0'; node .husky/install.mjs"` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；生产模式 guard 退出 0。
- `pnpm prepare` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；本地开发模式仍成功执行 Husky 安装脚本。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；15 个 workspace 已是最新状态。
- `pnpm lint` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；14 个 workspace task 通过，仅报告既有 warning。
- `pnpm typecheck` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；首次并发运行因本机内存不足退出，设置 `TURBO_CONCURRENCY=1` 后 14 个 workspace task 全部通过。
- `pnpm test` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；14 个 workspace task 与 101 个 workflow checker tests 全部通过。
- `pnpm build` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；Admin 与 SSO 生产构建通过。
- `pnpm check:docs` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；28 篇文档索引检查通过。
- `pnpm check:workflow` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；3 个 v2 feature 与 4 个 legacy feature 格式检查通过。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；Chromium 2 条用例通过。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；Chromium 2 条用例通过。
- `docker compose -f docker/docker-compose-dev.yml build` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；7 个应用镜像全部构建成功。
- `git diff --check` — passed；Content-Head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`；未发现 whitespace error。

## 评审记录

- Feature — fixed point: `d58ff96e0a45f91d9c5b5358e50a35453f0dc40d`；reviewed head: `c740a9e880c97e7662111c29d52110f3a7e0422d`；Standards: passed；Spec: passed；首轮 Standards 的授权范围与 workspace 记录 finding 已修复，随后从原 fixed point 完整复审清零。

## 授权记录

- 2026-07-19 — 用户明确要求修复完整 `docker compose build` 的 Husky 生命周期失败，授权覆盖 Compose 中所有受该根生命周期影响的应用镜像；未授权 merge、push 或远端分支操作。
- 2026-07-19 — 维护者确认按 Merge brief 执行本地 squash、最终 SHA 回填和本地功能分支清理；仍未授权 push 或远端分支操作。

## Waivers

- 无。

## 重开与修复

- 2026-07-19 — 首轮 compose 构建发现 `HUSKY=0` 只作用于 install 命令，未覆盖 builder 中再次触发 `prepare` 的 `pnpm deploy --prod`；已改为 deps stage `ENV`，使 builder 继承跳过配置。
- 2026-07-19 — 第二轮完整 compose 构建发现 Admin 与 SSO 的 `pnpm rebuild` 也会执行根 `prepare`，但其 deps stage 未复制安装脚本；已把相同的 `HUSKY=0` 与脚本复制约束扩展到两个前端镜像。
- 2026-07-19 — 首轮 Standards 评审发现 ledger 把用户的完整 compose 修复授权误写为“后端镜像”，并漏列应用 workspace 与 frontend 验证；已按原始用户请求校正范围、分类和验证计划。

## Merge brief

- Feature branch: `codex/quick-fix-prod-husky-prepare`
- Target branch: `main`
- Target base: `d58ff96e0a45f91d9c5b5358e50a35453f0dc40d`
- Target tip: `d58ff96e0a45f91d9c5b5358e50a35453f0dc40d`
- Content head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`
- Verified content head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`
- Reviewed content head: `8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`
- Delivery summary: 将根 `prepare` 改为可按生产、CI 与显式 `HUSKY=0` 安全跳过的安装脚本，并让 Compose 中六类应用 Docker stage 复制该脚本、继承跳过配置，避免 `install`、`deploy` 与 `rebuild` 因缺少 devDependency Husky 失败。
- Commit range: `d58ff96e0a45f91d9c5b5358e50a35453f0dc40d...8e3bff9620bd9ec6582d875ccd23317ac6ad30e3`
- Validation: passed
- Review: passed
- Waivers and risks: none
- Local transaction:
  1. 再次确认 `main` tip 仍为 `d58ff96e0a45f91d9c5b5358e50a35453f0dc40d`，若变化则停止。
  2. 切换到 `main`，对 `codex/quick-fix-prod-husky-prepare` 执行 `git merge --squash`，创建一个 focused delivery commit。
  3. 将最终 squash SHA 回填到交付记录，创建 tracker-only 元数据提交。
  4. 运行 `pnpm check:workflow`、`pnpm check:docs` 与 `git diff --check`，确认最终字段已全部回填。
  5. 删除本地功能分支 `codex/quick-fix-prod-husky-prepare`。

## Delivery receipt

- Target branch: `main`
- Squash commit: `f2958aea4b80422c13ad8353eebee5031230f2b3`
- Tracker metadata: planned
- Final checks:
  - `pnpm check:workflow` — passed
  - `pnpm check:docs` — passed
  - `git diff --check` — passed
- Local feature branch: deleted
