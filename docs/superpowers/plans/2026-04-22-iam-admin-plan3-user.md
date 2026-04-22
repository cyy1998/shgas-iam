# IAM Admin — Plan 3：用户管理模块实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 Plan 2（organization）打下的 `defineQueryOp`/`defineMutationOp` + tRPC + Hono 双暴露范式，把用户管理模块做成端到端可用：后端补齐 RESTful CRUD + 重置密码 + 状态切换 + 软删除，前端实现 ProTable + 新建/编辑 Modal + 重置密码 Modal + 详情抽屉（基本 / 雇佣只读 / 日志占位）。

**Architecture:**
- 后端沿用 Plan 2 的单域"ops → routes/handlers + trpc"拼装：每个端点在 `routes/admin/user/user.ops.ts` 用 `defineQueryOp` / `defineMutationOp` 声明一次，Hono handler + tRPC procedure 都只是薄壳
- 管理端读写路径增加一组不过滤 `status` 的仓储函数（`*ForAdmin`），保持现有业务侧 `getUserByUsername` 等的 `status=Enable` 过滤语义不变，避免牵连 SSO/鉴权链路
- 前端按 spec 约定：列表用 `ProTable`、表单用 `ModalForm`、详情用 `Drawer + Tabs`；数据层统一走 `apps/admin/src/services/user.ts` 的 tRPC 客户端包装

**Tech Stack:** Bun + Hono + `@hono/zod-openapi` + tRPC v11 + Prisma（后端），UMI Max + React + Ant Design Pro + `@trpc/client`（前端），bcrypt-ts 做密码哈希

**Module Boundary（与用户对齐后的结论）：**
- 详情抽屉的"雇佣"Tab 本期**只实现只读列表**，复用已有 `employment.repository.getEmploymentsByUserId`；"+ 新增雇佣"按钮仅拼 `/employments?username=xxx` 跳转，交给 Plan 4
- 管理端读取用户详情**新增**不过滤 `status` 的仓储函数，原业务侧 `getUserByUsername` 的 `status=Enable` 过滤保持不变
- 用户列表**不展示**主岗（部门+岗位）列；详情里从 `employments` 数组中挑 `isPrimary=true` 那条展示
- 删除策略：存在活跃雇佣（`status=Enable` 且 `isDelete=false`）时拒绝删除，抛 `UserHasActiveEmploymentError`（前端按钮置灰 + tooltip，与组织一致）

---

## 文件结构

### 后端新建

- `apps/api/src/errors/UserHasActiveEmploymentError.ts` — 删除用户存在活跃雇佣时的 409 错误
- `apps/api/src/routes/admin/user/user.ops.ts` — business-op 定义（8 个 op）
- `apps/api/src/routes/admin/user/user.trpc.ts` — tRPC router 聚合

### 后端修改

- `apps/api/src/services/user/user.schema.ts` — 新增 `UserAdminCreateDtoSchema` / `UserUpdateDtoSchema` / `UserStatusUpdateDtoSchema`，`UserPaginationQueryDtoSchema` 的 `exactConditions` 增加 `statuses`
- `apps/api/src/services/user/user.type.ts` — 对应类型导出
- `apps/api/src/services/user/user.repository.ts` — 新增 `getUserByUsernameForAdmin`、`updateUserByUsername`、`softDeleteUserByUsername`、`setUserForAdmin`；扩展 `searchUsersFuzzy` 支持 `statuses` 精确过滤
- `apps/api/src/services/user/user.service.ts` — 新增 `getUserDetailByUsernameForAdmin`、`setUserForAdmin`、`updateUser`、`updateUserStatus`、`deleteUser`、`resetPasswordByUsername`
- `apps/api/src/routes/admin/user/user.routes.ts` — 重写为 RESTful 路径（`GET /:username`、`POST /`、`PUT /:username`、`PATCH /:username/status`、`DELETE /:username`、`POST /:username/reset-password`、保留 `POST /search` 与 `POST /generate-password`，移除 `POST /set` 对外路由）
- `apps/api/src/routes/admin/user/user.handlers.ts` — 薄 handlers，调 `ops.xxx.run(...)`
- `apps/api/src/routes/admin/user/user.index.ts` — 重新 wire
- `apps/api/src/trpc/routers/admin/index.ts` — 加入 `user: userAdminRouter`

### 前端新建

- `apps/admin/src/services/user.ts` — tRPC 客户端薄封装
- `apps/admin/src/pages/users/components/UserFormModal.tsx` — 新建/编辑用户
- `apps/admin/src/pages/users/components/ResetPasswordModal.tsx` — 显示后端生成的新密码
- `apps/admin/src/pages/users/components/UserDetailDrawer.tsx` — 右侧抽屉 Tabs（基本 / 雇佣只读 / 日志占位）

### 前端修改

- `apps/admin/src/pages/users/index.tsx` — 从 stub 替换为完整列表页

---

## Task 索引

- **Phase A — Backend 错误 & Schema**：A1 / A2 / A3
- **Phase B — Backend Repository / Service**：B1 / B2
- **Phase C — Routes / Ops / tRPC 拼装**：C1 / C2 / C3 / C4 / C5 / C6
- **Phase D — Backend 手测**：D1
- **Phase E — Frontend Service**：E1
- **Phase F — Frontend 页面组件**：F1 / F2 / F3 / F4 / F5（self-review）
- **Phase G — Frontend 手测**：G1

---

## Task A1：UserHasActiveEmploymentError 错误类

**Files:**
- Create: `apps/api/src/errors/UserHasActiveEmploymentError.ts`

- [ ] **Step 1：创建错误类**

写入 `apps/api/src/errors/UserHasActiveEmploymentError.ts`：

```ts
import { CustomError } from "./CustomError";

export class UserHasActiveEmploymentError extends CustomError {
  constructor(message: string = "该用户仍存在活跃雇佣，无法删除") {
    super(message, 409);
    this.name = "UserHasActiveEmploymentError";
  }
}
```

- [ ] **Step 2：typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误（原有 pre-existing 错误可忽略）

- [ ] **Step 3：commit**

```bash
git add apps/api/src/errors/UserHasActiveEmploymentError.ts
git commit -m "feat(api): 新增 UserHasActiveEmploymentError（409）"
```

---

## Task A2：扩展 user DTO schema（创建/更新/状态/搜索）

**Files:**
- Modify: `apps/api/src/services/user/user.schema.ts`

- [ ] **Step 1：在文件末尾追加 admin 端 DTO schema**

在 `apps/api/src/services/user/user.schema.ts` 文件**末尾**追加（保留所有现有导出）：

```ts
export const UserAdminCreateDtoSchema = UserSchema.partial().required({
  username: true,
  name: true,
  userType: true,
}).omit({
  id: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
  password: true,
}).extend({
  password: z.string().min(8).optional().openapi({
    example: "P@ssw0rd1",
    description: "留空则后端生成随机 8 位密码（需由前端通过单独渠道展示给管理员）",
  }),
  status: z.enum(Status).optional().openapi({ example: Status.Enable }),
}).openapi("UserAdminCreateDto");

export const UserUpdateDtoSchema = UserSchema.partial().pick({
  name: true,
  mobile: true,
  wxId: true,
  userType: true,
  status: true,
  orderNum: true,
}).extend({
  status: z.enum(Status).optional(),
}).openapi("UserUpdateDto");

export const UserStatusUpdateDtoSchema = z.object({
  status: z.enum(Status),
}).openapi("UserStatusUpdateDto");
```

- [ ] **Step 2：为 `UserPaginationQueryDtoSchema.conditions.exactConditions` 增加 `statuses` 字段**

定位到文件中 `UserPaginationQueryDtoSchema` 的定义（约第 32–45 行），把 `exactConditions` 对象改成（**只改 exactConditions，保留 fuzzyConditions 不变**）：

```ts
      exactConditions: z.object({
        userTypes: z.array(z.string()).optional().openapi({ example: ["正式员工"] }),
        usernames: z.array(z.string()).optional().openapi({ example: ["138550", "136163"] }),
        phones: z.array(z.string()).optional().openapi({ example: ["17721462865"] }),
        wxIds: z.array(z.string()).optional().openapi({ example: ["1592677631"] }),
        names: z.array(z.string()).optional().openapi({ example: ["蔡奕阳"] }),
        statuses: z.array(z.enum(Status)).optional().openapi({ example: [Status.Enable, Status.Pause] }),
      }),
```

- [ ] **Step 3：typecheck**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

- [ ] **Step 4：commit**

```bash
git add apps/api/src/services/user/user.schema.ts
git commit -m "feat(api): 扩展用户 DTO schema（create/update/status + 状态精确过滤）"
```

---

## Task A3：user.type.ts 对应类型导出

**Files:**
- Modify: `apps/api/src/services/user/user.type.ts`

- [ ] **Step 1：把文件替换为**

```ts
import type { z } from "@hono/zod-openapi";
import type {
  UserAdminCreateDtoSchema,
  UserCreateDtoSchema,
  UserDetailDtoSchema,
  UserDtoSchema,
  UserPaginationQueryDtoSchema,
  UserQueryDtoSchema,
  UserQueryWithPrivilegeDelegationDtoSchema,
  UserStatusUpdateDtoSchema,
  UserUpdateDtoSchema,
} from "./user.schema";

export interface UserDto extends z.infer<typeof UserDtoSchema> {}
export interface UserDetailDto extends z.infer<typeof UserDetailDtoSchema> {}
export interface UserQueryDto extends z.infer<typeof UserQueryDtoSchema> {}
export interface UserPaginationQueryDto extends z.infer<typeof UserPaginationQueryDtoSchema> {}
export interface UserQueryWithPrivilegeDelegationDto
  extends z.infer<typeof UserQueryWithPrivilegeDelegationDtoSchema> {}
export interface UserCreateDto extends z.infer<typeof UserCreateDtoSchema> {}
export interface UserAdminCreateDto extends z.infer<typeof UserAdminCreateDtoSchema> {}
export interface UserUpdateDto extends z.infer<typeof UserUpdateDtoSchema> {}
export interface UserStatusUpdateDto extends z.infer<typeof UserStatusUpdateDtoSchema> {}
```

- [ ] **Step 2：typecheck + commit**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

```bash
git add apps/api/src/services/user/user.type.ts
git commit -m "feat(api): 导出 User admin DTO 类型"
```

---

## Task B1：user.repository 扩展管理端仓储函数

**Files:**
- Modify: `apps/api/src/services/user/user.repository.ts`

- [ ] **Step 1：`searchUsersFuzzy` 加入 `statuses` 精确过滤**

定位到现有 `searchUsersFuzzy` 函数。在 Prisma `where` 对象中，紧跟 `wxId: { in: ...wxIds }` 之后、`isDelete: false` 之前，插入：

```ts
      status: {
        in: userPaginationQueryDto.conditions.exactConditions.statuses,
      },
```

**注意：** `status` 的值是 `number[] | undefined`；`statuses` 若为 `undefined`，Prisma 会忽略该子句（与现有 `userType` 等同一模式）。

- [ ] **Step 2：在文件末尾追加管理端新函数**

```ts
export async function getUserByUsernameForAdmin(
  username: string,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.findFirst({
    where: {
      username,
      isDelete: false,
    },
  });
}

export async function countUsersFuzzy(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.count({
    where: {
      OR: userPaginationQueryDto.conditions.fuzzyConditions.text !== undefined
        ? [
            { username: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
            { name: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
            { mobile: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
            { wxId: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
          ]
        : undefined,
      userType: { in: userPaginationQueryDto.conditions.exactConditions.userTypes },
      username: { in: userPaginationQueryDto.conditions.exactConditions.usernames },
      mobile: { in: userPaginationQueryDto.conditions.exactConditions.phones },
      wxId: { in: userPaginationQueryDto.conditions.exactConditions.wxIds },
      status: { in: userPaginationQueryDto.conditions.exactConditions.statuses },
      isDelete: false,
    },
  });
}

export async function searchUsersFuzzyPaged(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  const { pageNum, pageSize } = userPaginationQueryDto;
  const [rows, total] = await Promise.all([
    tx.user.findMany({
      where: {
        OR: userPaginationQueryDto.conditions.fuzzyConditions.text !== undefined
          ? [
              { username: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
              { name: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
              { mobile: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
              { wxId: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
            ]
          : undefined,
        userType: { in: userPaginationQueryDto.conditions.exactConditions.userTypes },
        username: { in: userPaginationQueryDto.conditions.exactConditions.usernames },
        mobile: { in: userPaginationQueryDto.conditions.exactConditions.phones },
        wxId: { in: userPaginationQueryDto.conditions.exactConditions.wxIds },
        status: { in: userPaginationQueryDto.conditions.exactConditions.statuses },
        isDelete: false,
      },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy: [{ orderNum: "asc" }, { id: "asc" }],
    }),
    tx.user.count({
      where: {
        OR: userPaginationQueryDto.conditions.fuzzyConditions.text !== undefined
          ? [
              { username: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
              { name: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
              { mobile: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
              { wxId: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
            ]
          : undefined,
        userType: { in: userPaginationQueryDto.conditions.exactConditions.userTypes },
        username: { in: userPaginationQueryDto.conditions.exactConditions.usernames },
        mobile: { in: userPaginationQueryDto.conditions.exactConditions.phones },
        wxId: { in: userPaginationQueryDto.conditions.exactConditions.wxIds },
        status: { in: userPaginationQueryDto.conditions.exactConditions.statuses },
        isDelete: false,
      },
    }),
  ]);
  return { rows, total };
}

export async function updateUserByUsername(
  username: string,
  data: {
    name?: string;
    mobile?: string | null;
    wxId?: string | null;
    userType?: string | null;
    status?: number;
    orderNum?: number;
  },
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.update({
    where: { username },
    data,
  });
}

export async function softDeleteUserByUsername(
  username: string,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.update({
    where: { username },
    data: { isDelete: true },
  });
}

export async function countActiveEmploymentsByUsername(
  username: string,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.count({
    where: {
      isDelete: false,
      status: Status.Enable,
      user: {
        username,
        isDelete: false,
      },
    },
  });
}

export async function setUserForAdmin(
  userCreateDto: UserCreateDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.create({
    data: userCreateDto,
  });
}
```

**注意：** `countActiveEmploymentsByUsername` 直接从 `user.repository` 发起，避免在 service 里再跨 repository 引用；这与 `organization.repository.countActiveEmploymentsByOrgCode` 同构。

- [ ] **Step 3：typecheck + commit**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

```bash
git add apps/api/src/services/user/user.repository.ts
git commit -m "feat(api): user repository 增加管理端只读/变更/计数函数"
```

---

## Task B2：user.service 管理端函数

**Files:**
- Modify: `apps/api/src/services/user/user.service.ts`

- [ ] **Step 1：在文件末尾追加管理端函数**

在 `apps/api/src/services/user/user.service.ts` 末尾追加（**不动已有函数**）：

```ts
export async function getUserDetailByUsernameForAdmin(username: string): Promise<UserDetailDto> {
  const user = await userRepository.getUserByUsernameForAdmin(username);
  if (user === null) {
    throw new UserNotFoundError("用户不存在");
  }
  const userDto = UserDetailDtoSchema.parse(user);
  const employments = await employmentRepository.getEmploymentsByUserId(userDto.id);
  const employmentDtos = [];
  for (const employment of employments) {
    const roles = await roleRepository.getRolesByEmploymentId(employment.id);
    const privileges = await privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
    const employmentDto = EmploymentDetailDtoSchema.parse(EmploymentDtoConverterSchema.parse(employment));
    employmentDto.roles = roles.map(r => r.roleCode);
    employmentDto.privileges = privileges.map(p => p.privilegeCode);
    employmentDtos.push(employmentDto);
  }
  userDto.employments = employmentDtos;
  userDto.roles = [...new Set(employmentDtos.flatMap(e => e.roles))];
  userDto.privileges = [...new Set(employmentDtos.flatMap(e => e.privileges))];
  return userDto;
}

export async function searchUsersFuzzyForAdmin(userPageQuery: UserPaginationQueryDto) {
  const { rows, total } = await userRepository.searchUsersFuzzyPaged(userPageQuery);
  const result = rows.map(u => UserDtoSchema.parse(u));
  const pages = total === 0 ? 0 : Math.ceil(total / userPageQuery.pageSize);
  return {
    result,
    total,
    pageNum: userPageQuery.pageNum,
    pageSize: userPageQuery.pageSize,
    pages,
  };
}

export async function setUserForAdmin(dto: {
  username: string;
  name: string;
  userType: string;
  password?: string;
  mobile?: string | null;
  wxId?: string | null;
  status?: number;
  orderNum?: number;
}): Promise<{ username: string; generatedPassword: string | null }> {
  return await prisma.$transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(dto.username, tx);
    if (existing !== null) {
      throw new CustomError("用户名已存在");
    }
    const plainPassword = dto.password ?? generateRandomPasswordImport();
    const passwordHash = await hash(plainPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setUserForAdmin(
      {
        username: dto.username,
        name: dto.name,
        userType: dto.userType,
        password: passwordHash,
        mobile: dto.mobile ?? null,
        wxId: dto.wxId ?? null,
        status: dto.status ?? Status.Enable,
        orderNum: dto.orderNum ?? 0,
      } as UserCreateDto,
      tx,
    );
    return {
      username: dto.username,
      generatedPassword: dto.password ? null : plainPassword,
    };
  });
}

export async function updateUser(
  username: string,
  data: {
    name?: string;
    mobile?: string | null;
    wxId?: string | null;
    userType?: string | null;
    status?: number;
    orderNum?: number;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }
    await userRepository.updateUserByUsername(username, data, tx);
    return true;
  });
}

export async function updateUserStatus(username: string, status: number) {
  return await updateUser(username, { status });
}

export async function deleteUser(username: string) {
  return await prisma.$transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }
    const activeEmps = await userRepository.countActiveEmploymentsByUsername(username, tx);
    if (activeEmps > 0) {
      throw new UserHasActiveEmploymentError();
    }
    await userRepository.softDeleteUserByUsername(username, tx);
    return true;
  });
}

export async function resetPasswordByUsername(username: string): Promise<string> {
  return await prisma.$transaction(async (tx) => {
    const user = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    const newPassword = generateRandomPasswordImport();
    const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
    return newPassword;
  });
}
```

- [ ] **Step 2：把上面代码里的 `generateRandomPasswordImport` 解析为实际导入**

在文件顶部 import 区追加（保持与现有顺序一致；alphabetical 可由 lint 自修）：

```ts
import { UserHasActiveEmploymentError } from "@errors/UserHasActiveEmploymentError";
import { generateRandomPassword } from "@utils/encryption.utils";
```

然后把代码段里的 `generateRandomPasswordImport()` 全部替换成 `generateRandomPassword(8)`（共 2 处：`setUserForAdmin` 与 `resetPasswordByUsername`）。

- [ ] **Step 3：lint-fix + typecheck**

```bash
pnpm --filter @iam/api lint:fix
pnpm --filter @iam/api typecheck
```

Expected: 无新增 lint/ts 错误（pre-existing 可忽略）

- [ ] **Step 4：commit**

```bash
git add apps/api/src/services/user/user.service.ts
git commit -m "feat(api): user service 增加管理端 CRUD / 重置密码 / 软删除"
```

---

## Task C1：routes/admin/user/user.schema.ts 保留 VO 不变，补充 admin list VO

**Files:**
- Modify: `apps/api/src/routes/admin/user/user.schema.ts`

**说明：** 当前 VO 已包含 `UserVo` 与 `UserDetailVo`，满足列表 + 详情。本 Task 不需要结构性改动，仅核对即可。若发现 `UserVo` 多余字段（privileges/roles）导致列表响应过大，可在后续优化；本次不动，保持最小差异。

- [ ] **Step 1：核对**

Read `apps/api/src/routes/admin/user/user.schema.ts`，确认：

1. `UserVoSchema` 基于 `UserDtoSchema` + `statusText`
2. `UserVoConverterSchema` 从 DTO 转 VO
3. `UserDetailVoSchema` / `UserDetailVoConverterSchema` 存在

若均存在，**跳过本 Task 不 commit**，仅在记录里勾选完成即可。

---

## Task C2：routes/admin/user/user.ops.ts（business-op 定义）

**Files:**
- Create: `apps/api/src/routes/admin/user/user.ops.ts`

- [ ] **Step 1：新建文件**

```ts
import { z } from "zod";
import { Status } from "@/enums/status";
import { defineMutationOp, defineQueryOp } from "@/lib/core/business-op";
import {
  UserAdminCreateDtoSchema,
  UserPaginationQueryDtoSchema,
  UserStatusUpdateDtoSchema,
  UserUpdateDtoSchema,
} from "@/services/user/user.schema";
import * as userService from "@/services/user/user.service";
import { generateRandomPassword } from "@utils/encryption.utils";
import { UserDetailVoConverterSchema, UserVoConverterSchema } from "./user.schema";

export const searchUserOp = defineQueryOp({
  input: UserPaginationQueryDtoSchema,
  handler: async (input) => {
    const { result, ...rest } = await userService.searchUsersFuzzyForAdmin(input);
    return {
      result: result.map(u => UserVoConverterSchema.parse(u)),
      ...rest,
    };
  },
});

export const getUserOp = defineQueryOp({
  input: z.object({ username: z.string() }),
  handler: async ({ username }) => {
    const detail = await userService.getUserDetailByUsernameForAdmin(username);
    return UserDetailVoConverterSchema.parse(detail);
  },
});

export const createUserOp = defineMutationOp({
  input: UserAdminCreateDtoSchema,
  handler: input => userService.setUserForAdmin(input),
});

export const updateUserOp = defineMutationOp({
  input: z.object({
    username: z.string(),
    data: UserUpdateDtoSchema,
  }),
  handler: ({ username, data }) => userService.updateUser(username, data),
});

export const updateUserStatusOp = defineMutationOp({
  input: z.object({
    username: z.string(),
    status: z.enum(Status),
  }),
  handler: ({ username, status }) => userService.updateUserStatus(username, status),
});

export const deleteUserOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }) => userService.deleteUser(username),
});

export const resetPasswordOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }) => userService.resetPasswordByUsername(username),
});

export const generatePasswordOp = defineQueryOp({
  input: z.object({}).optional(),
  handler: () => generateRandomPassword(8),
});

// 为了避免 updateUserStatusOp 和 UserStatusUpdateDtoSchema 间差异，保留 re-export
export { UserStatusUpdateDtoSchema };
```

**注意：**
- `updateUserStatusOp` 的 `input` 里 `status` 字段用 `z.enum(Status)`，与 `UserStatusUpdateDtoSchema` 的 shape 等价；但 Hono 路由的 body 会定义成 `UserStatusUpdateDtoSchema`（只含 `status`），handler 会把路径里的 `username` + body 的 `status` 合并成 `{username, status}` 再传给 op
- `generatePasswordOp` 无 input（定义 `z.object({}).optional()` 兼容 tRPC 客户端调用时不传参数）

- [ ] **Step 2：typecheck + commit**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

```bash
git add apps/api/src/routes/admin/user/user.ops.ts
git commit -m "feat(api): 新增 user business-op 定义（8 个端点）"
```

---

## Task C3：routes/admin/user/user.routes.ts 重写为 RESTful

**Files:**
- Modify: `apps/api/src/routes/admin/user/user.routes.ts`

- [ ] **Step 1：整体替换文件内容为**

```ts
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@/lib/core/pagination/schema";
import { UserDetailVoSchema, UserVoSchema } from "@/routes/admin/user/user.schema";
import {
  UserAdminCreateDtoSchema,
  UserPaginationQueryDtoSchema,
  UserStatusUpdateDtoSchema,
  UserUpdateDtoSchema,
} from "@/services/user/user.schema";

const tags = ["Admin/User"];

export const usersSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(UserPaginationQueryDtoSchema, "用户分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(UserVoSchema))),
      "分页用户列表",
    ),
  },
});

export const usersDetail = createRoute({
  method: "get",
  path: "/:username",
  tags,
  request: {
    params: z.object({ username: z.string().openapi({ example: "138550" }) }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(UserDetailVoSchema),
      "用户详情（含雇佣/角色/权限聚合）",
    ),
  },
});

export const usersCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(UserAdminCreateDtoSchema, "创建用户参数（密码可留空由后端生成）"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.object({
        username: z.string(),
        generatedPassword: z.string().nullable().openapi({
          description: "若请求未提供 password，则返回后端生成的明文密码；否则为 null",
        }),
      })),
      "用户创建成功",
    ),
  },
});

export const usersUpdate = createRoute({
  method: "put",
  path: "/:username",
  tags,
  request: {
    params: z.object({ username: z.string() }),
    body: jsonContentRequired(UserUpdateDtoSchema, "用户更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "更新成功"),
  },
});

export const usersStatusUpdate = createRoute({
  method: "patch",
  path: "/:username/status",
  tags,
  request: {
    params: z.object({ username: z.string() }),
    body: jsonContentRequired(UserStatusUpdateDtoSchema, "用户状态变更"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
  },
});

export const usersDelete = createRoute({
  method: "delete",
  path: "/:username",
  tags,
  request: {
    params: z.object({ username: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "软删除成功"),
  },
});

export const usersResetPassword = createRoute({
  method: "post",
  path: "/:username/reset-password",
  tags,
  request: {
    params: z.object({ username: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.string().openapi({ example: "Z8m2xq7W", description: "新的明文密码" })),
      "密码已重置",
    ),
  },
});

export const usersGeneratePassword = createRoute({
  method: "post",
  path: "/generate-password",
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.string()), "候选密码"),
  },
});
```

**注意：** 原 `POST /set` 路由**移除**（spec 明确废弃对外路由；service 层 `setUsers` 函数依然保留供内部使用）。`POST /detail` / `POST /reset-password`（带 body）路径被替换为 RESTful 形式。

- [ ] **Step 2：typecheck + commit**

Run: `pnpm --filter @iam/api typecheck`
Expected: 会在 `user.handlers.ts` / `user.index.ts` 出现"找不到导出 usersSearch/usersDetail 等"的错误 —— 这是预期的，下一步 Task C4/C5 会修复。先 commit 当前独立改动：

```bash
git add apps/api/src/routes/admin/user/user.routes.ts
git commit -m "feat(api): user routes 重构为 RESTful（/:username + PATCH/DELETE/POST /reset-password）"
```

---

## Task C4：routes/admin/user/user.handlers.ts 改为薄 handlers

**Files:**
- Modify: `apps/api/src/routes/admin/user/user.handlers.ts`

- [ ] **Step 1：整体替换文件内容为**

```ts
import type { UserRouteHandler } from "./user.type";
import * as ops from "./user.ops";

export const usersSearch: UserRouteHandler<"usersSearch"> = async c =>
  c.json(await ops.searchUserOp.run(c.req.valid("json")));

export const usersDetail: UserRouteHandler<"usersDetail"> = async c =>
  c.json(await ops.getUserOp.run(c.req.valid("param")));

export const usersCreate: UserRouteHandler<"usersCreate"> = async c =>
  c.json(await ops.createUserOp.run(c.req.valid("json")));

export const usersUpdate: UserRouteHandler<"usersUpdate"> = async c =>
  c.json(await ops.updateUserOp.run({
    username: c.req.valid("param").username,
    data: c.req.valid("json"),
  }));

export const usersStatusUpdate: UserRouteHandler<"usersStatusUpdate"> = async c =>
  c.json(await ops.updateUserStatusOp.run({
    username: c.req.valid("param").username,
    status: c.req.valid("json").status,
  }));

export const usersDelete: UserRouteHandler<"usersDelete"> = async c =>
  c.json(await ops.deleteUserOp.run(c.req.valid("param")));

export const usersResetPassword: UserRouteHandler<"usersResetPassword"> = async c =>
  c.json(await ops.resetPasswordOp.run(c.req.valid("param")));

export const usersGeneratePassword: UserRouteHandler<"usersGeneratePassword"> = async c =>
  c.json(await ops.generatePasswordOp.run(undefined));
```

- [ ] **Step 2：typecheck + commit**

Run: `pnpm --filter @iam/api typecheck`
Expected: 仍有 `user.index.ts` 里 old handler 名字找不到的报错 —— 下一步修复

```bash
git add apps/api/src/routes/admin/user/user.handlers.ts
git commit -m "feat(api): user handlers 改为薄壳调用 business-op"
```

---

## Task C5：routes/admin/user/user.index.ts 重新 wire

**Files:**
- Modify: `apps/api/src/routes/admin/user/user.index.ts`

- [ ] **Step 1：整体替换文件内容为**

```ts
import { createRouter } from "@lib/core/create-router";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./user.handlers";
import * as routes from "./user.routes";

const router = createRouter();

router.use("*", publicAuthenicationHandler);

router
  .openapi(routes.usersSearch, handlers.usersSearch)
  .openapi(routes.usersDetail, handlers.usersDetail)
  .openapi(routes.usersCreate, handlers.usersCreate)
  .openapi(routes.usersUpdate, handlers.usersUpdate)
  .openapi(routes.usersStatusUpdate, handlers.usersStatusUpdate)
  .openapi(routes.usersDelete, handlers.usersDelete)
  .openapi(routes.usersResetPassword, handlers.usersResetPassword)
  .openapi(routes.usersGeneratePassword, handlers.usersGeneratePassword);

export default router;
```

- [ ] **Step 2：typecheck + commit**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

```bash
git add apps/api/src/routes/admin/user/user.index.ts
git commit -m "feat(api): user.index 重新 wire 8 个 RESTful 端点"
```

---

## Task C6：user.trpc.ts 新建 + 挂到 admin 根 router

**Files:**
- Create: `apps/api/src/routes/admin/user/user.trpc.ts`
- Modify: `apps/api/src/trpc/routers/admin/index.ts`

- [ ] **Step 1：创建 `apps/api/src/routes/admin/user/user.trpc.ts`**

```ts
import { router } from "@/trpc/trpc";
import * as ops from "./user.ops";

export const userAdminRouter = router({
  search: ops.searchUserOp.toTRPC(),
  detail: ops.getUserOp.toTRPC(),
  create: ops.createUserOp.toTRPC(),
  update: ops.updateUserOp.toTRPC(),
  updateStatus: ops.updateUserStatusOp.toTRPC(),
  delete: ops.deleteUserOp.toTRPC(),
  resetPassword: ops.resetPasswordOp.toTRPC(),
  generatePassword: ops.generatePasswordOp.toTRPC(),
});
```

- [ ] **Step 2：更新 `apps/api/src/trpc/routers/admin/index.ts`**

```ts
import { organizationAdminRouter } from "@/routes/admin/organization/organization.trpc";
import { positionAdminRouter } from "@/routes/admin/position/position.trpc";
import { userAdminRouter } from "@/routes/admin/user/user.trpc";
import { router } from "@/trpc/trpc";

export const adminRouter = router({
  organization: organizationAdminRouter,
  position: positionAdminRouter,
  user: userAdminRouter,
});
```

- [ ] **Step 3：typecheck + commit**

Run: `pnpm --filter @iam/api typecheck`
Expected: 无新增错误

```bash
git add apps/api/src/routes/admin/user/user.trpc.ts apps/api/src/trpc/routers/admin/index.ts
git commit -m "feat(api): 挂载 user tRPC router 到 admin 根"
```

---

## Task D1：后端 Scalar/curl 手测

**说明：** 项目没有测试框架，通过 Scalar UI 与 curl 覆盖主要路径。

- [ ] **Step 1：启动 API**

```bash
pnpm --filter @iam/api dev
```

确认控制台输出 `http://localhost:30000` 且 Scalar UI 可访问：`http://localhost:30000/doc/scalar`

- [ ] **Step 2：手测清单**

在 Scalar 或 curl 下逐项验证（每项都要带上 `Cookie` / 认证头以通过 `publicAuthenicationHandler`，按已有方式登录后复制 cookie）：

1. **POST /admin/users/search**：`{ pageNum:1, pageSize:10, conditions:{ fuzzyConditions:{text:"蔡"}, exactConditions:{} } }` → 返回 `{code:200, data:{result, total, pageNum, pageSize, pages}}`；`result[0]` 含 `statusText`
2. **POST /admin/users/search** with `exactConditions.statuses:[2]` → 只返回状态=2 的用户
3. **GET /admin/users/138550**（已存在用户名）→ 返回含 employments / roles / privileges 的 detail
4. **GET /admin/users/NOT_EXIST** → 404 `{code:404,message:"用户不存在"}`
5. **POST /admin/users**：`{ username:"t0001", name:"测试", userType:"外包", password:"Passw0rd1" }` → 返回 `{generatedPassword: null}`
6. **POST /admin/users**：`{ username:"t0002", name:"测试2", userType:"外包" }`（不传 password）→ 返回 `generatedPassword` 为 8 位字符串
7. **POST /admin/users**：用已存在 `username` 重复提交 → 400+ "用户名已存在"
8. **PUT /admin/users/t0001**：`{ name:"测试新名" }` → `true`，再 `GET /admin/users/t0001` 确认
9. **PATCH /admin/users/t0001/status**：`{status:2}` → `true`，再 detail 看到 `status=2, statusText="暂停"`
10. **POST /admin/users/t0001/reset-password** → 返回新密码字符串
11. **POST /admin/users/generate-password** → 返回 8 位随机字符串
12. **DELETE /admin/users/t0002**（无雇佣）→ `true`
13. **DELETE /admin/users/138550**（若有活跃雇佣）→ 409 + `UserHasActiveEmploymentError` 消息

- [ ] **Step 3：tRPC 端点同样打通**

启动 admin dev（`pnpm --filter @iam/admin dev`）前，不需要完整手测 tRPC；下一 phase 的前端联调会自然覆盖。本 Task 主要验证 Hono REST + 业务正确性。

- [ ] **Step 4：标记通过**

无需 commit；将此 Task 标记 completed 即可。

---

## Task E1：admin/services/user.ts

**Files:**
- Create: `apps/admin/src/services/user.ts`

- [ ] **Step 1：新建文件**

```ts
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@iam/api/trpc";
import type { Status } from "@iam/shared";
import { apiClient } from "@/lib/api-client";

type AdminUserOutputs = inferRouterOutputs<AppRouter>["admin"]["user"];
export type UserVo = AdminUserOutputs["search"]["result"][number];
export type UserDetailVo = AdminUserOutputs["detail"];
export type UserCreateResult = AdminUserOutputs["create"];

export type UserSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: {
      userTypes?: string[];
      usernames?: string[];
      phones?: string[];
      wxIds?: string[];
      names?: string[];
      statuses?: Status[];
    };
  };
};

export function searchUsers(params: UserSearchParams) {
  return apiClient.admin.user.search.query(params);
}

export function getUser(username: string) {
  return apiClient.admin.user.detail.query({ username });
}

export function createUser(body: {
  username: string;
  name: string;
  userType: string;
  password?: string;
  mobile?: string | null;
  wxId?: string | null;
  status?: Status;
}) {
  return apiClient.admin.user.create.mutate(body);
}

export function updateUser(
  username: string,
  data: {
    name?: string;
    mobile?: string | null;
    wxId?: string | null;
    userType?: string | null;
    status?: Status;
    orderNum?: number;
  },
) {
  return apiClient.admin.user.update.mutate({ username, data });
}

export function updateUserStatus(username: string, status: Status) {
  return apiClient.admin.user.updateStatus.mutate({ username, status });
}

export function deleteUser(username: string) {
  return apiClient.admin.user.delete.mutate({ username });
}

export function resetUserPassword(username: string) {
  return apiClient.admin.user.resetPassword.mutate({ username });
}

export function generateRandomPassword() {
  return apiClient.admin.user.generatePassword.query();
}
```

**注意：** `generateRandomPasswordOp` 的 input 是 `z.object({}).optional()`；tRPC v11 客户端在 `optional` 情况下 `.query()` 不需要参数。若类型报错可改为 `.query(undefined)`。

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
```

Expected: 无新增错误

```bash
git add apps/admin/src/services/user.ts
git commit -m "feat(admin): 新增 user service（tRPC 薄封装）"
```

---

## Task F1：UserFormModal（新建/编辑用户）

**Files:**
- Create: `apps/admin/src/pages/users/components/UserFormModal.tsx`

- [ ] **Step 1：新建文件**

```tsx
import { createUser, type UserDetailVo, updateUser } from "@/services/user";
import {
  ModalForm,
  ProFormSelect,
  ProFormText,
} from "@ant-design/pro-components";
import { getUserStatusOptions } from "@iam/shared";
import { message, Modal } from "antd";

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  initialValues?: UserDetailVo | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function UserFormModal({
  open,
  mode,
  initialValues,
  onOpenChange,
  onSuccess,
}: Props) {
  const isEdit = mode === "edit";

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : "操作失败");

  const showGeneratedPassword = (password: string) => {
    Modal.info({
      title: "用户创建成功 — 初始密码",
      content: (
        <div>
          <p>请将下列密码复制并告知用户，关闭后不再显示：</p>
          <pre style={{ fontSize: 16, background: "#f5f5f5", padding: 8 }}>
            {password}
          </pre>
        </div>
      ),
      okText: "我已复制",
    });
  };

  return (
    <ModalForm
      title={isEdit ? "编辑用户" : "新建用户"}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={
        initialValues
          ? {
              username: initialValues.username,
              name: initialValues.name,
              mobile: initialValues.mobile ?? "",
              wxId: initialValues.wxId ?? "",
              userType: initialValues.userType ?? "",
              status: initialValues.status,
            }
          : { status: 1 }
      }
      modalProps={{ destroyOnClose: true, maskClosable: false }}
      onFinish={async (values) => {
        try {
          if (isEdit) {
            await updateUser(initialValues!.username, {
              name: values.name,
              mobile: values.mobile || null,
              wxId: values.wxId || null,
              userType: values.userType || null,
              status: values.status,
            });
            message.success("更新成功");
          } else {
            const res = await createUser({
              username: values.username,
              name: values.name,
              userType: values.userType,
              password: values.password || undefined,
              mobile: values.mobile || null,
              wxId: values.wxId || null,
              status: values.status,
            });
            message.success("创建成功");
            if (res.generatedPassword) {
              showGeneratedPassword(res.generatedPassword);
            }
          }
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
        label="用户名"
        disabled={isEdit}
        rules={[{ required: true, message: "请输入用户名" }]}
      />
      <ProFormText
        name="name"
        label="姓名"
        rules={[{ required: true, message: "请输入姓名" }]}
      />
      <ProFormText
        name="userType"
        label="用户类型"
        placeholder="例如：正式员工 / 外包 / 劳务派遣"
        rules={[{ required: true, message: "请输入用户类型" }]}
      />
      <ProFormText name="mobile" label="手机号" />
      <ProFormText name="wxId" label="微信 ID" />
      {!isEdit && (
        <ProFormText.Password
          name="password"
          label="初始密码"
          placeholder="留空则后端生成随机密码"
        />
      )}
      <ProFormSelect
        name="status"
        label="状态"
        options={getUserStatusOptions().map(o => ({
          label: o.label,
          value: o.value,
        }))}
        rules={[{ required: true }]}
      />
    </ModalForm>
  );
}
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/pages/users/components/UserFormModal.tsx
git commit -m "feat(admin): 新增 UserFormModal（含新建/编辑双模式）"
```

---

## Task F2：ResetPasswordModal

**Files:**
- Create: `apps/admin/src/pages/users/components/ResetPasswordModal.tsx`

- [ ] **Step 1：新建文件**

```tsx
import { resetUserPassword } from "@/services/user";
import { message, Modal } from "antd";

type Args = {
  username: string;
  name?: string;
};

export function confirmResetPassword({ username, name }: Args) {
  Modal.confirm({
    title: `重置 ${name ?? username} 的密码？`,
    content: "确认后将生成新的随机密码，请做好交接准备。",
    okType: "danger",
    okText: "重置",
    onOk: async () => {
      try {
        const newPassword = await resetUserPassword(username);
        Modal.info({
          title: "新密码已生成",
          content: (
            <div>
              <p>请将下列密码复制并转交给用户，关闭后不再显示：</p>
              <pre style={{ fontSize: 16, background: "#f5f5f5", padding: 8 }}>
                {newPassword}
              </pre>
            </div>
          ),
          okText: "我已复制",
        });
      }
      catch (err) {
        message.error(err instanceof Error ? err.message : "重置失败");
      }
    },
  });
}
```

**说明：** 导出的是函数而不是组件 —— 这个交互只需"点击→确认→显示结果"，无持久 UI 状态，用命令式 `Modal.confirm`/`Modal.info` 更简洁，与 `OrgDetailPanel.onDelete` 保持一致的写法。

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/pages/users/components/ResetPasswordModal.tsx
git commit -m "feat(admin): 重置密码命令式确认弹窗"
```

---

## Task F3：UserDetailDrawer（Tabs：基本 / 雇佣只读 / 日志占位）

**Files:**
- Create: `apps/admin/src/pages/users/components/UserDetailDrawer.tsx`

- [ ] **Step 1：新建文件**

```tsx
import StatusTag from "@/components/StatusTag";
import { deleteUser, getUser, type UserDetailVo, updateUserStatus } from "@/services/user";
import { ProDescriptions } from "@ant-design/pro-components";
import { getUserStatusOptions } from "@iam/shared";
import {
  Button,
  Drawer,
  Dropdown,
  Empty,
  message,
  Modal,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { history } from "umi";
import { confirmResetPassword } from "./ResetPasswordModal";

type EmploymentRow = UserDetailVo["employments"][number];

type Props = {
  open: boolean;
  username: string | null;
  onClose: () => void;
  onEdit: (detail: UserDetailVo) => void;
  onChanged: () => void;
};

const employmentColumns: ColumnsType<EmploymentRow> = [
  {
    title: "公司",
    dataIndex: "companyName",
    render: (_, row) => row.companyName ?? "—",
  },
  {
    title: "部门",
    dataIndex: "deptName",
    render: (_, row) => row.deptName ?? "—",
  },
  {
    title: "岗位",
    dataIndex: "posName",
    render: (_, row) => row.posName ?? "—",
  },
  {
    title: "主岗",
    dataIndex: "isPrimary",
    render: (_, row) => (row.isPrimary ? <Tag color="blue">主岗</Tag> : null),
    width: 70,
  },
  {
    title: "状态",
    dataIndex: "status",
    render: (_, row) => <StatusTag domain="employment" status={row.status} />,
    width: 90,
  },
];

export default function UserDetailDrawer({
  open,
  username,
  onClose,
  onEdit,
  onChanged,
}: Props) {
  const [detail, setDetail] = useState<UserDetailVo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !username) {
      setDetail(null);
      return;
    }
    setLoading(true);
    getUser(username)
      .then(setDetail)
      .catch(err => message.error(err instanceof Error ? err.message : "加载详情失败"))
      .finally(() => setLoading(false));
  }, [open, username]);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : "操作失败");

  const refresh = async () => {
    if (!username) return;
    setLoading(true);
    try {
      const d = await getUser(username);
      setDetail(d);
    }
    finally {
      setLoading(false);
    }
    onChanged();
  };

  const onStatusChange = async (status: number) => {
    if (!detail) return;
    try {
      await updateUserStatus(detail.username, status);
      message.success("状态已更新");
      await refresh();
    }
    catch (err) {
      handleError(err);
    }
  };

  const onDelete = () => {
    if (!detail) return;
    Modal.confirm({
      title: `删除用户 ${detail.name}？`,
      content: "软删除后用户将不再可见。若用户存在活跃雇佣，将被拒绝。",
      okType: "danger",
      onOk: async () => {
        try {
          await deleteUser(detail.username);
          message.success("已删除");
          onChanged();
          onClose();
        }
        catch (err) {
          handleError(err);
        }
      },
    });
  };

  const gotoCreateEmployment = () => {
    if (!detail) return;
    history.push(`/employments?username=${encodeURIComponent(detail.username)}`);
  };

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
                <StatusTag domain="user" status={detail.status} />
              </Space>
            )
          : "用户详情"
      }
      extra={
        detail && (
          <Space>
            <Button onClick={() => onEdit(detail)}>编辑</Button>
            <Dropdown
              menu={{
                items: getUserStatusOptions()
                  .filter(o => o.value !== detail.status)
                  .map(o => ({
                    key: String(o.value),
                    label: `切为「${o.label}」`,
                    onClick: () => onStatusChange(o.value),
                  })),
              }}
            >
              <Button>状态</Button>
            </Dropdown>
            <Button onClick={() => confirmResetPassword({ username: detail.username, name: detail.name })}>
              重置密码
            </Button>
            <Button danger onClick={onDelete}>删除</Button>
          </Space>
        )
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
                <ProDescriptions<UserDetailVo>
                  column={2}
                  dataSource={detail}
                  columns={[
                    { title: "用户名", dataIndex: "username" },
                    { title: "姓名", dataIndex: "name" },
                    { title: "手机", dataIndex: "mobile", render: (_, r) => r.mobile ?? "—" },
                    { title: "微信 ID", dataIndex: "wxId", render: (_, r) => r.wxId ?? "—" },
                    { title: "用户类型", dataIndex: "userType", render: (_, r) => r.userType ?? "—" },
                    {
                      title: "状态",
                      dataIndex: "status",
                      render: (_, r) => <StatusTag domain="user" status={r.status} />,
                    },
                    {
                      title: "角色",
                      dataIndex: "roles",
                      span: 2,
                      render: (_, r) =>
                        r.roles.length === 0
                          ? "—"
                          : r.roles.map(code => <Tag key={code}>{code}</Tag>),
                    },
                    {
                      title: "权限数",
                      dataIndex: "privileges",
                      render: (_, r) => r.privileges.length,
                    },
                    {
                      title: "雇佣数",
                      dataIndex: "employments",
                      render: (_, r) => r.employments.length,
                    },
                    {
                      title: "创建时间",
                      dataIndex: "createTime",
                      render: (_, r) => new Date(r.createTime).toLocaleString(),
                    },
                    {
                      title: "更新时间",
                      dataIndex: "updateTime",
                      render: (_, r) => new Date(r.updateTime).toLocaleString(),
                    },
                  ]}
                />
              ),
            },
            {
              key: "employments",
              label: `雇佣（${detail.employments.length}）`,
              children: (
                <div>
                  <div style={{ marginBottom: 12, textAlign: "right" }}>
                    <Button type="primary" onClick={gotoCreateEmployment}>
                      + 新增雇佣
                    </Button>
                  </div>
                  <Table<EmploymentRow>
                    rowKey="id"
                    size="small"
                    columns={employmentColumns}
                    dataSource={detail.employments}
                    pagination={false}
                    locale={{ emptyText: "暂无雇佣" }}
                  />
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

**注意：**
- `EmploymentRow` 的字段名（`companyName` / `deptName` / `posName` / `isPrimary` / `status`）必须与 `EmploymentDetailDtoSchema` 推导的字段一致；在实现时如类型不匹配（例如实际字段是 `department.orgName` 而非 `deptName`），根据 tRPC 类型提示做本地重命名即可，不要回头改后端
- `StatusTag` 已支持 `domain="employment"`（`employment.status` 有 `getEmploymentStatusOptions`）
- `history.push` 从 `umi` 导入（现有页面已使用，例如 `RightContent`）

- [ ] **Step 2：typecheck 若 `companyName` 等字段名不存在**

Run: `pnpm --filter @iam/admin typecheck`

若 TS 报 `Property 'companyName' does not exist`，把列配置里的 `dataIndex` 替换为实际字段名（参考 `EmploymentDtoConverterSchema` 的输出形状，常见为 `company?.orgName` / `deptartment?.orgName` / `position?.posName`）。例：

```tsx
const employmentColumns: ColumnsType<EmploymentRow> = [
  { title: "公司", render: (_, row) => row.company?.orgName ?? "—" },
  { title: "部门", render: (_, row) => row.deptartment?.orgName ?? "—" },
  { title: "岗位", render: (_, row) => row.position?.posName ?? "—" },
  // ...
];
```

根据 TS 推导调整到可编译。

- [ ] **Step 3：commit**

```bash
git add apps/admin/src/pages/users/components/UserDetailDrawer.tsx
git commit -m "feat(admin): 用户详情抽屉（基本/雇佣只读/日志占位）"
```

---

## Task F4：UsersPage — ProTable + toolbar

**Files:**
- Modify: `apps/admin/src/pages/users/index.tsx`

- [ ] **Step 1：整体替换文件内容为**

```tsx
import StatusTag from "@/components/StatusTag";
import UserDetailDrawer from "@/pages/users/components/UserDetailDrawer";
import UserFormModal from "@/pages/users/components/UserFormModal";
import { confirmResetPassword } from "@/pages/users/components/ResetPasswordModal";
import {
  deleteUser,
  type UserDetailVo,
  type UserVo,
  searchUsers,
  updateUserStatus,
} from "@/services/user";
import {
  type ActionType,
  PageContainer,
  type ProColumns,
  ProTable,
} from "@ant-design/pro-components";
import { getUserStatusOptions } from "@iam/shared";
import { Button, Dropdown, message, Modal } from "antd";
import { useRef, useState } from "react";

type FormState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; initialValues: UserDetailVo };

export default function UsersPage() {
  const actionRef = useRef<ActionType>();
  const [formState, setFormState] = useState<FormState>({ open: false });
  const [drawerUsername, setDrawerUsername] = useState<string | null>(null);

  const handleError = (err: unknown) =>
    message.error(err instanceof Error ? err.message : "操作失败");

  const onDelete = (row: UserVo) => {
    Modal.confirm({
      title: `删除用户 ${row.name}？`,
      content: "软删除后用户不再可见。若存在活跃雇佣将被拒绝。",
      okType: "danger",
      onOk: async () => {
        try {
          await deleteUser(row.username);
          message.success("已删除");
          actionRef.current?.reload();
        }
        catch (err) {
          handleError(err);
        }
      },
    });
  };

  const onStatusChange = async (row: UserVo, status: number) => {
    try {
      await updateUserStatus(row.username, status);
      message.success("状态已更新");
      actionRef.current?.reload();
    }
    catch (err) {
      handleError(err);
    }
  };

  const columns: ProColumns<UserVo>[] = [
    { title: "工号", dataIndex: "username", width: 120 },
    { title: "姓名", dataIndex: "name", width: 120 },
    { title: "手机", dataIndex: "mobile", width: 140, search: false },
    { title: "类型", dataIndex: "userType", width: 120, search: false },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      valueType: "select",
      valueEnum: Object.fromEntries(
        getUserStatusOptions().map(o => [o.value, { text: o.label }]),
      ),
      render: (_, row) => <StatusTag domain="user" status={row.status} />,
    },
    {
      title: "创建时间",
      dataIndex: "createTime",
      width: 170,
      search: false,
      render: (_, row) => new Date(row.createTime).toLocaleString(),
    },
    {
      title: "操作",
      valueType: "option",
      width: 280,
      render: (_, row) => [
        <a key="view" onClick={() => setDrawerUsername(row.username)}>查看</a>,
        <a
          key="reset"
          onClick={() => confirmResetPassword({ username: row.username, name: row.name })}
        >
          重置密码
        </a>,
        <Dropdown
          key="status"
          menu={{
            items: getUserStatusOptions()
              .filter(o => o.value !== row.status)
              .map(o => ({
                key: String(o.value),
                label: `切为「${o.label}」`,
                onClick: () => onStatusChange(row, o.value),
              })),
          }}
        >
          <a>状态</a>
        </Dropdown>,
        <a key="delete" style={{ color: "#d4380d" }} onClick={() => onDelete(row)}>
          删除
        </a>,
      ],
    },
  ];

  return (
    <PageContainer title="用户管理">
      <ProTable<UserVo>
        actionRef={actionRef}
        rowKey="username"
        columns={columns}
        search={{ labelWidth: "auto" }}
        request={async (params) => {
          try {
            const { current = 1, pageSize = 20, username, name, status } = params as {
              current?: number;
              pageSize?: number;
              username?: string;
              name?: string;
              status?: number;
            };
            const text = (username || name || "") as string;
            const data = await searchUsers({
              pageNum: current,
              pageSize,
              conditions: {
                fuzzyConditions: text ? { text } : {},
                exactConditions: {
                  statuses: status !== undefined ? [status as 1 | 2 | 3] : undefined,
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
          <Button
            key="create"
            type="primary"
            onClick={() => setFormState({ open: true, mode: "create" })}
          >
            + 新建用户
          </Button>,
        ]}
      />

      <UserFormModal
        open={formState.open}
        mode={formState.open ? formState.mode : "create"}
        initialValues={
          formState.open && formState.mode === "edit" ? formState.initialValues : null
        }
        onOpenChange={(open) => {
          if (!open) setFormState({ open: false });
        }}
        onSuccess={() => {
          setFormState({ open: false });
          actionRef.current?.reload();
        }}
      />

      <UserDetailDrawer
        open={drawerUsername !== null}
        username={drawerUsername}
        onClose={() => setDrawerUsername(null)}
        onEdit={(detail) => {
          setDrawerUsername(null);
          setFormState({ open: true, mode: "edit", initialValues: detail });
        }}
        onChanged={() => actionRef.current?.reload()}
      />
    </PageContainer>
  );
}
```

- [ ] **Step 2：typecheck + commit**

```bash
pnpm --filter @iam/admin typecheck
git add apps/admin/src/pages/users/index.tsx
git commit -m "feat(admin): 用户管理页面（ProTable + 新建/详情抽屉）"
```

---

## Task F5：前端 self-review 与 lint

- [ ] **Step 1：lint 修复**

```bash
pnpm --filter @iam/admin format 2>/dev/null || true
```

- [ ] **Step 2：自检**

- 检查 `apps/admin/src/pages/users/index.tsx` 与 `UserDetailDrawer.tsx` 内 `history.push` 引入路径是否与现有页面一致
- 检查 `UserFormModal.tsx` 新建时若未填 `password` 后端会返回 `generatedPassword` 明文；编辑模式下不暴露 `password` 字段 —— 已实现
- 在 `UserDetailDrawer` 里对抽屉未关闭前切换 `username` 的 race（先前请求晚于后一次到达覆盖 state）——本次不处理，已在 README/本计划描述不解决

- [ ] **Step 3：commit（如 format 有差异）**

```bash
git diff --cached --stat
# 若有改动
git commit -m "chore(admin): users 模块 format/lint"
```

---

## Task G1：前端浏览器手测

- [ ] **Step 1：同时启动 api 和 admin**

```bash
pnpm --filter @iam/api dev      # 终端 1
pnpm --filter @iam/admin dev    # 终端 2
```

- [ ] **Step 2：登录 admin 后走以下清单**

1. `/users` 页面能加载首页数据
2. 顶部搜索：输入姓名/工号模糊匹配 → 结果正确
3. 顶部搜索：选择状态（正常/暂停/结束）→ 结果正确
4. 点击"+ 新建用户"：
   - 不填密码 → 创建成功后弹出"初始密码"对话框显示后端生成密码
   - 填密码 → 创建成功，不再弹密码
5. 点击行"查看"打开详情抽屉：
   - 基本信息 Tab 正确
   - 雇佣 Tab 显示用户的雇佣列表（若无则"暂无雇佣"）
   - "+ 新增雇佣"按钮点击后跳转到 `/employments?username=xxx`（目标页当前是 stub，预期 404/空页可接受）
   - 日志 Tab 显示"尚未接入"占位
6. 抽屉"编辑"按钮打开 Modal，更新姓名后保存 → 列表 + 抽屉都刷新
7. 抽屉状态下拉 → 切换状态 → 列表 + 抽屉都刷新
8. 抽屉"重置密码"→ 二次确认 → 弹窗显示新密码
9. 抽屉"删除"（若用户无活跃雇佣）→ 删除成功，抽屉关闭，列表刷新
10. 行操作"状态/删除/重置密码"均可用，与抽屉操作结果一致

- [ ] **Step 3：验收通过后人工确认**

用户确认后，手动标记 Task G1 完成；如有问题反馈则创建修复子任务。

---

## Self-Review（计划作者填写）

- **Spec 覆盖**：
  - 4.2 端点列表：search ✓、GET /:username ✓、POST / ✓、PUT /:username ✓、PATCH /:username/status ✓、DELETE /:username ✓、POST /:username/reset-password ✓、POST /generate-password ✓；POST /set 对外路由按 spec 废弃 ✓
  - 5.1 目录：pages/users/{index.tsx, components/{UserFormModal, UserDetailDrawer, ResetPasswordModal}} ✓；`hooks/useUserActions.ts` **未实现**（本计划通过 `confirmResetPassword` 函数式封装替代，无状态复用需求）——对齐 YAGNI，实现时不再新增 hook
  - 6.2 列表/抽屉/Modal：均已覆盖；主岗列按用户决策改为抽屉内展示，不在列表列中
  - 错误类：`UserHasActiveEmploymentError` 在 spec 9 节未单列，但 6.2 描述"删除（二次确认）"需要后端校验；已补
- **占位扫描**：
  - Task F3 明确指出 `EmploymentRow` 字段名可能需本地重命名，并给出 fallback 代码 —— 不是占位，是两段可交替的实现
  - 其余 Task 全部包含完整代码
- **类型一致性**：
  - `searchUsers` 返回 `{result, total, pageNum, pageSize, pages}`（Task B2 / Task E1 对齐）
  - `createUser` 返回 `{username, generatedPassword: string | null}`（Task B2 / Task C3 / Task E1 / Task F1 对齐）
  - `resetUserPassword` 返回 `string`（Task B2 / Task C3 / Task F2 对齐）

---

**执行建议**：Phase A-C 可一次性连做（拆小 commit），D1 手测卡点后再开 Phase E-F；G1 等 api 和 admin 都起来后在浏览器完整走一轮。
