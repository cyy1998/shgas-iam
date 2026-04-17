# Turborepo Monorepo 迁移与管理员前端设计

**日期：** 2026-04-17  
**状态：** 已批准

## 目标

将现有 `iam-service` 后端迁移为 Turborepo monorepo，新增面向业务管理员（HR/业务人员）的管理后台前端，覆盖用户、组织、职位、雇佣关系四个核心模块。

---

## 1. Monorepo 目录结构

```
iam-monorepo/
├── apps/
│   ├── api/              # 现有 iam-service 迁入，Hono + Bun + Prisma
│   └── admin/            # 新建管理后台，React + Ant Design Pro
├── packages/
│   └── shared/           # 纯 TypeScript：枚举、DTO 类型，无运行时依赖
├── turbo.json
├── pnpm-workspace.yaml
└── package.json          # workspace 根，仅管理工具链依赖
```

### 包命名约定

| 包 | package.json name | 说明 |
|---|---|---|
| `apps/api` | `@iam/api` | 后端服务 |
| `apps/admin` | `@iam/admin` | 管理前端 |
| `packages/shared` | `@iam/shared` | 共享类型 |

---

## 2. 包依赖关系

```
apps/admin  ──devDep──▶  apps/api      (仅引用 AppType，不打包运行时)
apps/admin  ──dep──────▶  packages/shared
apps/api    ──dep──────▶  packages/shared
packages/shared  (无外部依赖，纯 TypeScript)
```

### `packages/shared` 的职责

- 导出项目枚举（从 `apps/api` 的 `src/enums/` 迁移）
- 导出纯 TS 数据类型（DTO interface，不含 Zod schema）
- **不**包含 Hono、Prisma、Zod 等框架依赖

---

## 3. Turborepo Pipeline

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "persistent": true,
      "cache": false
    },
    "lint": { "dependsOn": ["^lint"] },
    "typecheck": { "dependsOn": ["^typecheck"] }
  }
}
```

- `build`：拓扑顺序，shared 先构建，api 和 admin 后并行
- `dev`：api + admin 并行启动，shared 监听变更热更新
- `lint` / `typecheck`：三包并行，Turbo 缓存加速

---

## 4. Hono RPC 类型安全方案

### 原理

不使用 OpenAPI codegen，直接从后端 Hono app 导出类型，前端通过 `hc<AppType>` 获得完整类型推导：

```typescript
// apps/api/src/app.ts
export type AppType = typeof app

// apps/admin/src/lib/api-client.ts
import { hc } from 'hono/client'
import type { AppType } from '@iam/api'

export const apiClient = hc<AppType>(import.meta.env.VITE_API_BASE_URL, {
  init: { credentials: 'include' },  // 携带 session cookie
})
```

### 兼容性说明

项目使用 `@hono/zod-openapi`（`OpenAPIHono`），与标准 Hono RPC 基本兼容，但需要在初期以一个路由小范围验证类型推导链，再全面铺开。

---

## 5. 认证与鉴权流程

### 流程

1. 用户访问 `/admin/*`，路由守卫触发
2. 调用 `GET /public/user-info`（浏览器自动携带 session cookie）
3. **返回 401** → 重定向至 SSO 登录页，登录成功后回调返回 `/admin`
4. **返回 200** → 检查 `user.roles` 是否包含 admin role
   - 含 admin role → 进入管理后台
   - 不含 admin role → 显示 403 无权限页面

### 前端实现

- 在 ADP `app.tsx` 的 `initialState` 中发起 `/public/user-info` 请求，结果存入全局状态
- `apiClient` 统一配置 `credentials: 'include'`，401 响应自动跳转 SSO，403 响应显示提示
- 无需 localStorage token 管理，完全依赖 session cookie

### 跨域配置

- **开发环境**：Vite proxy 转发请求到 `localhost:30000`（api 端口），admin 默认运行在 `localhost:5173`，绕过跨域限制
- **生产环境**：nginx 反向代理同域部署，或后端 CORS 配置允许 admin 前端域名 + `credentials: true`

---

## 6. 管理后台 UI 设计

### 布局

Ant Design Pro 侧边栏布局（`SideMenu`）：
- 左侧固定导航菜单，显示四个一级模块
- 右侧内容区，顶部面包屑导航
- 基于 `user.roles` 动态过滤可见菜单项

### 模块与页面

| 模块 | 核心操作 | 对应后端接口 |
|---|---|---|
| 用户管理 | 列表/搜索、新建/编辑（Drawer）、重置密码、查看角色权限 | `GET/POST/PUT /admin/users` |
| 组织管理 | 树形结构展示、新建/编辑/停用节点、查看成员 | `GET/POST/PUT /admin/organizations` |
| 职位管理 | 列表/筛选、新建/编辑/停用、查看在职人员 | `GET/POST/PUT /admin/positions` |
| 雇佣关系 | 雇佣记录列表、新建入职、办理离职、调岗 | `GET/POST/PUT /admin/employments` |

### 页面交互约定

- **统一列表页模式**：搜索栏 + 表格 + 分页，所有模块复用同一 `ProTable` 封装
- **简单表单**（< 8 个字段）→ 右侧 Drawer
- **复杂表单**（含子表格/树选择）→ 全屏 Modal
- **删除操作** → Popconfirm 二次确认
- **批量操作** → 表格 `rowSelection` + 批量操作按钮
- **导入** → 上传 Excel → 预览确认 → 提交
- **错误提示** → 表单字段内联 + 顶部 Message

---

## 7. 后端所需改动（最小化）

1. **导出 `AppType`**：在 `apps/api/src/app.ts` 末尾添加 `export type AppType = typeof app`
2. **CORS 配置**：开发环境允许 `localhost:5173`（Vite 默认端口），生产按实际域名配置
3. **枚举迁移**：将 `src/enums/` 中的纯枚举逐步迁移到 `packages/shared`（可分批进行）
4. **package.json 调整**：将 `apps/api` 的 `name` 设为 `@iam/api`，添加 `exports` 字段导出类型

---

## 8. 迁移步骤概览

1. 初始化 monorepo 根（`turbo.json`、更新 `pnpm-workspace.yaml`）
2. 将现有代码移入 `apps/api/`，验证后端仍可正常启动
3. 创建 `packages/shared`，迁移枚举
4. 初始化 `apps/admin`（Ant Design Pro 脚手架）
5. 配置 Hono RPC 客户端，用一个接口验证类型推导
6. 实现认证流程（`initialState` + 路由守卫）
7. 按模块逐一实现列表页和表单页

---

## 9. 暂不包含的内容

以下功能在初期不纳入范围，可在后续迭代中扩展：

- 角色管理、权限委托管理的前端页面
- 客户端（OAuth client）管理
- 操作审计日志页面
- 移动端适配
