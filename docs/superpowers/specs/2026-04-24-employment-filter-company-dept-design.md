# 雇佣关系筛选：新增公司与部门筛选器

**日期：** 2026-04-24  
**状态：** 已批准

## 背景

雇佣关系列表当前支持按用户名、状态、是否主岗筛选。后端查询接口已完整支持 `companyOrgCodes` 和 `deptOrgCodes` 过滤，但前端未暴露这两个筛选项。

## 目标

在 ProTable 搜索栏中新增公司和部门级联筛选，选择公司后部门列表自动过滤为该公司下属部门，与新增雇佣表单的交互模式保持一致。

## 变更范围

**仅前端单文件：** `apps/admin/src/pages/employments/index.tsx`

后端无需改动。

## 设计详情

### 新增列定义

在 `columns` 中追加两个 `hideInTable: true` 的搜索专用列：

**公司列**

- `dataIndex: 'companyOrgCode'`
- `renderFormItem(_, __, form)` 返回一个 `Select`，调用 `apiClient.admin.organization.search.query` 并限定 `orgType: OrganizationType.Company`，支持 `showSearch` 模糊搜索
- `onChange` 时通过 `form.setFieldValue('deptOrgCode', undefined)` 清空部门字段

**部门列**

- `dataIndex: 'deptOrgCode'`
- `renderFormItem(_, __, form)` 返回文件内定义的 `<DeptFilterSelect form={form} />` 组件
- `DeptFilterSelect` 使用 `Form.useWatch('companyOrgCode', form)` 监听公司值：
  - 无公司值时禁用，placeholder 提示"请先选择公司"
  - 有公司值时加载该公司下属部门（`orgType: Department` + `ancestorOrgCode: companyOrgCode`）
  - 公司变更时自动清空已选部门（companyOrgCode 变化时 useEffect 重置 options）

### `request` 回调更新

从 `params` 中额外提取 `companyOrgCode` 和 `deptOrgCode`，传入查询条件：

```ts
exactConditions: {
  companyOrgCodes: companyOrgCode ? [companyOrgCode] : undefined,
  deptOrgCodes: deptOrgCode ? [deptOrgCode] : undefined,
  statuses: ...,
  isPrimary: ...,
}
```

### 新增 imports

- `apiClient` from `@/lib/api-client`
- `OrganizationType` from `@iam/shared`
- `Form, Select` from `antd`
- `type FormInstance` from `antd`
- `type AppRouter` from `@iam/api/trpc`（复用 OrgVo 类型）
- `type inferRouterOutputs` from `@trpc/server`

## 不在范围内

- 多选公司/部门（当前为单选，后端虽支持数组，UI 保持简洁）
- 后端改动
- 其他页面的筛选调整
