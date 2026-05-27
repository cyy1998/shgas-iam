## Why

当前 `employment` 同时保存 `orgId/dept_id` 与 `compId`，但公司可以从任职组织的组织树祖先链派生；两份组织事实会产生公司与部门不一致的脏状态。与此同时，现有 Employment DTO/VO 只返回扁平 `compName/orgName` 字段，无法表达完整公司组织链，也让 admin 查询中的公司/部门筛选长期停留在成对字段模型。

本变更将 Employment 的组织语义收敛为“任职绑定实际组织，组织链由组织树派生”，并为现有第三方调用方保留迁移期兼容字段。

## What Changes

- **BREAKING**: 数据模型目标态移除 `employment.compId`，Employment 只持久化实际任职组织 `orgId`。
- 重设计 Employment DTO/VO：
  - 增加结构化 `user`、`position` summary。
  - 增加结构化 `organization` 上下文，包含 `assignedOrg`、`fullOrgPath` 和 `companyNodes`。
  - 新增 schema 均以 Zod schema 为来源，并通过 `z.infer` 导出 TypeScript type。
  - 保留当前扁平字段 `username/name/mobile/wxId/posCode/posName/orgCode/orgName/orgType/compCode/compName` 作为 deprecated 兼容字段。
- 调整 Employment 创建与转岗输入，后端只写入实际任职组织；公司选择仅作为前端筛选或可选祖先校验，不再入库。
- 统一 admin 中涉及组织的筛选语义，提供可复用组织树选择 contract，并让 Employment 查询使用组织筛选对象而不是长期依赖 `companyOrgCodes + deptOrgCodes`。
- 保持既有第三方和前端在迁移期仍可读取 deprecated 扁平字段；`compCode/compName` 由组织链派生，无法解析公司时返回 `null`。
- 不改变现有授权模型：角色/权限继续基于 Employment 的实际任职组织、岗位和直接任职关系聚合。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `employment-management`: 调整 Employment 数据模型、DTO/VO contract、创建/转岗输入和组织筛选查询语义。
- `organization-management`: 补充 admin 可复用组织树选择 contract，统一组织筛选、搜索回显和懒加载节点形状。
- `admin-user-management`: 用户详情中的 employments 使用新的 Employment 组织上下文 contract，并保留 deprecated 兼容字段。
- `directory-and-self-service`: public/internal 面向第三方或自助场景返回的 employment 信息保持兼容字段，同时支持由组织链派生公司信息。

## Impact

- 影响数据库 schema、Drizzle migrations、`packages/db` schema/relations 和历史数据迁移。
- 影响 `packages/domain/src/employment` 的 schema、mapper 和 type 导出。
- 影响 `apps/admin-api` 与 `apps/api` 的 employment repository/service/schema、user detail 聚合和 OpenAPI/tRPC contract。
- 影响 `apps/admin` 中 Employment 列表、创建、转岗、用户详情任职列表，以及可复用组织树选择组件。
- 影响 `apps/sso` 与第三方调用方对 deprecated 扁平 employment 字段的迁移计划。
- 不引入新的外部依赖，不改变权限聚合来源。
