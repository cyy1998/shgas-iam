## Context

`employment` 当前持久化 `orgId/dept_id` 与 `compId` 两个组织引用。`orgId` 是任职实际组织，`compId` 是公司组织；但组织表已经通过 `organization_closure` 维护祖先链，公司可以从 `orgId` 的祖先链中派生。现状会允许 `compId` 与 `orgId` 所属组织树不一致，并且 Employment DTO 只能返回扁平公司/部门字段，无法给前端或第三方提供完整组织链。

本仓库已经有 `packages/domain` 作为稳定 DTO schema 与 type 的来源，`define-domain-dto-types` 变更也明确了 `schema.ts` 与 `.type.ts` 的职责分离。本设计沿用该分层：稳定 Employment DTO schema/type 放在 `packages/domain/src/employment`，admin 专属查询输入和 VO 仍留在对应 app。

## Goals / Non-Goals

**Goals:**

- 将 Employment 持久化模型收敛为只保存实际任职组织 `orgId`，目标态移除 `compId`。
- 为 Employment DTO 提供结构化 `user`、`position` 和 `organization` 上下文。
- 在 `organization` 上下文中返回 `assignedOrg`、`fullOrgPath`、`companyNodes`，不暴露 `primaryCompany`、`companyOrgPath` 或 `resolution`。
- 保留当前扁平字段作为 deprecated 兼容字段，支持现有第三方和前端平滑迁移。
- 统一 admin 组织筛选语义，提供可复用组织树选择 contract，并让 Employment 查询使用同一组织筛选模型。
- 保持权限聚合继续基于实际任职组织、岗位和任职直接角色，不改变授权语义。

**Non-Goals:**

- 不支持 Employment 保存历史公司快照；公司信息由当前组织树派生。
- 不在本变更中实现组织树移动、闭包表重建或历史组织版本化。
- 不强制所有 admin 业务接口返回完整组织树；业务查询只接收统一组织筛选输入。
- 不移除 deprecated 扁平字段；移除计划应由后续独立变更处理。
- 不重做 HR 审批流、离职流、岗位模型或权限模型。

## Decisions

### Decision: Employment 只持久化实际任职组织

`employment` 目标态移除 `compId` 与 `idx_comp_id`，只保存 `orgId` 作为实际任职组织。公司相关展示、筛选和兼容字段全部从 `organization_closure` 与 `organizations` 派生。

备选方案是保留 `compId` 并在创建/转岗时校验公司与部门一致。该方案能保留历史快照，但仍然维护两份组织事实，后续组织树调整时仍会产生语义分歧。本变更选择派生模型，使 Employment 的事实来源更单一。

### Decision: 组织上下文返回完整链，不返回主公司便利字段

Employment DTO 使用以下稳定结构：

```ts
EmploymentDto
├─ user: EmploymentUserSummary
├─ position: EmploymentPositionSummary
└─ organization: EmploymentOrganizationContext
   ├─ assignedOrg
   ├─ fullOrgPath
   └─ companyNodes
```

`fullOrgPath` 按 root -> assignedOrg 排序。每个节点包含 `pathIndex` 与 `distanceToAssignedOrg`，调用方可以自行选择最近公司、根公司或完整路径展示。`companyNodes` 是 `fullOrgPath` 中 `orgType=OrganizationType.Company` 的节点列表，也按 root -> assignedOrg 顺序返回。

不返回 `primaryCompany`、`companyOrgPath` 或 `resolution`。这些字段属于展示或诊断便利，不应固化为领域 contract。

### Decision: deprecated 扁平字段保留但从新模型派生

`EmploymentDtoSchema` 继续包含以下兼容字段：

```ts
username, name, mobile, wxId,
posCode, posName,
orgCode, orgName, orgType,
compCode, compName
```

这些字段标记为 deprecated。`orgCode/orgName/orgType` 来自 `organization.assignedOrg`；`compCode/compName` 为兼容旧调用方，从 `companyNodes` 中距离 assignedOrg 最近的 Company 节点派生。由于正式结构不暴露 `primaryCompany`，该选择只用于 legacy 字段映射；如果 `companyNodes` 为空，`compCode/compName` 返回 `null`。

### Decision: Zod schema 是 DTO 与 VO 的结构来源

新增的 `EmploymentUserSummarySchema`、`EmploymentPositionSummarySchema`、`EmploymentOrgNodeSchema`、`EmploymentOrganizationContextSchema`、`EmploymentDtoSchema` 和 `EmploymentDetailDtoSchema` 都定义为 Zod schema。对应 TypeScript type 在 `packages/domain/src/employment/employment.type.ts` 中由 `z.infer` 推导。

`EmploymentVoSchema` 和 `EmploymentDetailVoSchema` 留在 `apps/admin-api/src/routes/admin/employment`，只增加 admin 展示字段，例如状态文本和组织路径文本。VO 不作为跨 app 稳定领域 contract。

### Decision: 组织链查询在 repository 层批量组装

Employment 查询结果需要批量补齐用户、岗位和组织上下文。repository 应按分页结果或用户任职集合一次性收集 `orgId`，通过闭包表查询这些任职组织的祖先链，并按任职 id 组装：

- `assignedOrg`: `employment.orgId` 对应组织。
- `fullOrgPath`: 祖先链加自身，按 depth 从远到近或按 `pathIndex` 规范化为 root -> assignedOrg。
- `companyNodes`: 从 `fullOrgPath` 过滤 Company。

这避免在列表页为每条 Employment 逐条查询组织链。若组织链缺失或 assignedOrg 已软删除，查询应遵循现有“未软删除 employment 必须能映射出关联数据”的行为，避免返回半结构化脏 DTO。

### Decision: admin 统一组织筛选输入，不把完整树塞进业务查询

admin 前端使用可复用 `OrganizationTreeSelector` 组件处理树形选择、搜索、回显和懒加载。后端提供统一 selector 节点 contract，例如：

```ts
OrganizationSelectorNode
├─ id
├─ orgCode
├─ orgName
├─ orgType
├─ status
├─ level
├─ parentId
├─ isLeaf
├─ fullPath
├─ pathText
└─ selectable
```

业务查询接口接收统一组织筛选对象，而不是每个业务自行维护 `companyOrgCode + deptOrgCode`：

```ts
OrganizationFilter
├─ orgCodes?: string[]
├─ matchMode: "exact" | "subtree" | "company"
└─ orgTypes?: OrganizationType[]
```

Employment 查询迁移为 `organization?: OrganizationFilter`。迁移期保留 `companyOrgCodes` 和 `deptOrgCodes`，服务层映射为：

- `deptOrgCodes` -> `organization.matchMode="exact"`
- `companyOrgCodes` -> `organization.matchMode="company"`

### Decision: 创建与转岗只写入实际任职组织

Employment 创建输入使用 `orgCode` 表示实际任职组织，转岗输入使用 `newOrgCode`。前端仍可通过组织树选择公司/部门，但后端只持久化实际任职组织。

为避免客户端选择错配，可支持可选 `expectedAncestorOrgCode`。当传入该字段时，后端 SHALL 校验 `orgCode/newOrgCode` 位于该祖先组织的子树内；校验失败时拒绝创建或转岗。该字段不入库。

## Risks / Trade-offs

- [Risk] 历史任职的公司会随组织树变化而变化。→ Mitigation: 本变更明确不保存历史公司快照；如业务需要历史快照，应后续引入组织版本或 employment snapshot。
- [Risk] 现有数据中 `compId` 与 `orgId` 祖先链不一致，删除 `compId` 后旧公司信息无法恢复。→ Mitigation: 迁移前执行数据审计，列出不一致记录并人工确认修复策略。
- [Risk] 外部组织或临时组织没有 Company 祖先，旧 `compName` 调用方可能收到 `null`。→ Mitigation: 保留完整 `organization.fullOrgPath` 和 `companyNodes`，并在 API 说明中标记 `compCode/compName` nullable/deprecated。
- [Risk] Employment 列表批量组装组织链可能增加查询复杂度。→ Mitigation: 使用闭包表按 orgIds 批量查询并在内存分组；避免 N+1 查询。
- [Risk] 前端多个页面同时迁移组织筛选组件，容易出现 UX 不一致。→ Mitigation: 先实现共享 `OrganizationTreeSelector` 与统一服务包装，再逐页替换。
- [Risk] deprecated 字段长期保留会让调用方继续依赖旧模型。→ Mitigation: 在 schema 注释、OpenAPI description 和迁移文档中明确 deprecated，后续单独规划移除时间。

## Migration Plan

1. 增加新的 Employment 组织上下文 schema、mapper 和批量查询组装逻辑，同时保留旧字段输出。
2. 增加 admin 组织 selector contract 与前端共享树选择组件。
3. 调整 Employment 查询、创建、转岗输入，保留旧 `companyOrgCodes/deptOrgCodes/companyOrgCode/deptOrgCode/newCompanyOrgCode/newDeptOrgCode` 的兼容映射。
4. 增加数据审计脚本或迁移前检查，识别 `employment.compId` 与 `employment.orgId` 祖先公司不一致、以及没有 Company 祖先的记录。
5. 生成并应用 Drizzle migration，删除 `employment.compId` 与相关 index/relation。
6. 更新 admin、SSO 和 public/internal 调用方消费新结构，继续渲染 deprecated 字段作为 fallback。
7. 运行受影响 package 的 typecheck、test，并对 admin Employment 列表/详情/创建/转岗和 public user-info 做 smoke test。

Rollback 时，在未删除列前可回滚到旧 mapper；删除列后若需要回滚，必须通过迁移备份或审计输出恢复 `compId`。因此生产迁移前必须保留数据库备份。

## Open Questions

- 是否需要专门记录“组织链无 Company 祖先”的数据质量告警，还是仅让 `compCode/compName=null`。
- `OrganizationFilter.matchMode="company"` 是否只匹配 Company 类型祖先，还是允许任意组织作为公司筛选入口；本设计倾向只对 Company 节点使用该模式。
- 创建/转岗的旧字段兼容期持续多久，后续是否需要单独移除 deprecated 输入字段。
