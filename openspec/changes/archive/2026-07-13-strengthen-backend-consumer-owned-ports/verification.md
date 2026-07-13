## Verification Evidence

### Production Port Inventory

- 日期：2026-07-13。
- Inventory：API 19 个、Admin API 8 个、OIDC Provider 3 个，三个 app 合计 30 个 production `*.port.ts`。
- API repository/service-derived ports（6）：
  - `services/client/client.port.ts`
  - `services/mobile/mobile.port.ts`
  - `services/organization/organization.port.ts`
  - `services/privilege/privilegeDelegation.port.ts`
  - `services/user/user.port.ts`
  - `use-cases/internal/register-purveyor-contact/register-purveyor-contact.port.ts`
- Admin API repository-derived ports（6）：`services/{client,employment,organization,position,role,user}/*.port.ts`。
- OIDC Provider repository-derived port（1）：`provider/claims.port.ts`。
- OIDC neutral ownership 复核项（1）：`interaction/interaction.port.ts` 从 `repositories/client-metadata.ts` 取得 runtime metadata；其 global session、provider binding、return-handle type 也需确认只有单一 protocol/session owner。
- 合规 control ports 包括前五个 child 新建的 Account Recovery、Authentication、SSO、resign-user ports，以及 `Pick<...Port>`、platform type narrowing；全局 guard 不应误报这些合法依赖。

### Pre-Implementation Baseline

- `pnpm --filter @iam/api test`：40 files、199 tests、490 assertions passed；architecture 15/15 passed。
- `pnpm --filter @iam/api typecheck`：passed。
- `pnpm --filter @iam/api lint`：passed。
- `pnpm --filter @iam/admin-api test`：23 files、107 tests、316 assertions passed；architecture 10/10 passed。
- `pnpm --filter @iam/admin-api typecheck`：passed。
- `pnpm --filter @iam/admin-api lint`：passed。
- `pnpm --filter @iam/oidc-provider test`：19 files、73 tests passed；architecture 5/5 passed，`http-server-logging` 3/3 passed。
- `pnpm --filter @iam/oidc-provider typecheck`：passed。
- `pnpm --filter @iam/oidc-provider lint`：passed。

### TDD Red / Green

- Guard control green：三个 architecture suites 的 synthetic fixtures 均允许 `Pick<...Port>` 与 platform narrowing，并识别 repository import、multiline `Pick<...Repository>` 和 `Pick<...Service>`。
- Global port ownership red：production port 修改前分别运行三个 architecture files，均只新增 1 个预期失败：
  - API：17 passed、1 failed，精确列出 6 个 target ports。
  - Admin API：11 passed、1 failed，精确列出 6 个 target ports。
  - OIDC Provider：6 passed、1 failed，精确列出 `provider/claims.port.ts` 与 `interaction/interaction.port.ts`。
- 合计 14 个目标文件，与 design inventory 一致；未出现 control false positive。
- API green：六个 target ports 改为直接声明 reader/store/collaborator signatures，`MobileVerificationCodeReservation` 移至 `mobile.type.ts`，API architecture 18/18 passed。
- API compatibility：新增 provider-to-port compile-time assertions，现有 client/user/organization/privilege/delegation/employment/role/position repositories、MobileService 与 UserProfileQueryService 全部直接结构兼容；未增加 adapter 或 type assertion。
- API focused：8 files、49 tests、87 assertions passed；随后 API typecheck 与 lint passed。首次 lint 仅报告新 test import order、unused generic 和一个 port import order，机械修正后全绿。
- Admin API green：六个 target service ports 改为直接声明 reader/transaction store signatures；client OIDC patch、employment create/update、role create/assignment 等 persistence inputs 移至相邻 `*.type.ts`，Admin architecture 12/12 passed。
- Admin compatibility：新增 provider-to-port compile-time assertions，六个 repositories 及交叉 employment/organization/position/user/role/privilege readers 全部直接结构兼容；未增加 composition adapter 或 type assertion。
- Admin focused：10 files、65 tests、192 assertions passed；Admin typecheck 与 lint passed。实现中唯一类型修正是把 `AdminEmploymentRecordUpdate` 从 interface 改为等价 type literal，以满足既有 `compactUpdate` 的 `Record<string, unknown>` 约束；其余 lint 为 import-order 机械修正。
- OIDC green：authorization claim 的纯 DTO/assembly owner 与 client runtime metadata/mapper 均移至 `provider/`；claims 与 interaction ports 不再 import `repositories/**`。global session、provider binding、return handle 继续分别由既有 neutral protocol/session module 单点持有，OIDC architecture 7/7 passed。
- OIDC compatibility：新增 account/authorization repository、client runtime store、session kernel adapter 对 claims/interaction ports 的 compile-time assertions；composition 保持直接 structural wiring，未增加 adapter 或 type assertion。
- OIDC focused：9 files、46 tests、97 assertions passed；OIDC typecheck 与 lint passed。首次 architecture green 暴露纯 authorization-claim 文件仍位于 `repositories/**`，随后将其 owner 一并迁至 `provider/`；其余修正仅为 Vitest/import-order lint 规则。

### Final Verification

- 最终实现侧验证发生在最后一次 source/type owner 修改之后：
  - `pnpm --filter @iam/api test`：41 files、202 tests、494 assertions passed，包含 architecture 18/18 与新增 compile-time contract test。
  - `pnpm --filter @iam/api typecheck`、`pnpm --filter @iam/api lint`：passed。
  - `pnpm --filter @iam/admin-api test`：24 files、110 tests、320 assertions passed，包含 architecture 12/12 与新增 compile-time contract test。
  - `pnpm --filter @iam/admin-api typecheck`、`pnpm --filter @iam/admin-api lint`：passed。
  - `pnpm --filter @iam/oidc-provider test`：20 files、79 tests passed，包含 architecture 7/7 与新增 4 个 compile-time contract tests。
  - `pnpm --filter @iam/oidc-provider typecheck`、`pnpm --filter @iam/oidc-provider lint`：passed。
- OIDC full test 首次与另外八个 test/typecheck/lint 任务并行时，`http-server-logging` 的单个 case 超过 10 秒 timeout；相同 full test 随即独立重跑，20/20 files、79/79 tests 全绿（该 case 4.587 秒），归类为本机资源竞争而非稳定回归。
- Repository/document/OpenSpec gates：
  - `pnpm check:docs`：28 docs indexed，passed。
  - `pnpm exec openspec validate strengthen-backend-consumer-owned-ports --type change --strict`：passed。
  - `pnpm exec openspec validate standardize-backend-application-boundaries --type change --strict`：passed。
  - `pnpm check:openspec`：36 items passed、0 failed；73 archives integrity passed（保留既有 1 条 tasks-complete waiver）。
  - `git diff --check`：passed。
- Smoke 环境：`ss -ltn` 确认本机 dev/Docker backend ports 均未监听；对 API `/doc`、Admin `/admin/doc`、Admin `/rpc/doc`、OIDC discovery 的短超时请求均返回 curl exit 7 / HTTP `000`。这是服务未启动的环境限制，不是 HTTP contract failure；未启动依赖栈，避免为纯边界重构引入额外外部状态。
- 剩余验证边界：本地未执行 live discovery/JWKS/authorize/token/UserInfo/RP-Initiated Logout 或实际数据库 smoke，也未运行远端 CI；相应 protocol/session/persistence 路径由现有 full suites、repository tests 和 compile-time compatibility assertions 覆盖。

### Contract And Scope Review

- REST/OpenAPI：未修改 route、schema、handler 或 response mapping；API full route tests 与 Admin REST adapter tests 全绿，公开 endpoint shape 无 diff。
- tRPC：未修改 router/procedure/adapter；Admin tRPC adapter、error formatter 与 resign-user parity tests 全绿。
- OIDC/SSO：authorization claim 与 client metadata 仅迁移 owner，mapper body 和 DTO fields 保持一致；OIDC claims snapshot、token extra、interaction、configuration、protocol、token-flow、provider wiring tests，以及 API SSO suites全绿。
- Session/Redis：未修改 Session Kernel 调用、Redis key、TTL、binding、credential lifetime 或 cache algorithm；API session consistency、Admin session revocation、OIDC session/redis adapter/client runtime store tests 全绿。
- Transaction/persistence：repository query/write bodies与 composition wiring 未改变；真实 repository/store/session adapter 均通过 provider-to-port structural assertions，相关 service/repository/use-case tests 全绿。
- Audit/notification/profile dirty：API registration、organization/user、audit tests与 Admin employment/organization/position/role/user/client tests覆盖既有审计、通知、session revocation 和 dirty facts，均全绿。
- Guard/adapter review：三个 architecture suites 扫描全部 30 个 production ports；最终违规列表为空。人工 `rg` 只发现合法 `Pick<HumanRiskServicePort>`，没有 repository/service-derived port、unchecked assertion 或 behaviorless wrapper。
- Platform drift：变更文件不包含 DB schema/migration、workspace dependency/lockfile、env、Docker/gateway/deployment 配置；因此无 schema、dependency、environment 或 deployment topology drift。
