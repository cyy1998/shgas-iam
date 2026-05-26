## 1. Domain Type Exports

- [x] 1.1 为 `packages/domain/src/client` 新增 `client.type.ts`，从 `ClientDtoSchema` 推导并导出 `ClientDto`。
- [x] 1.2 为 `packages/domain/src/organization` 新增 `organization.type.ts`，从稳定 schema 推导并导出 `Organization`、`OrganizationDetail`、`OrganizationDto`、`OrganizationCreateDto`、`OrganizationUpdateDto`。
- [x] 1.3 为 `packages/domain/src/employment` 新增 `employment.type.ts`，从稳定 schema 推导并导出 `Employment`、`EmploymentDetail`、`EmploymentDto`、`EmploymentDetailDto`。
- [x] 1.4 为 `packages/domain/src/user` 新增 `user.type.ts`，从稳定 schema 推导并导出 `User`、`UserDto`、`UserDetailDto`、`UserCreateDto`。
- [x] 1.5 为 `packages/domain/src/position` 新增 `position.type.ts`，从稳定 schema 推导并导出 `PositionDto` 和 `Position`。
- [x] 1.6 为 `packages/domain/src/privilege` 新增 `privilege.type.ts`，从 `PrivilegeDtoSchema` 推导并导出 `PrivilegeDto`。
- [x] 1.7 更新各 domain 子模块 `index.ts`，同时导出 `schema.ts` 与对应 `.type.ts`。

## 2. App Type Cleanup

- [x] 2.1 审查 `apps/admin-api/src/services/*/*.type.ts` 中通过 domain schema 重复推导的稳定 DTO type。
- [x] 2.2 将稳定 DTO type 改为从 `@iam/domain/<domain>` 导入，保留 admin 专属分页查询、创建、更新、状态变更等 type 在 app 内。
- [x] 2.3 确认 route 层 `Vo`、`RouteHandler` 和展示聚合类型仍留在对应 app route `.type.ts` 中。
- [x] 2.4 搜索仓库中其他直接通过 `@iam/domain` schema 推导稳定 DTO type 的位置，并按同一边界迁移。

## 3. Validation

- [x] 3.1 运行 `pnpm --filter @iam/domain typecheck` 验证 domain type 导出。
- [x] 3.2 运行 `pnpm --filter @iam/admin-api typecheck` 验证 app 侧导入迁移。
- [x] 3.3 运行相关 lint 或更窄检查，确认 type-only import 与导出风格符合现有配置。
- [x] 3.4 确认本变更未改变 DTO schema 字段、OpenAPI schema 名称、mapper 输出和 API 响应结构。
