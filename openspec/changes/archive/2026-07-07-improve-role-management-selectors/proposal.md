## Why

角色管理页面当前要求管理员手填所属应用编码、组织编码、岗位编码和任职 ID，容易输错，也要求管理员预先知道内部标识。角色创建和角色分配是高频且影响授权结果的管理操作，应改为可搜索、可选择的对象选择流程，降低误操作概率。

## What Changes

- 将角色创建表单的所属应用从手填 `clientCode` 改为远程搜索下拉，仍提交稳定的 `clientCode`。
- 将角色列表的所属应用筛选改为远程搜索下拉，保持按 `clientCode` 精确筛选。
- 将新增角色分配表单改为按分配类型展示对象选择器：
  - 组织分配使用组织树选择器，提交 `orgCode`，保留 `includeDescendants` 开关。
  - 岗位分配使用远程搜索下拉，提交 `posCode`。
  - 任职分配使用远程搜索下拉，提交 `employmentId`。
- 切换分配类型时清理无关字段，避免隐藏字段污染提交数据。
- 如现有任职搜索无法满足下拉体验，增强 admin-api 任职搜索，使其支持按任职 ID、用户、组织和岗位信息定位可分配任职。
- 不改变角色、角色分配、画像刷新、审计、数据库 schema 或授权解析语义。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `admin-role-management`: 角色管理页面必须通过可搜索选择控件选择所属应用和角色分配目标，避免管理员手填对象编码或任职 ID。
- `employment-management`: 管理端任职搜索的 fuzzy text 必须支持角色分配任职选择器需要的任职 ID、用户、组织和岗位定位。

## Impact

- `apps/admin/src/pages/roles/`：角色表单、角色列表筛选、角色详情分配弹窗。
- `apps/admin/src/services/`：必要时补充或复用 client、organization、position、employment service wrapper。
- `apps/admin-api/src/services/employment/`：仅在现有搜索能力不足时增强任职搜索条件。
- `apps/admin-api/src/routes/admin/employment/` 和 tRPC 类型消费：仅随任职搜索契约增强而受影响。
- 测试影响：前端组件或 service wrapper 测试、必要的 admin mocked E2E、任职搜索增强的 admin-api 单元测试。
