## Why

前五批后端边界迁移已经要求新 use-case 使用 consumer-owned ports，但三个 backend 仍有 production `*.port.ts` 通过 `Pick<Repository>`、`Pick<Service>` 或 repository-owned DTO 定义消费契约。现在统一收敛这些遗留边界，才能让方法与数据 shape 的所有权真正落在消费方，并让 architecture guard 防止同类回退。

## What Changes

- 盘点并迁移 API、Admin API 与 OIDC Provider 中仍派生自 concrete repository/service 的 production ports。
- 由消费方直接声明所需方法签名；共享数据 shape 改由 consumer-owned `*.type.ts`、domain module 或 shared contract 提供。
- 让既有 repository、service 与 composition 通过 TypeScript 结构兼容满足新 ports，不改变 query、write、transaction 或 protocol 行为。
- 为三个 backend 增加 architecture guards，禁止 production `*.port.ts` import `*.repository.ts`，并禁止使用 `Pick<...Repository>` 或 `Pick<...Service>` 定义 port。
- 保持全部 REST/OpenAPI、tRPC、OIDC/SSO、session、Redis、audit、notification 与 profile dirty 契约，以及数据库 schema、workspace dependencies 和部署拓扑不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `backend-functional-di`: 将 consumer-owned port 约束从新建或迁移模块扩展到三个 backend 的 production ports，并要求跨 app architecture guards 阻止 repository/service 派生契约回退。
- `backend-structure-conventions`: 明确 neutral data shape 的合法归属及 port-hardening 迁移后的文件边界与外部契约保持要求。

## Impact

- 影响 `apps/api/src/**/*.port.ts`、`apps/admin-api/src/**/*.port.ts`、`apps/oidc-provider/src/{provider,interaction}/**/*.port.ts` 中盘点出的遗留边界，以及必要的相邻 `*.type.ts`、repository/composition 类型接线。
- 影响三个 backend 的 architecture tests、focused type-level/characterization tests、typecheck、lint 和 full test 验证矩阵。
- 不改变 endpoint、runtime DTO shape、persistence、transaction、数据库或 Redis 行为；不新增 workspace dependency。
