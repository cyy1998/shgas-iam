## Context

`EmploymentService.resignUser(username, auditContext)` 当前在一个 UnitOfWork 中依次查询用户、结束全部 active employments、将用户状态更新为
`UserStatus.Disable`、写入 `admin.employment.resign_user` audit，并用同一 `afterCommit` context 标记
`EmploymentUpdated` 与 `UserUpdated`。流程本身已具备正确的 transaction ownership，但它同时修改 Employment 和 User 生命周期，继续位于
领域对齐的 `EmploymentService` 会掩盖跨领域 Application Use Case 职责。

Employment adapter 同时生成 REST handler 与 tRPC procedure，现有 public operation 使用 `{ username }` 输入、tRPC key `resignUser`、
REST handler key `employmentsResignUser`，成功结果为 `true`。本 child 必须保持这些 protocol contracts、调用顺序、错误传播、audit payload、
profile dirty/afterCommit behavior 与 session 语义不变。

本 child 依赖前三个 API child 已归档后的 umbrella feature 分支。Admin API 尚无 `composition/use-cases`；现有
`composition/services` 创建 `EmploymentService` 并把它直接交给 employment adapter。Umbrella 还记录了
`admin-api-adapter.test.ts` 的 4 条 lint baseline，本 child 负责以不改变测试行为的 mechanical cleanup 关闭它们。

## Goals / Non-Goals

**Goals:**

- 用 `resign-user` caller-goal use-case 表达跨 User/Employment 的离职 transaction。
- 保留用户查询、employment end、user disable、audit、profile dirty 的既有顺序和 atomicity。
- 通过 consumer-owned port 只声明离职流程实际消费的方法和中立 shape。
- 在 Admin API 建立独立 `composition/use-cases`，并让 employment adapter 分别接收领域 service 与离职 use-case facade。
- 删除 `EmploymentService.resignUser`，增加 characterization 与 architecture guards 防止职责回退。
- 关闭 umbrella 已归属本 child 的 Admin API lint baseline。

**Non-Goals:**

- 不拆分 `EmploymentService` 的 create、update、status、delete、transfer 或 set-primary operations。
- 不改变 employment/user repository query 或 write，不改变 active employment 的定义或 `endTime` 生成方式。
- 不新增显式 session revocation、权限快照 cleanup、notification、审批或 HR 状态机。
- 不修改 REST/OpenAPI schema、path、method、response envelope、tRPC router key 或错误类型。
- 不处理 OIDC provider components，也不全局迁移现有 `Pick<Repository>` ports；后者属于最后一个 port-hardening child。
- 不改变 database schema、Redis keyspace、workspace dependency 或 deployment topology。

## Decisions

### 1. 建立单一 `resign-user` use-case 与 `execute` seam

新增：

```text
apps/admin-api/src/use-cases/employment/resign-user/
  __tests__/resign-user.use-case.test.ts
  resign-user.use-case.ts
  resign-user.port.ts
  resign-user.type.ts
```

Factory 使用 `createResignUserUseCase`，对外暴露
`execute(input: { username: string }, options?: { auditContext?: AdminAuditContext }): Promise<true>`。输入使用 adapter 已验证的 primitive；
use-case 不接收 Hono `Context`、REST route type 或 tRPC context。Adapter 继续用 `resolveAdminAuditContext` 将 protocol context 归一化后传入。

替代方案是把方法移动到 `UserService`。未采用，因为该流程仍同时拥有 Employment 和 User 生命周期，移动到另一个领域 service 只会交换错误归属。
也不保留 `EmploymentService.resignUser` 转发 facade，避免形成双重 ownership。

### 2. 保留一个 UnitOfWork 和原有副作用顺序

Use-case 继续使用单一 UnitOfWork，callback 内顺序保持为：

1. `getUserByUsernameForAdmin(username)`；不存在时抛出既有 `UserNotFoundError("用户不存在")`。
2. `endActiveEmploymentsByUserId(user.id)`。
3. `updateUserByUsername(username, { status: UserStatus.Disable })`。
4. `recordAuditLog(buildEmploymentResignUserAudit(user, auditContext))`。
5. `markUsersDirty`，userIds 为目标 user，reasons 按原顺序为 `EmploymentUpdated`、`UserUpdated`，并传递 transaction 的
   `afterCommit` 与 audit `requestId`/`traceId`。
6. 返回 `true`。

UnitOfWork options 继续使用 `adminAuditTransactionOptions(auditContext)`，使 afterCommit failure logs 保留 observability context。任一步失败继续让
transaction rollback；use-case 不新增 catch、补偿、fallback 或 best-effort audit。当前离职没有显式 session revocation，本迁移也不新增，仍依赖既有
disabled-user live-state/session behavior。

### 3. 新 port 直接声明消费行为和中立 shape

`resign-user.port.ts` 定义离职 transaction 的最小 user lookup/update、employment end、audit writer 和 profile dirty marker 方法，以及
`UnitOfWorkPort<ResignUserTransactionPorts>`。目标用户 shape 只包含 audit 与 workflow 使用的 `id`、`username`、可选 `name`；audit input、dirty
input 和 afterCommit shape 由消费方直接声明或引用中立 domain/shared types。

新 port 不使用 `Pick<UserRepository>`、`Pick<EmploymentRepository>`、`Pick<EmploymentService>`，也不 import `*.repository.ts`、route 或
concrete service factory。`composition/use-cases` 通过 `mapUnitOfWork` 把现有 tx repositories、audit service 和 dirty marker 结构化适配给它。

从 `AdminEmploymentTransactionPorts` 移除仅由离职使用的 `endActiveEmploymentsByUserId` 与 `updateUserByUsername`；EmploymentService 为 create
等既有 operations 保留它实际需要的 user lookup。其余历史 repository-derived port shapes 不在本 child 顺手收敛。

### 4. Admin composition 单独暴露 `useCases`

新增 `apps/admin-api/src/composition/use-cases/index.ts`，创建并返回：

```ts
{
  employment: {
    resignUser,
  },
}
```

`createAdminApiComposition` 在 services 之后创建 useCases，并通过独立字段交给 route composition。Employment adapter deps 调整为：

- `employmentService`：只包含既有 Employment 领域 operations，不包含 `resignUser`；
- `resignUser`：只包含 use-case `execute` facade。

Route composition 将 `useCases.employment.resignUser` 注入 adapter。Adapter 仍创建同一个 `defineAdminApiMutationOperation`，继续复用其 REST/tRPC
exports，因此 route/schema/index/trpc public shape 不变。Use-case 不并入 `services` aggregate。

### 5. TDD characterization 和 architecture guards 同时锁定迁移

Production 修改前补齐以下 executable seams：

- `resign-user.use-case.test.ts` 先以 missing module 形成 red，再覆盖完整成功顺序、audit/context/dirty input、unknown-user no-side-effect 和
  transaction failure propagation。
- employment adapter characterization 同时通过 REST handler 与 tRPC caller 证明 `{ username }`、`true` result、audit context 与 facade dispatch
  不变，并证明非离职 operations 仍走 `EmploymentService`。
- 既有 EmploymentService characterization 继续覆盖其它 lifecycle operations；离职断言迁到 use-case tests，不复制 ownership。
- architecture red tests 禁止 `EmploymentService` 恢复 `resignUser`、禁止 employment adapter 把离职重新绑定到 domain service、要求 production
  use-case 由 `composition/use-cases` 创建，并检查新 port 不依赖 repository/concrete service 或 `Pick<...>`。

Architecture guard 使用临时 sentinel 验证时，必须只触发新增规则，随后删除 sentinel 并确认全绿。

### 6. Admin lint baseline 只做 task-owned mechanical cleanup

`apps/admin-api/src/lib/__tests__/admin-api-adapter.test.ts` 的 import order 与仅用于 compile-time assertions 的 type aliases 按 ESLint 规则整理。
不删除 compile-time contract assertion，也不改变测试 runtime behavior。若 lint 暴露其它历史问题，先按 scope drift 分类，不在本 child 静默扩大修复。

## Risks / Trade-offs

- [Risk] transaction ports 映射遗漏 `afterCommit` 或 observability options，导致 profile rebuild/log context 变化。→ Mitigation：复用
  `mapUnitOfWork` 与 `adminAuditTransactionOptions`，测试精确断言 dirty marker 的 afterCommit、requestId 和 traceId。
- [Risk] adapter 拆分 deps 时改变 REST/tRPC key、schema 或 success envelope。→ Mitigation：复用原 mutation operation，并同时覆盖 REST handler 与
  tRPC caller characterization；route/schema 文件不做行为性修改。
- [Risk] 从 EmploymentService 删除方法后误伤其它 Employment lifecycle wiring。→ Mitigation：只移除 resignation-only transaction methods，运行
  EmploymentService focused tests 与 Admin API full suite。
- [Risk] 新 port 为减少代码而复用 repository type，形成 provider-owned contract。→ Mitigation：consumer-owned direct interfaces 加 architecture
  guard；历史 ports 留给最后一个 child。
- [Trade-off] 单个 use-case 增加一个 composition 层和显式 wiring。→ 接受少量 wiring，以换取跨领域 transaction ownership 与独立测试 seam。

## Migration Plan

1. 记录 Admin employment、adapter/tRPC、architecture、full test、typecheck 与 lint 的当前基线。
2. 在 production 修改前建立 use-case、adapter 与 architecture failing tests，并确认 red signal 只来自预期缺失/旧 ownership。
3. 实现 `resign-user` consumer-owned port/type/use-case，按成功与失败 vertical slices 转绿。
4. 新增 Admin `composition/use-cases`，更新 composition/routes/adapter wiring，删除 `EmploymentService.resignUser` 及 resignation-only service ports。
5. 关闭已记录 lint baseline，运行 focused/architecture、Admin full test/typecheck/lint、child strict validation、`pnpm check:openspec` 与
   `git diff --check`；人工复核 REST/tRPC、transaction、audit、dirty 和 session compatibility matrix。
6. 用户确认 Archive 后同步 delta specs、归档并 squash merge 回 `feature/standardize-backend-application-boundaries`。

Rollback 只需回退本 child 的 squash commit，即可恢复 `EmploymentService.resignUser` 与旧 adapter wiring。没有 data migration、Redis migration、
dependency 或 deployment 切换步骤。

## Open Questions

无阻断性开放问题。是否新增离职 session revocation 属于行为变更，不在本结构迁移 child 内处理；historical Admin/OIDC ports 的全局收敛仍由最后一个
consumer-owned ports child 完成。
