## Verification Summary

- 日期：2026-07-13
- Change：`migrate-api-sso-workflows`
- 结果：实现与本地验证完成，25/25 tasks complete，具备 Archive 前置条件。
- Verify skill：仓库 workflow 指定的 `$openspec-verify-change` 在当前可用 skills 中不存在；本次按
  `docs/workflows/verify.md` 执行等价验证矩阵。

## TDD Evidence

- 用户确认 seams：六个 operation `execute`、`createSsoRedirectUrlValidator`、`createSsoHandlers` 与 architecture guards。
- Redirect validator 和六个 use-case 均先出现 missing-module red，再以单个 vertical slice 转绿。
- Architecture guard 使用临时 legacy `routes/sso/sso.port.ts` sentinel，确认仅 migrated SSO route guard 预期失败；删除后
  architecture 16/16 tests 全绿。
- Focused 汇总：10 files、66 tests、161 assertions 全绿；随后新增 callback unknown-client 与 Independent authorize redirect
  characterization，单独验证通过。

## Commands And Results

- `pnpm --filter @iam/api test`：40 files、199 tests、490 assertions 全部通过。
- `pnpm --filter @iam/api typecheck`：通过。
- `pnpm --filter @iam/api lint`：通过。
- `openspec validate migrate-api-sso-workflows --strict --no-interactive`：通过。
- `pnpm check:openspec`：36/36 items 通过；70 archives integrity 通过。历史 waiver 仍为
  `2026-05-27-normalize-employment-organization-context` 的 2 个 incomplete tasks。
- `git diff --check`：通过。

## Compatibility Review

- `apps/api/src/routes/sso/sso.routes.ts` 与 `sso.schema.ts` 无 diff；path、method、schema 与既有 `/sso/token` 文档现状均未改变。
- Handler 继续拥有 cookie/header/query token precedence、cookie write/delete、redirect query/encoding、endpoint configuration 与
  response envelope。
- Gateway callback 保持 client/redirect validation、`unauthorized` auth-code consume、ORCAS-before-local-session 与
  `ClientManagementLevel.Gateway`；Independent exchange 保持 client secret、`invalid_auth_code` 与
  `ClientManagementLevel.Independent`。
- OA 保持 production 五分钟边界、SM3/Base64、Formal user、`amr=["oa"]` 和 success audit 顺序。
- WeChat 保持 `wx-code:${code}`、`Processing`、600 秒 TTL、200ms polling、既有 retry 边界、legacy cache payload、
  `amr=["wechat"]`、首次 success audit 与 failure sentinel 行为。
- Custom SSO Session Kernel adapter、authority keys、cleanup/notification、ORCAS/WeChat integration contracts、database schema、
  workspace dependencies 与 deployment topology均未修改。

## Residual Risk And Rollback

- 未运行 live `/doc`、authorize/callback/token/OA/WeChat/logout endpoint smoke：当前没有运行中的 API、真实 Redis、测试账号和可用
  ORCAS/WeChat integration 前提。本地 DI、handler、真实 Session Kernel/FakeRedis integration 与 full API suite 已覆盖主要风险。
- Rollback 为回退本 child 的最终 squash commit，恢复 `SsoService`、legacy route wiring 与旧 tests；无数据或 Redis migration。
