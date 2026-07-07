## 1. Admin-api 任职搜索增强

- [x] 1.1 扩展 `apps/admin-api/src/services/employment/employment.repository.ts` 的 fuzzy text 条件，使其匹配 `employment.id::text`、用户 username/name、任职组织 orgCode/orgName 和岗位 posCode/posName。
- [x] 1.2 保持任职搜索现有 exactConditions、分页、排序、返回 DTO/VO 结构和未软删除过滤语义不变。
- [x] 1.3 为任职搜索 fuzzy 范围补充或更新 admin-api 测试，覆盖按任职 ID、组织信息和岗位信息定位记录。

## 2. Admin 前端选择器改造

- [x] 2.1 在角色创建/编辑表单中将所属应用字段改为远程搜索选择控件，选项展示 `clientName（clientCode）`，提交值保持 `clientCode`，编辑态保持所属应用不可变。
- [x] 2.2 在角色列表筛选中将所属应用筛选改为远程搜索选择控件，并继续把所选 `clientCode` 传给角色搜索 exactConditions。
- [x] 2.3 在新增角色分配表单中复用 `OrganizationTreeSelector` 选择 organization 分配目标，提交 `orgCode` 并保留默认 `includeDescendants=true`。
- [x] 2.4 在新增角色分配表单中使用远程搜索岗位选择控件选择 position 分配目标，默认过滤 `PositionStatus.Enable`，提交 `posCode`。
- [x] 2.5 在新增角色分配表单中使用远程搜索任职选择控件选择 employment 分配目标，默认过滤 `EmploymentStatus.Enable`，提交 `employmentId`，并展示用户、组织路径、岗位和任职 ID 摘要。
- [x] 2.6 在切换 `targetType` 时清理不属于当前类型的字段，确保 position/employment 创建请求不会携带 `includeDescendants=true`。

## 3. 前端测试与 mock

- [x] 3.1 补充或更新 admin 前端测试/mocks，使 client、position、employment 搜索响应能支持角色页面选择器场景。
- [x] 3.2 为角色创建表单或角色分配弹窗补充 focused 测试，验证选择控件提交现有 role create / assignment create 契约值。
- [x] 3.3 补充角色管理 mocked E2E 或组件交互测试，覆盖新增分配类型切换后旧字段不会污染提交。

## 4. 验证

- [x] 4.1 运行 `openspec validate improve-role-management-selectors --strict`。
- [x] 4.2 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`。
- [x] 4.3 运行 `pnpm --filter @iam/admin test` 和 `pnpm --filter @iam/admin typecheck`。
- [x] 4.4 未新增或修改 mocked E2E，`pnpm --filter @iam/admin e2e` 不适用。
