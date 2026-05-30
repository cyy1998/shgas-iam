## 1. Adapter Helper

- [x] 1.1 梳理 `apps/admin-api/src/routes/admin/{user,position,organization,employment,client,audit}` 的现有 `handlers.ts`、`trpc.ts`、`ops.ts` 重复模式，统一定义 helper 需要支持的输入组装、上下文传递和输出包装能力。
- [x] 1.2 在 `apps/admin-api/src/lib/` 新增 admin REST/tRPC adapter helper，支持 query/mutation、Zod 输入 schema、REST 输入组装、可选上下文传递和 service handler。
- [x] 1.3 让 helper 的 REST 路径继续返回 `resp.ok` envelope，并让 tRPC 路径继续复用现有 tRPC 错误映射。
- [x] 1.4 为 helper 添加 focused tests，覆盖 query、mutation、REST param/body 合并、上下文传递和 tRPC 错误映射。

## 2. Module Migration

- [x] 2.1 迁移 `user` 模块到新 helper，保持其 REST route、tRPC router key、audit context 传递和 password 相关行为等价。
- [x] 2.2 迁移 `position` 模块到新 helper，保持其 REST route、tRPC router key 和 status/update/delete 语义等价。
- [x] 2.3 迁移 `organization` 模块到新 helper，保持其 REST route、tRPC router key、children/selector 查询和状态变更语义等价。
- [x] 2.4 迁移 `employment` 模块到新 helper，保持其 REST route、tRPC router key、transfer/set-primary/resign 等语义等价。
- [x] 2.5 迁移 `client` 模块到新 helper，保持其 REST route、tRPC router key、ID/code 更新路径和状态变更语义等价。
- [x] 2.6 迁移 `audit` 模块到新 helper，保持其 REST route、tRPC router key 和日志查询语义等价。
- [x] 2.7 移除或简化各模块中仅做透传的旧 `*.ops.ts` 结构，复杂复用逻辑若仍保留则必须有明确的跨入口职责。

## 3. Compatibility And Documentation

- [x] 3.1 记录新 helper 的适用边界：简单 CRUD 使用 helper，复杂 REST/tRPC 复用继续允许显式 `*.ops.ts`。
- [x] 3.2 确认所有当前 admin 双入口模块都已切换到统一 adapter 体系，不再保留“只迁移一部分模块”的中间状态。
- [x] 3.3 确认迁移不改变 REST 路径、HTTP method、请求/响应 schema、tRPC router key 或业务返回语义。

## 4. Verification

- [x] 4.1 运行迁移后各模块相关测试和新增 helper 测试。
- [x] 4.2 运行 `pnpm --filter @iam/admin-api typecheck`。
- [x] 4.3 如迁移影响 tRPC 类型被 admin frontend 消费，运行 `pnpm --filter @iam/admin typecheck`。
- [x] 4.4 视改动范围运行 `pnpm --filter @iam/admin-api lint`。
