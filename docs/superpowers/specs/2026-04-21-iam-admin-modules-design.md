# IAM 管理后台 — 用户 / 组织 / 职位 / 雇佣关系模块设计

- **日期**：2026-04-21
- **涉及包**：`apps/api`（@iam/api）、`apps/admin`（@iam/admin）、`packages/shared`（@iam/shared）
- **状态**：待实现

## 1. 背景与目标

管理后台框架已搭好（UMI Max + Ant Design Pro + `hc<AppType>` 端到端类型）。`apps/admin/src/pages/` 下的 `users` / `organizations` / `positions` / `employments` 目前仅为占位 stub。本文档定义这四个模块的完整设计，同时顺带把 `apps/api` 中对应的 admin 路由规整为 RESTful。

后端现状：每个域仅暴露 `POST /search` 与 `POST /set` 两个端点，缺少单条更新、状态切换、软删除、雇佣的业务动作端点。

## 2. 范围

**包含**：
- 四个模块的列表、新建、编辑、详情、状态切换、软删除
- 雇佣关系独有的业务动作：入职/兼岗、转岗、主岗切换、暂停/恢复、离职
- 后端 admin 路由的 RESTful 规整（兼容新增端点）
- `@iam/shared` 状态枚举辅助扩展

**不包含**：
- Excel 批量导入 / 导出
- 角色与权限的可视化分配（留给后续 IAM 核心模块）
- 组织机构"已删除回收站"与恢复
- 雇佣甘特 / 时间线视图
- 审计日志页面（详情内留占位 Tab）

## 3. 架构原则

- 后端继续走 Hono + `@hono/zod-openapi` + `services/<domain>` 三层（route / service / repository）
- 前端使用 UMI Max 内置的 `ProTable` / `ProForm` / `ProDescriptions` / `ProDrawer`；数据获取用 `useRequest`
- 唯一 HTTP 入口：`apps/admin/src/lib/api-client.ts` 的 `hc<AppType>` 实例
- 状态管理：不引入 Redux/Zustand，UMI `model` + `useRequest` 已足够
- 跨包枚举只放 `@iam/shared`；UI 组件不下沉到 shared

## 4. 后端 API 端点清单

### 4.1 复用约定

- 复杂查询统一用 `POST /<resource>/search`（嵌套 `fuzzyConditions` / `exactConditions` / 分页参数难以用 query string 表达）
- 单资源读写用标准动词：`GET /:id`、`POST /`、`PUT /:id`、`PATCH /:id/status`、`DELETE /:id`
- 业务动作用 `POST /:id/<verb>`（RESTful 公认变通）
- 现有 `POST /set` 批量端点废弃对外路由；对应 service 函数保留供内部 / SSO 使用

### 4.2 Users — `/admin/users`

| 方法 | 路径 | 动作 | 备注 |
|------|------|------|------|
| POST | `/search` | 分页搜索 | 重构现有 `POST /search` |
| GET | `/:username` | 详情 | 重构现有 `GET /detail?username=` |
| POST | `/` | 创建单条 | 新增 |
| PUT | `/:username` | 整体更新 | 新增 |
| PATCH | `/:username/status` | 启用/暂停/停用 | 新增 |
| DELETE | `/:username` | 软删除（`isDelete=1`） | 新增 |
| POST | `/:username/reset-password` | 重置密码 | 重构：username 移至路径 |
| POST | `/generate-password` | 生成候选密码 | 保留现有 |

### 4.3 Organizations — `/admin/organizations`

| 方法 | 路径 | 动作 |
|------|------|------|
| POST | `/search` | 扁平搜索（重构现有） |
| GET | `/tree` | 新增：返回完整组织树，左树组件使用 |
| GET | `/:orgCode` | 详情（含下级计数） |
| POST | `/` | 创建（指定 parent） |
| PUT | `/:orgCode` | 更新 |
| PATCH | `/:orgCode/status` | 状态 |
| DELETE | `/:orgCode` | 软删除（有下级或关联雇佣时拒绝） |

### 4.4 Positions — `/admin/positions`

| 方法 | 路径 | 动作 |
|------|------|------|
| POST | `/search` | 分页搜索（重构现有） |
| GET | `/:posCode` | 详情 |
| POST | `/` | 创建 |
| PUT | `/:posCode` | 更新 |
| PATCH | `/:posCode/status` | 状态 |
| DELETE | `/:posCode` | 软删除（有关联雇佣时拒绝） |

### 4.5 Employments — `/admin/employments`

| 方法 | 路径 | 动作 |
|------|------|------|
| POST | `/search` | 分页搜索（重构现有） |
| GET | `/:id` | 详情 |
| POST | `/` | 新增雇佣（入职/兼岗） |
| PUT | `/:id` | 编辑（描述、时间等可变字段；已结束雇佣拒绝） |
| PATCH | `/:id/status` | 暂停/恢复 |
| DELETE | `/:id` | 软删除 |
| POST | `/:id/transfer` | 新增：转岗（原子事务：结束旧 + 建新） |
| POST | `/:id/set-primary` | 新增：设为主岗（自动将原主岗置非主） |
| POST | `/users/:username/resign` | 新增：按人离职（级联结束全部雇佣） |

### 4.6 新增错误类型

- `OrganizationHasChildrenError` — 删除时有下级
- `OrganizationHasEmploymentError` — 删除时有关联雇佣
- `PositionHasEmploymentError` — 删除时有关联雇佣
- `EmploymentNotEditableError` — 已结束雇佣拒绝 PUT
- `PrimaryEmploymentRequiredError` — 离职后一致性校验

## 5. 前端模块结构

### 5.1 目录

```
apps/admin/src/
├── pages/
│   ├── users/
│   │   ├── index.tsx                       # 列表（ProTable）
│   │   ├── components/
│   │   │   ├── UserDetailDrawer.tsx        # 右侧抽屉 Tab: 基本/雇佣/日志
│   │   │   ├── UserFormModal.tsx           # 新建/编辑
│   │   │   └── ResetPasswordModal.tsx
│   │   └── hooks/useUserActions.ts
│   ├── organizations/
│   │   ├── index.tsx                       # 左树 + 右侧详情
│   │   ├── components/
│   │   │   ├── OrgTree.tsx
│   │   │   ├── OrgDetailPanel.tsx
│   │   │   └── OrgFormModal.tsx
│   │   └── hooks/useOrgTree.ts
│   ├── positions/
│   │   ├── index.tsx
│   │   └── components/PositionFormModal.tsx
│   ├── employments/
│   │   ├── index.tsx                       # 扁平记录表 + 多维过滤
│   │   └── components/
│   │       ├── EmploymentFormModal.tsx     # 新增雇佣
│   │       ├── TransferModal.tsx
│   │       └── ResignConfirm.tsx
│   └── 403/index.tsx
├── services/
│   ├── user.ts
│   ├── organization.ts
│   ├── position.ts
│   └── employment.ts
├── components/
│   └── StatusTag.tsx                       # 通用状态标签
├── utils/
│   └── request.ts                          # 统一 apiClient 响应解包
└── lib/api-client.ts                       # 现有
```

### 5.2 约定

- `services/<domain>.ts` 薄封装：每个方法对应一个 apiClient 调用，统一走 `utils/request.ts` 解包；`code !== 200` 抛 `ServiceError`
- 列表数据由 `ProTable.request` 直接消费 `services/<domain>.search(params)`；变更后 `actionRef.current?.reload()`
- 详情 / 树使用 `useRequest`（umi 内置）
- `StatusTag` 消费 `@iam/shared` 新增的 `get*StatusOptions()`，不下沉 UI 到 shared 包
- 全局请求拦截器：`code !== 200` 抛错 + `message.error(err.message)`；401 沿用 SSO 重定向；403 跳 `/403`

## 6. 各模块页面细节

### 6.1 组织管理 `/organizations`

**左树**
- 数据源：`GET /admin/organizations/tree` 首次加载全量（组织量级百级，代价可忽略）
- 节点显示：`orgName` + `orgCode` + 状态色点；支持搜索高亮、右键菜单（新建下级/编辑/停用/删除）
- 顶部"+ 新建根组织"按钮

**右侧详情**
- 未选中：占位提示
- 选中：`ProDescriptions` 展示 `orgCode`、`orgName`、`orgType`、`parent`、`level`、`path`、`status`、时间戳
- 下方：
  - 下级组织小表格（点行切换左树选中节点）
  - 部门员工数计数 + "跳转到雇佣页过滤"链接（不在本页重复展开）
- 头部动作：编辑 / 状态 / 删除（有下级或雇佣时禁用并 tooltip）

**新建/编辑 Modal**：`orgCode`（编辑只读）、`orgName`、`orgType`（下拉）、`parentOrgCode`（树选择器，新建时预填当前选中节点）、`status`

### 6.2 用户管理 `/users`

**列表**：列为工号 / 姓名 / 手机 / 类型 / 状态 / 主岗部门+岗位（可选列）/ 创建时间 / 操作
- 搜索：姓名/工号/手机（模糊）+ 类型/状态（精确）
- 操作列：查看 / 编辑 / 重置密码 / 状态切换 / 删除（二次确认）
- 工具栏：+ 新建用户

**抽屉（宽 560px）**
- 头部：姓名 + 工号 + 状态 tag
- Tabs：基本信息 / 雇佣关系（带数量）/ 操作日志（本次占位 `<Empty />`）
- 雇佣 Tab 内部小表格 + 底部"+ 新增雇佣"按钮，跳转 `/employments` 并预填 `username` 查询参数
- 底部粘性动作：重置密码 / 暂停 / 删除

**新建 / 编辑 Modal**：`username`（编辑只读）、`name`、`mobile`、`userType`、`password`（留空则后端调 generate）、`status`

### 6.3 职位管理 `/positions`

- 列表：`posCode` / `posName` / `status` / `description` / 操作
- 搜索：名称/编码模糊 + 状态精确
- 新建/编辑 Modal：`posCode`（编辑只读）、`posName`、`description`、`status`
- 操作：编辑 / 状态 / 删除（后端拒绝有雇佣关联者）
- 无树无抽屉

### 6.4 雇佣关系 `/employments`

**列表（扁平记录表）**
- 列：用户（姓名+工号）/ 公司 / 部门 / 岗位 / 主岗 tag / 状态 / 起止时间 / 操作
- 过滤：
  - 模糊：用户名/姓名
  - 精确级联：公司 → 部门（按 `orgType` 过滤）；岗位；是否主岗；状态
  - 默认隐藏已结束雇佣，过滤器可显示
- 操作列（条件化）：
  - 正常 / 暂停：转岗 / 设主岗（非主岗才显示）/ 暂停或恢复 / 结束
  - 已结束：仅详情
- 工具栏："+ 新增雇佣"、"按用户离职"（弹窗远程搜索选定 username，二次确认后调 `POST /admin/employments/users/:username/resign`）

**新增雇佣 Modal**：`username`（远程搜索补全）、`companyOrgCode` / `deptOrgCode`（级联）、`posCode`、`isPrimary`（该用户已有主岗时默认否并警示）、`startTime`、`description`；后端校验 `PosOrgComposition` 存在（复用现有）

**转岗 Modal**：展示原雇佣只读 → 输入新公司/新部门/新岗位/生效时间/是否继承主岗 → `POST /:id/transfer`

**设主岗 / 暂停 / 结束**：二次确认弹窗 + 对应端点

**支持通过 URL `?username=xxx` 从用户抽屉跳转时自动打开新增 Modal 并预填**

## 7. 数据流

典型 CRUD：

```
ProTable.request
  → services/<domain>.search({pageNum, pageSize, ...filters})
  → apiClient.admin.<domain>.search.$post({ json })
  → utils/request 解包 (code !== 200 抛错)
  → {result, total, pageNum, ...} 转 ProTable 返回格式
```

- 变更后：`message.success` + `actionRef.current?.reload()` + 关闭 Modal
- 抽屉内变更：同时刷新抽屉 `useRequest.run()` 与列表
- 组织树缓存：页面内 `useState`，增删改后重新拉全量
- 雇佣联动：从用户抽屉"+ 新增雇佣"跳 `/employments?username=xxx`

## 8. `@iam/shared` 扩展

- `packages/shared/src/enums/organization.status.ts` 新增 `stringifyOrganizationStatus` 与 `getOrganizationStatusOptions`
- `user.status.ts` / `position.status.ts` / `employment.status.ts` 补齐 `get*StatusOptions()` 返回 `[{label, value, color}]`
- 不新增 UI 组件

## 9. 测试策略

**后端**：项目当前未引入测试框架；本次不强制引入。新增 service 函数保持事务边界清晰（`transfer` / `setPrimary` / `resign` / 软删除前置校验），便于后续补 `bun:test`。至少通过 Scalar UI (`/doc/scalar`) 手测每个新端点。

**前端**：不写单测；实现阶段形成手测 checklist，覆盖每模块 CRUD + 特殊流（转岗、离职、删除拒绝、状态切换）。

## 10. 实现顺序

建议按依赖与复杂度：

1. **基础设施**：`@iam/shared` 状态辅助、`StatusTag`、`utils/request.ts`
2. **Position**：最简单，作为端到端模式样板（含后端 RESTful 重构）
3. **Organization**：树 + 详情，建立新布局范式
4. **User**：表格 + 抽屉
5. **Employment**：依赖前三者就绪，含全部业务动作

每模块内部顺序：后端端点 → Zod schema → 前端 service → 页面组件。
