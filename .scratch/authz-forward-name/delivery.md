# Authz 下游用户姓名透传交付记录

Workflow-Version: 2
Feature-Slug: authz-forward-name
Workflow-Kind: quick
Stage: delivered
Feature-Branch: codex/quick-authz-forward-name
Target-Branch: main
Target-Base: 87d3f288ef36336c0f42b391bb33febca02496d8
Ticketing-Authorization: not-applicable
Implementation-Authorization: granted
Authorized-Implementation-Scope: 在现有 `/auth/authz` 下游用户摘要中新增 `name` 字段，并让根 `pnpm test` 不再隐式运行 workflow CLI 专项测试，同步回归测试与当前文档
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config,code,dependencies,docs
Affected-Workspaces: @iam/api
Validation-Plan: declared
Content-Head: f0db0a484d1461af9aaea46ecec51c5de90bb3e8
Verified-Content-Head: f0db0a484d1461af9aaea46ecec51c5de90bb3e8
Reviewed-Content-Head: f0db0a484d1461af9aaea46ecec51c5de90bb3e8
Merge-Target-Tip: 87d3f288ef36336c0f42b391bb33febca02496d8
Final-Squash-Commit: 72a4103f4934042eafe3f1e20b5fa078be0a5f18

## 范围与验收

- [x] `/auth/authz` 成功响应的 `X-User-Info` 解码后包含当前用户的 `name`。
- [x] 既有 `id` 与 `username` 字段保持不变，不透传完整用户详情。
- [x] 接口响应体继续携带与 `X-User-Info` 相同的 Base64 用户摘要。
- [x] 当前第三方 SSO 对接文档与回归测试反映新增字段。
- [x] 根 `pnpm test` 只运行普通 workspace 测试，不再隐式调用 `pnpm test:workflow`。
- [x] `pnpm test:workflow` 继续作为修改 workflow checker 或 CLI 测试时使用的显式专项命令。

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| feature | agent-config,code,dependencies,docs | @iam/api | `pnpm --filter @iam/api exec bun test src/routes/sso/__tests__/sso-session-consistency.test.ts src/routes/auth/__tests__/auth.handlers.test.ts`<br>`pnpm --filter @iam/api lint`<br>`pnpm --filter @iam/api typecheck`<br>`pnpm install --frozen-lockfile`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm build`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |

## 阶段证据

- `G0 Intake` — 已确认范围仅为扩展现有 authz 用户摘要，不改变鉴权方式、会话协议、数据库或网关路由。
- `G1 Branch Ready` — 已从干净的 `main` 固定基线创建快速改动分支，并声明范围、验收与验证计划。
- `G4 Implementing` — 用户明确要求额外向下游传递 `name`，已授权本范围内的实现与验证。
- `G4 Implementing` — 已创建快速改动候选提交；Content-Head: `d22b0dba2b68804d01ed1454659464ec721ae7a2`；进入功能级验证与双轴评审。
- `G4 Implementing` — 用户将范围扩展为根 `pnpm test` 不再隐式运行 workflow CLI 专项测试；已终止旧根测试进程并更新实现与验证计划。
- `G4 Implementing` — 已创建根测试脚本拆分候选提交；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；重新执行功能级验证与完整双轴评审。
- `G4 Implementing` — Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；Validation Plan 全部通过，进入最终双轴评审。
- `G5 Feature Verified` — Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；功能级验证全部通过，最终 Standards 与 Spec 双轴评审清零。
- `G6 Merge Ready` — target tip 仍为 `87d3f288ef36336c0f42b391bb33febca02496d8`；content、verified 与 reviewed head 一致，等待维护者授权本地 squash 事务。
- `G7 Delivered` — 本地 squash delivery commit 为 `72a4103f4934042eafe3f1e20b5fa078be0a5f18`；最终 SHA 回填、tracker-only 元数据提交、最终检查和本地功能分支清理在同一本地事务内完成。

## 验证记录

- `pnpm --filter @iam/api exec bun test src/routes/sso/__tests__/sso-session-consistency.test.ts src/routes/auth/__tests__/auth.handlers.test.ts` — passed；Content-Head: `d22b0dba2b68804d01ed1454659464ec721ae7a2`；23 条 authz 与 SSO Session Kernel 聚焦回归通过。
- `pnpm --filter @iam/api lint` — passed；Content-Head: `d22b0dba2b68804d01ed1454659464ec721ae7a2`；API workspace lint 通过。
- `pnpm --filter @iam/api typecheck` — passed；Content-Head: `d22b0dba2b68804d01ed1454659464ec721ae7a2`；API workspace TypeScript 类型检查通过。
- `pnpm check:docs` — passed；Content-Head: `d22b0dba2b68804d01ed1454659464ec721ae7a2`；28 篇索引文档检查通过。
- `pnpm check:workflow` — passed；Content-Head: `d22b0dba2b68804d01ed1454659464ec721ae7a2`；6 个 v2 feature 与 4 个 legacy feature 格式检查通过。
- `git diff --check` — passed；Content-Head: `d22b0dba2b68804d01ed1454659464ec721ae7a2`；候选 diff 未发现 whitespace error。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；15 个 workspace 依赖已是最新状态，锁文件保持不变。
- `pnpm test` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；14 个 workspace 普通测试全部通过，根命令未再调用 `pnpm test:workflow`。
- `pnpm check:docs` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；28 篇索引文档检查通过。
- `pnpm check:workflow` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；6 个 v2 feature 与 4 个 legacy feature 格式检查通过。
- `git diff --check` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；根测试脚本拆分候选 diff 未发现 whitespace error。
- `pnpm --filter @iam/api exec bun test src/routes/sso/__tests__/sso-session-consistency.test.ts src/routes/auth/__tests__/auth.handlers.test.ts` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；23 条 authz 与 SSO Session Kernel 聚焦回归通过。
- `pnpm --filter @iam/api lint` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；API workspace lint 通过。
- `pnpm --filter @iam/api typecheck` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；API workspace TypeScript 类型检查通过。
- `pnpm lint` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；14 个 workspace 与根工具 lint 通过，仅报告既有 frontend warnings。
- `pnpm typecheck` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；14 个 workspace 类型检查通过。
- `pnpm build` — passed；Content-Head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`；Admin 与 SSO 生产构建通过。

## 评审记录

- Feature — fixed point: `87d3f288ef36336c0f42b391bb33febca02496d8`；reviewed head: `2fb2f4c2515640f3e058e1a896c195919ece7695`；Standards: passed；Spec: passed；两个并行子代理均报告无 findings，reviewed content head 为 `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`。

## 授权记录

- 2026-07-22 — 用户明确要求在 authz 下游用户信息中新增 `name`；授权实现与验证，未授权 merge、push 或远端操作。
- 2026-07-22 — 用户明确要求普通功能开发测试不要运行 `pnpm test:workflow`，并进一步授权修改根 `pnpm test`；未授权 merge、push 或远端操作。
- 2026-07-22 — 维护者批准按 Merge brief 执行本地 squash 合并、最终 SHA 回填和本地功能分支清理；未授权 push 或其他远端操作。

## Waivers

- 无。

## 重开与修复

- 无。

## Merge brief

- Feature branch: `codex/quick-authz-forward-name`
- Target branch: `main`
- Target base: `87d3f288ef36336c0f42b391bb33febca02496d8`
- Target tip: `87d3f288ef36336c0f42b391bb33febca02496d8`
- Content head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`
- Verified content head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`
- Reviewed content head: `f0db0a484d1461af9aaea46ecec51c5de90bb3e8`
- Delivery summary: `/auth/authz` 的 Base64 用户摘要在保留 `id` 与 `username` 的基础上新增 live user `name`，同步回归与第三方 SSO 文档；根 `pnpm test` 改为只运行普通 workspace 测试，workflow CLI 测试保留为显式专项命令。
- Commit range: `87d3f288ef36336c0f42b391bb33febca02496d8...f0db0a484d1461af9aaea46ecec51c5de90bb3e8`
- Validation: passed
- Review: passed
- Waivers and risks: none
- Local transaction:
  1. 再次确认 `main` tip 仍为 `87d3f288ef36336c0f42b391bb33febca02496d8`，若变化则停止。
  2. 切换到 `main`，对 `codex/quick-authz-forward-name` 执行 `git merge --squash`，创建一个 focused delivery commit。
  3. 将最终 squash SHA 回填到交付记录，创建 tracker-only 元数据提交。
  4. 运行 `pnpm check:workflow`、`pnpm check:docs` 与 `git diff --check`，确认最终字段已全部回填。
  5. 删除本地功能分支 `codex/quick-authz-forward-name`。

## Delivery receipt

- Target branch: `main`
- Squash commit: `72a4103f4934042eafe3f1e20b5fa078be0a5f18`
- Tracker metadata: planned
- Final checks:
  - `pnpm check:workflow` — passed
  - `pnpm check:docs` — passed
  - `git diff --check` — passed
- Local feature branch: deleted
