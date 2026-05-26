## Why

领域稳定 DTO 目前已经在 `packages/domain` 中逐步沉淀为 schema，但对应 TypeScript 类型仍分散在具体 app 或 service 层通过 `z.infer` 重复定义。这样会让运行时契约和编译期契约分离，增加跨 app 复用、重命名和迁移时的维护成本。

本变更将领域稳定 DTO 的类型定义收拢到领域包自身，并要求类型定义放在独立 `.type.ts` 文件中，使 `packages/domain` 同时成为 DTO schema 与 DTO type 的统一来源。

## What Changes

- 在 `packages/domain/src/<domain>/` 下为领域稳定 DTO 增加独立 `<domain>.type.ts` 文件。
- 从对应 `schema.ts` 中导出的稳定 DTO schema 推导并导出同名或语义一致的 TypeScript 类型。
- 更新 domain 子模块 `index.ts` 和根 `packages/domain/src/index.ts` 导出，让 app 可直接从 `@iam/domain/<domain>` 消费 DTO schema 与 type。
- 调整 app/service 层中重复定义的领域稳定 DTO type，改为从 `@iam/domain` 导入。
- 保留 app 专属类型在 app 内定义，例如 admin 查询 DTO、admin create/update DTO、VO、RouteHandler。
- 不改变 DTO schema 的运行时校验逻辑、OpenAPI schema 名称或 API 响应结构。

## Capabilities

### New Capabilities

- `domain-dto-type-contracts`: 规定领域稳定 DTO 的 schema 与 TypeScript type 在 `packages/domain` 中共同维护，并通过独立 `.type.ts` 文件导出给各 app 使用。

### Modified Capabilities

- 无。

## Impact

- 主要影响 `packages/domain/src/*` 的文件结构与导出。
- 影响 `apps/admin-api/src/services/*/*.type.ts` 中对领域稳定 DTO 的引用方式。
- 可能影响其他 app 或 package 中直接通过 domain schema 执行 `z.infer` 的代码。
- 不引入数据库迁移、不改变 REST/tRPC API 行为、不改变前端展示行为。
