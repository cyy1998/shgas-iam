## Why

`apps/api/src/services/user/user.service.ts` 同时承担用户详情聚合、密码规则、密码 hash、短信验证码校验、手机号绑定、审计日志、事务编排和权限委托查询，职责边界不清，导致测试、复用和后续安全规则调整成本偏高。审计日志在 `api` 与 `admin-api` 的多个业务 service 中也存在重复拼装 action、target 和 details 的局部 helper，容易让审计口径漂移。

## What Changes

- 将 public API 用户服务改造为薄 use-case facade：保留现有导出函数和业务行为，拆出用户详情聚合、密码 helper、手机号绑定校验、权限委托查询聚合等内部 helper。
- 将用户相关审计日志从 `user.service.ts` 中抽离到 `apps/api/src/services/audit/events/` 下的业务审计事件封装。
- 在 `apps/admin-api/src/services/audit/` 下建立管理端业务审计事件封装，承接用户、客户端、组织、岗位、任职等管理端 mutation 的审计拼装逻辑。
- 保留 `apps/api/src/services/audit/audit.service.ts` 和 `apps/admin-api/src/services/audit/audit.service.ts` 作为 app 级审计写入器，不把业务 action 细节塞入底层写入服务。
- 抽出可复用的审计脱敏 helper，例如手机号审计脱敏，减少 `maskMobileForAudit` 在多个模块中的重复实现。
- 不修改 REST、tRPC、数据库 schema、审计 action 名称、审计字段语义和现有错误语义。
- 不改变 `resetPassword` 当前不复用自助改密密码强度校验的行为；该安全策略是否调整另行提案。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `audit-logging`: 增加业务审计事件封装约束，要求业务 service 复用集中定义的审计事件 helper，并保持现有审计模型、action、target 和脱敏语义。
- `directory-and-self-service`: 增加 public 用户服务职责拆分约束，要求拆分后自助改密、找回密码、绑定手机号、用户详情聚合和权限委托查询行为保持不变。
- `admin-user-management`: 增加管理端用户服务审计封装约束，要求管理端用户 mutation 继续写入既有 `admin.user.*` 审计事件，同时将审计拼装从用户服务主体中移出。

## Impact

- Affected code:
  - `apps/api/src/services/user/user.service.ts`
  - `apps/api/src/services/user/*.helper.ts`
  - `apps/api/src/services/audit/audit.service.ts`
  - `apps/api/src/services/audit/events/*.audit.ts`
  - `apps/api/src/routes/auth/auth.service.ts`
  - `apps/api/src/routes/open/open.handlers.ts`
  - `apps/api/src/routes/internal/*/*.handlers.ts`
  - `apps/admin-api/src/services/audit/*.ts`
  - `apps/admin-api/src/services/audit/events/*.audit.ts`
  - `apps/admin-api/src/services/user/user.service.ts`
  - `apps/admin-api/src/services/client/client.service.ts`
  - `apps/admin-api/src/services/organization/organization.service.ts`
  - `apps/admin-api/src/services/position/position.service.ts`
  - `apps/admin-api/src/services/employment/employment.service.ts`
- Tests:
  - Update existing Bun unit tests to mock newly introduced helper modules where appropriate.
  - Add focused tests for password helper, user detail helper, audit event helper and masking behavior.
- APIs and data:
  - No API contract changes.
  - No database migration.
  - No new runtime dependency.
