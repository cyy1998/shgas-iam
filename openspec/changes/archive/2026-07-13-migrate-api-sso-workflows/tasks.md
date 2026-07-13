## 1. Characterization Baseline 与 TDD Red Signal

- [x] 1.1 运行现有 SSO service/handler/routes、Custom SSO Session Kernel 与 API architecture focused tests，并记录 child 修改前 API
  full test、typecheck 和 lint 基线。
  - 2026-07-13：focused SSO/architecture 共 3 files、33 tests、75 assertions 全部通过；API full test 33 files、164 tests、
    400 assertions 通过；typecheck 与 lint 全部通过。
- [x] 1.2 与用户确认 TDD public seams：六个 operation `execute`、`createSsoRedirectUrlValidator`、`createSsoHandlers` facade
  dispatch 与 SSO architecture guards。
  - 2026-07-13：用户确认六个 operation `execute`、redirect validator、handler facade 与 architecture guards seams。
- [x] 1.3 扩展 SSO handler characterization tests，覆盖 authorize cookie/header/query precedence、request context、login/callback
  redirect、callback local/ORCAS cookie、token response、logout、OA/WeChat cookie/redirect 与错误传播。
  - 2026-07-13：handler tests 扩展至 13 tests，覆盖三层 token precedence、六个 operation 的 route adaptation 与 callback
    failure no-cookie/no-redirect；focused file 全绿。
- [x] 1.4 扩展 authorize/callback/code exchange characterization tests，覆盖 client/secret/redirect validation、invalid historical
  patterns、auth-code one-time consume、revoked principal、ORCAS、local-session mode/result 与失败顺序。
- [x] 1.5 扩展 OA/WeChat/logout characterization tests，覆盖 OA timestamp/hash/user type/session/audit、WeChat cache miss/hit/
  Processing/retry/timeout/payload/session/audit、logout cleanup/notification 与错误传播。
- [x] 1.6 为 legacy SSO route service/port、stateful workflow dependency 与 SSO port ownership 增加 architecture red tests，并确认只因
  现有 `sso.service.ts`、`sso.port.ts` 与 wiring 模式触发预期失败。
  - 2026-07-13：新增 route/port/composition guards；临时 legacy `sso.port.ts` sentinel 使 architecture 仅该 guard 预期红，删除后
    16 tests 全绿，并将 `services/sso`/`use-cases/sso` 纳入 legacy authority key guard。

## 2. Shared Redirect Validator

- [x] 2.1 先为 `createSsoRedirectUrlValidator` 编写 failing tests，再实现 http/https syntax、wildcard/path match、invalid pattern
  skip、warning event/message 与 request observability fields。
  - 2026-07-13：先确认 missing-module red，再以 3 tests 锁定 wildcard/path、invalid pattern logging/context 和 non-http rejection，
    全部转绿。
- [x] 2.2 在 services composition 创建 redirect validator，并确认它不拥有 client lookup、Hono context 或 redirect response。

## 3. Authorize Callback 与 Code Exchange Use-Cases

- [x] 3.1 先为 `authorize-sso` 编写 failing use-case tests，再实现 client lookup、redirect validation、token source 与
  Custom SSO Session authorize 的现有顺序和结果。
- [x] 3.2 先为 `complete-sso-callback` 编写 failing use-case tests，再实现 client/redirect validation、unauthorized auth-code consume、
  required ORCAS login、Gateway local session 与 no-token failure semantics。
- [x] 3.3 先为 `exchange-sso-code` 编写 failing use-case tests，再实现 client-secret validation、`invalid_auth_code` consume、
  Independent local session 与现有 sid/ttl/userInfo result。
- [x] 3.4 确认三个 use-case 的 `*.port.ts` 直接声明消费方法和中立 shape，不使用 `Pick<...Repository>`、
  `Pick<...Service>`、concrete route/service/adapter import 或 repository-owned DTO。

## 4. OA WeChat 与 Logout Use-Cases

- [x] 4.1 先为 `login-with-oa` 编写 failing use-case tests，再实现 production timestamp window、SM3/Base64 signature、active Formal
  user、detail lookup、`oa` AMR PrincipalSession、success audit 与错误传播顺序。
- [x] 4.2 先为 `login-with-wechat` 编写 failing use-case tests，再实现 cache miss/Processing/retry/timeout/legacy payload、wxId 与
  active-user lookup、`wechat` AMR PrincipalSession、success audit、final cache 和既有 key/TTL/delay。
- [x] 4.3 先为 `logout-sso-session` 编写 failing use-case tests，再实现 Custom SSO Session logout 委托和现有 success result。
- [x] 4.4 确认三个 use-case 的 `*.port.ts` 使用最小 Redis/delay/integration/user/session/audit contract，并保持 WeChat retry 不产生
  重复 audit 或新的 cleanup/fallback 行为。

## 5. Route Composition 与 Architecture Guard

- [x] 5.1 更新 SSO handler tests 为 `useCases.sso` 六个 operation facade seams，确认 route 仍拥有 cookie/header/query、request
  context、redirect、endpoint configuration 与 response adaptation。
- [x] 5.2 在 use-cases composition 创建六个 operations，通过 `useCases.sso` 注入 route composition，并保持 route-only client lookup
  与 config/logger 依赖。
- [x] 5.3 更新 SSO handlers 调用六个 `execute` facade，删除 `services.sso` wiring、`sso.service.ts` 与 `sso.port.ts`，不保留
  forwarding facade，并保持 routes/schema 无行为性 diff。
- [x] 5.4 完成 API architecture guards，覆盖 migrated SSO route application files、stateful workflow dependency、反向依赖和 SSO
  port ownership，并确认 red tests 转绿。

## 6. Verification 与 Archive 准备

- [x] 6.1 运行六个 SSO use-case、redirect validator、handler/routes、Custom SSO Session Kernel、相关 integration 与 API
  architecture focused tests。
  - 2026-07-13：focused 汇总 10 files、66 tests、161 assertions 全绿；随后新增 callback unknown-client 与 Independent
    authorize redirect characterization 均单独通过。
- [x] 6.2 运行 `pnpm --filter @iam/api test` 与 `pnpm --filter @iam/api typecheck`，确认完整测试和类型检查通过。
  - 2026-07-13：API full test 40 files、199 tests、490 assertions 全部通过；typecheck 通过。
- [x] 6.3 运行 `pnpm --filter @iam/api lint`，确认 API lint 全绿且未引入新的 diagnostic。
  - 2026-07-13：首轮仅发现新文件 import-order/indent formatting diagnostics，限定文件 `eslint --fix` 后 API lint 全绿。
- [x] 6.4 运行 child strict validation、`pnpm check:openspec` 与 `git diff --check`，检查 requirements、scenarios、tasks、active
  changes 与 archive integrity。
  - 2026-07-13：child strict validation 通过；OpenSpec 36/36 items 通过、70 archives integrity 通过；`git diff --check` 通过。
- [x] 6.5 人工复核 REST/OpenAPI、cookie、token precedence、redirect、client validation、ORCAS、OA、WeChat、Redis key/TTL、
  Session Kernel、audit、rollback matrix，并记录 child archive readiness。
  - 2026-07-13：`sso.routes.ts`/`sso.schema.ts` 无 diff；handler 保留 cookie/header/query precedence、cookie attributes 与
    redirect adaptation；use-case/integration tests覆盖 auth-code、ORCAS、OA/WeChat、Redis、Session Kernel、audit 与失败传播。
    未运行 live `/doc`/SSO endpoint smoke，因当前无运行中 API、真实测试账号和外部 integration 前提；剩余风险记录于
    `verification.md`。
