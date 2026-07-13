# Umbrella Verification Evidence

## Integration Inventory

- 日期：2026-07-13；分支：`feature/standardize-backend-application-boundaries`；验证开始时工作树干净。
- 六个 child changes 均已归档并保留完成的 `tasks.md` 与 `verification.md`：
  - `2026-07-13-migrate-api-account-recovery-workflows`
  - `2026-07-13-migrate-api-authentication-workflows`
  - `2026-07-13-migrate-api-sso-workflows`
  - `2026-07-13-extract-admin-user-resignation-use-case`
  - `2026-07-13-clarify-oidc-provider-protocol-components`
  - `2026-07-13-strengthen-backend-consumer-owned-ports`
- 逐条比对六个 archive delta specs：共 26 个 requirement headings，全部已存在于对应 `openspec/specs/<capability>/spec.md`，缺失 0；六份 child tasks 未发现未完成项。
- `main..HEAD` 恰好包含 umbrella baseline 与六个依赖顺序一致的 squash commits：`9b1018a`、`f07cece`、`f49c0c4`、`688ec3e`、`ed1e1fc`、`083cb87`、`9f83ecd`。提交主题分别对应 baseline、Account Recovery、Authentication、SSO、Admin User Resignation、OIDC Components 与 Consumer-Owned Ports，无额外 feature commit。

## Full Verification

- 最终集成验证在六个 child squash commits 全部进入 feature 分支后执行；三个 full test 顺序运行，避免 OIDC HTTP timing test 的已知资源竞争：
  - `pnpm --filter @iam/api test`：41 files、202 tests、494 assertions passed。
  - `pnpm --filter @iam/admin-api test`：24 files、110 tests、320 assertions passed。
  - `pnpm --filter @iam/oidc-provider test`：20 files、79 tests passed；`http-server-logging` 3/3 在 7.028 秒完成。
- `pnpm --filter @iam/{api,admin-api,oidc-provider} typecheck`：三项 passed。
- `pnpm --filter @iam/{api,admin-api,oidc-provider} lint`：三项 passed；迁移基线中的 API 1 条与 Admin 4 条 lint diagnostics 均已消除。
- 独立 architecture suites：API 18/18、Admin API 12/12、OIDC Provider 7/7 passed，覆盖 route/application ownership、use-case composition、OIDC protocol ownership 与全部 production port guards。
- `pnpm check:docs`：28 docs indexed，passed。

## Compatibility And Rollback Review

| Contract | Integrated evidence | Result |
| --- | --- | --- |
| REST/OpenAPI | `main...HEAD` 没有 `*.routes.ts`、`*.schema.ts` 或 route `*.type.ts` diff；API/Admin full route suites 与 typecheck 全绿 | Preserved |
| Admin tRPC | `resignUser` adapter parity/error tests 全绿，public `*.trpc.ts` 无 diff；最终 `pnpm --filter @iam/admin typecheck` passed | Preserved |
| Account Recovery/Auth | Full API suite 覆盖三种 verification usage、masking、Human Verification、MAGIC_CODE、credential parser、failure/blacklist、cookie/authz 与 audit | Preserved |
| SSO | Full API suite 覆盖 authorize/callback/exchange/OA/WeChat/logout、token precedence、redirect、ORCAS、retry/cache、audit 与错误传播 | Preserved |
| OIDC | Full OIDC suite 覆盖 discovery/configuration、claims snapshot、token extra、interaction、binding/config validation、credential revocation、token flow 与 provider wiring | Preserved |
| Session/Redis | API Session Kernel consistency、Admin session revocation、OIDC session/redis adapter/client runtime store tests 全绿；相关 key/TTL/lifetime implementation 无行为性改动 | Preserved |
| Audit/profile dirty/notification | Account Recovery/Auth/SSO/Admin resignation focused evidence与最终 full suites覆盖 action/context/order、两类 resignation dirty facts、SMS/欢迎通知及 cleanup failure paths | Preserved |
| Persistence/ports | Repository query/write bodies与 DB schema未迁移；30 个 production ports 的 guards为空违规，真实 repositories/stores/session adapter 通过 compile-time structural assertions | Preserved |
| Platform | `packages/db`、schema/migration、package/lockfile、env、Docker/gateway/deployment 文件相对 `main` 无 diff | Unchanged |

- Rollback 单元是六个独立 squash commits：`f07cece`、`f49c0c4`、`688ec3e`、`ed1e1fc`、`083cb87`、`9f83ecd`。单个 child 可 revert 其提交；若整体回退，应按依赖逆序从 `9f83ecd` 到 `f07cece` 执行。
- 无 database/Redis/dependency/deployment migration，因此 rollback 不需要数据回填、keyspace 转换或额外运维步骤。
- Smoke：`ss -ltn` 未发现 30000/30001/30002 或 Docker backend ports；API `/doc`、Admin `/admin/doc`、`/rpc/doc` 与 OIDC discovery 均为 curl exit 7 / HTTP `000`。这是服务未启动的环境限制，live endpoint、真实 Redis/DB、外部 ORCAS/WeChat/SMS 与远端 CI 仍是 residual risk。

## OpenSpec Traceability Audit

仓库当前未提供 `openspec-verify-change` skill；任务 8.4 按 `docs/workflows/verify.md` 使用 strict validation、主规格/实现/测试/child evidence 人工映射作为等价 fallback。

Umbrella delta specs 共 9 个 requirements、28 个 scenarios；映射结果如下：

| Requirement（scenario 数） | Design decisions | Implementation / guard | Child evidence | Result |
| --- | --- | --- | --- | --- |
| Legacy Route Application Modules（4） | 1–4 | open/auth/SSO legacy service/port 已删除；route ownership guards | Account Recovery、Authentication、SSO verifications | Complete |
| Cross-Domain Administrative Workflow（2） | 1、5 | `resign-user` use-case 独立拥有 transaction；EmploymentService 不含 `resignUser` | User Resignation verification | Complete |
| Protocol Components Classification（3） | 1、6 | `createOidcClaimsAdapter`、provider/security/session composition；无 mixed services aggregate | OIDC Components verification | Complete |
| Consumer-Owned Ports（3） | 7 | 30 个 production ports 全局 guard、neutral type owners、provider-to-port compile-time assertions | Consumer-Owned Ports verification | Complete |
| Architecture Guard Classification（3） | 9 | API 18、Admin 12、OIDC 7 个 architecture tests 全绿，合法 `*Port`/protocol types 不误报 | 六个 child TDD/guard evidence | Complete |
| API Application Locations（3） | 2–4、8 | Account Recovery/Auth/SSO operation-specific use-cases、support services、独立 `useCases` composition | 前三个 API child verifications | Complete |
| Admin Use-Case Composition（2） | 5、8 | `composition/use-cases` 与 `services` 分离，REST/tRPC adapter 注入独立 facade | User Resignation verification | Complete |
| OIDC Protocol Role Names（3） | 1、6、8 | claims adapter 命名、distinct provider/security/session ownership、domain 无 `oidc-provider` import | OIDC Components verification | Complete |
| External Contract Preservation（5） | Coordination matrix、9 | 最终 full/typecheck/lint/architecture、无 route contract/platform drift、兼容矩阵与 rollback review | 全部六个 child + 本 umbrella final evidence | Complete |

- Scenario-level coverage：Account Recovery/Auth/SSO route responsibilities 4/4；Admin domain split 2/2；OIDC protocol behavior/roles 6/6；consumer port/guard behavior 6/6；API/Admin layout 5/5；external contract/no-migration 5/5，合计 28/28。
- 结构探针确认 legacy open/auth/SSO services/ports、OIDC `composition/services` 均不存在；目标 use-cases 与 Claims Adapter 存在；EmploymentService 不再暴露 `resignUser`；production ports 没有 concrete repository/service-derived ownership；`packages/domain` 不依赖 `oidc-provider`。
- 初始人工文本探针曾误报合法 `Pick<HumanRiskServicePort>`，原因是 regex 将名称内部的 `Service` 当作 concrete suffix；收窄到类型名精确以 `Repository`/`Service` 结尾后通过，与 AST guard 的 synthetic control 结论一致。
- 未发现 unmapped requirement、scenario、design decision 或缺失 child evidence。Fallback 的残余风险仅是未运行已移除的专用 verify skill；strict/aggregate validation 与逐项人工 traceability 结果可复核。
