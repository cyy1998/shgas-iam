## 1. 批次 1：建立行为基线

- [x] 1.1 为 admin position search 增加 focused characterization test，锁定输入传递、`toPositionVo` 字段、member count、status text 与 pagination result。
- [x] 1.2 补齐 internal contact registration characterization tests，覆盖已有联系人且任职存在、补建任职、新建联系人、organization/position 缺失和 profile dirty reason。
- [x] 1.3 增加 contact registration 审计 payload、mobile redaction、production 欢迎短信、non-production 不发短信及 audit/SMS failure propagation 断言。
- [x] 1.4 运行新增的 position 与 contact registration focused tests，确认迁移前行为基线通过。

## 2. 批次 2：收口 Admin Position 查询边界

- [x] 2.1 扩展 admin position service port 与 factory，使 `PositionService` 通过注入 repository 暴露 search facade，并保持现有查询结果语义。
- [x] 2.2 将 position adapter 的 search operation 改为调用 `PositionService`，保留既有 VO mapping、pagination 以及 REST/tRPC shared operation。
- [x] 2.3 更新 admin-api composition wiring，移除 route composition 对 position repository 的传递，并清理 adapter 的 repository type dependency。
- [x] 2.4 增加或更新 position service/adapter tests，并运行 admin position focused tests 与 `pnpm --filter @iam/admin-api typecheck`。

## 3. 批次 3：提炼联系人注册 Application Use Case

- [x] 3.1 创建 `apps/api/src/use-cases/internal/register-purveyor-contact/`，使用 `register-purveyor-contact.use-case.ts`、`.port.ts`、`.type.ts` 与 `createRegisterPurveyorContactUseCase`/`RegisterPurveyorContactUseCase` 命名，返回对象暴露 `execute(input, options)`，且不依赖 Hono `Context`。
- [x] 3.2 将 organization/position 校验、已有联系人任职检查、新 user/employment 写入与 profile dirty marking 迁入 contact registration use-case 的 UnitOfWork callback。
- [x] 3.3 新增 `apps/api/src/composition/use-cases/index.ts` 和独立 `useCases` composition 字段，创建 `useCases.registerPurveyorContact`，并通过 `mapUnitOfWork` 只暴露所需 tx-bound repositories、profile dirty marker 与 `afterCommit`。
- [x] 3.4 为 use-case transaction 分支增加 unit tests，验证缺失 organization/position 的错误、写入调用和 dirty reason 保持等价，并确认 `UserService` 未吸收该跨领域 workflow。

## 4. 批次 4：迁移联系人副作用与 Route Wiring

- [x] 4.1 让 contact registration use-case 接收 normalized internal actor 与最小 audit request context，并在 transaction 成功后生成和写入原有 audit event。
- [x] 4.2 将 production 环境欢迎短信及原有失败传播迁入 use-case，保持 `transaction commit -> audit -> SMS` 顺序。
- [x] 4.3 将 internal user handler 改为只解析 input/context、调用 contact registration facade 并返回原有 success envelope，移除 repository、UnitOfWork、profile dirty、audit writer、mobile service 与 env dependencies。
- [x] 4.4 更新 API route/service composition types 与 wiring，并将 handler tests 收敛为 delegation/response tests、业务分支 tests 留在 use-case。
- [x] 4.5 运行 contact registration use-case、internal user handler 与相关 route focused tests，并运行 `pnpm --filter @iam/api typecheck`。

## 5. 批次 5：Architecture Guard 与整体回归

- [x] 5.1 扩展 API 与 admin-api architecture tests，扫描 route production module 的 type/value imports，禁止 app-local `*.repository` 与 `@iam/api-core/uow`，禁止 `services/**` 反向 import `use-cases/**`，并输出违规文件和 import specifier。
- [x] 5.2 使用 `rg` 复核 routes 不再直接依赖 repository/UnitOfWork、services 不反向依赖 use-cases；若发现第三个真实 route 违规，先更新本 change artifacts 再扩大实现范围。
- [x] 5.3 运行 `pnpm --filter @iam/api test`、`pnpm --filter @iam/admin-api test`、两个 backend 的 `typecheck` 与 `lint`。
- [x] 5.4 复核 REST/OpenAPI/tRPC route definitions、contact registration audit/SMS/profile dirty 行为和 position search presentation contract 未变化。
- [x] 5.5 更新 `docs/architecture/backend-architecture.md` 与 `docs/development/backend-implementation.md`，记录 Application Use Case、领域对齐 Application Service、pure domain logic 的目录、命名、依赖方向和 `UserService`/`RoleService` 分类，并运行 `pnpm check:docs`。
- [x] 5.6 运行 `openspec validate standardize-backend-route-boundaries --type change --strict`，确认 change artifacts 与实现清单可进入 Verify 阶段。
