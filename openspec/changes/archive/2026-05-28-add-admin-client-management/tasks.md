## 1. 后端契约与共享枚举

- [x] 1.1 为 `packages/contracts` 补齐 client status 和 managementLevel 的页面选项 helper，并保持现有枚举值不变。
- [x] 1.2 扩展 `apps/admin-api/src/services/client/client.schema.ts`，增加分页查询、更新、状态更新所需 schema。
- [x] 1.3 扩展 `apps/admin-api/src/services/client/client.type.ts`，导出分页查询、创建、更新、详情等类型。

## 2. client 服务与缓存一致性

- [x] 2.1 在 `client.repository.ts` 增加按 clientCode 查询未软删除记录、分页搜索、按 clientCode 更新、状态更新和软删除方法。
- [x] 2.2 在 `client.service.ts` 增加 search/detail/create/update/updateStatus/delete 领域方法，并统一处理不存在、重复 clientCode 等错误。
- [x] 2.3 调整 client 更新缓存策略，更新前读取旧 client，更新成功后删除旧 code/secret key 并写入新 code/secret key。
- [x] 2.4 调整 client 删除缓存策略，软删除成功后删除当前 code/secret key。
- [x] 2.5 增加 client service 单元测试，覆盖搜索、详情、状态更新、软删除、更新 clientCode/clientSecret 后旧 Redis key 清理。

## 3. admin-api REST 与 tRPC

- [x] 3.1 新增 `routes/admin/client/client.ops.ts`，用 `defineQueryOp`/`defineMutationOp` 定义 search/detail/create/update/updateStatus/delete。
- [x] 3.2 更新 `client.routes.ts` 为资源式 REST 路径，提供 search/detail/create/update/updateStatus/delete OpenAPI route。
- [x] 3.3 更新 `client.handlers.ts` 和 `client.index.ts`，让 REST handlers 通过 `ops.run()` 调用共享业务操作，并按需保留旧 `/create`、`/update` 兼容入口。
- [x] 3.4 新增 `client.trpc.ts` 并在 `trpc/routers/admin/index.ts` 注册 `admin.client` router。
- [x] 3.5 补充 admin client route/mapper 测试或最小回归测试，确认 REST 和 tRPC 共享同一输入输出语义。

## 4. admin 前端页面

- [x] 4.1 新增 `apps/admin/src/services/client.ts`，通过 `AppRouter` 推导 client 输入输出类型并封装 tRPC 调用。
- [x] 4.2 新增 client 管理页面入口和路由菜单配置，页面路径使用 `/clients`。
- [x] 4.3 实现 `clients/index.tsx`，使用 ProTable 展示 client 列表、分页、关键字搜索、状态筛选、管理模式筛选和操作列。
- [x] 4.4 实现 client 表单组件，支持新建和编辑基础字段、status、managementLevel、requireOrcas、validRedirectUrls、userExcluding、logoutEndpoint、callbackEndpoint。
- [x] 4.5 实现 client 详情或编辑前加载逻辑，确保编辑表单使用最新详情数据并在成功后刷新列表。
- [x] 4.6 实现页面状态变更和删除确认交互，成功后刷新列表，失败时展示错误信息。

## 5. 验证与收尾

- [x] 5.1 运行 `pnpm --filter @iam/admin-api test`，确认后端测试通过。
- [x] 5.2 运行 `pnpm --filter @iam/admin-api typecheck`，确认 admin-api 类型通过。
- [x] 5.3 运行 `pnpm --filter @iam/admin typecheck`，确认 admin 前端和 tRPC 类型消费通过。
- [x] 5.4 运行相关 lint 命令或记录无法运行的原因。
- [x] 5.5 手动检查 OpenSpec 任务与实现一致性，并在完成后更新任务勾选状态。
