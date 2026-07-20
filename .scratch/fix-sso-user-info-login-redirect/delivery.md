# 修复个人信息页单点登录跳转交付记录

Workflow-Version: 2
Feature-Slug: fix-sso-user-info-login-redirect
Workflow-Kind: quick
Stage: merge-ready
Feature-Branch: codex/quick-fix-sso-user-info-login-redirect
Target-Branch: main
Target-Base: cef6b2024d527c138da30d39730f21c18b1bf850
Ticketing-Authorization: not-applicable
Implementation-Authorization: granted
Authorized-Implementation-Scope: 修复 SSO 前端未登录直接访问个人信息页时缺少 client 与 redirectUrl、无法继续正常单点登录的问题
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config,frontend
Affected-Workspaces: @iam/sso
Validation-Plan: declared
Content-Head: de36d36118edb654005b19152bb90a8613950fdf
Verified-Content-Head: de36d36118edb654005b19152bb90a8613950fdf
Reviewed-Content-Head: de36d36118edb654005b19152bb90a8613950fdf
Merge-Target-Tip: cef6b2024d527c138da30d39730f21c18b1bf850
Final-Squash-Commit: pending

## 范围与验收

- [x] 未登录直接访问 `/portal/userInfo` 时，401 跳转到登录页并携带 `client=iam`。
- [x] 跳转携带当前个人信息页的完整地址作为 `redirectUrl`，登录后可继续标准 SSO authorize 流程并返回原页。
- [x] 已带业务方 `client`、`redirectUrl` 或 OIDC 恢复参数的既有登录上下文保持不变。

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| feature | agent-config,frontend | @iam/sso | `pnpm --filter @iam/sso exec vitest run src/utils/__tests__/request.test.ts`<br>`pnpm --filter @iam/sso lint`<br>`pnpm --filter @iam/sso typecheck`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm build`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`PLAYWRIGHT_E2E_SKIP_PREFLIGHT=1 pnpm --filter @iam/sso e2e`<br>`git diff --check` |

## 阶段证据

- `G0 Intake` — 已确认缺陷范围为 SSO 前端个人信息页的匿名访问跳转，不涉及后端协议或数据库变更。
- `G1 Branch Ready` — 已从干净的 `main` 固定基线创建快速修复分支，并声明范围、验收与验证计划。
- `G4 Implementing` — 用户已明确授权修复个人信息页的正常单点登录流程，正在建立回归测试并实施修复。
- `G4 Implementing` — 已创建快速修复候选提交；Content-Head: `69002311a92f50cc842cd665c3570845d2dc7be2`；进入功能级验证与双轴评审。
- `G4 Implementing` — 已修复首轮 Standards finding；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；重新执行功能级验证与完整双轴评审。
- `G4 Implementing` — Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；验收行为、除既有 Gateway 基线失败外的验证矩阵及最终双轴评审均已完成，等待维护者决定 `pnpm test` waiver。
- `G5 Feature Verified` — Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；功能级验证在维护者批准既有 Gateway 基线失败 waiver 后通过，最终 Standards 与 Spec 双轴评审清零。
- `G6 Merge Ready` — target tip 仍为 `cef6b2024d527c138da30d39730f21c18b1bf850`；content、verified 与 reviewed head 一致，等待维护者授权本地 squash 事务。

## 验证记录

- `pnpm --filter @iam/sso exec vitest run src/utils/__tests__/request.test.ts` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；匿名入口、既有 SSO 与 OIDC 上下文共 3 条回归用例通过。
- `pnpm --filter @iam/sso lint` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；仅报告 4 条既有 warning，无 error。
- `pnpm --filter @iam/sso typecheck` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；TypeScript 类型检查通过。
- `pnpm --filter @iam/sso test` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；7 个测试文件、18 条测试全部通过。
- `pnpm lint` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；14 个 workspace 通过，仅报告既有 warning。
- `pnpm typecheck` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；14 个 workspace 通过。
- `pnpm test` — waived；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；13 个 workspace 通过，`@iam/gateway-apisix` 两条 Tender forward-auth 基线用例失败；本分支对 `gateway/**` 无 diff，维护者已批准仅豁免这两条既有失败。
- `pnpm build` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；Admin 与 SSO 生产构建通过。
- `pnpm check:docs` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；28 篇索引文档检查通过。
- `pnpm check:workflow` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；5 个 v2 feature 与 4 个 legacy feature 格式检查通过。
- `pnpm exec bun test --timeout 15000 scripts/__tests__/check-workflow.test.ts` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；101 条 workflow CLI 测试通过。
- `PLAYWRIGHT_E2E_SKIP_PREFLIGHT=1 pnpm --filter @iam/sso e2e` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；真实 Chromium 3 条用例通过，跳过的仅是把可升级已安装包误报为缺失的 apt 预检。
- `git diff --check` — passed；Content-Head: `de36d36118edb654005b19152bb90a8613950fdf`；未发现 whitespace error。

## 评审记录

- Feature — fixed point: `cef6b2024d527c138da30d39730f21c18b1bf850`；reviewed head: `e671f5eb6a0362d6f266070ced4a23c2f55f3d42`；Standards: findings；Spec: passed；首轮 Standards 发现 Validation Plan 漏列 `pnpm check:docs`。
- Feature — fixed point: `cef6b2024d527c138da30d39730f21c18b1bf850`；reviewed head: `8c5d83cc6dc99853276407682aed5692526a16bc`；Standards: passed；Spec: passed；finding 修复后的完整范围复审清零，reviewed content head 为 `de36d36118edb654005b19152bb90a8613950fdf`。

## 授权记录

- 2026-07-20 — 用户明确要求修复 SSO 前端个人信息页未登录跳转缺少参数的问题；授权实现与验证，未授权 merge、push 或远端操作。
- 2026-07-20 — 维护者确认豁免 `pnpm test` 中两条既有 Gateway Tender forward-auth 失败；未授权 merge、push 或远端操作。

## Waivers

- 2026-07-20 — Command: `pnpm test`；Reason: 目标分支已将 Tender forward-auth 配置注释，但两条 Gateway 测试仍断言 `request_headers: ["apikey"]`，本功能分支对 `gateway/**` 无 diff；Scope: 本次 SSO 个人信息页修复验证中的两条既有 `@iam/gateway-apisix` Tender 用例失败；Risk: 既有 Gateway 配置与测试不一致仍需在独立范围处理，但不降低 SSO 单元、类型、构建或浏览器回归覆盖；Approved by: 当前维护者

## 重开与修复

- 2026-07-20 — 首轮 Standards 评审发现 agent-config Markdown 的 feature 验证计划漏列 `pnpm check:docs`；已补充该必需命令并重新执行验证与完整双轴评审。

## Merge brief

- Feature branch: `codex/quick-fix-sso-user-info-login-redirect`
- Target branch: `main`
- Target base: `cef6b2024d527c138da30d39730f21c18b1bf850`
- Target tip: `cef6b2024d527c138da30d39730f21c18b1bf850`
- Content head: `de36d36118edb654005b19152bb90a8613950fdf`
- Verified content head: `de36d36118edb654005b19152bb90a8613950fdf`
- Reviewed content head: `de36d36118edb654005b19152bb90a8613950fdf`
- Delivery summary: SSO 前端在匿名访问 `/portal/userInfo` 时为登录跳转补齐 `client=iam` 与当前完整页面 `redirectUrl`，继续标准 authorize 流程，并保持既有业务 SSO 与 OIDC 恢复上下文不变；新增请求层与真实浏览器回归。
- Commit range: `cef6b2024d527c138da30d39730f21c18b1bf850...de36d36118edb654005b19152bb90a8613950fdf`
- Validation: passed
- Review: passed
- Waivers and risks: 维护者已批准豁免 `pnpm test` 中两条与本分支无 diff 的既有 Gateway Tender forward-auth 失败；Gateway 配置与测试不一致仍需独立处理，SSO 验证矩阵全部通过。
- Local transaction:
  1. 再次确认 `main` tip 仍为 `cef6b2024d527c138da30d39730f21c18b1bf850`，若变化则停止。
  2. 切换到 `main`，对 `codex/quick-fix-sso-user-info-login-redirect` 执行 `git merge --squash`，创建一个 focused delivery commit。
  3. 将最终 squash SHA 回填到交付记录，创建 tracker-only 元数据提交。
  4. 运行 `pnpm check:workflow`、`pnpm check:docs` 与 `git diff --check`，确认最终字段已全部回填。
  5. 删除本地功能分支 `codex/quick-fix-sso-user-info-login-redirect`。

## Delivery receipt

- 无。
