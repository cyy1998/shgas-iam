## Why

当前 client 注册表已有数据库结构、部分 REST 创建/更新能力和公共读取能力，但缺少管理端完整页面与统一的 REST/tRPC 管理接口。管理员无法在 `admin` 中检索、查看、维护 client 配置，且更新 clientCode/clientSecret 时旧 Redis 缓存 key 未清理，可能导致旧凭据继续命中缓存。

## What Changes

- 在 `admin` 增加 client 管理页面，支持列表查询、状态筛选、详情查看、新建、编辑、状态变更和软删除。
- 在 `admin-api` 补齐 client 管理域的 REST 与 tRPC 能力，并与现有 user/position 等管理域保持 `ops` 复用模式。
- 为 client 查询增加分页搜索、详情读取、按 clientCode 更新、状态更新和软删除能力。
- 调整 client 更新缓存策略：当 clientCode 或 clientSecret 发生变化时删除旧 `cache:client:code:*` 与 `cache:client:secret:*` key，再写入新缓存。
- 增加必要的类型、schema、前端 service 封装和回归测试。

## Capabilities

### New Capabilities

### Modified Capabilities
- `client-registry`: 扩展管理端 client registry 能力，从仅支持创建/更新升级为可通过 admin 页面、REST 和 tRPC 完成常规 client 管理，并要求更新时清理旧缓存 key。

## Impact

- `apps/admin`: 新增 client 管理页面、表单/详情组件、service 封装、路由菜单入口，并复用现有 ProTable/ProForm 管理页风格。
- `apps/admin-api`: 补齐 `routes/admin/client` 的 `ops`、REST handlers/routes、tRPC router，扩展 client service/repository/schema/type。
- `apps/api`: 不改变公共读取接口契约，但会受益于更可靠的 Redis client 缓存一致性。
- `packages/contracts`: 如需要页面展示状态/管理模式选项，将补齐 client 状态与管理模式 option helper。
- `packages/db`: 预计不需要 schema 或 migration 变更。
- 测试影响：需要覆盖 client service 缓存清理、管理接口操作和前端类型消费路径的 typecheck。
