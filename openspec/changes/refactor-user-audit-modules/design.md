## Context

当前 `apps/api/src/services/user/user.service.ts` 是 public/open/internal 用户能力的集中入口，但内部混合了多种不同变化频率的逻辑：

- 用户详情 read model 聚合：用户、任职、角色、权限。
- 凭据规则：密码强度、bcrypt hash、默认密码验证。
- 手机号绑定：手机号格式、重复手机号、短信验证码。
- 审计日志：自助改密、找回密码、手机号绑定等事件拼装。
- 事务编排：查询用户、验证、写入、审计。
- 特定查询：用户搜索与权限委托查询组合。

同时，`apps/api` 与 `apps/admin-api` 的业务服务中存在多处局部审计 helper，重复拼装 target、details 和脱敏字段。底层 `audit.service.ts` 已经具备审计模型校验、actor 规范化、request context 注入和敏感字段脱敏能力，不应再承载具体业务 action。

本次变更是结构性重构，目标是降低服务模块职责密度，并保持既有 API、审计 action、错误语义和数据库行为不变。

## Goals / Non-Goals

**Goals:**

- 将 `apps/api/src/services/user/user.service.ts` 收敛为薄 use-case facade，只负责公开函数、事务边界和主要流程编排。
- 将用户详情聚合、密码规则、手机号绑定校验、权限委托查询聚合拆为可单独测试的 helper。
- 将 `api` 侧认证、自助和 internal 业务审计事件集中到 `apps/api/src/services/audit/events/`。
- 将 `admin-api` 侧管理端 mutation 审计事件集中到 `apps/admin-api/src/services/audit/events/`，减少各业务 service 内部的重复审计拼装。
- 复用现有 `@iam/domain/audit` 的 actor 规范化和 details 脱敏能力，并补充通用手机号审计脱敏 helper。
- 保持现有单元测试覆盖，并为新 helper 增加聚焦测试。

**Non-Goals:**

- 不改变 REST 或 tRPC 对外接口。
- 不修改 PostgreSQL schema、Drizzle schema 或 migration。
- 不调整审计 action 命名、actor/target 模型或审计查询能力。
- 不改变 `resetPassword` 当前允许弱密码的既有行为。
- 不治理 open 找回密码中的用户枚举风险；该问题需要单独安全策略提案。
- 不将 `api` 与 `admin-api` 的 app 级 `audit.service.ts` 强行合并为一个跨 app 写入器。

## Decisions

### Decision 1: `user.service.ts` 保留为 use-case facade

`user.service.ts` 继续导出当前路由和认证模块依赖的函数，例如 `setPassword`、`resetPassword`、`checkPassword`、`setMobile`、`searchUsersWithPrivilegeDelegation` 和 `getUserDetailBy*`。函数签名和返回值保持不变。

内部按职责拆分为：

```text
apps/api/src/services/user/
├── user.service.ts
├── user-detail.helper.ts
├── user-password.helper.ts
├── user-mobile-binding.helper.ts
└── user-delegation-query.helper.ts
```

理由：

- 路由层和认证模块不需要感知拆分，降低回归面。
- 事务边界仍在 service 层清晰可见。
- helper 可以被独立单元测试覆盖，减少对数据库、Redis、短信和 bcrypt 的 mock 复杂度。

备选方案：

- 按功能拆出多个 service，例如 `password.service.ts`、`mobile-binding.service.ts`。该方案会让上层调用点分散，并模糊 `user` 这个领域入口。
- 只在原文件内重排函数。该方案不能解决审计、密码和聚合逻辑难以复用与测试的问题。

### Decision 2: 密码 helper 只封装规则，不改变策略

`user-password.helper.ts` 负责：

- `isStrongPassword` 或 `assertStrongPassword`
- `hashUserPassword`
- `verifyUserPassword`

`setPassword` 使用强度校验；`resetPassword` 只使用 hash，不调用强度校验，以保持当前规格与测试记录的行为。

理由：

- 密码强度策略是否统一属于安全需求调整，不应混入结构重构。
- 将 `verifyUserPassword` 设计为接收已查询用户对象，可避免 `setPassword` 事务内再次通过 username 查询用户。

备选方案：

- 让 `resetPassword` 也调用 `assertStrongPassword`。这是合理安全方向，但会改变现有 open 找回密码行为。

### Decision 3: 业务审计事件放到 `audit/events`，底层写入器保持通用

`audit.service.ts` 继续负责：

- app 默认 `sourceApp`
- request context 解析
- actor 规范化
- details 补充与脱敏
- 持久化调用

业务事件 helper 负责：

- 固定 action
- 固定 targetType/targetId/targetCode/targetName
- 固定 details 基础字段
- 领域内敏感字段脱敏

建议结构：

```text
apps/api/src/services/audit/
├── audit.service.ts
└── events/
    ├── auth.audit.ts
    ├── self-user.audit.ts
    └── internal.audit.ts

apps/admin-api/src/services/audit/
├── audit.service.ts
├── admin-resource-audit.ts
└── events/
    ├── user.audit.ts
    ├── client.audit.ts
    ├── organization.audit.ts
    ├── position.audit.ts
    └── employment.audit.ts
```

理由：

- 避免 `audit.service.ts` 变成新的业务上帝模块。
- 业务事件 helper 靠近审计模块，便于统一 action 与脱敏口径。
- `admin-resource-audit.ts` 可承接管理端资源 target 的共性，领域 event helper 再补充各自 details。

备选方案：

- 把每个领域的审计 helper 放在领域 service 旁边，例如 `user.audit.ts` 位于 `services/user/`。该方案局部聚合较强，但跨领域审计口径不易发现和复用。
- 把所有审计事件放入一个 `audit.events.ts`。该方案初期简单，但会迅速膨胀。

### Decision 4: 手机号审计脱敏上移到共享 domain helper

将重复的 `maskMobileForAudit` 抽为共享 helper，例如 `packages/domain/src/audit/masking.ts` 并从 `@iam/domain/audit` 导出。

理由：

- 该脱敏规则服务于审计 details，不依赖 app runtime。
- `api`、`admin-api` 和后续脚本可以复用同一口径。

备选方案：

- 放入 `@iam/api-core`。该包偏 API 基础设施，手机号脱敏更接近业务审计 domain。
- 放入 `apps/api/src/services/audit`。该方案不能被 `admin-api` 复用。

### Decision 5: 测试按 helper 边界拆分

保留现有 service 测试覆盖端到端用例行为，同时增加 helper 单元测试：

- 密码 helper：强度、默认密码、production 密码为空、bcrypt compare/hash 调用。
- 用户详情 helper：employment roles/privileges 聚合与去重。
- 手机号绑定 helper：校验顺序、异常和验证码失败审计。
- audit event helper：action、outcome、target、details 和脱敏字段。
- masking helper：手机号为空、格式匹配和格式不匹配时的稳定输出。

理由：

- 结构重构最重要的验证是行为不漂移。
- helper 测试能减少 service 测试的 mock 面，后续策略变化更容易定位。

## Risks / Trade-offs

- [Risk] 迁移审计拼装时 action 或 details 字段轻微漂移。→ Mitigation: 先用现有测试固定关键审计字段，再迁移 helper；新增 event helper 测试比较 action、target 和 details。
- [Risk] 新增 helper 文件过多导致导航成本增加。→ Mitigation: 只按当前重复职责拆分，避免为单一调用点创建过细抽象。
- [Risk] 抽出 `verifyUserPassword` 后改变查询次数，可能影响 mock 期望。→ Mitigation: 更新测试以验证最终行为和事务内 repository 调用，不依赖重复查询这个实现细节。
- [Risk] `@iam/domain/audit` 新增 masking helper 可能引入跨包 typecheck 影响。→ Mitigation: 只新增纯函数和导出，不引入 app 依赖。
- [Risk] 管理端通用 `admin-resource-audit.ts` 抽象过度。→ Mitigation: 仅封装 actor/context/target/outcome 共性，领域 details 仍由各 `events/*.audit.ts` 明确拼装。

## Migration Plan

1. 新增共享手机号审计脱敏 helper 与测试。
2. 新增 `apps/api/src/services/user` 下的 helper，并逐步让 `user.service.ts` 调用。
3. 新增 `apps/api/src/services/audit/events`，迁移 self-service、auth、internal 的业务审计拼装。
4. 新增 `apps/admin-api/src/services/audit/admin-resource-audit.ts` 和 `events/*.audit.ts`，迁移 admin user/client/organization/position/employment 的局部审计 helper。
5. 更新相关单元测试，运行受影响 package 的 `test` 和 `typecheck`。
6. 若出现回归，可回滚对应 helper 调用到原 service 内联逻辑；由于无 schema/API 变更，运行时回滚不需要数据迁移。

## Open Questions

- 是否要在后续安全提案中统一 `resetPassword` 与 `setPassword` 的密码强度策略？
- 是否要进一步治理 open 找回密码的用户枚举风险？
- 管理端审计事件 helper 是否需要导出给未来 admin tRPC adapter 直接使用，还是仅限 service 内调用？
