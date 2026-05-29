## Context

上一轮 Employment 组织上下文规范化已经在 `EmploymentDto` 中引入 `user`、`position` 和 `organization`，同时为了迁移保留了顶层 deprecated 扁平字段。当前 `packages/domain/src/employment/schema.ts` 的 `EmploymentDtoSchema` 仍声明这些字段，`toEmploymentDto` 也会从结构化字段派生并回填它们；admin VO、public/internal user detail 和前端页面会继承或读取这些旧字段。

本变更是 API contract 清理，不涉及 Drizzle schema、PostgreSQL 数据迁移或组织树派生逻辑变化。

## Goals / Non-Goals

**Goals:**

- 从 Employment DTO、detail DTO、admin VO 和 OpenAPI/tRPC contract 中移除顶层 `username/name/mobile/wxId/posCode/posName/orgCode/orgName/orgType/compCode/compName`。
- 让 mapper 只输出 `user`、`position`、`organization` 结构化字段以及 employment 自身字段。
- 更新 admin 与 SSO 前端中读取 employment 顶层扁平字段的展示逻辑，改用结构化路径。
- 用单元测试或 typecheck 覆盖字段移除后的 contract。

**Non-Goals:**

- 不改变 `employment` 表结构、组织闭包表、公司节点派生规则或查询筛选语义。
- 不移除创建/转岗输入中的 `username`、`posCode`、`orgCode` 等请求字段；这些是输入标识符，不属于 Employment DTO 响应兼容字段。
- 不改变 User DTO 自身的 `username/name/mobile/wxId` 字段。

## Decisions

1. 在 domain DTO 层移除字段，而不是只在具体 route/VO 层过滤。

   `EmploymentDtoSchema` 是 `apps/api`、`apps/admin-api`、user detail 聚合和前端类型的共同来源。如果只在某个 route 层隐藏字段，其他复用路径仍会继续暴露旧 contract。直接收敛 domain schema 可以让 OpenAPI、tRPC 推导、mapper 返回值和测试保持一致。

2. 保留结构化字段名称与内容不变。

   调用方迁移路径保持简单：用户信息读取 `employment.user.*`，岗位信息读取 `employment.position.*`，实际任职组织读取 `employment.organization.assignedOrg.*`，组织路径和公司节点读取 `employment.organization.fullOrgPath` / `employment.organization.companyNodes`。

3. admin VO 只继续附加展示字段。

   `EmploymentVoSchema` 和 `EmploymentDetailVoSchema` 继续基于 DTO 扩展 `statusText`、`roles`、`privileges` 等 admin 展示字段，不重新定义或回填旧扁平字段。页面展示需要在组件层由结构化字段计算姓名、岗位、组织路径和公司展示文本。

4. 测试验证“没有旧字段”，而不是验证旧字段为 `undefined`。

   旧字段应从对象 contract 中消失。测试应使用 `not.toHaveProperty` 或等价断言，避免实现仍保留键但值为空时误判通过。

## Risks / Trade-offs

- [Risk] 外部调用方仍读取顶层字段会在升级后取不到数据。 → Mitigation: 在 proposal、spec 和发布说明中标记为 **BREAKING**，明确结构化字段迁移路径。
- [Risk] 前端列表、抽屉、SSO 用户信息页面存在零散 fallback 到 `row.orgName`、`detail.name` 的代码。 → Mitigation: 实现时用 `rg` 全量搜索 affected apps 中对 employment 扁平字段的读取，并用 typecheck 验证。
- [Risk] OpenAPI schema 移除字段后，快照或 DTO mapper 测试仍按旧字段断言。 → Mitigation: 同步更新 domain、api、admin-api 的 mapper 测试，并新增字段不存在断言。
