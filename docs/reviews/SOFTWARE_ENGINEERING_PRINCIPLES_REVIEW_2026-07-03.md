# 软件工程原则审查报告

## 背景

本文记录 2026-07-03 对 IAM Service 当前代码库进行的一次软件工程原则审查。审查由主会话调度 8 个只读子代理完成，每个子代理只聚焦一个原则：KISS、YAGNI、高内聚低耦合、单一职责、封装变化、契约清晰、幂等性、可观测性。

主会话仅负责调度、收集和归并结果；没有额外执行代码审查、代码修改、测试运行或服务启动。

## 总体结论

项目整体架构基础较好：后端 app 入口较薄，composition root、factory/DI、UnitOfWork、repository 工厂、Zod/OpenAPI、tRPC、结构化日志和审计链路都已经形成了较明确的工程惯例。

主要风险不在于整体架构失控，而是集中在两类高优先级问题：

1. **契约清晰存在 P1 级漂移**：OpenAPI 与实现不一致，运行时响应 envelope 使用 `any`，导致类型系统无法约束 handler 返回值。
2. **幂等性存在 P1 级缺口**：部分业务写路径缺数据库约束或请求级幂等机制，重复请求、并发重试、事务后副作用失败可能造成重复数据或不可恢复状态。

其余原则多为“基本通过”，但存在可持续收敛的中低风险问题：未使用抽象、边界泄漏、前端手写契约、Redis key 协议重复、部分核心服务职责偏重、gateway 校验器过大等。

## 结论总览

| 原则 | 结论 | 风险概述 |
|---|---|---|
| KISS | 基本通过 | 主路径简单；`createApp` 注册路径、gateway 命令、未使用抽象增加认知成本 |
| YAGNI | 基本通过 | 存在若干未被消费或提前泛化的共享层、DSL、worker registry、兼容字段 |
| 高内聚、低耦合 | 基本通过 | composition/DI 较好；少数 DTO、handler、adapter、前端页面越过边界 |
| 单一职责 | 基本通过 | 多数模块职责明确；session adapter、client service、session kernel、部分页面偏重 |
| 封装变化 | 基本通过 | 外部依赖多集中装配；Redis 协议、raw env、审计 action、前端 request policy 有泄漏 |
| 契约清晰 | 有明显问题 | OpenAPI 与实现不一致，响应 envelope `any`，SSO 手写类型漂移 |
| 幂等性 | 有明显问题 | 缺请求级幂等键，部分先查再插入无 DB 约束，事务后副作用不可恢复 |
| 可观测性 | 基本通过 | 后端日志/审计较好；前端 requestId、health check、traceId 索引仍不足 |

## 最高优先级问题

### P1: `/auth/authz` OpenAPI 与实现返回类型不一致

**原则风险**：契约清晰、可测试性、客户端兼容性

**证据**

- `apps/api/src/routes/auth/auth.routes.ts:68` 声明 `/auth/authz` 成功响应 `data` 是 `z.object()`
- `apps/api/src/services/session/custom-sso-session-kernel.adapter.ts:335` 返回 base64 字符串
- `apps/api/src/routes/auth/auth.handlers.ts:71` 将该字符串写入 `X-User-Info` 并通过 `resp.ok(data)` 返回

**影响**

消费者按照 OpenAPI 会以对象解析响应，但运行时实际返回字符串。该问题会直接造成客户端生成类型、联调、契约测试和网关文档不一致。

**建议**

优先将 OpenAPI schema 修正为 `createSuccessResponseSchema(z.string())`，或改实现返回对象。若当前生产行为已经依赖字符串，应优先让文档匹配现状，再另开变更讨论是否调整响应结构。

### P1: 响应 envelope 被 `any` 擦除

**原则风险**：契约清晰、类型安全、回归防护

**证据**

- `packages/api-core/src/http/response.ts:7` 的 `makeResponse(...): any`
- `ok/fail` 继承该 `any`
- `packages/api-core/src/core/openapi/schemas/create-success-schema.ts:3` 另行定义成功 schema

**影响**

Route handler 即使声明了 OpenAPI response schema，TypeScript 也无法校验 `resp.ok(data)` 中的 `data` 是否匹配 schema。契约漂移只能靠人工发现，缺少编译期护栏。

**建议**

在 `packages/api-core/src/http/response.ts` 定义并导出 `ApiEnvelope<T>`，让 `ok<T>()` / `fail<T>()` 返回泛型 envelope，去掉 `any`。之后补一组轻量契约测试，抽样验证 handler 返回值和 OpenAPI Zod schema 对齐。

### P1: 任职创建/转岗缺活跃唯一约束

**原则风险**：幂等性、数据一致性

**证据**

- `apps/admin-api/src/services/employment/employment.service.ts:102`
- `apps/admin-api/src/services/employment/employment.repository.ts:83`
- `packages/db/src/schema/core/employments.ts:24`

当前任职创建/转岗路径是先查再插入，但 `employment` 表只有普通索引，没有覆盖 `user_id + dept_id + pos_id + active status` 的唯一约束或排他保护。

**影响**

并发重复请求可能同时通过服务层检查，并插入重复任职关系。服务层检查不能替代数据库约束。

**建议**

增加活跃任职复合唯一约束，至少覆盖用户、部门、岗位与软删除/状态维度，并将 repository 写入改为 `onConflict` 或显式冲突映射。

### P1: 验证码先消费后事务失败不可恢复

**原则风险**：幂等性、用户体验、失败恢复

**证据**

- `apps/api/src/services/mobile/mobile.service.ts:15`
- `apps/api/src/services/user/user.service.ts:69`
- `apps/api/src/services/user/user-mobile-binding.helper.ts:21`

验证码消费通过 Redis `DEL` 一次性删除，但发生在密码重置或手机号绑定数据库事务之前。

**影响**

如果请求超时、后续 DB 写失败或事务回滚，用户重试时验证码已经被消费，导致合法重试失败。

**建议**

将验证码消费改为 reserve/confirm 模式，或引入 operationId：同一次业务操作可复用已保留凭证，业务提交成功后再确认消费。

## 分原则分析

### 1. KISS：先保持简单

**结论**：基本通过。

主路径大多显式、线性，组合根和薄 adapter 易读，没有明显为了抽象而抽象的核心架构问题。

**做得好的地方**

- `apps/api/src/app.ts:8` 入口只做组合根创建和 `createApp` 装配。
- `apps/api/src/composition/index.ts:35` 到 `:69` 按 runtime、repositories、uow、services、routes、middlewares 顺序线性创建。
- `packages/api-core/src/uow/unit-of-work.ts:32` 到 `:51` 的 UnitOfWork 抽象短小，核心只包事务和 afterCommit。
- `apps/admin-api/src/lib/admin-api-adapter.ts:39` 到 `:42` 明确限制 adapter 只组装输入、转发上下文、包装协议响应。

**主要问题**

| 风险 | 位置 | 问题 |
|---|---|---|
| P2 | `packages/api-core/src/core/define-config.ts:25`、`packages/api-core/src/core/create-app.ts:37`、`apps/api/src/composition/routes/index.ts:104` | route/middleware 同时支持默认目录匹配、`routeDir`、显式 records、伪文件路径和正则解析，新增 route 时需要理解多套规则 |
| P2 | `gateway/src/commands.ts:30`、`:57`、`:77` | `runValidate`、`runDiff`、`runApply` 重复 load manifest、validate、print issues、throw |
| P3 | `packages/api-core/src/core/business-op.ts:32` | `defineQueryOp/defineMutationOp` 抽样未发现业务引用，容易误导规范路径 |
| P3 | `gateway/src/validators/index.ts:8`、`:371`、`:463` | 单文件混合 source schema、ID/引用、敏感值、trusted proxy、logging policy |
| P3 | `packages/api-core/src/core/define-config.ts:13`、`apps/api/src/routes/internal/_middleware.ts:4` | `defineMiddleware` 当前只是 identity wrapper |

**建议**

- 收敛 `createApp` 的 route/middleware 注册模型，优先保留当前显式组合方式。
- 在 gateway 命令中提取 `loadValidatedManifestForCommand`。
- 删除或迁移 `business-op.ts`，避免与 admin adapter 形成重复规范。
- 将 gateway validators 按规则族拆分，并保留薄聚合器。

### 2. YAGNI：不要过度设计

**结论**：基本通过。

多数抽象有当前消费者或事务/测试边界支撑，但仍有若干提前泛化和历史兼容路径。

**做得好的地方**

- `@iam/jobs` 被 api、admin-api、worker 实际消费，不是空泛共享包。
- Admin REST/tRPC 共用 adapter 避免重复业务编排。
- UnitOfWork 被 api/admin-api 事务组合层实际使用。
- `apps/sso/src/access.ts:1` 明确 no-op 是 Umi Max 插件运行时要求，不是未来功能占位。

**主要问题**

| 风险 | 位置 | 问题 |
|---|---|---|
| P2 | `packages/api-core/src/core/business-op.ts:32` | 通用 operation 抽象未被业务引用 |
| P2 | `apps/api/src/routes/internal/user/user.routes.ts:59`、`packages/user-profile-read-model/src/user-profile.schema.ts:129` | 用户画像 DSL 支持递归 `all/any/not/nested`，但仓库内前端未消费 |
| P2 | `apps/worker/src/composition/index.ts:25`、`apps/worker/src/env.ts:5`、`apps/worker/src/modules/registry.ts:16` | worker 当前只有一个模块，却已有多模块选择和 registry 泛化 |
| P2 | `apps/admin-api/src/services/employment/employment.schema.ts:30`、`:57`、`:94` | Employment DTO 保留多组 deprecated compatibility 字段 |
| P3 | `packages/api-core/src/uow/index.ts:3` | `test-fakes` 从公共 `uow` barrel 导出 |
| P3 | `packages/api-core/src/errors/AuthzMaintaincingError.ts:3` | 拼写错误兼容别名仍导出，抽样未发现业务引用 |

**建议**

- 清理未使用的 `business-op.ts` 或把 admin adapter 收敛为唯一 operation 抽象。
- 对 `/internal/users/search-dsl` 明确消费者和需求，否则先不对外暴露通用 DSL。
- worker 在第二个模块出现前简化 env/registry，或用文档明确近期落地计划。
- 为 deprecated 字段设置删除版本和迁移检查。
- 测试 fake 移到专门测试子路径，避免扩大运行时公共 API。

### 3. 高内聚、低耦合

**结论**：基本通过。

整体有清晰的组合根、DI、仓储工厂和共享包分层；主要风险是少数 DTO、服务、路由直接感知 DB schema 或 repository。

**做得好的地方**

- `apps/api/src/app.ts:10`、`apps/admin-api/src/app.ts:10` 后端 app 入口很薄。
- `packages/api-core/src/core/create-app.ts:22`、`:155` 由 routes/middlewares records 驱动，保持 app-agnostic。
- `apps/api/src/composition/index.ts:39`、`:51` 和 `apps/admin-api/src/composition/index.ts:44` 将生产实例集中装配。
- `apps/api/src/__tests__/architecture.test.ts:116`、`apps/admin-api/src/__tests__/architecture.test.ts:114` 用架构测试守住生产 db/redis/logger/service 导入边界。

**主要问题**

| 风险 | 位置 | 问题 |
|---|---|---|
| P2 | `packages/domain/package.json:32`、`packages/domain/src/user/schema.ts:2`、`packages/domain/src/client/schema.ts:3` | `packages/domain` 直接依赖 `@iam/db/schema`，领域/契约层随持久化结构波动 |
| P2 | `apps/api/src/routes/internal/user/user.handlers.ts:2`、`:69`、`:125` | `contactRegister` 在 route handler 内直接编排 UoW、repositories、审计和短信 |
| P3 | `apps/admin-api/src/routes/admin/position/position.adapter.ts:18`、`:30` | Admin position adapter 对 search 直接调用 repository，而其他操作走 service |
| P3 | `apps/admin-api/src/services/client/client.service.ts:18`、`:322`、`apps/admin-api/src/services/position/position.schema.ts:13` | 部分 service/schema 直接使用 DB schema 解析业务输入 |
| P3 | `apps/admin/src/pages/employments/components/EmploymentFormModal.tsx:13`、`TransferModal.tsx:119` | Admin 前端页面组件少量直接依赖 `apiClient` / `AppRouter` |

**建议**

- 将稳定 DTO 与 DB-derived schema 解耦，至少把 DB shape 适配集中到少量 schema adapter。
- 把 `contactRegister` 提炼到用例服务，handler 只做请求解析和响应。
- 统一 route adapter 边界，避免 adapter 直接依赖 repository。
- 为 shared package 增加依赖方向 guard，例如禁止 `packages/domain -> @iam/db` 或显式列出例外。
- Admin 前端页面通过 `src/services` 包装 tRPC/API 调用。

### 4. 单一职责

**结论**：基本通过。

composition、route adapter、audit event builder 多数职责清晰，但少数核心文件承担了过多变更原因。

**做得好的地方**

- `apps/admin-api/src/composition/services/index.ts:21` 主要做依赖装配。
- `apps/api/src/composition/routes/index.ts:33` 只创建 handlers 并返回 route records。
- `apps/api/src/routes/sso/sso.handlers.ts:65` handler 层整体围绕 HTTP/cookie/redirect 适配。
- `apps/admin-api/src/services/audit/events/client.audit.ts:6` 审计事件 builder 是纯 payload 构造。

**主要问题**

| 风险 | 位置 | 问题 |
|---|---|---|
| P2 | `apps/api/src/services/session/custom-sso-session-kernel.adapter.ts:85`、`apps/oidc-provider/src/session/oidc-session-kernel.adapter.ts:77` | session adapter 同时处理协议映射、Redis、用户状态、审计、吊销等 |
| P2 | `apps/admin-api/src/services/client/client.service.ts:126` | client service 同时处理 CRUD、OIDC、cache sync、session revocation、审计 patch |
| P2 | `packages/api-core/src/session/kernel/facade.ts:119` | session kernel 覆盖创建、解析、续期、artifact、索引、吊销、tombstone、validation、cleanup |
| P3 | `apps/admin-api/src/services/employment/employment.service.ts:55` | 任职服务混合任职 CRUD、用户离职策略、profile dirty、审计 |
| P3 | `apps/admin/src/pages/users/components/UserDetailDrawer.tsx:77` | Drawer 同时处理详情请求、mutation、表格列、modal/drawer/tabs/audit UI |
| P3 | `packages/user-profile-read-model/src/user-profile.repository.ts:44` | repository 文件同时包含 CRUD/search、legacy query 转换、filter DSL SQL 编译 |
| P3 | `gateway/src/validators/index.ts:8` | validator 聚合文件承载过多规则族 |

**建议**

- 将 session adapter 拆出 payload store、user resolver、audit observer、token registrar 等小模块。
- 将 client service 拆为 lifecycle、OIDC、cache sync、session revocation policy。
- 在 session kernel 内拆出 revoker、index builder、tombstone factory、validation runner。
- 前端大页面优先拆 hook、动作组件、表格组件和展示组件。

### 5. 封装变化

**结论**：基本通过。

外部依赖多数由 runtime/composition 集中创建，port/factory/DTO/env 边界较清晰；但 Redis 协议、raw env、审计 action、前端请求策略仍泄漏到多个调用点。

**做得好的地方**

- `apps/api/src/composition/runtime/create-runtime.ts:93` 集中装配 SMS/CAP/Orcas/WeChat。
- `apps/api/src/composition/services/index.ts:39`、`:126` 通过 factory 和 port 注入服务依赖。
- `scripts/check-env-names.ts:185`、`:211` 守护 env 读取边界。
- `packages/db/src/schema/core/clients.ts:119`、`packages/domain/src/client/schema.ts:3` 通过 schema 派生减少手写漂移。

**主要问题**

| 风险 | 位置 | 问题 |
|---|---|---|
| P2 | `apps/api/src/services/client/client.service.ts:10`、`apps/admin-api/src/composition/runtime/create-runtime.ts:77` | `cache:client:*` Redis key、JSON 序列化、code/secret 索引协议在 public API 读侧和 admin-api 写侧重复 |
| P3 | `apps/api/src/composition/runtime/create-runtime.ts:52`、`apps/api/src/composition/routes/index.ts:61`、`apps/api/src/composition/services/index.ts:207` | runtime 暴露完整 `env`，调用方直接读 `runtime.config.env.*` |
| P3 | `packages/contracts/src/audit/actions.ts:236`、`apps/admin-api/src/services/client/client.service.ts:195` | 已有 `AuditActions`，但 admin 审计仍大量传裸字符串 |
| P3 | `apps/admin/src/app.ts:22`、`apps/admin/src/lib/api-client.ts:16`、`apps/sso/src/utils/request.ts:63` | 前端 `Client` header、credentials、401 处理分散 |
| P3 | `apps/api/src/routes/sso/sso.service.ts:187`、`:213` | 微信登录 Redis key、`Processing` 哨兵、TTL、JSON 形状嵌入 SSO service |
| P3 | `apps/api/src/lib/integrations/sms/sms.client.ts:28`、`orcas.client.ts:22`、`wechat.client.ts:27` | 外部 HTTP 客户端各自默认 `fetch`，缺统一 timeout/retry/tracing 策略 |

**建议**

- 抽出共享 `ClientCacheStore` 或 key/serialize/parse helper 到 `packages/api-core`。
- 从 runtime config 中移除公开完整 `env`，改为显式最小配置对象。
- 将审计 action 收紧为 `CanonicalAuditAction` 或统一 `AuditActions`。
- 前端抽共享 `authFetch/requestPolicy`。
- 为微信登录缓存建立 `WechatLoginStateStore` port。
- 后端 runtime 提供统一 `IntegrationHttpClient`。

### 6. 契约清晰

**结论**：有明显问题。

后端有较好的 Zod/OpenAPI/DTO 基础，但已经出现可核查的契约漂移。

**做得好的地方**

- `packages/db/src/schema/core/users.ts:23` 使用 `createSelectSchema` 派生 DB 选择 schema。
- `packages/domain/src/user/schema.ts:5` 基于 DB-derived schema 构造领域 DTO。
- `packages/api-core/src/core/openapi/helpers/common-error-responses.ts:9` 集中定义通用错误响应。
- `apps/admin-api/src/lib/admin-api-adapter.ts:46` 对 admin REST/tRPC 共享同一 Zod input parse。
- `apps/admin/src/lib/api-client.ts:6` 使用 `createTRPCClient<AppRouter>`。

**主要问题**

| 风险 | 位置 | 问题 |
|---|---|---|
| P1 | `apps/api/src/routes/auth/auth.routes.ts:68`、`custom-sso-session-kernel.adapter.ts:335`、`auth.handlers.ts:71` | `/auth/authz` OpenAPI 与实现返回类型不一致 |
| P1 | `packages/api-core/src/http/response.ts:7` | `resp.ok/fail` envelope 返回 `any` |
| P2 | `apps/sso/src/types/api.d.ts:27`、`apps/api/src/routes/public/public.routes.ts:19`、`packages/domain/src/user/schema.ts:17` | SSO 前端 `UserInfo` 手写字段与后端 DTO 漂移 |
| P2 | `apps/api/src/routes/internal/user/user.routes.ts:46` | `/search-with-delegation` 使用 `jsonContent`，文档显示 body 非必填，但业务实际必填 |
| P2 | `apps/api/src/services/user/user.port.ts:69` | port 返回 `Promise<unknown>`，擦除了 `{ users, delegations }` 输出契约 |
| P2 | `apps/api/src/enums/verificationCode.usage.ts:1`、`apps/sso/src/types/api.d.ts:35` | 验证码 usage、人机校验 action 前后端重复手写 |
| P3 | `apps/sso/src/services/open.ts:11`、`:46`、`public.ts:12`、`:19` | 后端 boolean 响应在前端 wrapper 声明为 `request<void>` |
| P3 | `apps/api/src/routes/open/open.routes.ts:110`、`:137` | CAP 成功响应不走 IAM envelope，但缺少显式协议例外说明 |

**建议**

- 定义 `ApiEnvelope<T>` 并泛型化 `ok/fail`。
- 修正 `/auth/authz` 成功 schema 或实现。
- SSO REST 面引入 OpenAPI 生成类型或共享 DTO，减少 `apps/sso/src/types/api.d.ts` 手写契约。
- 将 `VerificationCodeUsage`、`HumanVerificationAction` 移到 `packages/contracts`。
- 将 `/search-with-delegation` body 改为 `jsonContentRequired`。
- 用明确类型替换 `Promise<unknown>`。
- 给 CAP endpoints 增加命名 helper 或注释/测试，标记其非 envelope 响应是协议兼容例外。

### 7. 幂等性

**结论**：有明显问题。

基础设施层有局部幂等保护，但业务 mutation 普遍缺少请求级幂等键，部分先查再插入路径没有数据库约束兜底。

**做得好的地方**

- `packages/api-core/src/uow/unit-of-work.ts:39`、`after-commit.ts:34` 将数据库事务和 afterCommit 分开。
- 用户、客户端、组织、岗位等自然键有唯一约束：`users.ts:10`、`clients.ts:101`、`organizations.ts:9`、`positions.ts:9`。
- 组织闭包表有复合唯一索引，写入使用 `onConflictDoNothing`。
- 用户画像 dirty/read-model 链路有 upsert、版本化 jobId、claim 状态机。
- gateway apply 使用 APISIX `PUT` upsert，并按远端/期望状态 diff 后应用。

**主要问题**

| 风险 | 位置 | 问题 |
|---|---|---|
| P1 | `apps/admin-api/src/services/employment/employment.service.ts:102`、`employment.repository.ts:83`、`packages/db/src/schema/core/employments.ts:24` | 任职创建/转岗先查再插入，缺活跃唯一约束 |
| P1 | `apps/api/src/services/mobile/mobile.service.ts:15`、`user.service.ts:69`、`user-mobile-binding.helper.ts:21` | 验证码先 `DEL` 消费，事务失败后无法重试 |
| P2 | `apps/api/src/services/privilege/privilegeDelegation.service.ts:61`、`privilegeDelegation.repository.ts:102`、`privilege-delegations.ts:20` | 权限委托只靠服务层冲突查询，无唯一/排他约束 |
| P2 | `apps/admin-api/src/services/client/client.service.ts:190`、`:199`、`unit-of-work.ts:47` | 客户端创建 DB commit 后 required cache afterCommit 失败会留下已创建行，重试无法恢复原成功响应 |
| P2 | `apps/api/src/routes/internal/user/user.handlers.ts:113`、`:125` | 联系人注册事务后写审计和发送欢迎短信，重复请求可能重复副作用 |
| P3 | `packages/db/src/schema/log/audit-logs.ts:8`、`:38`、`apps/admin-api/src/services/audit/audit.repository.ts:35` | 审计表 `requestId` 仅普通索引，仓储直接 insert，同请求重放会产生多条审计 |
| P3 | `apps/worker/src/commands/user-profile-backfill.ts:14`、`user-profile-worker.service.ts:181`、`dirty.repository.ts:191` | backfill 重跑会推进 dirtyVersion 并重新入队，最终安全但不是 no-op |

**建议**

- 为 admin/api mutation 增加请求级幂等键：actor + route + method + idempotency-key + body hash。
- 给 employment 增加活跃任职复合唯一约束。
- 权限委托使用 PostgreSQL exclusion constraint 或事务内 advisory lock。
- 验证码消费改为 reserve/confirm。
- 事务后副作用引入 outbox/任务表和确定性 eventId。
- 审计写入增加可选 dedupe key。
- 状态更新和软删除接口对“已是目标状态/已删除”返回幂等成功。

### 8. 可观测性

**结论**：基本通过。

后端和 gateway 已有结构化日志、request id、错误日志、审计链路和测试证据；主要短板在前端错误关联、健康检查、traceId 查询性能和外部集成日志粒度。

**做得好的地方**

- `packages/api-core/src/core/create-app.ts:162` 到 `:167` 统一挂载 requestId、Pino logger、请求日志和错误处理。
- `packages/api-core/src/core/__tests__/create-app.logging.test.ts:34` 到 `:81` 覆盖 requestId 透传与生成。
- `packages/api-core/src/middlewares/error-handler.ts:75` 到 `:116` 结构化记录 REST/OpenAPI 错误。
- `apps/admin-api/src/routes/trpc/trpc.index.ts:73` 到 `:103` 结构化记录 tRPC 错误。
- 审计日志保存 requestId/traceId，并在 admin UI 中展示、复制和跳转 Grafana。
- gateway 有 JSON access log、Prometheus、OpenTelemetry、request-id 插件与校验测试。

**主要问题**

| 风险 | 位置 | 问题 |
|---|---|---|
| P2 | `apps/admin/src/utils/request.ts:4`、`:31`、`apps/sso/src/utils/request.ts:8`、`:95` | 前端 `ServiceError` 只保留 message/code，没有解析 `x-request-id` 或 envelope `data.requestId` |
| P2 | `apps/api/src/composition/routes/index.ts:105`、`apps/admin-api/src/composition/routes/index.ts:64` | API/admin-api 未发现直接 health/metrics 路由 |
| P3 | `packages/db/src/schema/log/audit-logs.ts:21`、`:38`、`apps/admin-api/src/services/audit/audit.repository.ts:80` | 审计表支持 traceId 查询但未给 traceId 建索引 |
| P3 | `apps/admin/src/app.ts:50`、`apps/sso/src/app.ts:10` | 前端初始化错误缺少统一 ErrorBoundary 或全局未捕获异常上报 |
| P3 | `packages/api-core/src/logger/index.ts:70`、`apps/api/src/services/human-verification/cap.service.ts:40`、`apps/api/src/routes/sso/sso.service.ts:81` | integration 事件定义存在，但 CAP/Orcas/Wechat 多为直接 await，外部依赖失败难聚合 |

**建议**

- 扩展前端 `ServiceError`，保留 requestId、traceId、status、data。
- 对 500/未知错误展示可复制 Request ID。
- 给 api/admin-api 增加内部 `/healthz` 或 `/readyz`。
- 为审计表补 `traceId` 或 `(traceId, eventTime)` 索引。
- 给 CAP、Orcas、Wechat、SMS 增加统一 integration logging wrapper。
- 接入前端 ErrorBoundary 和全局未捕获异常上报。

## 跨原则重复热点

### 1. `packages/api-core/src/core/business-op.ts`

同时被 KISS 和 YAGNI 标记。问题不是代码复杂本身，而是它与当前 admin adapter 能力重叠，且抽样未发现业务引用。建议删除或合并为唯一规范路径。

### 2. `gateway/src/validators/index.ts`

同时影响 KISS 和 SRP。该文件承载 source schema、引用校验、安全扫描、trusted proxy、logging policy 等规则，修改局部规则时需要跨越大量无关上下文。建议按规则族拆分。

### 3. `cache:client:*` Redis 协议

同时影响封装变化、幂等性和可维护性。读侧和写侧重复 key、序列化、索引协议，一旦缓存命名或结构变化需要跨 app 同步。建议抽共享 `ClientCacheStore`。

### 4. `packages/domain -> @iam/db/schema`

同时影响高内聚低耦合和契约稳定性。DB-derived schema 能减少手写漂移，但 domain 包直接依赖 db schema 会让领域契约随持久化结构变化。建议至少集中为 schema adapter，并用架构测试守护边界。

### 5. 前端手写 REST 契约

同时影响契约清晰、封装变化和可观测性。SSO 前端 `api.d.ts`、service wrapper、request error 都有漂移风险。建议引入 OpenAPI 生成类型或共享 DTO，并统一错误/requestId 处理。

## 建议整改路线

### 第一阶段：阻断高风险回归

1. 修正 `/auth/authz` OpenAPI 与实现不一致。
2. 泛型化 `ApiEnvelope<T>`，去掉 `resp.ok/fail` 的 `any`。
3. 给 employment 增加活跃唯一约束和冲突处理。
4. 将验证码消费改为 reserve/confirm 或 operationId 模式。
5. 补最小契约测试和并发/重试单测。

### 第二阶段：补关键工程护栏

1. 为 admin/api mutation 设计请求级幂等键。
2. 为事务后副作用设计 outbox 或确定性 eventId。
3. 增加 dependency guard，收紧 `packages/domain -> @iam/db`、handler/adapter 直连 repository 的例外。
4. 补 api/admin-api health/ready 路由。
5. 前端错误对象保留 requestId/traceId，并在错误提示中提供复制入口。

### 第三阶段：收敛复杂度和边界

1. 清理或合并 `business-op.ts`。
2. 拆分 `gateway/src/validators/index.ts`。
3. 抽 `ClientCacheStore` 和 `WechatLoginStateStore`。
4. 将 front-end request policy、401 处理、Client header 统一封装。
5. 清理 deprecated compatibility 字段、拼写错误兼容 alias、未引用 starter 组件。

### 第四阶段：降低长期维护成本

1. 拆分 session adapter、client service、session kernel 等重职责模块。
2. 拆分大前端页面组件和大 repository 文件。
3. 给 CAP 等非标准 envelope 响应建立明确协议例外 helper 和测试。
4. 为外部集成建立统一 logging、timeout、retry wrapper。
5. 为审计 `traceId` 查询增加索引。

## 验证建议

完成修复后，建议至少执行以下验证：

- `pnpm --filter @iam/api typecheck`
- `pnpm --filter @iam/admin-api typecheck`
- `pnpm --filter @iam/domain typecheck`
- 涉及 schema 变更时执行 `pnpm --filter @iam/db db:generate` 或目标环境要求的 Drizzle 校验流程
- 涉及前端契约时执行 `pnpm --filter @iam/sso typecheck` 与 `pnpm --filter @iam/admin typecheck`
- 对 employment 幂等和验证码 reserve/confirm 增加并发/重试单测
- 对 `/auth/authz`、`/internal/users/search-with-delegation` 增加契约测试

## 审查限制

- 本报告来自静态只读审查，未启动服务、未运行测试、未执行 OpenAPI diff。
- 子代理抽样覆盖了主要目录和热点文件，但不是逐行审完整个 monorepo。
- 对仓库外客户端是否依赖 legacy 字段、SSO legacy token、admin REST 旧契约无法确认；相关问题以 P2/P3 处理。
- 幂等性结论未通过并发测试复现，但基于服务层检查和数据库约束缺失可以判断存在真实风险。

## 附录：子代理抽样范围摘要

- 后端应用：`apps/api/src`、`apps/admin-api/src`
- 前端应用：`apps/admin/src`、`apps/sso/src`
- OIDC/worker：`apps/oidc-provider/src`、`apps/worker/src`
- 共享包：`packages/api-core/src`、`packages/contracts/src`、`packages/domain/src`、`packages/db/src`、`packages/user-profile-read-model/src`
- Gateway：`gateway/src`、`gateway/config`
- 搜索模式：`resp.ok/fail`、`createSuccessResponseSchema`、`jsonContent/jsonContentRequired`、`Promise<unknown>`、`any`、`onConflict`、`uniqueIndex`、`afterCommit`、`cache:client`、`runtime.config.env`、`AuditActions`、`requestId`、`traceId`、`health`、`metrics`、`defineQueryOp`、`legacy/deprecated/compat`
