## 1. 数据审计与迁移准备

- [x] 1.1 审查现有 `employment.compId` 与 `employment.orgId` 祖先 Company 的一致性，记录不一致和无 Company 祖先的样例数据。
- [x] 1.2 明确迁移前备份和回滚说明，确保删除 `compId` 前有可恢复数据来源。
- [x] 1.3 确认供应商、外部组织、临时组织没有 Company 祖先时的 `compCode/compName=null` 行为符合调用方预期。

## 2. DB Schema 与 Relations

- [x] 2.1 更新 `packages/db/src/schema/core/employments.ts`，移除 `compId` 字段和 `idx_comp_id`。
- [x] 2.2 更新 `packages/db/src/relations/core/employments.ts`，移除 employment 到 company 的直接 relation。
- [x] 2.3 更新 `packages/db/src/relations/core/organizations.ts`，移除 organization 到 compEmployments 的直接 relation。
- [x] 2.4 生成 Drizzle migration，删除 `employment.comp_id` 和相关 index。
- [x] 2.5 更新或补充 relations 单元测试，验证 employment relations 不再包含 company relation。

## 3. Domain Employment Contract

- [x] 3.1 在 `packages/domain/src/employment/schema.ts` 定义 `EmploymentUserSummarySchema`、`EmploymentPositionSummarySchema`、`EmploymentOrgNodeSchema` 和 `EmploymentOrganizationContextSchema`。
- [x] 3.2 重构 `EmploymentDtoSchema`，加入 `user`、`position`、`organization`，并保留 deprecated 扁平字段。
- [x] 3.3 将 `compCode` 和 `compName` 调整为 nullable，并从 `organization.companyNodes` 中距离 assignedOrg 最近的 Company 节点派生。
- [x] 3.4 更新 `EmploymentDetailDtoSchema`，确保 roles 和 privileges 与新 DTO 结构组合。
- [x] 3.5 更新 `packages/domain/src/employment/employment.type.ts`，从 schema 推导新增 DTO type。
- [x] 3.6 补充或更新 domain mapper 单元测试，覆盖完整组织链、多个 Company 节点、无 Company 节点和 deprecated 字段映射。

## 4. Organization Selector Contract

- [x] 4.1 在 admin organization service schema 中定义 `OrganizationPathNodeSchema`、`OrganizationSelectorNodeSchema` 和 selector 查询输入 schema。
- [x] 4.2 在 organization repository 中实现按 parentOrgCode 懒加载 selector 节点，并为节点批量附加 fullPath 和 pathText。
- [x] 4.3 在 organization repository 中实现按 text 或 orgCode 搜索 selector 节点，并返回可回显 fullPath。
- [x] 4.4 在 organization service、ops、REST routes 和 tRPC router 中暴露 selector 查询能力。
- [x] 4.5 为 organization selector 查询补充单元测试或聚焦 service/repository 测试，覆盖懒加载、搜索回显和 selectable。

## 5. Employment Backend Queries

- [x] 5.1 重写 admin employment repository 的 relation 附加逻辑，批量加载 user、position、assignedOrg 和组织祖先链。
- [x] 5.2 实现从 `organization_closure` 组装 root -> assignedOrg 的 `fullOrgPath`。
- [x] 5.3 实现 `companyNodes` 过滤和 deprecated `compCode/compName` 派生。
- [x] 5.4 将 employment 搜索条件迁移到 `organization?: OrganizationFilter`，支持 exact、subtree 和 company matchMode。
- [x] 5.5 保留 `companyOrgCodes` 和 `deptOrgCodes` 兼容输入，并映射为新的 organization 过滤。
- [x] 5.6 更新 public API employment repository，移除 `compId` 写入和 company relation 读取。
- [x] 5.7 更新 admin API 与 public API 的 role/privilege 聚合调用，确认继续只基于实际任职组织、岗位和任职直接角色。

## 6. Employment Lifecycle Inputs

- [x] 6.1 更新 admin `EmploymentAdminCreateDtoSchema`，新增 `orgCode` 和可选 `expectedAncestorOrgCode`，保留旧 company/dept 字段兼容。
- [x] 6.2 更新 admin `EmploymentTransferDtoSchema`，新增 `newOrgCode` 和可选 `expectedAncestorOrgCode`，保留旧 newCompany/newDept 字段兼容。
- [x] 6.3 在 create service 中解析实际任职组织，执行可选祖先校验，并创建不含 compId 的 employment 记录。
- [x] 6.4 在 transfer service 中解析新实际任职组织，执行可选祖先校验，并创建不含 compId 的新 employment 记录。
- [x] 6.5 更新 internal 供应商联系人注册逻辑，使新 employment 只写入供应商组织和默认岗位。
- [x] 6.6 更新 employment lifecycle 单元测试，覆盖新输入、旧字段兼容、祖先校验失败、不写 compId、主岗和转岗既有规则。

## 7. User Detail 与 Self-Service 聚合

- [x] 7.1 更新 admin user detail 聚合，确保 employments 返回新的 Employment DTO 组织上下文和 deprecated 扁平字段。
- [x] 7.2 更新 public user detail 和 SSO user-info 返回路径，确保 employments 使用相同 Employment DTO 结构。
- [x] 7.3 更新 admin user service 单元测试，验证用户详情 employment detail 包含完整组织链、公司节点和兼容字段。
- [x] 7.4 更新 public user service 或 dto mapper 测试，验证自助详情和供应商 employment 在无 Company 祖先时 `compName=null`。

## 8. Admin Frontend

- [x] 8.1 新增或重构共享 `OrganizationTreeSelector`，使用 selector tRPC 接口支持懒加载、搜索和回显。
- [x] 8.2 更新 employment 搜索表单，使用统一组织树选择器生成 organization filter，并保留旧筛选字段的兼容读取。
- [x] 8.3 更新 employment 创建弹窗，提交 `orgCode` 和可选 `expectedAncestorOrgCode`，不再依赖必填 companyOrgCode 入库。
- [x] 8.4 更新 employment 转岗弹窗，提交 `newOrgCode` 和可选 `expectedAncestorOrgCode`，展示旧任职的组织路径。
- [x] 8.5 更新 employment 列表、详情抽屉和 user detail 任职表格，优先展示 `organization.fullOrgPath` 或 pathText，并以 deprecated 字段作为 fallback。
- [x] 8.6 更新 admin frontend service types，匹配新的 tRPC 输入输出和 nullable `compName/compCode`。

## 9. API Docs 与 Compatibility

- [x] 9.1 更新 OpenAPI schema description，标记 Employment deprecated 扁平字段和旧输入字段。
- [x] 9.2 更新相关 docs 或迁移说明，说明 `compId` 移除、公司由组织链派生、`compCode/compName` nullable。
- [x] 9.3 搜索代码中所有 `compId`、`companyOrgCode`、`newCompanyOrgCode`、`compName` 使用点，确认已迁移或明确保留为兼容字段。

## 10. Validation

- [x] 10.1 运行 `pnpm --filter @iam/db db:generate` 并检查 migration 内容。
- [x] 10.2 运行 `pnpm --filter @iam/domain typecheck`。
- [x] 10.3 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`。
- [x] 10.4 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/api typecheck`。
- [x] 10.5 运行 `pnpm --filter @iam/admin typecheck`。
- [ ] 10.6 Smoke test admin Employment 搜索、详情、创建、转岗、用户详情任职列表。
- [ ] 10.7 Smoke test public `/public/user-info` 和 internal 供应商联系人注册。
