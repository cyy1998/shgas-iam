## Context

`client-registry` 目前已经定义 client 数据结构、公共读取逻辑和管理端 create/update REST 接口。现有 `admin-api` 的 user、position、organization、employment 管理域已经形成稳定模式：service/repository 负责领域行为，`routes/admin/<domain>/*.ops.ts` 作为 REST 和 tRPC 的共享业务入口，REST handlers 与 tRPC router 保持薄封装。`admin` 前端也已通过 `@iam/admin-api/trpc` 类型推导封装 service，并使用 ProTable、ProForm、Drawer/Modal 组成管理页面。

本变更跨越 `apps/admin`、`apps/admin-api`、`packages/contracts`，并涉及 clientSecret 缓存一致性，因此需要在实现前明确接口形态、缓存策略和 UI 范围。

## Goals / Non-Goals

**Goals:**
- 在 `admin-api` 中为 client 补齐分页搜索、详情、新建、编辑、状态更新、软删除能力。
- 通过同一组 `client.ops.ts` 同时暴露 REST 与 tRPC，保持现有管理域风格一致。
- 在 `admin` 中新增 client 管理页面，支持管理员完成常规 client 配置维护。
- 更新 clientCode 或 clientSecret 时清理旧 Redis key，避免旧标识或旧凭据继续通过缓存生效。
- 增加足够的 service/unit/typecheck 验证，覆盖关键缓存和接口行为。

**Non-Goals:**
- 不重命名已有 `ClientStatus.Maintance` 枚举成员，避免扩大枚举兼容性影响；页面文案可显示为“维护中”。
- 不改变公共 `/open/client/status`、SSO、auth 路由的外部契约。
- 不引入新的密钥加密、脱敏存储或密钥轮换审批流程；这些属于后续安全治理。
- 不修改 PostgreSQL client 表结构，不生成 Drizzle migration。

## Decisions

### 1. client 管理域沿用 `ops` 作为 REST/tRPC 共享入口

实现新增 `apps/admin-api/src/routes/admin/client/client.ops.ts`，将 search/detail/create/update/updateStatus/delete 定义为 `defineQueryOp` 或 `defineMutationOp`。REST handlers 调用 `op.run()`，tRPC router 调用 `op.toTRPC()`。

理由：这与 position/user 等域一致，可以避免 REST 和 tRPC 分别实现业务逻辑导致行为漂移。

备选方案：直接在 handlers 与 tRPC router 中分别调用 service。该方案短期更少文件，但会重复入参拼装、错误映射和响应语义，不采用。

### 2. 管理端主键使用 `clientCode`，更新入参拆成 path code + body data

REST 采用：
- `POST /admin/clients/search`
- `GET /admin/clients/:clientCode`
- `POST /admin/clients`
- `PUT /admin/clients/:clientCode`
- `PATCH /admin/clients/:clientCode/status`
- `DELETE /admin/clients/:clientCode`

tRPC 采用 `admin.client.search/detail/create/update/updateStatus/delete`。`update` 输入为 `{ clientCode, data }`，允许 `data.clientCode` 作为重命名目标；service 负责判断新旧 code 是否冲突。

理由：页面和外部调用更自然地以稳定业务编码定位 client，且与 position 的 `posCode` 管理模式一致。

备选方案：继续按 `id` 更新。该方案贴近现有 create/update 代码，但 UI 和 API 可读性较弱，也不利于 REST path 语义统一，不采用。

### 3. 搜索先做数据库分页，避免在内存中分页

repository 增加 `searchClientsPaged`，按 `isDelete = false` 过滤，支持：
- fuzzy: `clientCode`、`clientName`、`url`、`description`
- exact: `statuses`、`managementLevels`

返回 `{ rows, total }`，service/ops 组装 `pageNum/pageSize/pages/result`。

理由：client 数量可能不大，但管理列表应与 user/employment 的数据库分页方式靠拢，避免未来数据量增长时需要再改接口契约。

备选方案：像当前 position 一样先查全量再 `paginate()`。实现更快，但会把性能限制写进新接口，不采用。

### 4. 更新缓存时显式删除旧 code/secret key

`updateClient` 在事务内读取旧 client，校验存在和唯一性，更新数据库后得到新 client。事务成功后按旧值和新值做缓存同步：
- 若旧 `clientCode` 与新 `clientCode` 不同，删除旧 `cache:client:code:<old>`。
- 若旧 `clientSecret` 与新 `clientSecret` 不同，删除旧 `cache:client:secret:<old>`。
- 写入新 `cache:client:code:<new>` 与 `cache:client:secret:<new>`。

删除、状态更新和普通更新复用同一缓存同步策略；软删除后删除当前 code/secret key。

理由：读取侧优先查 Redis，如果旧 key 不删除，旧 clientCode 或旧 clientSecret 可能继续生效。

备选方案：给缓存加 TTL 等待自然过期。该方案仍有窗口期，且当前 key 未设置 TTL；对凭据场景不够可靠，不采用。

### 5. admin 页面复用现有管理页组件语言

新增 `apps/admin/src/pages/clients/index.tsx` 和必要组件。列表使用 ProTable，表单使用 ModalForm，详情可使用 Drawer 或 ProDescriptions。service 通过 `apiClient.admin.client.*` 做 tRPC 调用并导出推导类型。

字段处理：
- `validRedirectUrls`、`userExcluding` 在表单中以多行文本或可增删列表输入，提交前转换为 string array。
- `requireOrcas` 使用 switch。
- `managementLevel`、`status` 使用 Select。
- `clientSecret` 创建时必填，编辑时允许修改但需要明确字段展示和提交。

理由：沿用现有页面体验，减少认知差异，并保持前端类型来自 admin-api。

备选方案：只做 REST 调用页面。该方案会丢失 tRPC 类型联动，不符合当前 admin 的服务封装模式，不采用。

## Risks / Trade-offs

- [Risk] clientSecret 在管理页面可见或可编辑可能带来泄漏风险。→ Mitigation: 本次保持现有 schema 能力但在 UI 上避免不必要的列表展示，详情/编辑中按管理需要展示；后续可单独设计密钥脱敏和轮换流程。
- [Risk] 软删除或禁用 client 后，运行中会话是否立即失效当前没有统一要求。→ Mitigation: 本次只保证 client 配置缓存失效；现有 session 生命周期和 auth 行为不额外改变。
- [Risk] 修改 clientCode 可能影响已有外部系统配置。→ Mitigation: 更新接口允许重命名，但 UI 在编辑时可保守禁用 clientCode 或增加确认；若实现选择允许修改，必须同步清理旧缓存。
- [Risk] `ClientStatus.Maintance` 拼写错误延续。→ Mitigation: 不改枚举成员，避免破坏现有导入；只补 helper 文案。
- [Risk] REST 路径从 `/create`、`/update` 扩展到资源式路径后存在并存期。→ Mitigation: 新增资源式路径并可保留旧路径兼容，最终以新路径和 tRPC 为页面入口。
