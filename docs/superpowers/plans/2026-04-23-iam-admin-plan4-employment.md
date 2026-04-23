# IAM Admin — Plan 4：雇佣关系模块实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 Plan 1/2/3 打下的 `defineQueryOp`/`defineMutationOp` + tRPC + Hono 双暴露范式，把雇佣关系模块做成端到端可用：后端补齐 RESTful CRUD + 状态切换 + 软删除 + 业务动作（转岗 / 设主岗 / 按用户离职），前端实现 ProTable + 新建/转岗/详情抽屉 + URL 预填跳转。

**Architecture:**
- 后端沿用 Plan 2/3 的"ops → routes/handlers + trpc"拼装：每个端点在 `routes/admin/employment/employment.ops.ts` 用 `defineQueryOp` / `defineMutationOp` 声明一次，Hono handler + tRPC procedure 都只是薄壳
- 管理端读写路径新增一组不过滤 `status/isDelete` 的仓储函数（`*ForAdmin`），保持现有业务侧 `getEmploymentsByUserId` 等的 `status=Enable` 过滤语义不变
- 业务动作（transfer / setPrimary / resign）全部在 `prisma.$transaction` 内原子完成：转岗 = 旧置 Disable+endTime + 新建；设主岗 = 先清同用户其它 primary 再置主；按用户离职 = 全部 Disable+endTime 且 User.status 置 Disable
- 新建雇佣**不校验 PosOrgComposition 存在**（当前 PosOrgComposition 已闲置，直接写 (userId, posId, orgId, compId) 到 Employment 即可；`posOrg` 关系在 MySQL `relationMode="prisma"` 下不强制 FK）
- 前端按 spec 约定：列表用 `ProTable` + 默认隐藏已结束；新建/转岗用 `ModalForm`；详情用 `Drawer + Tabs`；数据层统一走 `apps/admin/src/services/employment.ts` 的 tRPC 客户端包装

**Tech Stack:** Bun + Hono + `@hono/zod-openapi` + tRPC v11 + Prisma（后端），UMI Max + React + Ant Design Pro + `@trpc/client`（前端）

**Module Boundary（与用户对齐后的结论）：**
- "结束雇佣" = `status=Disable` + `endTime=now()`；DELETE /:id 仅用于管理员误录软删除（`isDelete=true`）
- "转岗"新雇佣的 `isPrimary` **默认继承**原雇佣，Modal 允许覆盖
- "按用户离职"对该用户名下所有活跃雇佣置 `status=Disable + endTime=now()`，并把 `User.status` 置 `Disable`
- "设为主岗"采用事务：先把同 `userId` 的其它 `isPrimary=true` 置 false，再把当前置 true
- 新建雇佣**不校验 PosOrgComposition**
- 列表默认隐藏 `status=Disable`（前端 request 回调在 `statuses` 未显式选择时注入 `[Enable, Pause]`）
- 从用户抽屉跳 `/employments?username=xxx` 会自动打开"新建雇佣" Modal 并把 `username` 字段 disabled 预填
- 列表 VO **不**附带 roles/privileges；仅在 `EmploymentDetailDrawer` 的 Roles Tab 只读展示（复用 `EmploymentDetailDto`）
- 公司/部门筛选实现为两个独立的远程搜索 Select（通过 `admin.organization.search` 按 `orgType` 过滤），不做 cascader

---

## 文件结构

### 后端新建

- `apps/api/src/errors/EmploymentNotFoundError.ts` — 雇佣关系不存在（404）
- `apps/api/src/errors/EmploymentNotEditableError.ts` — 已结束雇佣拒改（409）
- `apps/api/src/routes/admin/employment/employment.ops.ts` — business-op 定义（9 个 op）
- `apps/api/src/routes/admin/employment/employment.trpc.ts` — tRPC router 聚合

### 后端修改

- `apps/api/src/services/employment/employment.schema.ts` — 新增 `EmploymentAdminPaginationQueryDtoSchema`、`EmploymentAdminCreateDtoSchema`、`EmploymentUpdateDtoSchema`、`EmploymentStatusUpdateDtoSchema`、`EmploymentTransferDtoSchema`
- `apps/api/src/services/employment/employment.type.ts` — 对应类型导出
- `apps/api/src/services/employment/employment.repository.ts` — 新增 `getEmploymentByIdForAdmin`、`searchEmploymentsFuzzyForAdminPaged`、`createEmploymentRecord`、`updateEmploymentRecord`、`unsetPrimariesByUserId`、`setIsPrimary`、`softDeleteEmployment`、`endActiveEmploymentsByUserId`
- `apps/api/src/services/employment/employment.service.ts` — 新增 `getEmploymentDetailByIdForAdmin`、`searchEmploymentsFuzzyForAdmin`、`createEmploymentForAdmin`、`updateEmployment`、`updateEmploymentStatus`、`deleteEmployment`、`transferEmployment`、`setPrimaryEmployment`、`resignUser`
- `apps/api/src/routes/admin/employment/employment.schema.ts` — 新增 `EmploymentDetailVoSchema` / `EmploymentDetailVoConverterSchema`（附带 roles / privileges，供详情抽屉使用）
- `apps/api/src/routes/admin/employment/employment.routes.ts` — 重写为 RESTful 路径（保留 `POST /search` 语义但用新 DTO；新增 GET /:id、POST /、PUT /:id、PATCH /:id/status、DELETE /:id、POST /:id/transfer、POST /:id/set-primary、POST /users/:username/resign；废弃 `POST /set`）
- `apps/api/src/routes/admin/employment/employment.handlers.ts` — 薄 handlers
- `apps/api/src/routes/admin/employment/employment.index.ts` — 重新 wire
- `apps/api/src/trpc/routers/admin/index.ts` — 挂载 `employment: employmentAdminRouter`

### 前端新建

- `apps/admin/src/services/employment.ts` — tRPC 客户端薄封装
- `apps/admin/src/pages/employments/components/EmploymentFormModal.tsx` — 新增雇佣 Modal
- `apps/admin/src/pages/employments/components/TransferModal.tsx` — 转岗 Modal
- `apps/admin/src/pages/employments/components/ResignByUserModal.tsx` — 按用户离职（命令式确认函数）
- `apps/admin/src/pages/employments/components/EmploymentDetailDrawer.tsx` — 详情抽屉（基本 / 角色只读 / 日志占位）

### 前端修改

- `apps/admin/src/pages/employments/index.tsx` — 从 stub 替换为完整列表页

---

## Task 索引

- **Phase A — Backend 错误类**：A1 / A2
- **Phase B — Backend Schema / Type**：B1 / B2
- **Phase C — Backend Repository**：C1
- **Phase D — Backend Service**：D1
- **Phase E — Backend Routes / Ops / tRPC 拼装**：E1 / E2 / E3 / E4 / E5 / E6
- **Phase F — Backend 手测**：F1
- **Phase G — Frontend Service**：G1
- **Phase H — Frontend 页面组件**：H1 / H2 / H3 / H4 / H5 / H6（self-review）
- **Phase I — Frontend 手测**：I1

---

## Task A1：EmploymentNotFoundError 错误类

**Files:**
- Create: `apps/api/src/errors/EmploymentNotFoundError.ts`

- [ ] **Step 1：创建错误类**

写入 `apps/api/src/errors/EmploymentNotFoundError.ts`：

```ts
import { CustomError } from "./CustomError";

export class EmploymentNotFoundError extends CustomError {
  constructor(message: string = "雇佣关系不存在") {
    super(message, 404);
    this.name = "EmploymentNotFoundError";
  }
}
```

- [ ] **Step 2：typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

- [ ] **Step 3：commit**

```bash
git add apps/api/src/errors/EmploymentNotFoundError.ts
git commit -m "feat(api): 新增 EmploymentNotFoundError（404）"
```

---

## Task A2：EmploymentNotEditableError 错误类

**Files:**
- Create: `apps/api/src/errors/EmploymentNotEditableError.ts`

- [ ] **Step 1：创建错误类**

写入 `apps/api/src/errors/EmploymentNotEditableError.ts`：

```ts
import { CustomError } from "./CustomError";

export class EmploymentNotEditableError extends CustomError {
  constructor(message: string = "已结束的雇佣关系不能修改") {
    super(message, 409);
    this.name = "EmploymentNotEditableError";
  }
}
```

- [ ] **Step 2：typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

- [ ] **Step 3：commit**

```bash
git add apps/api/src/errors/EmploymentNotEditableError.ts
git commit -m "feat(api): 新增 EmploymentNotEditableError（409）"
```

---

## Task B1：扩展 employment DTO schema（分页查询 / 创建 / 更新 / 状态 / 转岗）

**Files:**
- Modify: `apps/api/src/services/employment/employment.schema.ts`

**说明：** 现有 `EmploymentPaginationQueryDtoSchema` 使用 `createPageQuerySchema(EmploymentQueryDtoSchema)`，被非 admin 场景的 `searchEmploymentsFuzzy` 消费，**保持不动**。我们新增一套管理端 schema（`EmploymentAdmin*`），避免影响现有链路。

- [ ] **Step 1：在文件末尾追加 admin 端 DTO schema**

在 `apps/api/src/services/employment/employment.schema.ts` 文件**末尾**追加（保留现有所有导出）：

```ts
export const EmploymentAdminPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({
        example: "138550",
        description: "模糊匹配 username / name",
      }),
    }),
    exactConditions: z.object({
      usernames: z.array(z.string()).optional().openapi({ example: ["138550"] }),
      companyOrgCodes: z.array(z.string()).optional().openapi({ example: ["SR"] }),
      deptOrgCodes: z.array(z.string()).optional().openapi({ example: ["SR23"] }),
      posCodes: z.array(z.string()).optional().openapi({ example: ["E033"] }),
      isPrimary: z.boolean().optional().openapi({ example: true }),
      statuses: z.array(z.enum(Status)).optional().openapi({
        example: [Status.Enable, Status.Pause],
        description: "未传则返回全部状态，前端默认注入 [Enable, Pause] 以隐藏已结束",
      }),
    }),
  }),
).openapi("EmploymentAdminPaginationQueryDto");

export const EmploymentAdminCreateDtoSchema = z.object({
  username: z.string().openapi({ example: "138550" }),
  companyOrgCode: z.string().openapi({ example: "SR" }),
  deptOrgCode: z.string().openapi({ example: "SR23" }),
  posCode: z.string().openapi({ example: "E033" }),
  isPrimary: z.boolean().optional().openapi({ example: false }),
  startTime: z.coerce.date().optional().openapi({
    example: "2026-04-23T00:00:00.000Z",
    description: "缺省则由后端写入 now()",
  }),
  description: z.string().max(500).nullable().optional(),
}).openapi("EmploymentAdminCreateDto");

export const EmploymentUpdateDtoSchema = z.object({
  isPrimary: z.boolean().optional(),
  startTime: z.coerce.date().optional(),
  description: z.string().max(500).nullable().optional(),
}).openapi("EmploymentUpdateDto");

export const EmploymentStatusUpdateDtoSchema = z.object({
  status: z.enum(Status),
}).openapi("EmploymentStatusUpdateDto");

export const EmploymentTransferDtoSchema = z.object({
  newCompanyOrgCode: z.string().openapi({ example: "SB" }),
  newDeptOrgCode: z.string().openapi({ example: "SB01" }),
  newPosCode: z.string().openapi({ example: "E034" }),
  startTime: z.coerce.date().optional().openapi({
    description: "新雇佣的 startTime；缺省 now()",
  }),
  inheritPrimary: z.boolean().optional().openapi({
    example: true,
    description: "是否继承原雇佣的 isPrimary；缺省 true",
  }),
  description: z.string().max(500).nullable().optional(),
}).openapi("EmploymentTransferDto");
```

- [ ] **Step 2：typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

- [ ] **Step 3：commit**

```bash
git add apps/api/src/services/employment/employment.schema.ts
git commit -m "feat(api): 扩展 employment admin DTO schema"
```

---

## Task B2：employment.type.ts 对应类型导出

**Files:**
- Modify: `apps/api/src/services/employment/employment.type.ts`

- [ ] **Step 1：读现有文件**

Read: `apps/api/src/services/employment/employment.type.ts`

定位现有 `export interface` 行（仅有 `EmploymentDto`/`EmploymentQueryDto`/`EmploymentPaginationQueryDto`/`EmploymentCreateDto`）。

- [ ] **Step 2：把 import 段和 interface 段扩展为**

把 `import` 段替换为：

```ts
import type { z } from "@hono/zod-openapi";
import type {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentCreateDtoSchema,
  EmploymentDetailDtoSchema,
  EmploymentDtoSchema,
  EmploymentPaginationQueryDtoSchema,
  EmploymentQueryDtoSchema,
  EmploymentStatusUpdateDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "./employment.schema";
```

在现有 interface 之后追加：

```ts
export interface EmploymentDetailDto extends z.infer<typeof EmploymentDetailDtoSchema> {}
export interface EmploymentAdminPaginationQueryDto
  extends z.infer<typeof EmploymentAdminPaginationQueryDtoSchema> {}
export interface EmploymentAdminCreateDto extends z.infer<typeof EmploymentAdminCreateDtoSchema> {}
export interface EmploymentUpdateDto extends z.infer<typeof EmploymentUpdateDtoSchema> {}
export interface EmploymentStatusUpdateDto extends z.infer<typeof EmploymentStatusUpdateDtoSchema> {}
export interface EmploymentTransferDto extends z.infer<typeof EmploymentTransferDtoSchema> {}
```

（若现有文件已经 export 了 `EmploymentDetailDto`，跳过重复那一行。）

- [ ] **Step 3：typecheck + commit**

```bash
pnpm --filter @iam/api typecheck
git add apps/api/src/services/employment/employment.type.ts
git commit -m "feat(api): 导出 Employment admin DTO 类型"
```

---

## Task C1：employment.repository 扩展管理端仓储函数

**Files:**
- Modify: `apps/api/src/services/employment/employment.repository.ts`

- [ ] **Step 1：在文件末尾追加管理端新函数**

在 `apps/api/src/services/employment/employment.repository.ts` 文件**末尾**追加（保留所有现有函数）：

```ts
import type { EmploymentAdminPaginationQueryDto } from "./employment.type";

export async function getEmploymentByIdForAdmin(
  id: number,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.findFirst({
    where: {
      id,
      isDelete: false,
    },
    include: {
      user: true,
      deptartment: true,
      company: true,
      position: true,
    },
  });
}

export async function getEmploymentsByUserIdForAdmin(
  userId: number,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.findMany({
    where: {
      userId,
      isDelete: false,
    },
    include: {
      user: true,
      deptartment: true,
      company: true,
      position: true,
    },
  });
}

function buildEmploymentAdminWhere(dto: EmploymentAdminPaginationQueryDto) {
  const text = dto.conditions.fuzzyConditions.text;
  return {
    isDelete: false,
    status: { in: dto.conditions.exactConditions.statuses },
    isPrimary: dto.conditions.exactConditions.isPrimary,
    user: {
      isDelete: false,
      username: { in: dto.conditions.exactConditions.usernames },
      ...(text !== undefined
        ? {
            OR: [
              { username: { contains: text } },
              { name: { contains: text } },
            ],
          }
        : {}),
    },
    company: {
      isDelete: false,
      orgCode: { in: dto.conditions.exactConditions.companyOrgCodes },
    },
    deptartment: {
      isDelete: false,
      orgCode: { in: dto.conditions.exactConditions.deptOrgCodes },
    },
    position: {
      isDelete: false,
      posCode: { in: dto.conditions.exactConditions.posCodes },
    },
  };
}

export async function searchEmploymentsFuzzyForAdminPaged(
  dto: EmploymentAdminPaginationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  const { pageNum, pageSize } = dto;
  const where = buildEmploymentAdminWhere(dto);
  const [rows, total] = await Promise.all([
    tx.employment.findMany({
      where,
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
      include: {
        user: true,
        deptartment: true,
        company: true,
        position: true,
      },
    }),
    tx.employment.count({ where }),
  ]);
  return { rows, total };
}

export async function createEmploymentRecord(
  data: {
    userId: number;
    posId: number;
    orgId: number;
    compId: number;
    isPrimary?: boolean;
    startTime?: Date;
    description?: string | null;
    status?: number;
  },
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.create({
    data: {
      userId: data.userId,
      posId: data.posId,
      orgId: data.orgId,
      compId: data.compId,
      isPrimary: data.isPrimary ?? false,
      startTime: data.startTime ?? new Date(),
      description: data.description ?? null,
      status: data.status ?? Status.Enable,
    },
  });
}

export async function updateEmploymentRecord(
  id: number,
  data: {
    isPrimary?: boolean;
    startTime?: Date;
    endTime?: Date | null;
    description?: string | null;
    status?: number;
  },
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.update({
    where: { id },
    data,
  });
}

export async function unsetPrimariesByUserId(
  userId: number,
  exceptEmploymentId: number | null,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.updateMany({
    where: {
      userId,
      isPrimary: true,
      isDelete: false,
      ...(exceptEmploymentId !== null ? { NOT: { id: exceptEmploymentId } } : {}),
    },
    data: { isPrimary: false },
  });
}

export async function softDeleteEmployment(
  id: number,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.update({
    where: { id },
    data: { isDelete: true },
  });
}

export async function endActiveEmploymentsByUserId(
  userId: number,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.updateMany({
    where: {
      userId,
      isDelete: false,
      status: { in: [Status.Enable, Status.Pause] },
    },
    data: {
      status: Status.Disable,
      endTime: new Date(),
    },
  });
}
```

**注意：**
- `buildEmploymentAdminWhere` 对 `status` / `isPrimary` / `orgCode` 等过滤字段使用 `{ in: undefined }`、`undefined` 来让 Prisma 忽略，与 user 模块保持一致的模式
- 排序 `isPrimary desc, id desc` 让主岗排前面
- `createEmploymentRecord` 直接写 (userId, posId, orgId, compId) — 不校验 `PosOrgComposition`（MySQL `relationMode="prisma"` 下 FK 不强制）

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/api typecheck
git add apps/api/src/services/employment/employment.repository.ts
git commit -m "feat(api): employment repository 增加管理端查询/变更/计数函数"
```

---

## Task D1：employment.service 管理端函数

**Files:**
- Modify: `apps/api/src/services/employment/employment.service.ts`

- [ ] **Step 1：在文件顶部的 import 段追加**

定位现有 import 块（大约第 1–10 行），追加这些 import（保持 lint 自修顺序）：

```ts
import type {
  EmploymentAdminCreateDto,
  EmploymentAdminPaginationQueryDto,
  EmploymentTransferDto,
  EmploymentUpdateDto,
} from "./employment.type";
import { EmploymentNotEditableError } from "@errors/EmploymentNotEditableError";
import { EmploymentNotFoundError } from "@errors/EmploymentNotFoundError";
import { UserNotFoundError } from "@errors/UserNotFoundError";
import { prisma } from "@/db";
import { Status } from "@enums/status";
import { EmploymentDetailDtoSchema } from "./employment.schema";
import * as privilegeRepository from "@/services/privilege/privilege.repository";
import * as roleRepository from "@/services/role/role.repository";
import * as userRepository from "@/services/user/user.repository";
```

（注意 `CustomError` / `organizationRepository` / `positionRepository` 等已有 import — 不要重复。）

- [ ] **Step 2：在文件末尾追加管理端函数**

在 `apps/api/src/services/employment/employment.service.ts` 文件**末尾**追加：

```ts
export async function getEmploymentDetailByIdForAdmin(id: number) {
  const employment = await employmentRepository.getEmploymentByIdForAdmin(id);
  if (employment === null) {
    throw new EmploymentNotFoundError();
  }
  const roles = await roleRepository.getRolesByEmploymentId(employment.id);
  const privileges = await privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
  const dto = EmploymentDetailDtoSchema.parse(EmploymentDtoConverterSchema.parse(employment));
  dto.roles = roles.map(r => r.roleCode);
  dto.privileges = privileges.map(p => p.privilegeCode);
  return dto;
}

export async function searchEmploymentsFuzzyForAdmin(dto: EmploymentAdminPaginationQueryDto) {
  const { rows, total } = await employmentRepository.searchEmploymentsFuzzyForAdminPaged(dto);
  const result = rows.map(e => EmploymentDtoConverterSchema.parse(e));
  const pages = total === 0 ? 0 : Math.ceil(total / dto.pageSize);
  return {
    result,
    total,
    pageNum: dto.pageNum,
    pageSize: dto.pageSize,
    pages,
  };
}

export async function createEmploymentForAdmin(dto: EmploymentAdminCreateDto) {
  return await prisma.$transaction(async (tx) => {
    const [user, dept, company, position] = await Promise.all([
      userRepository.getUserByUsernameForAdmin(dto.username, tx),
      organizationRepository.getOrganizationByCode(dto.deptOrgCode, tx),
      organizationRepository.getOrganizationByCode(dto.companyOrgCode, tx),
      positionRepository.getPositionByCode(dto.posCode, tx),
    ]);
    if (user === null) throw new UserNotFoundError("用户不存在");
    if (dept === null) throw new CustomError("部门不存在");
    if (company === null) throw new CustomError("公司不存在");
    if (position === null) throw new CustomError("岗位不存在");

    const existing = await employmentRepository.getEmploymentByUserOrgPosId(
      user.id,
      dept.id,
      position.id,
      tx,
    );
    if (existing !== null) {
      throw new CustomError("相同任职关系已存在");
    }

    const newIsPrimary = dto.isPrimary ?? false;
    if (newIsPrimary) {
      await employmentRepository.unsetPrimariesByUserId(user.id, null, tx);
    }

    const created = await employmentRepository.createEmploymentRecord(
      {
        userId: user.id,
        posId: position.id,
        orgId: dept.id,
        compId: company.id,
        isPrimary: newIsPrimary,
        startTime: dto.startTime,
        description: dto.description ?? null,
        status: Status.Enable,
      },
      tx,
    );
    return { id: created.id };
  });
}

export async function updateEmployment(id: number, dto: EmploymentUpdateDto) {
  return await prisma.$transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null) throw new EmploymentNotFoundError();
    if (existing.status === Status.Disable) throw new EmploymentNotEditableError();

    // 若把当前置为主岗，先清同用户其它 primary
    if (dto.isPrimary === true && existing.isPrimary === false) {
      await employmentRepository.unsetPrimariesByUserId(existing.userId, id, tx);
    }

    await employmentRepository.updateEmploymentRecord(
      id,
      {
        isPrimary: dto.isPrimary,
        startTime: dto.startTime,
        description: dto.description,
      },
      tx,
    );
    return true;
  });
}

export async function updateEmploymentStatus(id: number, status: number) {
  return await prisma.$transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null) throw new EmploymentNotFoundError();

    const patch: { status: number; endTime?: Date | null } = { status };
    if (status === Status.Disable) {
      patch.endTime = new Date();
    }
    else if (existing.status === Status.Disable) {
      // 从已结束恢复 → 清空 endTime
      patch.endTime = null;
    }

    await employmentRepository.updateEmploymentRecord(id, patch, tx);
    return true;
  });
}

export async function deleteEmployment(id: number) {
  return await prisma.$transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null) throw new EmploymentNotFoundError();
    await employmentRepository.softDeleteEmployment(id, tx);
    return true;
  });
}

export async function transferEmployment(id: number, dto: EmploymentTransferDto) {
  return await prisma.$transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null) throw new EmploymentNotFoundError();
    if (existing.status === Status.Disable) throw new EmploymentNotEditableError();

    const [dept, company, position] = await Promise.all([
      organizationRepository.getOrganizationByCode(dto.newDeptOrgCode, tx),
      organizationRepository.getOrganizationByCode(dto.newCompanyOrgCode, tx),
      positionRepository.getPositionByCode(dto.newPosCode, tx),
    ]);
    if (dept === null) throw new CustomError("新部门不存在");
    if (company === null) throw new CustomError("新公司不存在");
    if (position === null) throw new CustomError("新岗位不存在");

    const inheritPrimary = dto.inheritPrimary ?? true;
    const newIsPrimary = inheritPrimary ? existing.isPrimary : false;

    // 1. 结束旧雇佣
    const now = new Date();
    await employmentRepository.updateEmploymentRecord(
      id,
      { status: Status.Disable, endTime: now, isPrimary: false },
      tx,
    );

    // 2. 若新为主岗，先清该用户其它 primary（此时旧的 isPrimary 已置 false）
    if (newIsPrimary) {
      await employmentRepository.unsetPrimariesByUserId(existing.userId, null, tx);
    }

    // 3. 创建新雇佣
    const created = await employmentRepository.createEmploymentRecord(
      {
        userId: existing.userId,
        posId: position.id,
        orgId: dept.id,
        compId: company.id,
        isPrimary: newIsPrimary,
        startTime: dto.startTime ?? now,
        description: dto.description ?? null,
        status: Status.Enable,
      },
      tx,
    );
    return { newEmploymentId: created.id };
  });
}

export async function setPrimaryEmployment(id: number) {
  return await prisma.$transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null) throw new EmploymentNotFoundError();
    if (existing.status === Status.Disable) throw new EmploymentNotEditableError();

    await employmentRepository.unsetPrimariesByUserId(existing.userId, id, tx);
    await employmentRepository.updateEmploymentRecord(id, { isPrimary: true }, tx);
    return true;
  });
}

export async function resignUser(username: string) {
  return await prisma.$transaction(async (tx) => {
    const user = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (user === null) throw new UserNotFoundError("用户不存在");

    await employmentRepository.endActiveEmploymentsByUserId(user.id, tx);
    await userRepository.updateUserByUsername(
      username,
      { status: Status.Disable },
      tx,
    );
    return true;
  });
}
```

**注意：**
- `CustomError` 已在文件顶部 import；若没有，加 `import { CustomError } from "@errors/CustomError";`
- `organizationRepository` / `positionRepository` 已在现有 `setEmployment` 中 import，无需重复
- `roleRepository.getRolesByEmploymentId` 与 `privilegeRepository.getPrivilegesByRoleIds` 在 user.service 中已被同样引用（行为一致）

- [ ] **Step 2：lint:fix + typecheck**

```bash
pnpm --filter @iam/api lint:fix
pnpm --filter @iam/api typecheck
```

Expected: 无新增错误

- [ ] **Step 3：commit**

```bash
git add apps/api/src/services/employment/employment.service.ts
git commit -m "feat(api): employment service 增加管理端 CRUD + 业务动作（transfer/setPrimary/resign）"
```

---

## Task E1：routes/admin/employment/employment.schema.ts 增加 DetailVo

**Files:**
- Modify: `apps/api/src/routes/admin/employment/employment.schema.ts`

- [ ] **Step 1：整体替换文件内容为**

```ts
import { z } from "@hono/zod-openapi";
import { statusToString } from "@/enums/status";
import { EmploymentDetailDtoSchema, EmploymentDtoSchema } from "@/services/employment/employment.schema";

export const EmploymentVoSchema = EmploymentDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("EmploymentVo");

export const EmploymentVoConverterSchema = EmploymentDtoSchema.transform(dto => ({
  ...dto,
  statusText: statusToString[dto.status],
})).pipe(EmploymentVoSchema);

export const EmploymentDetailVoSchema = EmploymentDetailDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("EmploymentDetailVo");

export const EmploymentDetailVoConverterSchema = EmploymentDetailDtoSchema.transform(dto => ({
  ...dto,
  statusText: statusToString[dto.status],
})).pipe(EmploymentDetailVoSchema);
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/api typecheck
git add apps/api/src/routes/admin/employment/employment.schema.ts
git commit -m "feat(api): employment VO 增加 DetailVo"
```

---

## Task E2：routes/admin/employment/employment.ops.ts（business-op 定义）

**Files:**
- Create: `apps/api/src/routes/admin/employment/employment.ops.ts`

- [ ] **Step 1：新建文件**

```ts
import { z } from "zod";
import { Status } from "@/enums/status";
import { defineMutationOp, defineQueryOp } from "@/lib/core/business-op";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentStatusUpdateDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@/services/employment/employment.schema";
import * as employmentService from "@/services/employment/employment.service";
import { EmploymentDetailVoConverterSchema, EmploymentVoConverterSchema } from "./employment.schema";

export const searchEmploymentOp = defineQueryOp({
  input: EmploymentAdminPaginationQueryDtoSchema,
  handler: async (input) => {
    const { result, ...rest } = await employmentService.searchEmploymentsFuzzyForAdmin(input);
    return {
      result: result.map(e => EmploymentVoConverterSchema.parse(e)),
      ...rest,
    };
  },
});

export const getEmploymentOp = defineQueryOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: async ({ id }) => {
    const detail = await employmentService.getEmploymentDetailByIdForAdmin(id);
    return EmploymentDetailVoConverterSchema.parse(detail);
  },
});

export const createEmploymentOp = defineMutationOp({
  input: EmploymentAdminCreateDtoSchema,
  handler: input => employmentService.createEmploymentForAdmin(input),
});

export const updateEmploymentOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    data: EmploymentUpdateDtoSchema,
  }),
  handler: ({ id, data }) => employmentService.updateEmployment(id, data),
});

export const updateEmploymentStatusOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    status: z.enum(Status),
  }),
  handler: ({ id, status }) => employmentService.updateEmploymentStatus(id, status),
});

export const deleteEmploymentOp = defineMutationOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: ({ id }) => employmentService.deleteEmployment(id),
});

export const transferEmploymentOp = defineMutationOp({
  input: z.object({
    id: z.coerce.number().int().positive(),
    data: EmploymentTransferDtoSchema,
  }),
  handler: ({ id, data }) => employmentService.transferEmployment(id, data),
});

export const setPrimaryEmploymentOp = defineMutationOp({
  input: z.object({ id: z.coerce.number().int().positive() }),
  handler: ({ id }) => employmentService.setPrimaryEmployment(id),
});

export const resignUserOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }) => employmentService.resignUser(username),
});

// re-export for handler body schemas
export { EmploymentStatusUpdateDtoSchema };
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/api typecheck
git add apps/api/src/routes/admin/employment/employment.ops.ts
git commit -m "feat(api): 新增 employment business-op 定义（9 个端点）"
```

---

## Task E3：routes/admin/employment/employment.routes.ts 重写为 RESTful

**Files:**
- Modify: `apps/api/src/routes/admin/employment/employment.routes.ts`

- [ ] **Step 1：整体替换文件内容为**

```ts
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@/lib/core/pagination/schema";
import { EmploymentDetailVoSchema, EmploymentVoSchema } from "@/routes/admin/employment/employment.schema";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentStatusUpdateDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@/services/employment/employment.schema";

const tags = ["Admin/Employment"];

export const employmentsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(EmploymentAdminPaginationQueryDtoSchema, "雇佣关系分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(EmploymentVoSchema))),
      "分页雇佣列表",
    ),
  },
});

export const employmentsDetail = createRoute({
  method: "get",
  path: "/:id",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(EmploymentDetailVoSchema),
      "雇佣详情（含 roles/privileges 聚合）",
    ),
  },
});

export const employmentsCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(EmploymentAdminCreateDtoSchema, "新增雇佣参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.object({ id: z.number() })),
      "雇佣创建成功",
    ),
  },
});

export const employmentsUpdate = createRoute({
  method: "put",
  path: "/:id",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: jsonContentRequired(EmploymentUpdateDtoSchema, "雇佣更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "更新成功"),
  },
});

export const employmentsStatusUpdate = createRoute({
  method: "patch",
  path: "/:id/status",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: jsonContentRequired(EmploymentStatusUpdateDtoSchema, "雇佣状态变更（status=Disable 时自动写 endTime=now）"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
  },
});

export const employmentsDelete = createRoute({
  method: "delete",
  path: "/:id",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "软删除成功"),
  },
});

export const employmentsTransfer = createRoute({
  method: "post",
  path: "/:id/transfer",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: jsonContentRequired(EmploymentTransferDtoSchema, "转岗参数（原子事务：结束旧 + 建新）"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.object({ newEmploymentId: z.number() })),
      "转岗成功",
    ),
  },
});

export const employmentsSetPrimary = createRoute({
  method: "post",
  path: "/:id/set-primary",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "已设为主岗"),
  },
});

export const employmentsResignUser = createRoute({
  method: "post",
  path: "/users/:username/resign",
  tags,
  request: {
    params: z.object({ username: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.boolean()),
      "离职成功（级联结束全部雇佣 + User.status=Disable）",
    ),
  },
});
```

**注意：** 原 `POST /set` 路由**移除**（spec 明确废弃对外路由；service 层 `setEmployment` 函数依然保留供内部使用）。

- [ ] **Step 2：typecheck + commit**

Run: `pnpm --filter @iam/api typecheck`
Expected: 会在 `employment.handlers.ts` / `employment.index.ts` 出现找不到 handler 的错误 —— 这是预期的，下一步修复。先 commit 独立改动：

```bash
git add apps/api/src/routes/admin/employment/employment.routes.ts
git commit -m "feat(api): employment routes 重构为 RESTful（9 个端点）"
```

---

## Task E4：routes/admin/employment/employment.handlers.ts 改为薄 handlers

**Files:**
- Modify: `apps/api/src/routes/admin/employment/employment.handlers.ts`

- [ ] **Step 1：整体替换文件内容为**

```ts
import type { EmploymentRouteHandler } from "./employment.type";
import * as ops from "./employment.ops";

export const employmentsSearch: EmploymentRouteHandler<"employmentsSearch"> = async c =>
  c.json(await ops.searchEmploymentOp.run(c.req.valid("json")));

export const employmentsDetail: EmploymentRouteHandler<"employmentsDetail"> = async c =>
  c.json(await ops.getEmploymentOp.run(c.req.valid("param")));

export const employmentsCreate: EmploymentRouteHandler<"employmentsCreate"> = async c =>
  c.json(await ops.createEmploymentOp.run(c.req.valid("json")));

export const employmentsUpdate: EmploymentRouteHandler<"employmentsUpdate"> = async c =>
  c.json(await ops.updateEmploymentOp.run({
    id: c.req.valid("param").id,
    data: c.req.valid("json"),
  }));

export const employmentsStatusUpdate: EmploymentRouteHandler<"employmentsStatusUpdate"> = async c =>
  c.json(await ops.updateEmploymentStatusOp.run({
    id: c.req.valid("param").id,
    status: c.req.valid("json").status,
  }));

export const employmentsDelete: EmploymentRouteHandler<"employmentsDelete"> = async c =>
  c.json(await ops.deleteEmploymentOp.run(c.req.valid("param")));

export const employmentsTransfer: EmploymentRouteHandler<"employmentsTransfer"> = async c =>
  c.json(await ops.transferEmploymentOp.run({
    id: c.req.valid("param").id,
    data: c.req.valid("json"),
  }));

export const employmentsSetPrimary: EmploymentRouteHandler<"employmentsSetPrimary"> = async c =>
  c.json(await ops.setPrimaryEmploymentOp.run(c.req.valid("param")));

export const employmentsResignUser: EmploymentRouteHandler<"employmentsResignUser"> = async c =>
  c.json(await ops.resignUserOp.run(c.req.valid("param")));
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/api typecheck
git add apps/api/src/routes/admin/employment/employment.handlers.ts
git commit -m "feat(api): employment handlers 改为薄壳调用 business-op"
```

---

## Task E5：routes/admin/employment/employment.index.ts 重新 wire

**Files:**
- Modify: `apps/api/src/routes/admin/employment/employment.index.ts`

- [ ] **Step 1：整体替换文件内容为**

```ts
import { createRouter } from "@lib/core/create-router";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./employment.handlers";
import * as routes from "./employment.routes";

const router = createRouter();

router.use("*", publicAuthenicationHandler);

router
  .openapi(routes.employmentsSearch, handlers.employmentsSearch)
  .openapi(routes.employmentsDetail, handlers.employmentsDetail)
  .openapi(routes.employmentsCreate, handlers.employmentsCreate)
  .openapi(routes.employmentsUpdate, handlers.employmentsUpdate)
  .openapi(routes.employmentsStatusUpdate, handlers.employmentsStatusUpdate)
  .openapi(routes.employmentsDelete, handlers.employmentsDelete)
  .openapi(routes.employmentsTransfer, handlers.employmentsTransfer)
  .openapi(routes.employmentsSetPrimary, handlers.employmentsSetPrimary)
  .openapi(routes.employmentsResignUser, handlers.employmentsResignUser);

export default router;
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/api typecheck
git add apps/api/src/routes/admin/employment/employment.index.ts
git commit -m "feat(api): employment.index 重新 wire 9 个 RESTful 端点"
```

---

## Task E6：employment.trpc.ts 新建 + 挂到 admin 根 router

**Files:**
- Create: `apps/api/src/routes/admin/employment/employment.trpc.ts`
- Modify: `apps/api/src/trpc/routers/admin/index.ts`

- [ ] **Step 1：创建 `apps/api/src/routes/admin/employment/employment.trpc.ts`**

```ts
import { router } from "@/trpc/trpc";
import * as ops from "./employment.ops";

export const employmentAdminRouter = router({
  search: ops.searchEmploymentOp.toTRPC(),
  detail: ops.getEmploymentOp.toTRPC(),
  create: ops.createEmploymentOp.toTRPC(),
  update: ops.updateEmploymentOp.toTRPC(),
  updateStatus: ops.updateEmploymentStatusOp.toTRPC(),
  delete: ops.deleteEmploymentOp.toTRPC(),
  transfer: ops.transferEmploymentOp.toTRPC(),
  setPrimary: ops.setPrimaryEmploymentOp.toTRPC(),
  resignUser: ops.resignUserOp.toTRPC(),
});
```

- [ ] **Step 2：更新 `apps/api/src/trpc/routers/admin/index.ts`**

```ts
import { employmentAdminRouter } from "@/routes/admin/employment/employment.trpc";
import { organizationAdminRouter } from "@/routes/admin/organization/organization.trpc";
import { positionAdminRouter } from "@/routes/admin/position/position.trpc";
import { userAdminRouter } from "@/routes/admin/user/user.trpc";
import { router } from "@/trpc/trpc";

export const adminRouter = router({
  organization: organizationAdminRouter,
  position: positionAdminRouter,
  user: userAdminRouter,
  employment: employmentAdminRouter,
});
```

- [ ] **Step 3：typecheck + commit**

```bash
pnpm --filter @iam/api typecheck
git add apps/api/src/routes/admin/employment/employment.trpc.ts apps/api/src/trpc/routers/admin/index.ts
git commit -m "feat(api): 挂载 employment tRPC router 到 admin 根"
```

---

## Task F1：后端 Scalar/curl 手测

**说明：** 项目没有测试框架，通过 Scalar UI 与 curl 覆盖主要路径。

- [ ] **Step 1：启动 API**

```bash
pnpm --filter @iam/api dev
```

确认控制台输出 `http://localhost:30000`，Scalar UI：`http://localhost:30000/doc/scalar`

- [ ] **Step 2：手测清单**

按已有方式登录后复制 cookie 到请求头；逐项验证：

1. **POST /admin/employments/search** body `{pageNum:1, pageSize:10, conditions:{fuzzyConditions:{},exactConditions:{}}}` → `{code:200, data:{result, total, pageNum, pageSize, pages}}`；`result[0]` 含 `statusText` / `username` / `compName` 等
2. **POST /admin/employments/search** body `{..., exactConditions:{statuses:[1,2]}}` → 仅正常/暂停
3. **POST /admin/employments/search** body `{..., exactConditions:{isPrimary:true}}` → 仅主岗
4. **POST /admin/employments/search** body `{..., fuzzyConditions:{text:"蔡"}}` → 用户名或姓名模糊命中
5. **GET /admin/employments/:id** (已知 id) → 含 `roles` / `privileges` / `statusText` 的 detail
6. **GET /admin/employments/999999** (不存在) → 404 `{code:404,message:"雇佣关系不存在"}`
7. **POST /admin/employments** body `{username:"138550", companyOrgCode:"SR", deptOrgCode:"SR23", posCode:"E033", isPrimary:false}` → `{id:N}`
8. **POST /admin/employments** 相同三元组 再发一次 → "相同任职关系已存在"
9. **POST /admin/employments** `{..., isPrimary:true}` → 该用户其它主岗应被清
10. **PUT /admin/employments/:id** `{description:"测试描述"}` → `true`，GET detail 确认
11. **PATCH /admin/employments/:id/status** `{status:2}` → `true`，detail 看到 `statusText="暂停"`
12. **PATCH /admin/employments/:id/status** `{status:3}` → `endTime` 被写入 now
13. **PATCH /admin/employments/:id/status** `{status:1}` （对刚结束的）→ `endTime` 清空
14. **PUT /admin/employments/:id** 对 status=3 的记录 → 409 `EmploymentNotEditableError`
15. **POST /admin/employments/:id/set-primary** → 该用户其它 primary 清空，当前置 true
16. **POST /admin/employments/:id/transfer** body `{newCompanyOrgCode:"SB", newDeptOrgCode:"SB01", newPosCode:"E034", inheritPrimary:true}` → 返回 `{newEmploymentId:N}`；旧记录 status=3+endTime；新记录 status=1 + 可能 isPrimary=true
17. **DELETE /admin/employments/:id** → `true`；search 看不到该记录
18. **POST /admin/employments/users/:username/resign**（选一个测试账户）→ `true`；该账户全部活跃雇佣 status=3+endTime；User.status=3
19. **POST /admin/employments/users/NOT_EXIST/resign** → 404 "用户不存在"

- [ ] **Step 3：标记通过**

无需 commit；将此 Task 标记 completed 即可。

---

## Task G1：admin/services/employment.ts

**Files:**
- Create: `apps/admin/src/services/employment.ts`

- [ ] **Step 1：新建文件**

```ts
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@iam/api/trpc";
import { apiClient } from "@/lib/api-client";

type AdminEmploymentOutputs = inferRouterOutputs<AppRouter>["admin"]["employment"];
export type EmploymentVo = AdminEmploymentOutputs["search"]["result"][number];
export type EmploymentDetailVo = AdminEmploymentOutputs["detail"];

export type EmploymentSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: {
      usernames?: string[];
      companyOrgCodes?: string[];
      deptOrgCodes?: string[];
      posCodes?: string[];
      isPrimary?: boolean;
      statuses?: (1 | 2 | 3)[];
    };
  };
};

export function searchEmployments(params: EmploymentSearchParams) {
  return apiClient.admin.employment.search.query(params);
}

export function getEmployment(id: number) {
  return apiClient.admin.employment.detail.query({ id });
}

export function createEmployment(body: {
  username: string;
  companyOrgCode: string;
  deptOrgCode: string;
  posCode: string;
  isPrimary?: boolean;
  startTime?: Date;
  description?: string | null;
}) {
  return apiClient.admin.employment.create.mutate(body);
}

export function updateEmployment(
  id: number,
  data: {
    isPrimary?: boolean;
    startTime?: Date;
    description?: string | null;
  },
) {
  return apiClient.admin.employment.update.mutate({ id, data });
}

export function updateEmploymentStatus(id: number, status: 1 | 2 | 3) {
  return apiClient.admin.employment.updateStatus.mutate({ id, status });
}

export function deleteEmployment(id: number) {
  return apiClient.admin.employment.delete.mutate({ id });
}

export function transferEmployment(
  id: number,
  data: {
    newCompanyOrgCode: string;
    newDeptOrgCode: string;
    newPosCode: string;
    startTime?: Date;
    inheritPrimary?: boolean;
    description?: string | null;
  },
) {
  return apiClient.admin.employment.transfer.mutate({ id, data });
}

export function setPrimaryEmployment(id: number) {
  return apiClient.admin.employment.setPrimary.mutate({ id });
}

export function resignUser(username: string) {
  return apiClient.admin.employment.resignUser.mutate({ username });
}
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/services/employment.ts
git commit -m "feat(admin): 新增 employment service（tRPC 薄封装）"
```

---

## Task H1：EmploymentFormModal（新增雇佣）

**Files:**
- Create: `apps/admin/src/pages/employments/components/EmploymentFormModal.tsx`

- [ ] **Step 1：新建文件**

```tsx
import { apiClient } from "@/lib/api-client";
import { createEmployment } from "@/services/employment";
import { searchUsers } from "@/services/user";
import {
  ModalForm,
  ProFormDatePicker,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from "@ant-design/pro-components";
import { message } from "antd";

type Props = {
  open: boolean;
  presetUsername?: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function EmploymentFormModal({
  open,
  presetUsername,
  onOpenChange,
  onSuccess,
}: Props) {
  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : "创建失败");

  return (
    <ModalForm
      title={presetUsername ? `为 ${presetUsername} 新增雇佣` : "新增雇佣"}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={{
        username: presetUsername ?? undefined,
        isPrimary: false,
      }}
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        try {
          await createEmployment({
            username: values.username,
            companyOrgCode: values.companyOrgCode,
            deptOrgCode: values.deptOrgCode,
            posCode: values.posCode,
            isPrimary: values.isPrimary,
            startTime: values.startTime ? new Date(values.startTime) : undefined,
            description: values.description || null,
          });
          message.success("雇佣已创建");
          onSuccess?.();
          return true;
        }
        catch (err) {
          handleError(err);
          return false;
        }
      }}
    >
      <ProFormText
        name="username"
        label="用户"
        disabled={!!presetUsername}
        rules={[{ required: true, message: "请输入用户名（工号）" }]}
        tooltip="如果从用户抽屉跳转，此处自动预填"
      />
      <ProFormSelect
        name="companyOrgCode"
        label="公司"
        showSearch
        rules={[{ required: true, message: "请选择公司" }]}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgTypes: ["公司"] as string[] },
            },
          } as unknown as Parameters<typeof apiClient.admin.organization.search.query>[0]);
          return res.result.map((o: { orgCode: string; orgName: string }) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      <ProFormSelect
        name="deptOrgCode"
        label="部门"
        showSearch
        rules={[{ required: true, message: "请选择部门" }]}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgTypes: ["部门"] as string[] },
            },
          } as unknown as Parameters<typeof apiClient.admin.organization.search.query>[0]);
          return res.result.map((o: { orgCode: string; orgName: string }) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      <ProFormSelect
        name="posCode"
        label="岗位"
        showSearch
        rules={[{ required: true, message: "请选择岗位" }]}
        request={async (params) => {
          const res = await apiClient.admin.position.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: {},
            },
          } as unknown as Parameters<typeof apiClient.admin.position.search.query>[0]);
          return res.result.map((p: { posCode: string; posName: string }) => ({
            label: `${p.posName} (${p.posCode})`,
            value: p.posCode,
          }));
        }}
      />
      <ProFormSwitch
        name="isPrimary"
        label="设为主岗"
        tooltip="若选 true，将自动把该用户其它主岗置为非主"
      />
      <ProFormDatePicker
        name="startTime"
        label="生效时间"
        tooltip="不填则使用当前时间"
      />
      <ProFormTextArea name="description" label="备注" />
    </ModalForm>
  );
}
```

**注意：** 
- `searchUsers` import 预留，但本 Modal 并未使用；若 lint 报错，可直接删除这一 import
- `apiClient.admin.organization.search.query` 的入参 schema 和泛型推导可能与 tRPC 类型对 orgTypes 要求严格；代码里使用 `as unknown as ...` 强转以规避类型深度问题。实现时若 TS 不报错，去掉断言即可
- 若现有 `admin.organization.search` 未支持 `orgTypes` 精确过滤，此处搜索候选集会跨所有 orgType。验收时观察下拉候选是否合理；若确需按 orgType 过滤，在 Plan 2 基础上扩展 organization 的 exactConditions 是独立 follow-up，不在本计划内

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/pages/employments/components/EmploymentFormModal.tsx
git commit -m "feat(admin): 新增 EmploymentFormModal（含 URL 预填 username）"
```

---

## Task H2：TransferModal

**Files:**
- Create: `apps/admin/src/pages/employments/components/TransferModal.tsx`

- [ ] **Step 1：新建文件**

```tsx
import { apiClient } from "@/lib/api-client";
import { type EmploymentVo, transferEmployment } from "@/services/employment";
import {
  ModalForm,
  ProFormDatePicker,
  ProFormSelect,
  ProFormSwitch,
  ProFormTextArea,
} from "@ant-design/pro-components";
import { Descriptions, message } from "antd";

type Props = {
  open: boolean;
  employment: EmploymentVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function TransferModal({
  open,
  employment,
  onOpenChange,
  onSuccess,
}: Props) {
  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : "转岗失败");

  return (
    <ModalForm
      title={`转岗 — ${employment?.name ?? ""} (${employment?.username ?? ""})`}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={{ inheritPrimary: true }}
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        if (!employment) return false;
        try {
          await transferEmployment(employment.id, {
            newCompanyOrgCode: values.newCompanyOrgCode,
            newDeptOrgCode: values.newDeptOrgCode,
            newPosCode: values.newPosCode,
            inheritPrimary: values.inheritPrimary,
            startTime: values.startTime ? new Date(values.startTime) : undefined,
            description: values.description || null,
          });
          message.success("转岗成功");
          onSuccess?.();
          return true;
        }
        catch (err) {
          handleError(err);
          return false;
        }
      }}
    >
      {employment && (
        <Descriptions
          size="small"
          bordered
          column={1}
          style={{ marginBottom: 16 }}
          items={[
            { label: "原公司", children: `${employment.compName} (${employment.compCode})` },
            { label: "原部门", children: `${employment.orgName} (${employment.orgCode})` },
            { label: "原岗位", children: `${employment.posName} (${employment.posCode})` },
            { label: "原主岗", children: employment.isPrimary ? "是" : "否" },
          ]}
        />
      )}
      <ProFormSelect
        name="newCompanyOrgCode"
        label="新公司"
        showSearch
        rules={[{ required: true }]}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgTypes: ["公司"] as string[] },
            },
          } as unknown as Parameters<typeof apiClient.admin.organization.search.query>[0]);
          return res.result.map((o: { orgCode: string; orgName: string }) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      <ProFormSelect
        name="newDeptOrgCode"
        label="新部门"
        showSearch
        rules={[{ required: true }]}
        request={async (params) => {
          const res = await apiClient.admin.organization.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: { orgTypes: ["部门"] as string[] },
            },
          } as unknown as Parameters<typeof apiClient.admin.organization.search.query>[0]);
          return res.result.map((o: { orgCode: string; orgName: string }) => ({
            label: `${o.orgName} (${o.orgCode})`,
            value: o.orgCode,
          }));
        }}
      />
      <ProFormSelect
        name="newPosCode"
        label="新岗位"
        showSearch
        rules={[{ required: true }]}
        request={async (params) => {
          const res = await apiClient.admin.position.search.query({
            pageNum: 1,
            pageSize: 50,
            conditions: {
              fuzzyConditions: { text: params.keyWords || undefined },
              exactConditions: {},
            },
          } as unknown as Parameters<typeof apiClient.admin.position.search.query>[0]);
          return res.result.map((p: { posCode: string; posName: string }) => ({
            label: `${p.posName} (${p.posCode})`,
            value: p.posCode,
          }));
        }}
      />
      <ProFormSwitch
        name="inheritPrimary"
        label="继承主岗"
        tooltip="默认继承原雇佣的 isPrimary；关闭则新岗位默认非主"
      />
      <ProFormDatePicker name="startTime" label="新岗位生效时间" />
      <ProFormTextArea name="description" label="备注" />
    </ModalForm>
  );
}
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/pages/employments/components/TransferModal.tsx
git commit -m "feat(admin): 新增 TransferModal（转岗）"
```

---

## Task H3：ResignByUserModal（命令式确认函数）

**Files:**
- Create: `apps/admin/src/pages/employments/components/ResignByUserModal.tsx`

- [ ] **Step 1：新建文件**

```tsx
import { resignUser } from "@/services/employment";
import { apiClient } from "@/lib/api-client";
import { Form, message, Modal, Select } from "antd";

type Args = {
  onSuccess?: () => void;
};

/**
 * 命令式"按用户离职"入口：弹窗内远程搜索用户名 → 二次确认
 */
export function openResignByUserDialog({ onSuccess }: Args) {
  let selectedUsername: string | null = null;
  let selectedName: string | null = null;

  const modal = Modal.confirm({
    title: "按用户离职",
    icon: null,
    width: 480,
    content: (
      <Form layout="vertical" style={{ marginTop: 12 }}>
        <p style={{ marginBottom: 8 }}>
          选中用户后，该用户名下所有活跃雇佣将被结束，且账号状态置为"结束"。此操作不可撤销。
        </p>
        <Form.Item label="选择用户" required>
          <Select
            showSearch
            placeholder="输入工号/姓名搜索"
            style={{ width: "100%" }}
            filterOption={false}
            onChange={(v, opt) => {
              selectedUsername = v as string;
              selectedName = (opt as { _name?: string } | null)?._name ?? null;
            }}
            options={[]}
            onSearch={async (text) => {
              if (!text) return;
              const res = await apiClient.admin.user.search.query({
                pageNum: 1,
                pageSize: 20,
                conditions: {
                  fuzzyConditions: { text },
                  exactConditions: {},
                },
              } as unknown as Parameters<typeof apiClient.admin.user.search.query>[0]);
              modal.update({
                content: (
                  <Form layout="vertical" style={{ marginTop: 12 }}>
                    <p style={{ marginBottom: 8 }}>
                      选中用户后，该用户名下所有活跃雇佣将被结束，且账号状态置为"结束"。此操作不可撤销。
                    </p>
                    <Form.Item label="选择用户" required>
                      <Select
                        showSearch
                        placeholder="输入工号/姓名搜索"
                        style={{ width: "100%" }}
                        filterOption={false}
                        onChange={(v) => {
                          selectedUsername = v as string;
                        }}
                        onSearch={() => { /* retrigger via parent redraw — 保持同一闭包写法 */ }}
                        options={(res.result as Array<{ username: string; name: string }>).map(u => ({
                          label: `${u.name} (${u.username})`,
                          value: u.username,
                        }))}
                      />
                    </Form.Item>
                  </Form>
                ),
              });
            }}
          />
        </Form.Item>
      </Form>
    ),
    okType: "danger",
    okText: "确认离职",
    onOk: async () => {
      if (!selectedUsername) {
        message.warning("请先选择用户");
        return Promise.reject(new Error("no user selected"));
      }
      try {
        await resignUser(selectedUsername);
        message.success(`${selectedName ?? selectedUsername} 已离职`);
        onSuccess?.();
      }
      catch (err) {
        message.error(err instanceof Error ? err.message : "离职失败");
        throw err;
      }
    },
  });
}
```

**注意：** `Modal.confirm` 内嵌动态 `<Select>` 的搜索联动在 antd 中较受限；若实现时发现交互不理想，退化为一个独立的命名组件 `ResignByUserModal`（state + `<Modal open>`）也可以。本任务允许 F3 按实际结果二选一。保持接口 `openResignByUserDialog({onSuccess})` 不变即可。

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/pages/employments/components/ResignByUserModal.tsx
git commit -m "feat(admin): 按用户离职命令式入口"
```

---

## Task H4：EmploymentDetailDrawer（Tabs：基本 / 角色只读 / 日志占位）

**Files:**
- Create: `apps/admin/src/pages/employments/components/EmploymentDetailDrawer.tsx`

- [ ] **Step 1：新建文件**

```tsx
import StatusTag from "@/components/StatusTag";
import { type EmploymentDetailVo, getEmployment } from "@/services/employment";
import { ProDescriptions } from "@ant-design/pro-components";
import { Drawer, Empty, message, Skeleton, Space, Tabs, Tag } from "antd";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  employmentId: number | null;
  onClose: () => void;
};

export default function EmploymentDetailDrawer({
  open,
  employmentId,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<EmploymentDetailVo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || employmentId === null) {
      setDetail(null);
      return;
    }
    setLoading(true);
    getEmployment(employmentId)
      .then(setDetail)
      .catch(err => message.error(err instanceof Error ? err.message : "加载详情失败"))
      .finally(() => setLoading(false));
  }, [open, employmentId]);

  return (
    <Drawer
      width={640}
      open={open}
      onClose={onClose}
      destroyOnClose
      title={
        detail
          ? (
              <Space>
                <span>{detail.name}</span>
                <span style={{ color: "#999", fontSize: 12 }}>{detail.username}</span>
                {detail.isPrimary ? <Tag color="blue">主岗</Tag> : null}
                <StatusTag domain="employment" status={detail.status} />
              </Space>
            )
          : "雇佣详情"
      }
    >
      {loading && !detail ? <Skeleton active /> : null}
      {!loading && !detail ? <Empty /> : null}
      {detail && (
        <Tabs
          items={[
            {
              key: "basic",
              label: "基本信息",
              children: (
                <ProDescriptions<EmploymentDetailVo>
                  column={2}
                  dataSource={detail}
                  columns={[
                    { title: "用户", dataIndex: "name", render: (_, r) => `${r.name} (${r.username})` },
                    {
                      title: "状态",
                      dataIndex: "status",
                      render: (_, r) => <StatusTag domain="employment" status={r.status} />,
                    },
                    { title: "公司", dataIndex: "compName", render: (_, r) => `${r.compName} (${r.compCode})` },
                    { title: "部门", dataIndex: "orgName", render: (_, r) => `${r.orgName} (${r.orgCode})` },
                    { title: "岗位", dataIndex: "posName", render: (_, r) => `${r.posName} (${r.posCode})` },
                    { title: "主岗", dataIndex: "isPrimary", render: (_, r) => (r.isPrimary ? "是" : "否") },
                    {
                      title: "开始",
                      dataIndex: "startTime",
                      render: (_, r) => new Date(r.startTime).toLocaleString(),
                    },
                    {
                      title: "结束",
                      dataIndex: "endTime",
                      render: (_, r) => (r.endTime ? new Date(r.endTime).toLocaleString() : "—"),
                    },
                    { title: "备注", dataIndex: "description", span: 2, render: (_, r) => r.description ?? "—" },
                  ]}
                />
              ),
            },
            {
              key: "roles",
              label: `角色 / 权限 (${detail.roles.length}/${detail.privileges.length})`,
              children: (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>角色：</strong>
                    {detail.roles.length === 0
                      ? <span style={{ color: "#999" }}>无</span>
                      : detail.roles.map(r => <Tag key={r}>{r}</Tag>)}
                  </div>
                  <div>
                    <strong>权限：</strong>
                    {detail.privileges.length === 0
                      ? <span style={{ color: "#999" }}>无</span>
                      : detail.privileges.map(p => <Tag key={p}>{p}</Tag>)}
                  </div>
                </div>
              ),
            },
            {
              key: "logs",
              label: "操作日志",
              children: <Empty description="日志功能尚未接入" />,
            },
          ]}
        />
      )}
    </Drawer>
  );
}
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/pages/employments/components/EmploymentDetailDrawer.tsx
git commit -m "feat(admin): 雇佣详情抽屉（基本/角色只读/日志占位）"
```

---

## Task H5：EmploymentsPage — ProTable + 工具栏 + URL 预填

**Files:**
- Modify: `apps/admin/src/pages/employments/index.tsx`

- [ ] **Step 1：整体替换文件内容为**

```tsx
import StatusTag from "@/components/StatusTag";
import EmploymentDetailDrawer from "@/pages/employments/components/EmploymentDetailDrawer";
import EmploymentFormModal from "@/pages/employments/components/EmploymentFormModal";
import { openResignByUserDialog } from "@/pages/employments/components/ResignByUserModal";
import TransferModal from "@/pages/employments/components/TransferModal";
import {
  deleteEmployment,
  type EmploymentVo,
  searchEmployments,
  setPrimaryEmployment,
  updateEmploymentStatus,
} from "@/services/employment";
import {
  type ActionType,
  PageContainer,
  type ProColumns,
  ProTable,
} from "@ant-design/pro-components";
import { getEmploymentStatusOptions } from "@iam/shared";
import { Button, Dropdown, message, Modal, Space, Tag } from "antd";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "umi";

type PresetFromUrl = {
  username?: string;
};

function parseQuery(search: string): PresetFromUrl {
  const params = new URLSearchParams(search);
  const username = params.get("username");
  return username ? { username } : {};
}

export default function EmploymentsPage() {
  const actionRef = useRef<ActionType>();
  const location = useLocation();

  const [formOpen, setFormOpen] = useState(false);
  const [formPresetUsername, setFormPresetUsername] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<EmploymentVo | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);

  // URL ?username=xxx → 自动打开新增 Modal
  useEffect(() => {
    const preset = parseQuery(location.search);
    if (preset.username) {
      setFormPresetUsername(preset.username);
      setFormOpen(true);
    }
  }, [location.search]);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : "操作失败");

  const onDelete = (row: EmploymentVo) => {
    Modal.confirm({
      title: `删除雇佣 ${row.name} / ${row.posName}？`,
      content: "软删除后该雇佣记录不再可见。",
      okType: "danger",
      onOk: async () => {
        try {
          await deleteEmployment(row.id);
          message.success("已删除");
          actionRef.current?.reload();
        }
        catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onStatusChange = async (row: EmploymentVo, status: 1 | 2 | 3) => {
    try {
      await updateEmploymentStatus(row.id, status);
      message.success("状态已更新");
      actionRef.current?.reload();
    }
    catch (err) {
      handleError(err);
    }
  };

  const onSetPrimary = (row: EmploymentVo) => {
    Modal.confirm({
      title: `将 ${row.name} 的主岗设为 ${row.posName}？`,
      content: "该用户的其它主岗将被自动置为非主。",
      onOk: async () => {
        try {
          await setPrimaryEmployment(row.id);
          message.success("已设为主岗");
          actionRef.current?.reload();
        }
        catch (err) {
          handleError(err);
        }
      },
    });
  };

  const columns: ProColumns<EmploymentVo>[] = [
    { title: "用户", dataIndex: "name", render: (_, r) => `${r.name} (${r.username})`, width: 160 },
    { title: "公司", dataIndex: "compName", width: 140, search: false },
    { title: "部门", dataIndex: "orgName", width: 140, search: false },
    { title: "岗位", dataIndex: "posName", width: 140, search: false },
    {
      title: "主岗",
      dataIndex: "isPrimary",
      width: 80,
      valueEnum: {
        true: { text: "是" },
        false: { text: "否" },
      },
      render: (_, r) => (r.isPrimary ? <Tag color="blue">主岗</Tag> : null),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      valueType: "select",
      valueEnum: Object.fromEntries(
        getEmploymentStatusOptions().map(o => [o.value, { text: o.label }]),
      ),
      render: (_, r) => <StatusTag domain="employment" status={r.status} />,
    },
    {
      title: "起止时间",
      dataIndex: "startTime",
      width: 200,
      search: false,
      render: (_, r) => (
        <span>
          {new Date(r.startTime).toLocaleDateString()}
          {" ~ "}
          {r.endTime ? new Date(r.endTime).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      title: "搜索",
      dataIndex: "username",
      hideInTable: true,
      fieldProps: { placeholder: "工号或姓名" },
    },
    {
      title: "操作",
      valueType: "option",
      width: 260,
      render: (_, row) => {
        const ended = row.status === 3;
        if (ended) {
          return [
            <a key="view" onClick={() => setDrawerId(row.id)}>查看</a>,
          ];
        }
        return [
          <a key="view" onClick={() => setDrawerId(row.id)}>查看</a>,
          <a key="transfer" onClick={() => setTransferTarget(row)}>转岗</a>,
          row.isPrimary
            ? null
            : <a key="primary" onClick={() => onSetPrimary(row)}>设主岗</a>,
          <Dropdown
            key="status"
            menu={{
              items: getEmploymentStatusOptions()
                .filter(o => o.value !== row.status)
                .map(o => ({
                  key: String(o.value),
                  label: `切为「${o.label}」`,
                  onClick: () => onStatusChange(row, o.value as 1 | 2 | 3),
                })),
            }}
          >
            <a>状态</a>
          </Dropdown>,
          <a key="delete" style={{ color: "#d4380d" }} onClick={() => onDelete(row)}>
            删除
          </a>,
        ].filter(Boolean) as React.ReactNode[];
      },
    },
  ];

  return (
    <PageContainer title="雇佣关系">
      <ProTable<EmploymentVo>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: "auto" }}
        request={async (params) => {
          try {
            const {
              current = 1,
              pageSize = 20,
              username,
              status,
            } = params as {
              current?: number;
              pageSize?: number;
              username?: string;
              status?: 1 | 2 | 3;
            };
            const data = await searchEmployments({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: username ? { text: username } : {},
                exactConditions: {
                  statuses: status !== undefined ? [status] : [1, 2],
                },
              },
            });
            return {
              data: data.result,
              total: data.total,
              success: true,
            };
          }
          catch (err) {
            handleError(err);
            return { data: [], total: 0, success: false };
          }
        }}
        toolBarRender={() => [
          <Space key="toolbar">
            <Button
              type="primary"
              onClick={() => {
                setFormPresetUsername(null);
                setFormOpen(true);
              }}
            >
              + 新增雇佣
            </Button>
            <Button
              danger
              onClick={() =>
                openResignByUserDialog({
                  onSuccess: () => actionRef.current?.reload(),
                })}
            >
              按用户离职
            </Button>
          </Space>,
        ]}
      />

      <EmploymentFormModal
        open={formOpen}
        presetUsername={formPresetUsername}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setFormPresetUsername(null);
        }}
        onSuccess={() => {
          setFormOpen(false);
          setFormPresetUsername(null);
          actionRef.current?.reload();
        }}
      />

      <TransferModal
        open={transferTarget !== null}
        employment={transferTarget}
        onOpenChange={(open) => {
          if (!open) setTransferTarget(null);
        }}
        onSuccess={() => {
          setTransferTarget(null);
          actionRef.current?.reload();
        }}
      />

      <EmploymentDetailDrawer
        open={drawerId !== null}
        employmentId={drawerId}
        onClose={() => setDrawerId(null)}
      />
    </PageContainer>
  );
}
```

**注意：**
- `useLocation` 从 `umi` 导入；已在框架内置
- 默认 `statuses: [1, 2]` 隐藏已结束；用户在顶部状态筛选里选具体值（含"结束"）后显示对应
- 操作列条件化：status=3 仅展示"查看"

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/pages/employments/index.tsx
git commit -m "feat(admin): 雇佣关系页面（ProTable + 新增/转岗/离职 + URL 预填）"
```

---

## Task H6：前端 self-review 与 lint

- [ ] **Step 1：format / lint 修复**

```bash
pnpm --filter @iam/admin format 2>/dev/null || true
```

- [ ] **Step 2：自检**

- 核对 `EmploymentVo` / `EmploymentDetailVo` 字段名（`compName` / `orgName` / `posName` / `username` / `name` / `isPrimary` / `startTime` / `endTime`）与 `EmploymentDtoSchema` 产出一致
- 列表 URL `?username=xxx` 预填后，用户关闭 Modal 时 URL 参数仍保留 —— 本次不清理（影响轻微）
- `openResignByUserDialog` 中的动态 Select 联动若体验不佳，允许替换为独立 FC + `<Modal open>` 实现，保持导出接口不变

- [ ] **Step 3：commit（如 format 有差异）**

```bash
git diff --cached --stat
# 若有改动
git commit -m "chore(admin): employments 模块 format/lint"
```

---

## Task I1：前端浏览器手测

- [ ] **Step 1：同时启动 api 和 admin**

```bash
pnpm --filter @iam/api dev      # 终端 1
pnpm --filter @iam/admin dev    # 终端 2
```

- [ ] **Step 2：登录 admin 后走以下清单**

1. `/employments` 加载首页数据，默认只显示 status ∈ {正常, 暂停}
2. 顶部搜索"工号或姓名"→ 模糊命中
3. 状态筛选切"结束"→ 显示已结束记录；切回全部看到正常+暂停
4. 点"+ 新增雇佣"：远程搜索公司 / 部门 / 岗位；不勾 isPrimary → 创建成功
5. 再新建一条同用户的雇佣，勾 isPrimary → 该用户原主岗在列表应显示非主
6. 点某行"查看"→ 详情抽屉展示基本 + 角色（若无则"无"）+ 日志占位
7. 点行"转岗"→ 展示原雇佣只读 + 新目标；默认继承主岗；提交后旧行 status=结束+endTime，新行 status=正常；若继承，新主岗生效
8. 点非主岗行的"设主岗"→ 二次确认 → 同用户其它主岗被清；列表刷新
9. 点行"状态"→ 切暂停/结束；切结束后 endTime 被填；再切回正常 → endTime 清空
10. 已结束行的操作列仅"查看"
11. 点"按用户离职"→ 弹窗搜索用户 → 选中 → 确认 → 该用户所有活跃雇佣结束；User.status=结束（在 `/users` 页确认）
12. 从 `/users` 某用户抽屉点"+ 新增雇佣"→ 跳 `/employments?username=xxx`，自动打开 Modal 且 username 字段 disabled

- [ ] **Step 3：验收通过后人工确认**

用户确认后，手动标记 Task I1 完成；如有问题反馈则创建修复子任务。

---

## Self-Review（计划作者填写）

- **Spec 覆盖**：
  - 4.5 端点：search ✓、GET /:id ✓、POST / ✓、PUT /:id ✓、PATCH /:id/status ✓、DELETE /:id ✓、POST /:id/transfer ✓、POST /:id/set-primary ✓、POST /users/:username/resign ✓；废弃 POST /set ✓
  - 6.4 列表/默认隐藏/条件化操作列/工具栏（新增+按用户离职）/URL 预填 ✓
  - 6.4 公司→部门级联：实现为独立远程搜索 Select（保留 orgType 过滤意图，但不做 cascader） — 在 Module Boundary 与 Task H1 注释中说明
  - 错误类：`EmploymentNotFoundError` / `EmploymentNotEditableError` 新增 ✓；`PrimaryEmploymentRequiredError`（spec 9 节提及）**未新增** —— 本次"按用户离职"级联时不做"必须至少一个主岗"的一致性校验，若后续发现必要再补
- **占位扫描**：
  - Task H1 / H2 中 `apiClient.admin.organization.search.query` / `admin.position.search.query` 的入参断言（`as unknown as ...`）是对 tRPC 深度类型的 workaround，不是占位；实现时若 TS 不报错可直接去掉断言
  - Task H3 内 Modal.confirm 动态 Select 实现不一定理想，已明确允许回退为独立 FC，保持导出接口不变
  - 其它步骤均含完整代码
- **类型一致性**：
  - `searchEmployments` 返回 `{result, total, pageNum, pageSize, pages}`（Task D1 / G1 对齐）
  - `createEmployment` 返回 `{id:number}`（Task D1 / E3 / G1 对齐）
  - `transferEmployment` 返回 `{newEmploymentId:number}`（Task D1 / E3 / G1 对齐）
  - `EmploymentVo` 字段（`compName/compCode/orgName/orgCode/posName/posCode/isPrimary/startTime/endTime/status/statusText/username/name`）— 由 `EmploymentDtoConverterSchema` + `EmploymentVoConverterSchema` 产出；前端 Task H1–H5 使用一致
- **事务完整性**：createEmploymentForAdmin（含 unsetPrimary）/ updateEmployment（含条件 unsetPrimary）/ transferEmployment（三步：结束旧 → unsetPrimary → 建新）/ setPrimaryEmployment（先 unset 再 set）/ resignUser（endActive + User.status）全部在 `prisma.$transaction` 内

---

**执行建议**：Phase A-E 可以一次性连做（每 Task 一次小 commit）；F1 手测 Scalar 通过后再开 G-H；I1 浏览器手测需要同时起 api+admin，完整走一轮 12 项清单后人工确认。
