# IAM 管理后台 · Plan 2 · 组织管理模块端到端

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 Position 已建立的双暴露（Hono OpenAPI + tRPC via `defineOp`）模式，完成组织管理模块后端 RESTful 重构（含 `/tree` 端点）与前端"左树 + 右侧详情"页面。

**Architecture:** 后端新增 `routes/admin/organization/` 下的 `organization.ops.ts` / `organization.trpc.ts` / `organization.schema.ts`，并重构 `routes.ts` / `handlers.ts` / `index.ts`；`services/organization/` 新增面向管理端的仓储与服务函数（不做 `status=Enable` 过滤，仅 `isDelete=false`）。前端使用 Ant Design `Tree` + `ProDescriptions` 实现左树右详情，所有 HTTP 走 `/rpc/*` tRPC client。

**Tech Stack:** 后端 Hono + `@hono/zod-openapi` + `@trpc/server` + Prisma；前端 UMI Max + Ant Design (Tree) + Ant Design Pro (ProDescriptions/ModalForm) + `@trpc/client`。

**Spec reference:** `docs/superpowers/specs/2026-04-21-iam-admin-modules-design.md` §4.3、§6.1

**Execution principles:**
- 每个任务结束后单独 git commit，conventional commits 中文描述
- 后端 ESLint (Antfu)：分号 + 双引号；前端 Prettier
- 后端路径别名 `@/` `@services/` `@errors/` `@lib/` `@enums/` `@middlewares/`；前端 `@/` → `src/`
- `tsc --noEmit` 是主要验证；测试框架未引入，功能用 Scalar UI + 浏览器手测

**File structure (new / modified):**

```
apps/api/src/
├── errors/
│   ├── OrganizationHasChildrenError.ts       (新增)
│   └── OrganizationHasEmploymentError.ts     (新增)
├── services/organization/
│   ├── organization.schema.ts                (追加 Update/StatusUpdate/PaginationQuery/TreeNode schemas)
│   ├── organization.repository.ts            (追加 admin 侧不过滤 Status 的查询 / update / softDelete / count 函数)
│   ├── organization.service.ts               (追加 getDetailByCodeForAdmin / getTree / search / update / updateStatus / delete)
│   └── organization.type.ts                  (补充新 schema 的类型导出)
├── routes/admin/organization/
│   ├── organization.schema.ts                (新增 VO / TreeNodeVo)
│   ├── organization.ops.ts                   (新增 defineQueryOp / defineMutationOp)
│   ├── organization.trpc.ts                  (新增 tRPC 适配器)
│   ├── organization.routes.ts                (重写：search/tree/detail/create/update/status/delete)
│   ├── organization.handlers.ts              (重写：逐一调 ops.*.run)
│   └── organization.index.ts                 (重写注册表)
└── trpc/routers/admin/index.ts               (加入 organization 子路由)

apps/admin/src/
├── services/organization.ts                  (新增，基于 tRPC)
└── pages/organizations/
    ├── components/
    │   ├── OrgFormModal.tsx                  (新增)
    │   ├── OrgTree.tsx                       (新增)
    │   └── OrgDetailPanel.tsx                (新增)
    └── index.tsx                             (重写：左树右详情布局)
```

---

## Phase A — 后端错误类型 + DTO schema 扩展

### Task A1: 新增 `OrganizationHasChildrenError`

**Files:**
- Create: `apps/api/src/errors/OrganizationHasChildrenError.ts`

- [ ] **Step 1: 创建文件**

Create `apps/api/src/errors/OrganizationHasChildrenError.ts` with:

```ts
import { CustomError } from "./CustomError";

export class OrganizationHasChildrenError extends CustomError {
  constructor(message: string = "该组织下存在子组织，无法删除") {
    super(message, 409);
    this.name = "OrganizationHasChildrenError";
  }
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/errors/OrganizationHasChildrenError.ts
git commit -m "feat(api): 新增 OrganizationHasChildrenError 用于组织删除前置校验"
```

---

### Task A2: 新增 `OrganizationHasEmploymentError`

**Files:**
- Create: `apps/api/src/errors/OrganizationHasEmploymentError.ts`

- [ ] **Step 1: 创建文件**

Create `apps/api/src/errors/OrganizationHasEmploymentError.ts` with:

```ts
import { CustomError } from "./CustomError";

export class OrganizationHasEmploymentError extends CustomError {
  constructor(message: string = "该组织下存在雇佣关系，无法删除") {
    super(message, 409);
    this.name = "OrganizationHasEmploymentError";
  }
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/errors/OrganizationHasEmploymentError.ts
git commit -m "feat(api): 新增 OrganizationHasEmploymentError 用于组织删除前置校验"
```

---

### Task A3: 扩展 `organization.schema.ts`（DTO 层）

**Files:**
- Modify: `apps/api/src/services/organization/organization.schema.ts`

**Rationale:** 新增：管理端分页查询 schema、更新 schema、状态变更 schema、树节点 schema。保留现有 `OrganizationDtoSchema / OrganizationDtoConverterSchema / OrganizationCreateDtoSchema / OrganizationQueryDtoSchema` 不动。

- [ ] **Step 1: 在文件末尾追加**

Append to `apps/api/src/services/organization/organization.schema.ts`:

```ts
import { Status } from "@/enums/status";
import { createPageQuerySchema } from "../../lib/core/pagination/schema";

export const OrganizationPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "上海" }),
    }),
    exactConditions: z.object({
      orgType: z.string().optional().openapi({ example: "部门" }),
      status: z.number().optional().openapi({ example: 1 }),
      parentOrgCode: z.string().optional().openapi({ example: "SR" }),
    }),
  }),
).openapi("OrganizationPaginationQueryDto");

export const OrganizationUpdateDtoSchema = z.object({
  orgName: z.string().min(1).optional(),
  orgType: z.string().min(1).optional(),
  status: z.enum(Status).optional(),
}).openapi("OrganizationUpdateDto");

export const OrganizationStatusUpdateDtoSchema = z.object({
  status: z.enum(Status),
}).openapi("OrganizationStatusUpdateDto");

type OrganizationTreeNodeDto = {
  id: number;
  orgCode: string;
  orgName: string;
  orgType: string;
  status: number;
  level: number;
  parentId: number;
  orderNum: number;
  children: OrganizationTreeNodeDto[];
};

export const OrganizationTreeNodeDtoSchema: z.ZodType<OrganizationTreeNodeDto> = z.lazy(() =>
  z.object({
    id: z.number(),
    orgCode: z.string(),
    orgName: z.string(),
    orgType: z.string(),
    status: z.number(),
    level: z.number(),
    parentId: z.number(),
    orderNum: z.number(),
    children: z.array(OrganizationTreeNodeDtoSchema),
  }),
).openapi("OrganizationTreeNodeDto");
```

- [ ] **Step 2: 检查 `Status` 与 `createPageQuerySchema` 导入路径**

查看文件头部既有 import，确保 `Status` 不重复导入。若文件头已有 `z` import 则沿用。

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/organization/organization.schema.ts
git commit -m "feat(api): 组织 DTO schema 新增分页查询/更新/状态/树节点"
```

---

### Task A4: 扩展 `organization.type.ts`

**Files:**
- Modify: `apps/api/src/services/organization/organization.type.ts`

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/api/src/services/organization/organization.type.ts` with:

```ts
import type { z } from "@hono/zod-openapi";
import type {
  OrganizationCreateDtoSchema,
  OrganizationDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationQueryDtoSchema,
  OrganizationStatusUpdateDtoSchema,
  OrganizationTreeNodeDtoSchema,
  OrganizationUpdateDtoSchema,
} from "./organization.schema";

export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;
export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>;
export type OrganizationQueryDto = z.infer<typeof OrganizationQueryDtoSchema>;
export type OrganizationPaginationQueryDto = z.infer<typeof OrganizationPaginationQueryDtoSchema>;
export type OrganizationUpdateDto = z.infer<typeof OrganizationUpdateDtoSchema>;
export type OrganizationStatusUpdateDto = z.infer<typeof OrganizationStatusUpdateDtoSchema>;
export type OrganizationTreeNodeDto = z.infer<typeof OrganizationTreeNodeDtoSchema>;
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/organization/organization.type.ts
git commit -m "feat(api): 组织类型导出补齐新增 schemas"
```

---

## Phase B — 后端仓储与服务层

### Task B1: Repository 追加 admin 查询 / update / softDelete / count

**Files:**
- Modify: `apps/api/src/services/organization/organization.repository.ts`

**Rationale:** 既有函数全部 `status: Status.Enable` 过滤，不适合管理端（需要看到所有未删除组织，包括暂停/停用）。新增的函数仅过滤 `isDelete: false`。

- [ ] **Step 1: 在文件末尾追加**

Append to `apps/api/src/services/organization/organization.repository.ts`:

```ts
/** Admin: 列出全部未删除组织（用于构造组织树） */
export async function listAllOrganizationsForAdmin(tx: PrismaTransaction = prisma) {
  return await tx.organization.findMany({
    where: { isDelete: false },
    orderBy: [
      { level: "asc" },
      { orderNum: "asc" },
      { id: "asc" },
    ],
  });
}

/** Admin: 按 orgCode 查询（不过滤 status） */
export async function getOrganizationByCodeForAdmin(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.organization.findFirst({
    where: { orgCode, isDelete: false },
    include: {
      parent: true,
      children: { where: { isDelete: false } },
    },
  });
}

/** Admin: 扁平分页搜索（多维过滤，支持关键字模糊） */
export async function searchOrganizationsForAdmin(
  query: {
    conditions: {
      fuzzyConditions: { text?: string };
      exactConditions: { orgType?: string; status?: number; parentOrgCode?: string };
    };
  },
  tx: PrismaTransaction = prisma,
) {
  const { fuzzyConditions, exactConditions } = query.conditions;
  return await tx.organization.findMany({
    where: {
      isDelete: false,
      ...(exactConditions.orgType ? { orgType: exactConditions.orgType } : {}),
      ...(exactConditions.status !== undefined ? { status: exactConditions.status } : {}),
      ...(exactConditions.parentOrgCode
        ? { parent: { orgCode: exactConditions.parentOrgCode } }
        : {}),
      ...(fuzzyConditions.text
        ? {
            OR: [
              { orgCode: { contains: fuzzyConditions.text } },
              { orgName: { contains: fuzzyConditions.text } },
            ],
          }
        : {}),
    },
    include: {
      parent: true,
      children: { where: { isDelete: false } },
    },
    orderBy: [
      { level: "asc" },
      { orderNum: "asc" },
      { id: "asc" },
    ],
  });
}

export async function updateOrganizationByCode(
  orgCode: string,
  data: { orgName?: string; orgType?: string; status?: number },
  tx: PrismaTransaction = prisma,
) {
  return await tx.organization.updateMany({
    where: { orgCode, isDelete: false },
    data,
  });
}

export async function softDeleteOrganizationByCode(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.organization.updateMany({
    where: { orgCode, isDelete: false },
    data: { isDelete: true },
  });
}

/** 直接子节点数量（不考虑更深后代） */
export async function countActiveChildrenByOrgCode(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.organization.count({
    where: {
      isDelete: false,
      parent: { orgCode, isDelete: false },
    },
  });
}

/** 组织作为 dept 或 comp 关联的未结束雇佣数 */
export async function countActiveEmploymentsByOrgCode(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.employment.count({
    where: {
      isDelete: false,
      OR: [
        { department: { orgCode, isDelete: false } },
        { company: { orgCode, isDelete: false } },
      ],
    },
  });
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误。若报 `department` 不存在说明 prisma 别名拼写需对照 schema.prisma（已确认为 `department`，即代码里保留的拼写）。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/organization/organization.repository.ts
git commit -m "feat(api): 组织仓储层新增 admin 查询/update/softDelete/count 能力"
```

---

### Task B2: Service 追加 getTree / getDetail / search / update / updateStatus / delete

**Files:**
- Modify: `apps/api/src/services/organization/organization.service.ts`

- [ ] **Step 1: 在文件顶部 import 区补充**

在既有 import 区末尾追加：

```ts
import type {
  OrganizationPaginationQueryDto,
  OrganizationTreeNodeDto,
  OrganizationUpdateDto,
} from "./organization.type";
import { OrganizationHasChildrenError } from "@errors/OrganizationHasChildrenError";
import { OrganizationHasEmploymentError } from "@errors/OrganizationHasEmploymentError";
import { Status, statusToString } from "@/enums/status";
import { paginate } from "@/utils/page.util";
```

（若 `paginate` 已 import 则去重）

- [ ] **Step 2: 在文件末尾追加**

Append to `apps/api/src/services/organization/organization.service.ts`:

```ts
export async function getOrganizationTreeForAdmin(): Promise<OrganizationTreeNodeDto[]> {
  const all = await organizationRepository.listAllOrganizationsForAdmin();
  const nodeMap = new Map<number, OrganizationTreeNodeDto>();
  const roots: OrganizationTreeNodeDto[] = [];

  for (const o of all) {
    nodeMap.set(o.id, {
      id: o.id,
      orgCode: o.orgCode,
      orgName: o.orgName,
      orgType: o.orgType,
      status: o.status,
      level: o.level,
      parentId: o.parentId,
      orderNum: o.orderNum,
      children: [],
    });
  }

  for (const o of all) {
    const node = nodeMap.get(o.id)!;
    const parent = nodeMap.get(o.parentId);
    if (parent) {
      parent.children.push(node);
    }
    else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getOrganizationDetailByCodeForAdmin(orgCode: string) {
  const org = await organizationRepository.getOrganizationByCodeForAdmin(orgCode);
  if (org === null) {
    throw new CustomError("组织不存在", 404);
  }
  const employmentCount = await organizationRepository.countActiveEmploymentsByOrgCode(orgCode);
  const dto = OrganizationDtoConverterSchema.parse(org);
  return {
    ...dto,
    statusText: statusToString[dto.status as Status] ?? "未知",
    childrenCount: org.children.length,
    employmentCount,
  };
}

export async function searchOrganizationsForAdmin(query: OrganizationPaginationQueryDto) {
  const orgs = await organizationRepository.searchOrganizationsForAdmin(query);
  const vos = orgs.map((o) => {
    const dto = OrganizationDtoConverterSchema.parse(o);
    return {
      ...dto,
      statusText: statusToString[dto.status as Status] ?? "未知",
      childrenCount: o.children.length,
    };
  });
  return paginate(vos, query);
}

export async function updateOrganization(orgCode: string, data: OrganizationUpdateDto) {
  return await prisma.$transaction(async (tx) => {
    const existing = await organizationRepository.getOrganizationByCodeForAdmin(orgCode, tx);
    if (existing === null) {
      throw new CustomError("组织不存在", 404);
    }
    await organizationRepository.updateOrganizationByCode(orgCode, data, tx);
    return true;
  });
}

export async function updateOrganizationStatus(orgCode: string, status: number) {
  return await updateOrganization(orgCode, { status });
}

export async function deleteOrganization(orgCode: string) {
  return await prisma.$transaction(async (tx) => {
    const existing = await organizationRepository.getOrganizationByCodeForAdmin(orgCode, tx);
    if (existing === null) {
      throw new CustomError("组织不存在", 404);
    }
    const childrenCount = await organizationRepository.countActiveChildrenByOrgCode(orgCode, tx);
    if (childrenCount > 0) {
      throw new OrganizationHasChildrenError();
    }
    const employmentCount = await organizationRepository.countActiveEmploymentsByOrgCode(orgCode, tx);
    if (employmentCount > 0) {
      throw new OrganizationHasEmploymentError();
    }
    await organizationRepository.softDeleteOrganizationByCode(orgCode, tx);
    return true;
  });
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/organization/organization.service.ts
git commit -m "feat(api): 组织服务层新增 tree/detail/search/update/delete 管理端能力"
```

---

## Phase C — 后端路由层（Business Op + Hono + tRPC）

### Task C1: 新建 `routes/admin/organization/organization.schema.ts`（VO）

**Files:**
- Create: `apps/api/src/routes/admin/organization/organization.schema.ts`

**Rationale:** VO 按架构约定放在 routes 层，扩展 DTO 增加 `statusText / childrenCount / employmentCount`。

- [ ] **Step 1: 创建文件**

Create `apps/api/src/routes/admin/organization/organization.schema.ts` with:

```ts
import { z } from "@hono/zod-openapi";
import { OrganizationDtoSchema } from "@/services/organization/organization.schema";

export const OrganizationVoSchema = OrganizationDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
  childrenCount: z.number().openapi({ example: 3 }),
}).openapi("OrganizationVo");

export const OrganizationDetailVoSchema = OrganizationVoSchema.extend({
  employmentCount: z.number().openapi({ example: 12 }),
}).openapi("OrganizationDetailVo");
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/organization/organization.schema.ts
git commit -m "feat(api): 新增组织 VO schema 位于路由层"
```

---

### Task C2: 新建 `organization.ops.ts`

**Files:**
- Create: `apps/api/src/routes/admin/organization/organization.ops.ts`

- [ ] **Step 1: 创建文件**

Create `apps/api/src/routes/admin/organization/organization.ops.ts` with:

```ts
import { z } from "zod";
import { Status } from "@/enums/status";
import { defineMutationOp, defineQueryOp } from "@/lib/core/business-op";
import {
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@/services/organization/organization.schema";
import * as organizationService from "@/services/organization/organization.service";

export const searchOrganizationOp = defineQueryOp({
  input: OrganizationPaginationQueryDtoSchema,
  handler: input => organizationService.searchOrganizationsForAdmin(input),
});

export const getOrganizationTreeOp = defineQueryOp({
  input: z.object({}).optional(),
  handler: () => organizationService.getOrganizationTreeForAdmin(),
});

export const getOrganizationOp = defineQueryOp({
  input: z.object({ orgCode: z.string() }),
  handler: ({ orgCode }) => organizationService.getOrganizationDetailByCodeForAdmin(orgCode),
});

export const createOrganizationOp = defineMutationOp({
  input: OrganizationCreateDtoSchema,
  handler: input => organizationService.setOrganization(input),
});

export const updateOrganizationOp = defineMutationOp({
  input: z.object({
    orgCode: z.string(),
    data: OrganizationUpdateDtoSchema,
  }),
  handler: ({ orgCode, data }) => organizationService.updateOrganization(orgCode, data),
});

export const updateOrganizationStatusOp = defineMutationOp({
  input: z.object({
    orgCode: z.string(),
    status: z.enum(Status),
  }),
  handler: ({ orgCode, status }) => organizationService.updateOrganizationStatus(orgCode, status),
});

export const deleteOrganizationOp = defineMutationOp({
  input: z.object({ orgCode: z.string() }),
  handler: ({ orgCode }) => organizationService.deleteOrganization(orgCode),
});
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误（此时 routes.ts 旧代码仍在，handlers 未改，可能还有类型错但 ops.ts 本身不应报错；若整包报错继续下一步）

- [ ] **Step 3: 暂不独立 commit，与 C3-C6 合并**

---

### Task C3: 重写 `organization.routes.ts`

**Files:**
- Modify: `apps/api/src/routes/admin/organization/organization.routes.ts`

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/api/src/routes/admin/organization/organization.routes.ts` with:

```ts
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import {
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationStatusUpdateDtoSchema,
  OrganizationTreeNodeDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@/services/organization/organization.schema";
import { OrganizationDetailVoSchema, OrganizationVoSchema } from "./organization.schema";

const tags = ["Admin/Organization"];

export const organizationsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(OrganizationPaginationQueryDtoSchema, "组织分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationVoSchema)), "符合条件组织列表"),
  },
});

export const organizationsTree = createRoute({
  method: "get",
  path: "/tree",
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationTreeNodeDtoSchema)), "完整组织树"),
  },
});

export const organizationDetail = createRoute({
  method: "get",
  path: "/:orgCode",
  tags,
  request: {
    params: z.object({ orgCode: z.string().openapi({ example: "SR" }) }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(OrganizationDetailVoSchema), "组织详情"),
  },
});

export const organizationCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(OrganizationCreateDtoSchema, "组织创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "组织创建成功"),
  },
});

export const organizationUpdate = createRoute({
  method: "put",
  path: "/:orgCode",
  tags,
  request: {
    params: z.object({ orgCode: z.string() }),
    body: jsonContentRequired(OrganizationUpdateDtoSchema, "组织更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "组织更新成功"),
  },
});

export const organizationStatusUpdate = createRoute({
  method: "patch",
  path: "/:orgCode/status",
  tags,
  request: {
    params: z.object({ orgCode: z.string() }),
    body: jsonContentRequired(OrganizationStatusUpdateDtoSchema, "组织状态变更"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
  },
});

export const organizationDelete = createRoute({
  method: "delete",
  path: "/:orgCode",
  tags,
  request: {
    params: z.object({ orgCode: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "组织删除成功"),
  },
});
```

Note: 原 `/set` 端点移除对外路由；`setOrganization` 服务函数保留供内部使用（现已被 `createOrganizationOp` 调用）。

- [ ] **Step 2: 暂不独立 commit**

---

### Task C4: 重写 `organization.handlers.ts`

**Files:**
- Modify: `apps/api/src/routes/admin/organization/organization.handlers.ts`

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/api/src/routes/admin/organization/organization.handlers.ts` with:

```ts
import type { OrganizationRouteHandler } from "./organization.type";
import * as ops from "./organization.ops";

export const organizationsSearch: OrganizationRouteHandler<"organizationsSearch"> = async c =>
  c.json(await ops.searchOrganizationOp.run(c.req.valid("json")));

export const organizationsTree: OrganizationRouteHandler<"organizationsTree"> = async c =>
  c.json(await ops.getOrganizationTreeOp.run(undefined));

export const organizationDetail: OrganizationRouteHandler<"organizationDetail"> = async c =>
  c.json(await ops.getOrganizationOp.run(c.req.valid("param")));

export const organizationCreate: OrganizationRouteHandler<"organizationCreate"> = async c =>
  c.json(await ops.createOrganizationOp.run(c.req.valid("json")));

export const organizationUpdate: OrganizationRouteHandler<"organizationUpdate"> = async c =>
  c.json(await ops.updateOrganizationOp.run({
    orgCode: c.req.valid("param").orgCode,
    data: c.req.valid("json"),
  }));

export const organizationStatusUpdate: OrganizationRouteHandler<"organizationStatusUpdate"> = async c =>
  c.json(await ops.updateOrganizationStatusOp.run({
    orgCode: c.req.valid("param").orgCode,
    status: c.req.valid("json").status,
  }));

export const organizationDelete: OrganizationRouteHandler<"organizationDelete"> = async c =>
  c.json(await ops.deleteOrganizationOp.run(c.req.valid("param")));
```

- [ ] **Step 2: 暂不独立 commit**

---

### Task C5: 重写 `organization.index.ts` 注册所有路由

**Files:**
- Modify: `apps/api/src/routes/admin/organization/organization.index.ts`

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/api/src/routes/admin/organization/organization.index.ts` with:

```ts
import { createRouter } from "@lib/core/create-router";
import { publicAuthenticationHandler } from "@middlewares/authentication.handler";
import * as handlers from "./organization.handlers";
import * as routes from "./organization.routes";

const router = createRouter();

router.use(`*`, publicAuthenticationHandler);

router
  .openapi(routes.organizationsSearch, handlers.organizationsSearch)
  .openapi(routes.organizationsTree, handlers.organizationsTree)
  .openapi(routes.organizationDetail, handlers.organizationDetail)
  .openapi(routes.organizationCreate, handlers.organizationCreate)
  .openapi(routes.organizationUpdate, handlers.organizationUpdate)
  .openapi(routes.organizationStatusUpdate, handlers.organizationStatusUpdate)
  .openapi(routes.organizationDelete, handlers.organizationDelete);

export default router;
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit C2-C5**

```bash
git add apps/api/src/routes/admin/organization/organization.ops.ts \
        apps/api/src/routes/admin/organization/organization.routes.ts \
        apps/api/src/routes/admin/organization/organization.handlers.ts \
        apps/api/src/routes/admin/organization/organization.index.ts
git commit -m "refactor(api): 组织路由重构为 RESTful 格式并接入 business-op 双暴露"
```

---

### Task C6: 新建 `organization.trpc.ts`

**Files:**
- Create: `apps/api/src/routes/admin/organization/organization.trpc.ts`

- [ ] **Step 1: 创建文件**

Create `apps/api/src/routes/admin/organization/organization.trpc.ts` with:

```ts
import { router } from "@/trpc/trpc";
import * as ops from "./organization.ops";

export const organizationAdminRouter = router({
  search: ops.searchOrganizationOp.toTRPC(),
  tree: ops.getOrganizationTreeOp.toTRPC(),
  detail: ops.getOrganizationOp.toTRPC(),
  create: ops.createOrganizationOp.toTRPC(),
  update: ops.updateOrganizationOp.toTRPC(),
  updateStatus: ops.updateOrganizationStatusOp.toTRPC(),
  delete: ops.deleteOrganizationOp.toTRPC(),
});
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/organization/organization.trpc.ts
git commit -m "feat(api): 新增组织 tRPC router 复用 business-op"
```

---

### Task C7: 聚合进 adminRouter

**Files:**
- Modify: `apps/api/src/trpc/routers/admin/index.ts`

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/api/src/trpc/routers/admin/index.ts` with:

```ts
import { organizationAdminRouter } from "@/routes/admin/organization/organization.trpc";
import { positionAdminRouter } from "@/routes/admin/position/position.trpc";
import { router } from "@/trpc/trpc";

export const adminRouter = router({
  organization: organizationAdminRouter,
  position: positionAdminRouter,
});
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/trpc/routers/admin/index.ts
git commit -m "feat(api): admin tRPC 聚合路由挂载 organization 子路由"
```

---

## Phase D — 后端手测（用户执行）

### Task D1: Scalar + curl 验证

- [ ] **Step 1: 启动 API**

```bash
pnpm --filter @iam/api dev
```
Expected: 服务启动在 `http://localhost:30000`，无报错日志。

- [ ] **Step 2: 打开 Scalar UI**

浏览器打开 `http://localhost:30000/doc/scalar`
Expected: `Admin/Organization` 分组下有 7 个端点（search / tree / detail / create / update / status / delete），不再有 `/set`。

- [ ] **Step 3: 验证 GET /admin/organizations/tree**

GET `/admin/organizations/tree`
Expected: `{code:200, data:[...]}`，每个节点含 `id/orgCode/orgName/orgType/status/level/parentId/orderNum/children`。

- [ ] **Step 4: 验证 POST /admin/organizations/**

POST `/admin/organizations/` body:
```json
{
  "orgCode": "TEST-ORG-1",
  "orgName": "测试组织1",
  "orgType": "部门",
  "parentCode": null
}
```
Expected: `{code:200, data:true}`

- [ ] **Step 5: 验证 GET /admin/organizations/:orgCode**

GET `/admin/organizations/TEST-ORG-1`
Expected: 含 `statusText / childrenCount / employmentCount / isLeaf / parentCode / parentName`。

- [ ] **Step 6: 验证 PUT /:orgCode**

PUT `/admin/organizations/TEST-ORG-1` body `{"orgName":"测试组织1-改"}`
Expected: `{code:200, data:true}`；再 GET 验证名字已更新。

- [ ] **Step 7: 验证 PATCH /:orgCode/status**

PATCH `/admin/organizations/TEST-ORG-1/status` body `{"status":2}`
Expected: `{code:200, data:true}`；GET 验证 `status: 2, statusText: "暂停"`。

- [ ] **Step 8: 验证 POST /search**

POST `/admin/organizations/search` body:
```json
{"pageNum":1,"pageSize":10,"conditions":{"fuzzyConditions":{"text":"TEST"},"exactConditions":{}}}
```
Expected: 分页列表含 TEST-ORG-1。

- [ ] **Step 9: 验证 DELETE /:orgCode**

DELETE `/admin/organizations/TEST-ORG-1`
Expected: `{code:200, data:true}`；再 GET 返回 `{code:<非200>, message:"组织不存在"}`。

- [ ] **Step 10: 验证删除拒绝（子组织存在）**

先准备场景：创建 TEST-ORG-PARENT 和 TEST-ORG-CHILD（`parentCode:"TEST-ORG-PARENT"`），DELETE `/admin/organizations/TEST-ORG-PARENT`
Expected: `{code:409,message:"该组织下存在子组织，无法删除"}`

- [ ] **Step 11: 验证 /rpc 端点同步工作**

```bash
curl -X POST http://localhost:30000/rpc/admin.organization.tree \
  -H "Content-Type: application/json" \
  -H "Client: iam" \
  -d '{}'
```
Expected: tRPC 标准响应结构，`result.data` 含树数组（或 401/403 表示鉴权层正常）。

- [ ] **Step 12: 清理测试数据**

通过 Scalar DELETE 上述 TEST-* 记录；或 Prisma Studio 手动清理。

- [ ] **Step 13: 全部通过后无需额外 commit**

---

## Phase E — Admin 前端服务层

### Task E1: `services/organization.ts`

**Files:**
- Create: `apps/admin/src/services/organization.ts`

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/services/organization.ts` with:

```ts
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@iam/api/trpc";
import { Status } from "@iam/shared";
import { apiClient } from "@/lib/api-client";

type AdminOrgOutputs = inferRouterOutputs<AppRouter>["admin"]["organization"];
export type OrganizationVo = AdminOrgOutputs["search"]["result"][number];
export type OrganizationDetailVo = AdminOrgOutputs["detail"];
export type OrganizationTreeNode = AdminOrgOutputs["tree"][number];

export type OrganizationSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: {
      orgType?: string;
      status?: number;
      parentOrgCode?: string;
    };
  };
};

export function searchOrganizations(params: OrganizationSearchParams) {
  return apiClient.admin.organization.search.query(params);
}

export function getOrganizationTree() {
  return apiClient.admin.organization.tree.query();
}

export function getOrganization(orgCode: string) {
  return apiClient.admin.organization.detail.query({ orgCode });
}

export function createOrganization(body: {
  orgCode: string;
  orgName: string;
  orgType: string;
  parentCode?: string | null;
  status?: Status;
}) {
  return apiClient.admin.organization.create.mutate(body);
}

export function updateOrganization(
  orgCode: string,
  data: { orgName?: string; orgType?: string; status?: Status },
) {
  return apiClient.admin.organization.update.mutate({ orgCode, data });
}

export function updateOrganizationStatus(orgCode: string, status: Status) {
  return apiClient.admin.organization.updateStatus.mutate({ orgCode, status });
}

export function deleteOrganization(orgCode: string) {
  return apiClient.admin.organization.delete.mutate({ orgCode });
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | grep "services/organization" || echo "no errors"`
Expected: "no errors"。若报 `admin.organization` 不在类型中，回到 Task C7 检查聚合。

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/services/organization.ts
git commit -m "feat(admin): 新增组织服务封装对接 tRPC /rpc"
```

---

## Phase F — Admin 前端组件与页面

### Task F1: `OrgFormModal.tsx` 新建/编辑表单

**Files:**
- Create: `apps/admin/src/pages/organizations/components/OrgFormModal.tsx`

**Rationale:** 新建时可从 props 接收 `parentCode` 预填；编辑时 `orgCode` 只读。

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/pages/organizations/components/OrgFormModal.tsx` with:

```tsx
import {
  createOrganization,
  type OrganizationDetailVo,
  updateOrganization,
} from "@/services/organization";
import { ModalForm, ProFormSelect, ProFormText } from "@ant-design/pro-components";
import { getOrganizationStatusOptions, OrganizationType } from "@iam/shared";
import { message } from "antd";

type Props = {
  open: boolean;
  mode: "create-root" | "create-child" | "edit";
  initialValues?: OrganizationDetailVo | null;
  parentCode?: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const orgTypeOptions = Object.values(OrganizationType).map((t) => ({
  label: t,
  value: t,
}));

const titleMap: Record<Props["mode"], string> = {
  "create-root": "新建根组织",
  "create-child": "新建下级组织",
  "edit": "编辑组织",
};

export default function OrgFormModal({
  open,
  mode,
  initialValues,
  parentCode,
  onOpenChange,
  onSuccess,
}: Props) {
  const isEdit = mode === "edit";

  return (
    <ModalForm
      title={titleMap[mode]}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={
        isEdit && initialValues
          ? {
              orgCode: initialValues.orgCode,
              orgName: initialValues.orgName,
              orgType: initialValues.orgType,
              status: initialValues.status,
            }
          : {
              orgType: OrganizationType.Department,
              status: 1,
            }
      }
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        try {
          if (isEdit && initialValues) {
            await updateOrganization(initialValues.orgCode, {
              orgName: values.orgName,
              orgType: values.orgType,
              status: values.status,
            });
            message.success("更新成功");
          } else {
            await createOrganization({
              orgCode: values.orgCode,
              orgName: values.orgName,
              orgType: values.orgType,
              parentCode: mode === "create-child" ? (parentCode ?? null) : null,
              status: values.status,
            });
            message.success("创建成功");
          }
          onSuccess?.();
          return true;
        } catch (err) {
          message.error(err instanceof Error ? err.message : "操作失败");
          return false;
        }
      }}
    >
      <ProFormText
        name="orgCode"
        label="组织编码"
        disabled={isEdit}
        rules={[{ required: true, message: "请输入组织编码" }]}
      />
      <ProFormText
        name="orgName"
        label="组织名称"
        rules={[{ required: true, message: "请输入组织名称" }]}
      />
      <ProFormSelect
        name="orgType"
        label="组织类型"
        options={orgTypeOptions}
        rules={[{ required: true }]}
      />
      {mode === "create-child" && (
        <ProFormText
          label="上级组织"
          initialValue={parentCode ?? ""}
          disabled
          fieldProps={{ value: parentCode ?? "" }}
        />
      )}
      <ProFormSelect
        name="status"
        label="状态"
        options={getOrganizationStatusOptions().map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        rules={[{ required: true }]}
      />
    </ModalForm>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | grep "OrgFormModal" || echo "no errors"`
Expected: "no errors"

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/organizations/components/OrgFormModal.tsx
git commit -m "feat(admin): 新增组织新建/编辑表单 Modal"
```

---

### Task F2: `OrgTree.tsx` 左树组件

**Files:**
- Create: `apps/admin/src/pages/organizations/components/OrgTree.tsx`

**Rationale:** 消费 `/tree` 接口，树节点显示 `orgName (orgCode)` + 状态色点；顶部搜索框按名称/编码模糊过滤并自动展开命中节点。

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/pages/organizations/components/OrgTree.tsx` with:

```tsx
import type { OrganizationTreeNode } from "@/services/organization";
import { getOrganizationStatusOptions } from "@iam/shared";
import { Badge, Input, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import { useMemo, useState } from "react";

type Props = {
  data: OrganizationTreeNode[];
  selectedKey?: string;
  onSelect: (orgCode: string, node: OrganizationTreeNode) => void;
};

type TreeDataNode = DataNode & {
  orgCode: string;
  raw: OrganizationTreeNode;
};

const statusColorMap = Object.fromEntries(
  getOrganizationStatusOptions().map((o) => [
    o.value,
    o.color === "success" ? "green" : o.color === "warning" ? "gold" : "default",
  ]),
) as Record<number, "green" | "gold" | "default">;

function toDataNode(node: OrganizationTreeNode, keyword: string): TreeDataNode {
  const matched = keyword
    && (node.orgName.includes(keyword) || node.orgCode.includes(keyword));
  const title = (
    <span style={{ fontWeight: matched ? 600 : 400 }}>
      <Badge color={statusColorMap[node.status] ?? "default"} />
      {" "}
      {node.orgName}
      <span style={{ color: "#999", marginLeft: 6 }}>
        (
        {node.orgCode}
        )
      </span>
    </span>
  );
  return {
    key: node.orgCode,
    title,
    orgCode: node.orgCode,
    raw: node,
    children: node.children.map((c) => toDataNode(c, keyword)),
  };
}

function collectMatchedKeys(
  nodes: OrganizationTreeNode[],
  keyword: string,
  acc: string[] = [],
): string[] {
  for (const n of nodes) {
    const hit = n.orgName.includes(keyword) || n.orgCode.includes(keyword);
    if (hit) {
      acc.push(n.orgCode);
    }
    if (n.children.length > 0) {
      collectMatchedKeys(n.children, keyword, acc);
    }
  }
  return acc;
}

function collectAncestorKeys(
  nodes: OrganizationTreeNode[],
  targets: Set<string>,
  path: string[] = [],
  acc: Set<string> = new Set(),
): Set<string> {
  for (const n of nodes) {
    const nextPath = [...path, n.orgCode];
    if (targets.has(n.orgCode)) {
      path.forEach((k) => acc.add(k));
    }
    if (n.children.length > 0) {
      collectAncestorKeys(n.children, targets, nextPath, acc);
    }
  }
  return acc;
}

export default function OrgTree({ data, selectedKey, onSelect }: Props) {
  const [keyword, setKeyword] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [autoExpand, setAutoExpand] = useState(true);

  const treeData = useMemo(() => data.map((n) => toDataNode(n, keyword)), [data, keyword]);

  const computedExpanded = useMemo(() => {
    if (!keyword) return expandedKeys;
    const matched = new Set(collectMatchedKeys(data, keyword));
    const ancestors = collectAncestorKeys(data, matched);
    return Array.from(new Set([...ancestors, ...matched]));
  }, [keyword, data, expandedKeys]);

  return (
    <div>
      <Input.Search
        placeholder="搜索组织名称或编码"
        allowClear
        onChange={(e) => {
          setKeyword(e.target.value);
          setAutoExpand(true);
        }}
        style={{ marginBottom: 8 }}
      />
      <Tree<TreeDataNode>
        blockNode
        showLine
        treeData={treeData}
        selectedKeys={selectedKey ? [selectedKey] : []}
        expandedKeys={computedExpanded}
        autoExpandParent={autoExpand}
        onExpand={(keys) => {
          setExpandedKeys(keys as string[]);
          setAutoExpand(false);
        }}
        onSelect={(_, info) => {
          const node = info.node as TreeDataNode;
          onSelect(node.orgCode, node.raw);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | grep "OrgTree" || echo "no errors"`
Expected: "no errors"

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/organizations/components/OrgTree.tsx
git commit -m "feat(admin): 新增组织左树组件含搜索高亮与展开联动"
```

---

### Task F3: `OrgDetailPanel.tsx` 右侧详情面板

**Files:**
- Create: `apps/admin/src/pages/organizations/components/OrgDetailPanel.tsx`

**Rationale:** 未选中时显示占位；选中后展示 ProDescriptions + 下级组织迷你表 + 员工数 + 动作按钮。

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/pages/organizations/components/OrgDetailPanel.tsx` with:

```tsx
import StatusTag from "@/components/StatusTag";
import {
  deleteOrganization,
  type OrganizationDetailVo,
  type OrganizationTreeNode,
  updateOrganizationStatus,
} from "@/services/organization";
import { ProDescriptions } from "@ant-design/pro-components";
import { getOrganizationStatusOptions } from "@iam/shared";
import { Button, Dropdown, Empty, message, Modal, Space, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";

type Props = {
  loading: boolean;
  detail: OrganizationDetailVo | null;
  childrenNodes: OrganizationTreeNode[];
  onEdit: () => void;
  onCreateChild: () => void;
  onSelectChild: (orgCode: string) => void;
  onChanged: () => void;
};

const childColumns = (onSelectChild: (orgCode: string) => void): ColumnsType<OrganizationTreeNode> => [
  {
    title: "编码",
    dataIndex: "orgCode",
    render: (v, row) => (
      <a onClick={() => onSelectChild(row.orgCode)}>{v}</a>
    ),
  },
  { title: "名称", dataIndex: "orgName" },
  { title: "类型", dataIndex: "orgType" },
  {
    title: "状态",
    dataIndex: "status",
    render: (_, row) => <StatusTag domain="org" status={row.status} />,
  },
];

export default function OrgDetailPanel({
  loading,
  detail,
  childrenNodes,
  onEdit,
  onCreateChild,
  onSelectChild,
  onChanged,
}: Props) {
  if (!detail) {
    return (
      <div style={{ padding: 48 }}>
        <Empty description="请选择左侧组织查看详情" />
      </div>
    );
  }

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : "操作失败");

  const onStatusChange = async (status: number) => {
    try {
      await updateOrganizationStatus(detail.orgCode, status);
      message.success("状态已更新");
      onChanged();
    } catch (err) {
      handleError(err);
    }
  };

  const deleteDisabled = detail.childrenCount > 0 || detail.employmentCount > 0;
  const deleteDisabledReason = detail.childrenCount > 0
    ? "有下级组织，不可删除"
    : detail.employmentCount > 0
      ? "存在关联雇佣，不可删除"
      : "";

  const onDelete = () => {
    Modal.confirm({
      title: `删除组织 ${detail.orgName}？`,
      content: "软删除后不会出现在列表中，如需恢复请联系管理员。",
      okType: "danger",
      onOk: async () => {
        try {
          await deleteOrganization(detail.orgCode);
          message.success("已删除");
          onChanged();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Space size="middle">
          <h3 style={{ margin: 0 }}>
            {detail.orgName}
            <span style={{ color: "#999", fontSize: 12, marginLeft: 8 }}>
              {detail.orgCode}
            </span>
          </h3>
          <StatusTag domain="org" status={detail.status} />
        </Space>
        <Space>
          <Button onClick={onCreateChild}>+ 下级组织</Button>
          <Button onClick={onEdit}>编辑</Button>
          <Dropdown
            menu={{
              items: getOrganizationStatusOptions()
                .filter((o) => o.value !== detail.status)
                .map((o) => ({
                  key: String(o.value),
                  label: `切为「${o.label}」`,
                  onClick: () => onStatusChange(o.value),
                })),
            }}
          >
            <Button>状态</Button>
          </Dropdown>
          {deleteDisabled ? (
            <Tooltip title={deleteDisabledReason}>
              <Button danger disabled>删除</Button>
            </Tooltip>
          ) : (
            <Button danger onClick={onDelete}>删除</Button>
          )}
        </Space>
      </div>

      <ProDescriptions<OrganizationDetailVo>
        column={2}
        dataSource={detail}
        loading={loading}
        columns={[
          { title: "编码", dataIndex: "orgCode" },
          { title: "名称", dataIndex: "orgName" },
          { title: "类型", dataIndex: "orgType" },
          { title: "层级", dataIndex: "level" },
          { title: "路径", dataIndex: "path", span: 2 },
          {
            title: "上级",
            dataIndex: "parentName",
            render: (_, row) => row.parentCode
              ? `${row.parentName} (${row.parentCode})`
              : "—",
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (_, row) => <StatusTag domain="org" status={row.status} />,
          },
          { title: "下级数", dataIndex: "childrenCount" },
          { title: "在职雇佣", dataIndex: "employmentCount" },
          {
            title: "创建时间",
            dataIndex: "createTime",
            render: (_, row) => new Date(row.createTime).toLocaleString(),
          },
          {
            title: "更新时间",
            dataIndex: "updateTime",
            render: (_, row) => new Date(row.updateTime).toLocaleString(),
          },
        ]}
      />

      <div style={{ marginTop: 24 }}>
        <h4>下级组织</h4>
        <Table<OrganizationTreeNode>
          rowKey="orgCode"
          size="small"
          pagination={false}
          columns={childColumns(onSelectChild)}
          dataSource={childrenNodes}
          locale={{ emptyText: "无下级组织" }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | grep "OrgDetailPanel" || echo "no errors"`
Expected: "no errors"

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/organizations/components/OrgDetailPanel.tsx
git commit -m "feat(admin): 新增组织右侧详情面板含 Descriptions 与下级表格"
```

---

### Task F4: `pages/organizations/index.tsx` 页面组装

**Files:**
- Modify: `apps/admin/src/pages/organizations/index.tsx`

**Rationale:** 组装左树 + 右详情；维护 selected orgCode / 树数据 / 当前节点详情；树与详情共享刷新。

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/admin/src/pages/organizations/index.tsx` with:

```tsx
import OrgDetailPanel from "@/pages/organizations/components/OrgDetailPanel";
import OrgFormModal from "@/pages/organizations/components/OrgFormModal";
import OrgTree from "@/pages/organizations/components/OrgTree";
import {
  getOrganization,
  getOrganizationTree,
  type OrganizationDetailVo,
  type OrganizationTreeNode,
} from "@/services/organization";
import { PageContainer } from "@ant-design/pro-components";
import { useRequest } from "@umijs/max";
import { Button, Card, Col, message, Row, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";

type FormState =
  | { open: false }
  | { open: true; mode: "create-root" }
  | { open: true; mode: "create-child"; parentCode: string }
  | { open: true; mode: "edit"; initialValues: OrganizationDetailVo };

function findNode(
  nodes: OrganizationTreeNode[],
  orgCode: string,
): OrganizationTreeNode | undefined {
  for (const n of nodes) {
    if (n.orgCode === orgCode) return n;
    const child = findNode(n.children, orgCode);
    if (child) return child;
  }
  return undefined;
}

export default function OrganizationsPage() {
  const [selectedCode, setSelectedCode] = useState<string | undefined>();
  const [formState, setFormState] = useState<FormState>({ open: false });

  const treeReq = useRequest(() => getOrganizationTree(), {
    onError: (e) => message.error(e instanceof Error ? e.message : "加载组织树失败"),
  });

  const detailReq = useRequest<OrganizationDetailVo, [string]>(
    (orgCode: string) => getOrganization(orgCode),
    {
      manual: true,
      onError: (e) => message.error(e instanceof Error ? e.message : "加载组织详情失败"),
    },
  );

  useEffect(() => {
    if (selectedCode) {
      detailReq.run(selectedCode);
    }
  }, [selectedCode]);

  const selectedChildren = useMemo(() => {
    if (!selectedCode || !treeReq.data) return [];
    const node = findNode(treeReq.data, selectedCode);
    return node?.children ?? [];
  }, [selectedCode, treeReq.data]);

  const refreshAll = () => {
    treeReq.refresh();
    if (selectedCode) detailReq.run(selectedCode);
  };

  const onSuccess = () => {
    setFormState({ open: false });
    refreshAll();
  };

  const onDetailChanged = () => {
    // 删除时 detail 已经失效，清选择
    refreshAll();
    setSelectedCode(undefined);
  };

  return (
    <PageContainer title="组织管理">
      <Row gutter={16}>
        <Col span={8}>
          <Card
            title="组织树"
            extra={
              <Button
                type="primary"
                size="small"
                onClick={() => setFormState({ open: true, mode: "create-root" })}
              >
                + 新建根组织
              </Button>
            }
          >
            {treeReq.loading ? (
              <Spin />
            ) : (
              <OrgTree
                data={treeReq.data ?? []}
                selectedKey={selectedCode}
                onSelect={(code) => setSelectedCode(code)}
              />
            )}
          </Card>
        </Col>
        <Col span={16}>
          <Card bodyStyle={{ padding: 0 }}>
            <OrgDetailPanel
              loading={detailReq.loading}
              detail={detailReq.data ?? null}
              childrenNodes={selectedChildren}
              onEdit={() => {
                if (detailReq.data) {
                  setFormState({
                    open: true,
                    mode: "edit",
                    initialValues: detailReq.data,
                  });
                }
              }}
              onCreateChild={() => {
                if (selectedCode) {
                  setFormState({
                    open: true,
                    mode: "create-child",
                    parentCode: selectedCode,
                  });
                }
              }}
              onSelectChild={(code) => setSelectedCode(code)}
              onChanged={onDetailChanged}
            />
          </Card>
        </Col>
      </Row>

      <OrgFormModal
        open={formState.open}
        mode={formState.open ? formState.mode : "create-root"}
        initialValues={formState.open && formState.mode === "edit" ? formState.initialValues : null}
        parentCode={formState.open && formState.mode === "create-child" ? formState.parentCode : null}
        onOpenChange={(open) => {
          if (!open) setFormState({ open: false });
        }}
        onSuccess={onSuccess}
      />
    </PageContainer>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | head -30`
Expected: 无错误（或仅与本模块无关的历史告警）。

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/organizations/index.tsx
git commit -m "feat(admin): 组织管理页面实现左树右详情布局"
```

---

## Phase G — 前端手测 + 收尾

### Task G1: 浏览器手测（用户执行）

- [ ] **Step 1: 并发启动前后端**

Terminal A: `pnpm --filter @iam/api dev`
Terminal B: `pnpm --filter @iam/admin dev`

- [ ] **Step 2: 导航 /organizations**

Expected: 页面加载；左树显示全部组织；Network 面板可见 `POST /rpc/admin.organization.tree`。

- [ ] **Step 3: 点击某个组织**

Expected: 右侧 Descriptions 显示详情；状态 Tag 正确；"下级组织"表格显示子节点。

- [ ] **Step 4: 搜索树**

在左树搜索框输入 "测试"
Expected: 命中节点加粗，并自动展开到命中。

- [ ] **Step 5: 新建根组织**

点 "+ 新建根组织"，填 `TEST-ROOT-1 / 测试根 / 分公司` → 提交
Expected: 树刷新出现新节点。

- [ ] **Step 6: 新建下级组织**

选中 TEST-ROOT-1 → 右上 "+ 下级组织" → 填 `TEST-SUB-1 / 测试子 / 部门` → 提交
Expected: 树中 TEST-ROOT-1 下出现 TEST-SUB-1。

- [ ] **Step 7: 编辑组织**

点右上"编辑"，修改名称 → 提交
Expected: 详情与树同步刷新。

- [ ] **Step 8: 状态切换**

右上"状态"下拉 → 切为暂停
Expected: 右上 Tag 变黄，树节点色点同步变黄。

- [ ] **Step 9: 删除拒绝场景**

选 TEST-ROOT-1（有子） → 删除按钮应 disabled + tooltip "有下级组织，不可删除"。

- [ ] **Step 10: 删除成功场景**

选 TEST-SUB-1（无子、无雇佣） → 点"删除" → 确认
Expected: 提示"已删除"；树移除；右侧重回占位。

- [ ] **Step 11: 清理测试数据**

通过 Scalar 或前端删除 TEST-ROOT-1。

- [ ] **Step 12: 全部通过后无需额外 commit**

---

### Task G2: Self-Review

- [ ] **Step 1: 完整 typecheck + lint**

```bash
pnpm typecheck
pnpm lint
```
Expected: `typecheck` 0 错误；`lint` 无 error（warn 可接受）。

- [ ] **Step 2: 查看提交历史**

```bash
git log --oneline -25
```
Expected: Plan 2 所有提交按 Phase 顺序呈现、描述清晰。

- [ ] **Step 3: 同步 spec（若偏差）**

若实施中对 spec §6.1 有微调（例如 `create-child` 右键菜单未实现，用 "+下级组织"按钮代替），在 spec 文件末尾 changelog 区说明。若完全一致则无需改动。

---

## 遗留与后续

本 plan 完成后：
- 组织管理端到端可用：后端 7 个 RESTful 端点 + 同构 tRPC procedures；前端左树 + 右详情 + CRUD + 状态 + 软删
- `OrganizationHasChildrenError` / `OrganizationHasEmploymentError` 可供后续删除类操作复用
- `defineQueryOp` 支持 `input` 为空 object（用于 tree 类无参数接口），模式已跑通

后续 Plans：
- **Plan 3**：User 模块（表格 + 抽屉 + 重置密码）
- **Plan 4**：Employment 模块（转岗 / 设主岗 / 暂停恢复 / 离职）
