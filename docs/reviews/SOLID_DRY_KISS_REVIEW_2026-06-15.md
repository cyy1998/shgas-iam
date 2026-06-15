# SOLID / DRY / KISS 代码审查记录

## 背景

本文记录 2026-06-15 对 IAM Service 当前代码库进行的一次轻量架构体检，重点观察是否存在不符合 SOLID、DRY、KISS 原则的局部风险。

本次只做探索和文档沉淀，未修改业务代码。OpenSpec 当前无活动 change。

## 总体判断

项目整体分层约定清晰，后端已形成 route / adapter / service / repository / shared package 的基本边界，admin-api 的 REST 与 tRPC 也基本遵循薄 adapter 模式。主要风险不是整体架构失控，而是部分核心不变量开始在多个 app 或多个页面中分叉：

- 内部认证策略存在两个入口，且其中一个入口混入硬编码 IP 绕过。
- 角色授权、组织关系、雇佣关系装配逻辑在 public API 与 admin-api 中重复。
- 管理端分页语义与分页执行位置不统一。
- 前端页面中状态值和 CRUD 交互模板有散点重复。

这些问题大多还处在可控阶段，适合用小步收敛而不是大规模重构。

## 主要问题

### P0: 内部认证策略重复且行为分叉

**原则风险**：SRP、DRY、DIP。

当前已有共享内部认证中间件：

- `packages/api-core/src/middlewares/auth.ts:85` 的 `createInternalAuthenticationHandler`
- `apps/api/src/middlewares/authentication.handler.ts:14` 的 `internalAuthenticationHandler`
- `apps/api/src/routes/internal/_middleware.ts:4` 对 internal tier 统一应用该中间件

但 `/auth/internal-authz` 又手写了一套校验逻辑：

- `apps/api/src/routes/auth/auth.handlers.ts:61` 读取 `apikey`
- `apps/api/src/routes/auth/auth.handlers.ts:64` 对 `IP-Chain` 中的 `192.168.93.`、`192.168.73.88` 直接放行
- `apps/api/src/routes/auth/auth.handlers.ts:71` 再通过 client secret 查询 client

**影响**：

- 同一内部认证策略存在两个实现，后续修改 secret 规则、错误映射、审计或日志时容易漏改。
- IP 白名单属于环境策略，硬编码在 route handler 中会让部署差异变成隐藏行为。
- handler 同时承担路由响应、安全策略、client 查询，职责过厚。

**建议**：

1. 将 IP 白名单改为环境变量或 gateway / middleware 层策略。
2. 让 `/auth/internal-authz` 复用 `createInternalAuthenticationHandler` 或抽出同源 `verifyInternalClient` helper。
3. 若确实需要 IP bypass，明确命名为独立策略，并保留结构化日志和测试。

### P1: 角色授权查询规则逐字重复

**原则风险**：DRY、SRP。

以下两个文件哈希完全一致：

- `apps/api/src/services/role/role.repository.ts`
- `apps/admin-api/src/services/role/role.repository.ts`

其中 `roleAssignedToEmploymentWhere()` 同时组合岗位角色、组织角色、任职角色规则，`getRolesByEmploymentId()` 被 public API 与 admin-api 详情路径依赖。

**影响**：

- 角色授权是核心业务规则，放两份会让 bugfix、性能优化或软删/status 过滤变更漏一边。
- 后续若增加角色来源或组织继承规则，两边必须同步理解和测试。

**建议**：

将该查询下沉到共享位置，例如 `packages/db/src/queries/core/role.ts` 或 `packages/domain` 中更偏领域查询的模块。保留 app service 各自的 DTO 映射和权限边界，不把 app-specific handler 一起抽走。

### P1: 组织关系与雇佣关系装配逻辑跨 app 重复

**原则风险**：DRY、SRP。

组织关系：

- `apps/api/src/services/organization/organization.repository.ts:20` 的 `attachOrganizationRelations`
- `apps/admin-api/src/services/organization/organization.repository.ts:23` 的 `attachOrganizationRelations`
- `apps/api/src/services/organization/organization.repository.ts:106` 与 `apps/admin-api/src/services/organization/organization.repository.ts:69` 的 `setOrganization`

雇佣关系：

- `apps/api/src/services/employment/employment.repository.ts:35` 的 `attachEmploymentRelations`
- `apps/admin-api/src/services/employment/employment.repository.ts:37` 的 `attachEmploymentRelations`

这些函数处理的是 closure table、父子组织、完整组织路径、任职组织上下文等底层不变量。

**影响**：

- closure 维护、软删过滤、组织路径排序或 companyNodes 规则一旦变更，需要同步多个 app。
- admin-api 已经在这些共享装配基础上叠加 admin-specific 查询，文件自然变厚。

**建议**：

优先抽底层 assembler/query helper，而不是抽整个 repository：

- `attachOrganizationRelations`
- 创建组织时维护 `organization_closure` 的逻辑
- `attachEmploymentRelations`
- 组织路径节点排序与 `companyNodes` 派生

public API 与 admin-api 仍保留各自查询入口和 DTO 映射。

### P1: 分页语义与执行位置不统一

**原则风险**：KISS、DRY、一致性。

已有共享内存分页工具：

- `packages/api-core/src/utils/page.ts:3`

该工具在空结果时返回 `pages = 1`：

- `packages/api-core/src/utils/page.ts:15`

但部分服务手写分页结果时空结果返回 `pages = 0`：

- `apps/admin-api/src/services/user/user.service.ts:52`
- `apps/admin-api/src/services/client/client.service.ts:68`
- `apps/admin-api/src/services/audit/audit.service.ts:148`
- `apps/admin-api/src/services/employment/employment.service.ts:77`

执行位置也不统一：

- DB 分页：`apps/admin-api/src/services/user/user.repository.ts:58`、`apps/admin-api/src/services/audit/audit.repository.ts:69`
- 内存分页：`apps/admin-api/src/routes/admin/position/position.adapter.ts:20`、`apps/admin-api/src/services/organization/organization.service.ts:96`

**影响**：

- 前端不同资源页可能遇到不同的空分页语义。
- position / organization 搜索在数据变大后容易出现性能上限，且和其他 paged repository 模式不一致。

**建议**：

1. 明确定义空结果 `pages` 应为 0 还是 1，并让 schema、工具函数、服务返回保持一致。
2. 新增一个共享 `toPageResult(result, total, query)` 用于已做 DB limit/count 的查询。
3. 对 position 和 organization search 评估是否迁移到 repository 层 `limit/count`。

### P2: 管理端前端状态操作语义泄漏

**原则风险**：DRY、KISS。

contracts 已提供状态枚举和 options helper：

- `packages/contracts/src/enums/user.status.ts`
- `packages/contracts/src/enums/employment.status.ts`
- `packages/contracts/src/enums/client.status.ts`
- `packages/contracts/src/enums/position.status.ts`

但页面层仍存在散点数字和类型断言：

- `apps/admin/src/pages/users/index.tsx:52` 的 `status: number`
- `apps/admin/src/pages/users/index.tsx:54` 的 `status as 1 | 2 | 3`
- `apps/admin/src/pages/users/components/UserDetailDrawer.tsx:122` 的 `status as 1 | 2 | 3`
- `apps/admin/src/pages/clients/index.tsx:87` 的 `status as 1 | 2 | 3`
- `apps/admin/src/pages/employments/index.tsx:199` 的 `row.status === 3`
- `apps/admin/src/pages/employments/index.tsx:287` 的默认 `[1, 2]`

**影响**：

- 状态值调整或新增状态时，页面层需要散点修改。
- 不同页面的状态菜单、成功提示、错误处理和 reload 模式重复。

**建议**：

先做薄工具，不要平台化：

- 将状态类型从 tRPC input 或 contracts enum 推导出来。
- 抽一个 `buildStatusMenuItems(options, current, onChange)`。
- 抽一个极小的 `showError(err, fallback)` 或 `runAdminAction()`，统一错误提示和成功后 reload。

### P2: 部分 service 职责偏厚

**原则风险**：SRP、KISS。

`apps/admin-api/src/services/client/client.service.ts` 同时处理：

- Redis client cache key 写入与清理：`client.service.ts:36`
- client CRUD 与审计：`client.service.ts:131`
- OIDC 配置、启停、移除、secret 轮换：`client.service.ts:237`
- OIDC runtime invalidation：`client.service.ts:102`

**影响**：

- 业务流程仍可读，但 OIDC 和普通 client CRUD 共享一个 service 文件后，后续新增 OIDC 功能会进一步加厚。
- cache 与 invalidation 是副作用策略，和核心 client mutation 混在一起会增加测试组合。

**建议**：

在下一次相关变更中顺手拆分，不建议单独大重构：

- `client-cache.service.ts`：cache key、set/delete/sync
- `client-oidc.service.ts`：OIDC 配置、启停、secret、invalidation
- `client.service.ts` 保留普通 CRUD 编排和对外导出

### P2: SSO login 页面偏厚

**原则风险**：SRP、KISS。

`apps/sso/src/pages/login/index.tsx` 同时处理：

- 登录模式状态与 URL query：`index.tsx:45`
- 密码登录：`index.tsx:95`
- 手机登录：`index.tsx:130`
- 绑定手机号：`index.tsx:161`
- 短信验证码倒计时和发送：`index.tsx:184`
- 无 client 的安全提示页和正常登录页 UI：`index.tsx:241`

**影响**：

- 当前仍能阅读，但多个登录流程共享表单、验证码、人机校验和 redirect，后续新增认证方式时容易继续膨胀。

**建议**：

只在新增登录能力时拆，不做提前重构：

- `useSmsCodeCountdown`
- `useLoginRedirect`
- `PasswordLoginForm` / `SmsLoginForm`
- `UnsafeEntryNotice`

## 不建议立即处理的问题

以下内容看起来有重复或行数偏高，但当前不宜作为优先重构目标：

1. `packages/api-core/src/session/index.ts`、`packages/contracts/src/auth/login-credential.ts`、`gateway/src/validators/index.ts` 行数较高，但符号都集中在单一领域内，边界相对清楚。
2. `apps/admin/src/pages/*` 的 CRUD 页面模板重复较多，但过早抽成页面框架会让 ProTable 细节难以调试。应先抽薄工具。
3. `apps/api/src/utils/lint.util.ts` 与 `apps/admin-api/src/utils/lint.util.ts` 逐字重复，但只是类型工具，影响低于业务规则重复。

## 建议的收敛顺序

1. **P0 内部认证收敛**：先移除 handler 里的硬编码 IP 策略或迁移到配置化 middleware。
2. **P1 共享角色查询**：将 `role.repository.ts` 的核心规则移到共享查询模块，并补充 public/admin 两侧调用测试。
3. **P1 共享组织/雇佣 assembler**：抽 closure、组织路径、任职上下文装配，不改变 app-specific 查询入口。
4. **P1 统一分页语义**：确认 `pages` 空值语义，补共享 `toPageResult`，逐步迁移 DB 分页。
5. **P2 前端薄工具化**：状态菜单、错误提示、action reload、状态类型推导。
6. **P2 顺手拆厚 service/page**：仅在相关业务变更中拆 `client.service.ts` 和 SSO login 页面。

## 可转 OpenSpec 的候选 change

如果要进入实现，建议拆成小 change：

1. `consolidate-internal-authz-policy`
2. `extract-shared-role-queries`
3. `extract-organization-employment-assemblers`
4. `standardize-admin-pagination`
5. `standardize-admin-status-actions`

其中第 1 项应优先处理；第 2、3 项适合和测试一起做；第 4、5 项可以作为低风险工程质量改进。
