# IAM 管理后台 · Plan 1 · 共享基础设施 + Position 端到端

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立四模块共用的基础设施（共享状态枚举辅助、前端统一请求解包、通用 StatusTag 组件），并以 Position 为端到端样板完成后端 RESTful 重构与前端 CRUD 页面。

**Architecture:** 后端按 spec §4.4 把 `POST /set` 废弃对外路由，新增精细 RESTful 端点（详情/创建/更新/状态/软删）。前端走 `ProTable + ProForm Modal` 模式；所有 HTTP 走 `apiClient` 端到端类型；数据获取 `useRequest`；状态标签统一 `StatusTag`。

**Tech Stack:** 后端 Hono + `@hono/zod-openapi` + Prisma；前端 UMI Max + Ant Design Pro (ProTable/ProForm) + Hono typed client。项目未配测试框架，验证方式：`tsc --noEmit` + Scalar UI（后端）+ 浏览器手测（前端）。

**Spec reference:** `docs/superpowers/specs/2026-04-21-iam-admin-modules-design.md`

**Execution principles:**
- 每个任务结束后提交一次 git commit
- 代码风格：后端 ESLint (Antfu) 要求分号 + 双引号；前端 Prettier
- 路径别名：后端 `@/*` `@services/*` `@lib/*` `@errors/*` 等；前端 `@/*` 指 `src/`
- 中文提交信息，conventional commits 格式

---

## Phase A — 共享基础设施

### Task A1: `@iam/shared` 状态辅助扩展

**Files:**
- Modify: `packages/shared/src/enums/position.status.ts`
- Modify: `packages/shared/src/enums/user.status.ts`
- Modify: `packages/shared/src/enums/employment.status.ts`
- Modify: `packages/shared/src/enums/organization.status.ts`

**Rationale:** 现有文件只有 `*ToString` 映射；前端的 `StatusTag` 与下拉筛选需要带颜色、label、value 的结构化 options。Organization 连 stringify 都没有。

- [ ] **Step 1: 补齐 `organization.status.ts`**

Replace the entire file `packages/shared/src/enums/organization.status.ts` with:

```ts
export enum OrganizationStatus {
  Enable = 1,
  Pause,
  Disable,
}

export const organizationStatusToString: Record<OrganizationStatus, string> = {
  [OrganizationStatus.Enable]: "正常",
  [OrganizationStatus.Pause]: "暂停",
  [OrganizationStatus.Disable]: "停用",
};

export type StatusOption = {
  label: string;
  value: number;
  color: "success" | "warning" | "default";
};

export function getOrganizationStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: OrganizationStatus.Enable, color: "success" },
    { label: "暂停", value: OrganizationStatus.Pause, color: "warning" },
    { label: "停用", value: OrganizationStatus.Disable, color: "default" },
  ];
}
```

- [ ] **Step 2: 扩展 `position.status.ts`**

Append to `packages/shared/src/enums/position.status.ts`:

```ts
import type { StatusOption } from "./organization.status";

export function getPositionStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: PositionStatus.Enable, color: "success" },
    { label: "暂停", value: PositionStatus.Pause, color: "warning" },
    { label: "废除", value: PositionStatus.Disable, color: "default" },
  ];
}
```

- [ ] **Step 3: 扩展 `user.status.ts`**

Append to `packages/shared/src/enums/user.status.ts`:

```ts
import type { StatusOption } from "./organization.status";

export function getUserStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: UserStatus.Enable, color: "success" },
    { label: "暂停", value: UserStatus.Pause, color: "warning" },
    { label: "结束", value: UserStatus.Disable, color: "default" },
  ];
}
```

- [ ] **Step 4: 扩展 `employment.status.ts`**

Append to `packages/shared/src/enums/employment.status.ts`:

```ts
import type { StatusOption } from "./organization.status";

export function getEmploymentStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: EmploymentStatus.Enable, color: "success" },
    { label: "暂停", value: EmploymentStatus.Pause, color: "warning" },
    { label: "结束", value: EmploymentStatus.Disable, color: "default" },
  ];
}
```

- [ ] **Step 5: 验证类型检查**

Run: `pnpm --filter @iam/api typecheck && pnpm --filter @iam/admin exec tsc --noEmit`
Expected: 无错误输出（shared 通过 rootDir 被两端消费，`StatusOption` 类型跨文件可见）

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/enums/
git commit -m "feat(shared): 扩展状态枚举辅助函数提供带颜色的 options"
```

---

### Task A2: 前端 `utils/request.ts` 响应解包

**Files:**
- Create: `apps/admin/src/utils/request.ts`

**Rationale:** Hono 客户端的 `.json()` 返回 `{code, message, data}`；若 `code !== 200` 需要抛错并附带 message。所有 service 层统一走这个 unwrap。

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/utils/request.ts` with:

```ts
import { message } from "antd";

export class ServiceError extends Error {
  public code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

export async function unwrap<T>(
  response: Response | Promise<Response>,
): Promise<T> {
  const res = await response;
  if (!res.ok) {
    throw new ServiceError(`HTTP ${res.status}`, res.status);
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  if (body.code !== 200) {
    throw new ServiceError(body.message || "请求失败", body.code);
  }
  return body.data;
}

export function handleError(err: unknown) {
  if (err instanceof ServiceError) {
    message.error(err.message);
    return;
  }
  if (err instanceof Error) {
    message.error(err.message);
    return;
  }
  message.error("未知错误");
}
```

- [ ] **Step 2: 验证类型检查**

Run: `pnpm --filter @iam/admin exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/utils/request.ts
git commit -m "feat(admin): 新增统一响应解包与错误处理工具"
```

---

### Task A3: 通用 `StatusTag` 组件

**Files:**
- Create: `apps/admin/src/components/StatusTag.tsx`

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/components/StatusTag.tsx` with:

```tsx
import {
  getEmploymentStatusOptions,
  getOrganizationStatusOptions,
  getPositionStatusOptions,
  getUserStatusOptions,
} from "@iam/shared";
import { Tag } from "antd";

type Domain = "user" | "org" | "position" | "employment";

const optionsByDomain = {
  user: getUserStatusOptions,
  org: getOrganizationStatusOptions,
  position: getPositionStatusOptions,
  employment: getEmploymentStatusOptions,
} as const;

type Props = {
  domain: Domain;
  status: number | undefined | null;
};

export default function StatusTag({ domain, status }: Props) {
  if (status === undefined || status === null) {
    return <Tag>未知</Tag>;
  }
  const option = optionsByDomain[domain]().find((o) => o.value === status);
  if (!option) {
    return <Tag>未知({status})</Tag>;
  }
  return <Tag color={option.color}>{option.label}</Tag>;
}
```

- [ ] **Step 2: 验证类型检查**

Run: `pnpm --filter @iam/admin exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/StatusTag.tsx
git commit -m "feat(admin): 新增通用 StatusTag 组件消费共享状态 options"
```

---

## Phase B — Position 后端 RESTful 重构

### Task B1: 新增 `PositionHasEmploymentError`

**Files:**
- Create: `apps/api/src/errors/PositionHasEmploymentError.ts`

- [ ] **Step 1: 创建错误类**

```ts
import { CustomError } from "./CustomError";

export class PositionHasEmploymentError extends CustomError {
  constructor(message: string = "该岗位下存在雇佣关系，无法删除") {
    super(message, 409);
    this.name = "PositionHasEmploymentError";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/errors/PositionHasEmploymentError.ts
git commit -m "feat(api): 新增 PositionHasEmploymentError 用于岗位删除前置校验"
```

---

### Task B2: Position repository 扩展

**Files:**
- Modify: `apps/api/src/services/position/position.repository.ts`

**Rationale:** 新增 `updatePositionByCode` / `updatePositionStatusByCode` / `softDeletePositionByCode` / `countEmploymentsByPosCode`。现有 `getPositionByCode` 未过滤 `isDelete`，需修正（软删后不应返回）。

- [ ] **Step 1: 替换 `getPositionByCode` 以过滤软删**

Replace the existing `getPositionByCode` function in `apps/api/src/services/position/position.repository.ts` with:

```ts
export async function getPositionByCode(posCode: string, tx: PrismaTransaction = prisma) {
  return await tx.position.findFirst({
    where: {
      posCode,
      isDelete: false,
    },
  });
}
```

- [ ] **Step 2: 在文件末尾追加新函数**

Append to `apps/api/src/services/position/position.repository.ts`:

```ts
export async function updatePositionByCode(
  posCode: string,
  data: { posName?: string; description?: string | null; status?: number },
  tx: PrismaTransaction = prisma,
) {
  return await tx.position.updateMany({
    where: { posCode, isDelete: false },
    data,
  });
}

export async function softDeletePositionByCode(
  posCode: string,
  tx: PrismaTransaction = prisma,
) {
  return await tx.position.updateMany({
    where: { posCode, isDelete: false },
    data: { isDelete: true },
  });
}

export async function countActiveEmploymentsByPosCode(
  posCode: string,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.count({
    where: {
      isDelete: false,
      position: { posCode, isDelete: false },
    },
  });
}
```

- [ ] **Step 3: 验证 typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/position/position.repository.ts
git commit -m "feat(api): 岗位仓储层新增 update/softDelete/countEmployments 并修正软删过滤"
```

---

### Task B3: Position service 扩展

**Files:**
- Modify: `apps/api/src/services/position/position.service.ts`

- [ ] **Step 1: 在现有 service 文件末尾追加**

Append to `apps/api/src/services/position/position.service.ts`:

```ts
export async function getPositionDetailByCode(posCode: string) {
  const pos = await positionRepository.getPositionByCode(posCode);
  if (pos === null) {
    throw new CustomError("岗位不存在", 404);
  }
  return PositionDtoSchema.parse(pos);
}

export async function updatePosition(
  posCode: string,
  data: { posName?: string; description?: string | null; status?: number },
) {
  return await prisma.$transaction(async (tx) => {
    const existing = await positionRepository.getPositionByCode(posCode, tx);
    if (existing === null) {
      throw new CustomError("岗位不存在", 404);
    }
    await positionRepository.updatePositionByCode(posCode, data, tx);
    return true;
  });
}

export async function updatePositionStatus(posCode: string, status: number) {
  return await updatePosition(posCode, { status });
}

export async function deletePosition(posCode: string) {
  return await prisma.$transaction(async (tx) => {
    const existing = await positionRepository.getPositionByCode(posCode, tx);
    if (existing === null) {
      throw new CustomError("岗位不存在", 404);
    }
    const employmentCount = await positionRepository.countActiveEmploymentsByPosCode(posCode, tx);
    if (employmentCount > 0) {
      throw new PositionHasEmploymentError();
    }
    await positionRepository.softDeletePositionByCode(posCode, tx);
    return true;
  });
}
```

- [ ] **Step 2: 在文件顶部补充 import**

Add to the import block at the top of `apps/api/src/services/position/position.service.ts` (after the existing `CustomError` import):

```ts
import { PositionHasEmploymentError } from "@errors/PositionHasEmploymentError";
```

- [ ] **Step 3: 验证 typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/position/position.service.ts
git commit -m "feat(api): 岗位服务层新增 detail/update/status/delete 能力"
```

---

### Task B4: Position route schema 扩展

**Files:**
- Modify: `apps/api/src/services/position/position.schema.ts`

**Rationale:** 新增 `PositionUpdateDtoSchema`（更新时 posCode 从路径来，不需要）和 `PositionStatusUpdateDtoSchema`。

- [ ] **Step 1: 文件末尾追加**

Append to `apps/api/src/services/position/position.schema.ts`:

```ts
export const PositionUpdateDtoSchema = z.object({
  posName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(Status).optional(),
}).openapi("PositionUpdateDto");

export const PositionStatusUpdateDtoSchema = z.object({
  status: z.enum(Status),
}).openapi("PositionStatusUpdateDto");
```

- [ ] **Step 2: 验证 typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/position/position.schema.ts
git commit -m "feat(api): 新增岗位更新与状态变更 schema"
```

---

### Task B5: Position route 定义重构

**Files:**
- Modify: `apps/api/src/routes/admin/position/position.routes.ts`

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/api/src/routes/admin/position/position.routes.ts` with:

```ts
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import {
  PositionCreateDtoSchema,
  PositionDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionStatusUpdateDtoSchema,
  PositionUpdateDtoSchema,
} from "@/services/position/position.schema";
import { PositionVoSchema } from "./position.schema";

const tags = ["Admin/Position"];

export const positionsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(PositionPaginationQueryDtoSchema, "岗位分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(PositionVoSchema)), "符合条件岗位列表"),
  },
});

export const positionDetail = createRoute({
  method: "get",
  path: "/:posCode",
  tags,
  request: {
    params: z.object({ posCode: z.string().openapi({ example: "E001" }) }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(PositionDtoSchema), "岗位详情"),
  },
});

export const positionCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(PositionCreateDtoSchema, "岗位创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "岗位创建成功"),
  },
});

export const positionUpdate = createRoute({
  method: "put",
  path: "/:posCode",
  tags,
  request: {
    params: z.object({ posCode: z.string() }),
    body: jsonContentRequired(PositionUpdateDtoSchema, "岗位更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "岗位更新成功"),
  },
});

export const positionStatusUpdate = createRoute({
  method: "patch",
  path: "/:posCode/status",
  tags,
  request: {
    params: z.object({ posCode: z.string() }),
    body: jsonContentRequired(PositionStatusUpdateDtoSchema, "岗位状态变更"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
  },
});

export const positionDelete = createRoute({
  method: "delete",
  path: "/:posCode",
  tags,
  request: {
    params: z.object({ posCode: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "岗位删除成功"),
  },
});
```

Note: `positionsSet` 已移除 — 批量 `setPositions` service 保留供内部使用，不再暴露路由。

- [ ] **Step 2: 验证 typecheck（会暂时失败，因为 handlers 还引用 positionsSet）**

Run: `pnpm --filter @iam/api typecheck`
Expected: 错误提示 `positionsSet` 找不到（下一个 task 修复）

- [ ] **Step 3: 不独立 commit**，与 B6 一起提交

---

### Task B6: Position handlers 重构

**Files:**
- Modify: `apps/api/src/routes/admin/position/position.handlers.ts`

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/api/src/routes/admin/position/position.handlers.ts` with:

```ts
import type { PositionRouteHandler } from "./position.type";
import * as positionRepository from "@/services/position/position.repository";
import * as positionService from "@/services/position/position.service";
import * as resp from "@/utils/http/response";
import { paginate } from "@/utils/page.util";
import { PositionVoConverterSchema } from "./position.schema";

export const positionsSearch: PositionRouteHandler<"positionsSearch"> = async (c) => {
  const positionPaginationQuery = c.req.valid("json");
  const positions = await positionRepository.searchPositionsFuzzy(positionPaginationQuery);
  const positionVos = positions.map(p => PositionVoConverterSchema.parse(p));
  return c.json(resp.ok(paginate(positionVos, positionPaginationQuery)));
};

export const positionDetail: PositionRouteHandler<"positionDetail"> = async (c) => {
  const { posCode } = c.req.valid("param");
  const data = await positionService.getPositionDetailByCode(posCode);
  return c.json(resp.ok(data));
};

export const positionCreate: PositionRouteHandler<"positionCreate"> = async (c) => {
  const body = c.req.valid("json");
  const data = await positionService.setPosition(body);
  return c.json(resp.ok(data));
};

export const positionUpdate: PositionRouteHandler<"positionUpdate"> = async (c) => {
  const { posCode } = c.req.valid("param");
  const body = c.req.valid("json");
  const data = await positionService.updatePosition(posCode, body);
  return c.json(resp.ok(data));
};

export const positionStatusUpdate: PositionRouteHandler<"positionStatusUpdate"> = async (c) => {
  const { posCode } = c.req.valid("param");
  const { status } = c.req.valid("json");
  const data = await positionService.updatePositionStatus(posCode, status);
  return c.json(resp.ok(data));
};

export const positionDelete: PositionRouteHandler<"positionDelete"> = async (c) => {
  const { posCode } = c.req.valid("param");
  const data = await positionService.deletePosition(posCode);
  return c.json(resp.ok(data));
};
```

- [ ] **Step 2: 验证 typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 可能仍有 index.ts 错误（下一步修复）

- [ ] **Step 3: 暂不独立 commit**

---

### Task B7: Position index.ts 注册新路由

**Files:**
- Modify: `apps/api/src/routes/admin/position/position.index.ts`

- [ ] **Step 1: 替换整个文件**

Replace the entire content of `apps/api/src/routes/admin/position/position.index.ts` with:

```ts
import { createRouter } from "@lib/core/create-router";
import { publicAuthenticationHandler } from "@middlewares/authentication.handler";
import * as handlers from "./position.handlers";
import * as routes from "./position.routes";

const router = createRouter();

router.use(`*`, publicAuthenticationHandler);

router
  .openapi(routes.positionsSearch, handlers.positionsSearch)
  .openapi(routes.positionDetail, handlers.positionDetail)
  .openapi(routes.positionCreate, handlers.positionCreate)
  .openapi(routes.positionUpdate, handlers.positionUpdate)
  .openapi(routes.positionStatusUpdate, handlers.positionStatusUpdate)
  .openapi(routes.positionDelete, handlers.positionDelete);

export default router;
```

- [ ] **Step 2: 验证 typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无错误

- [ ] **Step 3: Commit B5-B7**

```bash
git add apps/api/src/routes/admin/position/
git commit -m "refactor(api): 岗位路由重构为 RESTful 格式并废弃对外 /set 端点"
```

---

### Task B8: 后端手测

- [ ] **Step 1: 启动 API 服务**

Run in a separate terminal: `pnpm --filter @iam/api dev`
Expected: 服务启动在 `http://localhost:30000`

- [ ] **Step 2: 打开 Scalar UI**

Open browser: `http://localhost:30000/doc/scalar`
Expected: 看到 `Admin/Position` 分组下有 6 个端点（search / detail / create / update / status / delete），不再有 `/set`

- [ ] **Step 3: 手测 POST /admin/positions/ 创建**

In Scalar UI: POST `/admin/positions/` with body `{"posCode": "TEST-001", "posName": "测试岗位", "status": 1}`
Expected: `{code:200, data:true}`

- [ ] **Step 4: 手测 GET /admin/positions/:posCode 详情**

GET `/admin/positions/TEST-001`
Expected: `{code:200, data:{posCode:"TEST-001", posName:"测试岗位", status:1, ...}}`

- [ ] **Step 5: 手测 PUT /:posCode**

PUT `/admin/positions/TEST-001` body `{"posName": "测试岗位-改"}`
Expected: `{code:200, data:true}`；再 GET 验证名字已更新

- [ ] **Step 6: 手测 PATCH /:posCode/status**

PATCH `/admin/positions/TEST-001/status` body `{"status": 2}`
Expected: `{code:200, data:true}`；GET 验证 status=2

- [ ] **Step 7: 手测 POST /search**

POST `/admin/positions/search` body `{"pageNum":1,"pageSize":10,"conditions":{"fuzzyConditions":{"text":"测试"},"exactConditions":{}}}`
Expected: 分页结果含 TEST-001

- [ ] **Step 8: 手测 DELETE /:posCode**

DELETE `/admin/positions/TEST-001`
Expected: `{code:200, data:true}`；再 GET 返回 `{code:<非200>, message:"岗位不存在"}`

- [ ] **Step 9: 如所有手测通过则不需要额外 commit**

---

## Phase C — Position 前端

### Task C1: `services/position.ts`

**Files:**
- Create: `apps/admin/src/services/position.ts`

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/services/position.ts` with:

```ts
import { apiClient } from "@/lib/api-client";
import { unwrap } from "@/utils/request";

export type PositionVo = {
  id: number;
  posCode: string;
  posName: string;
  description?: string | null;
  status: number;
  statusText: string;
  memberNumber: number;
  isDelete: boolean;
  createTime: string;
  updateTime: string;
};

export type PositionSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: Record<string, never>;
  };
};

export async function searchPositions(params: PositionSearchParams) {
  return unwrap<{
    result: PositionVo[];
    total: number;
    pageNum: number;
    pageSize: number;
    pages: number;
  }>(apiClient.admin.positions.search.$post({ json: params }));
}

export async function getPosition(posCode: string) {
  return unwrap<PositionVo>(
    apiClient.admin.positions[":posCode"].$get({ param: { posCode } }),
  );
}

export async function createPosition(body: {
  posCode: string;
  posName: string;
  description?: string;
  status?: number;
}) {
  return unwrap<boolean>(apiClient.admin.positions.$post({ json: body }));
}

export async function updatePosition(
  posCode: string,
  body: { posName?: string; description?: string | null; status?: number },
) {
  return unwrap<boolean>(
    apiClient.admin.positions[":posCode"].$put({ param: { posCode }, json: body }),
  );
}

export async function updatePositionStatus(posCode: string, status: number) {
  return unwrap<boolean>(
    apiClient.admin.positions[":posCode"].status.$patch({
      param: { posCode },
      json: { status },
    }),
  );
}

export async function deletePosition(posCode: string) {
  return unwrap<boolean>(
    apiClient.admin.positions[":posCode"].$delete({ param: { posCode } }),
  );
}
```

- [ ] **Step 2: 验证 typecheck**

Run: `pnpm --filter @iam/admin exec tsc --noEmit`
Expected: 无错误（若报 Hono 客户端路径不匹配，说明后端 AppType 未导出正确，返回检查 Task B7）

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/services/position.ts
git commit -m "feat(admin): 新增岗位服务封装对接 RESTful 端点"
```

---

### Task C2: 岗位表单 Modal

**Files:**
- Create: `apps/admin/src/pages/positions/components/PositionFormModal.tsx`

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/pages/positions/components/PositionFormModal.tsx` with:

```tsx
import {
  createPosition,
  type PositionVo,
  updatePosition,
} from "@/services/position";
import { handleError } from "@/utils/request";
import { ModalForm, ProFormSelect, ProFormText, ProFormTextArea } from "@ant-design/pro-components";
import { getPositionStatusOptions } from "@iam/shared";
import { message } from "antd";

type Props = {
  open: boolean;
  initialValues?: PositionVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function PositionFormModal({
  open,
  initialValues,
  onOpenChange,
  onSuccess,
}: Props) {
  const isEdit = !!initialValues;

  return (
    <ModalForm
      title={isEdit ? "编辑岗位" : "新建岗位"}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={
        initialValues
          ? {
              posCode: initialValues.posCode,
              posName: initialValues.posName,
              description: initialValues.description ?? "",
              status: initialValues.status,
            }
          : { status: 1 }
      }
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        try {
          if (isEdit) {
            await updatePosition(initialValues!.posCode, {
              posName: values.posName,
              description: values.description || null,
              status: values.status,
            });
            message.success("更新成功");
          } else {
            await createPosition({
              posCode: values.posCode,
              posName: values.posName,
              description: values.description || undefined,
              status: values.status,
            });
            message.success("创建成功");
          }
          onSuccess?.();
          return true;
        } catch (err) {
          handleError(err);
          return false;
        }
      }}
    >
      <ProFormText
        name="posCode"
        label="岗位编码"
        disabled={isEdit}
        rules={[{ required: true, message: "请输入岗位编码" }]}
      />
      <ProFormText
        name="posName"
        label="岗位名称"
        rules={[{ required: true, message: "请输入岗位名称" }]}
      />
      <ProFormTextArea name="description" label="描述" />
      <ProFormSelect
        name="status"
        label="状态"
        options={getPositionStatusOptions().map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        rules={[{ required: true }]}
      />
    </ModalForm>
  );
}
```

- [ ] **Step 2: 验证 typecheck**

Run: `pnpm --filter @iam/admin exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/positions/components/PositionFormModal.tsx
git commit -m "feat(admin): 新增岗位新建/编辑表单 Modal"
```

---

### Task C3: 岗位列表页

**Files:**
- Modify: `apps/admin/src/pages/positions/index.tsx`

- [ ] **Step 1: 替换整个文件**

Replace the content of `apps/admin/src/pages/positions/index.tsx` with:

```tsx
import StatusTag from "@/components/StatusTag";
import PositionFormModal from "@/pages/positions/components/PositionFormModal";
import {
  deletePosition,
  type PositionVo,
  searchPositions,
  updatePositionStatus,
} from "@/services/position";
import { handleError } from "@/utils/request";
import { ActionType, PageContainer, ProColumns, ProTable } from "@ant-design/pro-components";
import { getPositionStatusOptions } from "@iam/shared";
import { Button, Dropdown, message, Modal, Space } from "antd";
import { useRef, useState } from "react";

export default function PositionsPage() {
  const actionRef = useRef<ActionType>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PositionVo | null>(null);

  const onEdit = (row: PositionVo) => {
    setEditing(row);
    setModalOpen(true);
  };

  const onDelete = (row: PositionVo) => {
    Modal.confirm({
      title: `删除岗位 ${row.posName}？`,
      content: "软删除后不会出现在列表中，如需恢复请联系管理员。",
      okType: "danger",
      onOk: async () => {
        try {
          await deletePosition(row.posCode);
          message.success("已删除");
          actionRef.current?.reload();
        } catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onStatusChange = async (row: PositionVo, status: number) => {
    try {
      await updatePositionStatus(row.posCode, status);
      message.success("状态已更新");
      actionRef.current?.reload();
    } catch (err) {
      handleError(err);
    }
  };

  const columns: ProColumns<PositionVo>[] = [
    { title: "岗位编码", dataIndex: "posCode", width: 160 },
    { title: "岗位名称", dataIndex: "posName", width: 200 },
    { title: "描述", dataIndex: "description", ellipsis: true, search: false },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      search: false,
      render: (_, row) => <StatusTag domain="position" status={row.status} />,
    },
    { title: "雇佣人数", dataIndex: "memberNumber", width: 100, search: false },
    {
      title: "操作",
      valueType: "option",
      width: 220,
      render: (_, row) => [
        <a key="edit" onClick={() => onEdit(row)}>编辑</a>,
        <Dropdown
          key="status"
          menu={{
            items: getPositionStatusOptions()
              .filter((o) => o.value !== row.status)
              .map((o) => ({
                key: String(o.value),
                label: `切为「${o.label}」`,
                onClick: () => onStatusChange(row, o.value),
              })),
          }}
        >
          <a>状态</a>
        </Dropdown>,
        <a key="delete" style={{ color: "#d4380d" }} onClick={() => onDelete(row)}>删除</a>,
      ],
    },
  ];

  return (
    <PageContainer title="职位管理">
      <ProTable<PositionVo>
        actionRef={actionRef}
        rowKey="posCode"
        columns={columns}
        search={{ labelWidth: "auto" }}
        request={async (params) => {
          try {
            const { current = 1, pageSize = 10, posCode, posName } = params as any;
            const text = (posCode || posName || "") as string;
            const data = await searchPositions({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {},
              },
            });
            return {
              data: data.result,
              total: data.total,
              success: true,
            };
          } catch (err) {
            handleError(err);
            return { data: [], total: 0, success: false };
          }
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + 新建岗位
          </Button>,
        ]}
      />
      <PositionFormModal
        open={modalOpen}
        initialValues={editing}
        onOpenChange={setModalOpen}
        onSuccess={() => {
          setModalOpen(false);
          actionRef.current?.reload();
        }}
      />
    </PageContainer>
  );
}
```

- [ ] **Step 2: 验证 typecheck**

Run: `pnpm --filter @iam/admin exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/positions/index.tsx
git commit -m "feat(admin): 职位管理列表页 ProTable 实现完整 CRUD"
```

---

### Task C4: 前端手测

- [ ] **Step 1: 后端保持运行，启动前端**

In a new terminal: `pnpm --filter @iam/admin dev`
Expected: UMI 启动，提示在某端口打开浏览器

- [ ] **Step 2: 导航至 /positions**

浏览器访问前端地址 + `/positions`
Expected: 页面加载，ProTable 显示岗位列表（从代理到后端）

- [ ] **Step 3: 测试新建**

点击"+ 新建岗位"→ 填写 `posCode=TEST-002`, `posName=测试岗2`, status=正常 → 提交
Expected: 列表刷新出现 TEST-002

- [ ] **Step 4: 测试搜索**

搜索栏输入 `TEST`
Expected: 列表筛选

- [ ] **Step 5: 测试编辑**

对一行点"编辑" → 修改名称 → 提交
Expected: 提示成功，列表刷新

- [ ] **Step 6: 测试状态切换**

"状态"下拉切换 → 选"切为「暂停」"
Expected: 行状态 Tag 变黄色"暂停"

- [ ] **Step 7: 测试删除**

点"删除" → 确认
Expected: 行消失；若该岗位有雇佣关联，弹错误提示"该岗位下存在雇佣关系，无法删除"

- [ ] **Step 8: 清理测试数据（可选）**

通过 Scalar UI 或 Prisma Studio 清理 TEST-* 记录

- [ ] **Step 9: 全流程通过后无需额外 commit**

---

## Self-Review & 完成

- [ ] **Step 1: 验证所有 typecheck 通过**

```bash
pnpm typecheck
```
Expected: 所有包 0 错误

- [ ] **Step 2: 验证 lint 通过**

```bash
pnpm lint
```
Expected: 无 error（warn 可接受）

- [ ] **Step 3: 查看提交历史**

```bash
git log --oneline -20
```
Expected: 看到 Phase A/B/C 一系列提交，顺序清晰

- [ ] **Step 4: 更新根 CLAUDE.md 或 spec（如有必要）**

若 spec 有微调，同步更新 `docs/superpowers/specs/2026-04-21-iam-admin-modules-design.md`

---

## 遗留与后续

本 plan 完成后：
- `@iam/shared` 状态 options 已齐备（4 域）
- 前端基础设施（`utils/request`、`StatusTag`）已建立
- Position 模块端到端可用（后端 RESTful + 前端 CRUD + 状态 + 软删）

后续 plans（请基于当前 spec 继续使用 writing-plans 编写）：
- **Plan 2**：Organization 模块（含 `/tree` 端点、左树 + 右详情页）
- **Plan 3**：User 模块（表格 + 抽屉 + 重置密码）
- **Plan 4**：Employment 模块（业务动作：转岗 / 设主岗 / 暂停/恢复 / 离职）

每份 plan 沿用本 plan 的 Phase 结构：共享层扩展（若有）→ 后端 RESTful 化 → 前端页面 → 手测。
