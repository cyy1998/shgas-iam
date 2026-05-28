## Why

Employment DTO 已经提供 `user`、`position` 和 `organization` 结构化字段，旧的顶层扁平字段仍作为 deprecated 兼容层存在，导致 API contract、mapper、测试和前端消费路径同时维护两套表达。现在需要结束迁移期，移除这些兼容字段，让任职数据只通过结构化上下文表达。

## What Changes

- **BREAKING**: 从 `EmploymentDto` 和继承它的 detail/VO 响应中移除顶层扁平兼容字段：`username`、`name`、`mobile`、`wxId`、`posCode`、`posName`、`orgCode`、`orgName`、`orgType`、`compCode`、`compName`。
- 保留并继续要求结构化字段：
  - `user` summary 提供用户信息。
  - `position` summary 提供岗位信息。
  - `organization.assignedOrg`、`organization.fullOrgPath` 和 `organization.companyNodes` 提供组织上下文。
- 更新 Employment DTO mapper、Zod/OpenAPI schema、admin VO mapper、相关服务测试和前端消费代码，避免继续读取或生成这些扁平字段。
- 清理 OpenSpec 中“deprecated 扁平字段保持兼容”的要求，并调整第三方/自助场景中 employment 响应的契约描述。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `employment-management`: 移除 Employment DTO 顶层 deprecated 扁平字段，要求调用方使用结构化字段读取用户、岗位和组织上下文。
- `admin-user-management`: 用户详情中的 employments 不再暴露 Employment DTO 顶层 deprecated 扁平字段。
- `directory-and-self-service`: public/internal 面向第三方或自助场景返回的 employment 信息不再依赖顶层 deprecated 扁平字段。

## Impact

- 影响 `packages/domain/src/employment` 的 `EmploymentDtoSchema`、`EmploymentDetailDtoSchema`、`toEmploymentDto` 和相关单元测试。
- 影响 `apps/admin-api`、`apps/api` 中复用 Employment DTO 的 schema、mapper、OpenAPI/tRPC contract 和测试。
- 影响 `apps/admin` 与 `apps/sso` 中直接读取 employment 顶层扁平字段的页面、组件或服务类型。
- 对仍读取这些顶层字段的外部调用方是 breaking change；迁移路径是改用 `user`、`position` 和 `organization` 结构化字段。
