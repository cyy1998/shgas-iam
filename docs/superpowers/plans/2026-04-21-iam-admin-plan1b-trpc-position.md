# IAM 管理后台 · Plan 1b · tRPC 层与 Position 前端（替代 Plan 1 C1-C4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 api 中引入 tRPC 层与现有 Hono OpenAPI 路由并存；admin 端改用 tRPC client 消费；以 Position 为样板完成页面端到端实现。

**Architecture:** 延续 spec 第 11 节架构修订。新增 `apps/api/src/trpc/` 目录托管 tRPC 实例、router、CustomError→TRPCError 映射。挂载到 Hono `/rpc/*`。admin 用 `@trpc/client` 调 `/rpc/*`，不引入 React Query（继续走 umi `useRequest`/ProTable 内置请求）。

**Tech Stack:** `@trpc/server` 11.x、`@trpc/client` 11.x（需要 TS ≥ 5.7.2），zod v4。adapter: `@trpc/server/adapters/fetch`。

**Spec reference:** `docs/superpowers/specs/2026-04-21-iam-admin-modules-design.md`（含 §11 架构修订）

**Plan 1 已完成且保留：**
- A1 `@iam/shared` 状态 options（commits `9be2de6` + `d575b3c`）
- A2 `apps/admin/src/utils/request.ts`（`a26d34a` + `2ca8932`）
- A3 `apps/admin/src/components/StatusTag.tsx`（`b1d59db`）
- B1 PositionHasEmploymentError（`512b33e`）
- B2 Position repository（`d05a3ba`）
- B3 Position service（`c260d05`）
- B4 Position route schema（`5692d23`）
- B5-B7 Position Hono routes（`3cfdd8b`）— 保留对外
- B8 Hono 端点手测通过
- C0 tsconfig paths 修复（`8d7a1d4`）
- 组织 handler 类型修复（`cd7e157`）
- C1 原稿删除（`f53d83b`）
- spec tRPC 架构补充（`3e387c2`）

---

## Phase D — tRPC 后端基础设施

### Task D1: 安装 @trpc/server 与版本协调

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: 检查 api typescript 版本**

```bash
cat apps/api/package.json | grep typescript
```
Expected: `typescript: ^6`（tRPC 11.x 要求 ≥ 5.7.2，TS 6 满足）

- [ ] **Step 2: 安装 @trpc/server**

```bash
pnpm --filter @iam/api add @trpc/server@^11
```

- [ ] **Step 3: 验证安装**

```bash
cat apps/api/package.json | grep '@trpc/server'
```
Expected: `"@trpc/server": "^11.xx.x"` 出现在 dependencies

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): 引入 @trpc/server 依赖"
```

---

### Task D2: tRPC 实例 + CustomError 映射

**Files:**
- Create: `apps/api/src/trpc/trpc.ts`

**Rationale:** 初始化 tRPC、定义 context 类型、procedure 基础。全局错误格式化器把 `CustomError` 的 `code` 字段透传到 `TRPCError.data`，让 admin 客户端能读到业务 code。

- [ ] **Step 1: 创建目录与文件**

Create `apps/api/src/trpc/trpc.ts` with:

```ts
import type { Context as HonoContext } from "hono";
import { initTRPC, TRPCError } from "@trpc/server";
import { CustomError } from "@errors/CustomError";

export type TRPCAppContext = {
  hono: HonoContext;
};

export async function createTRPCContext(opts: { honoCtx: HonoContext }): Promise<TRPCAppContext> {
  return { hono: opts.honoCtx };
}

const t = initTRPC.context<TRPCAppContext>().create({
  errorFormatter({ shape, error }) {
    if (error.cause instanceof CustomError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          serviceCode: error.cause.code,
          serviceMessage: error.cause.message,
        },
      };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export function mapCustomErrorToTRPCError(err: unknown): never {
  if (err instanceof CustomError) {
    const httpCode = err.code === 404
      ? "NOT_FOUND"
      : err.code === 409
        ? "CONFLICT"
        : err.code === 403
          ? "FORBIDDEN"
          : err.code === 401
            ? "UNAUTHORIZED"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({
      code: httpCode,
      message: err.message,
      cause: err,
    });
  }
  throw err;
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm --filter @iam/api typecheck
```
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/trpc/trpc.ts
git commit -m "feat(api): 初始化 tRPC 实例并建立 CustomError 到 TRPCError 映射"
```

---

### Task D3: Position tRPC router

**Files:**
- Create: `apps/api/src/trpc/routers/admin/position.router.ts`

**Rationale:** Position 的 6 个 procedure，全部调现有 service 层函数，薄壳。

- [ ] **Step 1: 创建目录与文件**

Create `apps/api/src/trpc/routers/admin/position.router.ts` with:

```ts
import { z } from "zod";
import {
  PositionCreateDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionStatusUpdateDtoSchema,
  PositionUpdateDtoSchema,
} from "@/services/position/position.schema";
import * as positionRepository from "@/services/position/position.repository";
import * as positionService from "@/services/position/position.service";
import { paginate } from "@/utils/page.util";
import { PositionVoConverterSchema } from "@/routes/admin/position/position.schema";
import { mapCustomErrorToTRPCError, publicProcedure, router } from "../../trpc";

export const positionAdminRouter = router({
  search: publicProcedure
    .input(PositionPaginationQueryDtoSchema)
    .query(async ({ input }) => {
      try {
        const positions = await positionRepository.searchPositionsFuzzy(input);
        const positionVos = positions.map(p => PositionVoConverterSchema.parse(p));
        return paginate(positionVos, input);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  detail: publicProcedure
    .input(z.object({ posCode: z.string() }))
    .query(async ({ input }) => {
      try {
        return await positionService.getPositionDetailByCode(input.posCode);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  create: publicProcedure
    .input(PositionCreateDtoSchema)
    .mutation(async ({ input }) => {
      try {
        return await positionService.setPosition(input);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  update: publicProcedure
    .input(z.object({ posCode: z.string(), data: PositionUpdateDtoSchema }))
    .mutation(async ({ input }) => {
      try {
        return await positionService.updatePosition(input.posCode, input.data);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  updateStatus: publicProcedure
    .input(z.object({ posCode: z.string() }).and(PositionStatusUpdateDtoSchema))
    .mutation(async ({ input }) => {
      try {
        return await positionService.updatePositionStatus(input.posCode, input.status);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  delete: publicProcedure
    .input(z.object({ posCode: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await positionService.deletePosition(input.posCode);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),
});
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm --filter @iam/api typecheck
```
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/trpc/routers/
git commit -m "feat(api): 新增 Position tRPC router 复用 service 层"
```

---

### Task D4: 聚合 adminRouter 与 appRouter

**Files:**
- Create: `apps/api/src/trpc/routers/admin/index.ts`
- Create: `apps/api/src/trpc/app.router.ts`

- [ ] **Step 1: 创建 `apps/api/src/trpc/routers/admin/index.ts`**

```ts
import { router } from "../../trpc";
import { positionAdminRouter } from "./position.router";

export const adminRouter = router({
  position: positionAdminRouter,
});
```

- [ ] **Step 2: 创建 `apps/api/src/trpc/app.router.ts`**

```ts
import { router } from "./trpc";
import { adminRouter } from "./routers/admin";

export const appRouter = router({
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: 验证 typecheck**

```bash
pnpm --filter @iam/api typecheck
```
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/trpc/routers/admin/index.ts apps/api/src/trpc/app.router.ts
git commit -m "feat(api): 聚合 admin tRPC router 并导出 AppRouter 类型"
```

---

### Task D5: 挂载 tRPC 到 Hono + 修改 api exports

**Files:**
- Modify: `apps/api/src/lib/core/create-app.ts`
- Modify: `apps/api/package.json`

**Rationale:** 用 `fetchRequestHandler` 桥接 Hono 请求与 tRPC。所有 `/rpc/*` 的请求由 tRPC 处理，其余保持不变。同时把 `AppRouter` 类型通过 api 的 exports 暴露给 admin。

- [ ] **Step 1: 修改 `apps/api/src/lib/core/create-app.ts`**

在现有 imports 末尾追加：

```ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/trpc/app.router";
import { createTRPCContext } from "@/trpc/trpc";
```

在 `app.use(logger(...))` 之后、`app.onError(errorHandler)` 之前（或任何合理位置），添加 tRPC 挂载：

```ts
  app.all("/rpc/*", async (c) => {
    return await fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => createTRPCContext({ honoCtx: c }),
    });
  });
```

注意路径：`/rpc/*` 必须在 `app.route("/public", ...)` 等其他路由挂载之前或之后都可（Hono 按注册顺序匹配，但 `/rpc/*` 不会与它们冲突）。建议放在所有 `app.route(...)` 之前，紧接 `app.onError`。

- [ ] **Step 2: 修改 `apps/api/package.json` 导出类型**

编辑 `"exports"`：

```json
{
  "exports": {
    ".": "./src/app.ts",
    "./trpc": "./src/trpc/app.router.ts"
  }
}
```

后者让 admin 能 `import type { AppRouter } from "@iam/api/trpc"` 直接拿到路由类型，避免通过 `./src/app.ts` 触发整个 Hono 链式推导。

- [ ] **Step 3: 验证 typecheck**

```bash
pnpm --filter @iam/api typecheck
```
Expected: 无错误

- [ ] **Step 4: 启动服务自检**

```bash
pnpm --filter @iam/api dev
```
Expected: 无启动错误；看到 pino 日志表明服务在 `http://localhost:30000` 运行。

用 curl 快速验证 /rpc/ 响应：

```bash
curl -X POST http://localhost:30000/rpc/admin.position.search \
  -H "Content-Type: application/json" \
  -H "Client: iam" \
  -d '{"conditions":{"fuzzyConditions":{"text":""},"exactConditions":{}},"pageNum":1,"pageSize":10}'
```
Expected: JSON 响应，含 `result` 数组、`total` 等字段（有鉴权中间件的话可能是 401/403，也能证明 /rpc 挂上了）

如返回 401/403 属正常（鉴权层），重点确认不是 404。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/core/create-app.ts apps/api/package.json
git commit -m "feat(api): 挂载 tRPC 至 Hono /rpc/* 并导出 AppRouter 类型"
```

---

### Task D6: 后端手测（用户执行）

- [ ] **Step 1: api 在运行**

通知用户：api 保持 `pnpm --filter @iam/api dev` 运行。

- [ ] **Step 2: 用户通过 curl 或 REST 客户端验证**

用户请验证以下：

1. Scalar UI（`http://localhost:30000/doc/scalar`）仍可用，Hono `/admin/positions/*` 端点依然列出
2. tRPC 端点：
   ```bash
   curl -X POST http://localhost:30000/rpc/admin.position.search \
     -H "Content-Type: application/json" \
     -H "Client: iam" \
     --cookie "<your session cookie>" \
     -d '{"conditions":{"fuzzyConditions":{"text":""},"exactConditions":{}},"pageNum":1,"pageSize":10}'
   ```
   Expected: `{"result":{"data":{"result":[...],"total":...}}}` 结构（tRPC 标准封装）

3. tRPC 错误格式：调一个不存在的 procedure，应返回 tRPC 标准错误结构

用户反馈全部通过后继续 Phase E。

---

## Phase E — Admin 端 tRPC client

### Task E1: 安装 @trpc/client 与改写 api-client.ts

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `apps/admin/src/lib/api-client.ts`

- [ ] **Step 1: 检查 admin typescript 版本满足 tRPC 要求**

```bash
cat apps/admin/package.json | grep typescript
```
如果版本低于 5.7.2，升级：`pnpm --filter @iam/admin add -D typescript@^5.7`

- [ ] **Step 2: 安装 @trpc/client**

```bash
pnpm --filter @iam/admin add @trpc/client@^11 @trpc/server@^11
```

（装 `@trpc/server` 是为了 `TRPCClientError` 等公共类型；client 用不到全部）

- [ ] **Step 3: 改写 `apps/admin/src/lib/api-client.ts`**

Replace entire file content with:

```ts
import type { AppRouter } from "@iam/api/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const apiClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/rpc",
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          credentials: "include",
          headers: {
            ...(init?.headers ?? {}),
            Client: "iam",
          },
        }),
    }),
  ],
});

export type { AppRouter };
```

- [ ] **Step 4: 验证 typecheck**

```bash
pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | head -30
```
Expected: 无错误（或若仍有与 api-client 无关的历史错误，记录但继续）

- [ ] **Step 5: Commit**

```bash
git add apps/admin/package.json apps/admin/src/lib/api-client.ts pnpm-lock.yaml
git commit -m "refactor(admin): api-client 切换为 tRPC client 消费 /rpc"
```

---

### Task E2: 新建 `services/position.ts` (tRPC 版)

**Files:**
- Create: `apps/admin/src/services/position.ts`

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/services/position.ts` with:

```ts
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@iam/api/trpc";
import { apiClient } from "@/lib/api-client";

type AdminPositionOutputs = inferRouterOutputs<AppRouter>["admin"]["position"];
export type PositionVo = AdminPositionOutputs["search"]["result"][number];
export type PositionDetailVo = AdminPositionOutputs["detail"];

export type PositionSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: Record<string, never>;
  };
};

export function searchPositions(params: PositionSearchParams) {
  return apiClient.admin.position.search.query(params);
}

export function getPosition(posCode: string) {
  return apiClient.admin.position.detail.query({ posCode });
}

export function createPosition(body: {
  posCode: string;
  posName: string;
  description?: string;
  status?: number;
}) {
  return apiClient.admin.position.create.mutate(body);
}

export function updatePosition(
  posCode: string,
  data: { posName?: string; description?: string | null; status?: number },
) {
  return apiClient.admin.position.update.mutate({ posCode, data });
}

export function updatePositionStatus(posCode: string, status: number) {
  return apiClient.admin.position.updateStatus.mutate({ posCode, status });
}

export function deletePosition(posCode: string) {
  return apiClient.admin.position.delete.mutate({ posCode });
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | grep "services/position" || echo "no errors in services/position"
```
Expected: "no errors in services/position"。如仍有 `'apiClient' is of type 'unknown'` 说明 tRPC 类型也降级，返回排查。

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/services/position.ts
git commit -m "feat(admin): 基于 tRPC client 重新实现岗位服务"
```

---

### Task E3: 端到端类型推导验证（用户执行）

- [ ] **Step 1: 启动 admin dev 服务**

```bash
pnpm --filter @iam/admin dev
```

- [ ] **Step 2: 浏览器打开提示的 UMI 地址**

- [ ] **Step 3: 打开任一 .ts 文件（如 `services/position.ts`）在 VS Code 中，对 `apiClient.admin.position.search` 悬停**

Expected: VS Code 显示完整类型提示（参数为 `PositionPaginationQueryDtoSchema` 推导类型，返回 `Promise<{result: PositionVo[], total: number, ...}>`）

- [ ] **Step 4: 有任何类型缺失或 unknown 则反馈，否则继续 Phase F**

---

## Phase F — Admin Position 页面

### Task F1: 岗位表单 Modal

**Files:**
- Create: `apps/admin/src/pages/positions/components/PositionFormModal.tsx`

**Rationale:** 沿用 Plan 1 设计但改用 tRPC 服务调用。错误处理通过 try/catch + `message.error`（tRPC client 抛 `TRPCClientError`，其 `message` 已经带中文业务消息）。

- [ ] **Step 1: 创建文件**

Create `apps/admin/src/pages/positions/components/PositionFormModal.tsx` with:

```tsx
import {
  createPosition,
  type PositionVo,
  updatePosition,
} from "@/services/position";
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
          message.error(err instanceof Error ? err.message : "操作失败");
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

```bash
pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | grep "PositionFormModal" || echo "no errors"
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/positions/components/PositionFormModal.tsx
git commit -m "feat(admin): 新增岗位新建/编辑表单 Modal"
```

---

### Task F2: 岗位列表页

**Files:**
- Modify: `apps/admin/src/pages/positions/index.tsx`

- [ ] **Step 1: 替换文件内容**

Replace content of `apps/admin/src/pages/positions/index.tsx` with:

```tsx
import StatusTag from "@/components/StatusTag";
import PositionFormModal from "@/pages/positions/components/PositionFormModal";
import {
  deletePosition,
  type PositionVo,
  searchPositions,
  updatePositionStatus,
} from "@/services/position";
import { ActionType, PageContainer, ProColumns, ProTable } from "@ant-design/pro-components";
import { getPositionStatusOptions } from "@iam/shared";
import { Button, Dropdown, message, Modal } from "antd";
import { useRef, useState } from "react";

export default function PositionsPage() {
  const actionRef = useRef<ActionType>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PositionVo | null>(null);

  const handleError = (err: unknown) => {
    message.error(err instanceof Error ? err.message : "操作失败");
  };

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

```bash
pnpm --filter @iam/admin exec tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/positions/index.tsx
git commit -m "feat(admin): 职位管理列表页实现完整 CRUD"
```

---

### Task F3: 前端手测（用户执行）

- [ ] **Step 1: 启动前端与后端**

后端：`pnpm --filter @iam/api dev`
前端：`pnpm --filter @iam/admin dev`

- [ ] **Step 2: 浏览器访问 `/positions`**

Expected: 列表加载成功，通过 proxy 到 `/rpc/admin.position.search`

- [ ] **Step 3: 测试 CRUD**

- 新建：+ 新建岗位 → 填 TEST-003, 测试岗 3 → 列表出现
- 搜索：输入 TEST → 筛选生效
- 编辑：改名称 → 提示成功
- 状态：切为暂停 → Tag 变黄
- 删除：确认 → 行消失；有关联雇佣时拒绝

- [ ] **Step 4: 清理测试数据（可选）**

通过 Scalar UI 的 `/admin/positions/TEST-003` DELETE（Hono 路由依然可用）

- [ ] **Step 5: 浏览器 devtools Network 标签验证调用都打到 `/rpc/*`**

Expected: POST `/rpc/admin.position.search`、POST `/rpc/admin.position.create` 等

- [ ] **Step 6: 全流程通过后反馈**

---

## Phase G — Final Review

### Task G1: 完整 code review

派发 `superpowers:code-reviewer` 审查 Phase D/E/F 的所有提交。

---

## 遗留与后续

本 Plan 1b 完成后：
- tRPC 层在 api 中稳定运行，与 Hono OpenAPI 并存
- Position 模块端到端（tRPC procedures + admin CRUD 页面）可用
- 类型推导端到端恢复，模式已建立

后续 Plans：
- **Plan 2**：Organization 模块（含 `/tree` 端点、左树 + 右详情）— 同时扩展 Hono OpenAPI 路由与 tRPC procedures
- **Plan 3**：User 模块
- **Plan 4**：Employment 模块

每份 plan 沿用双暴露模式：Hono OpenAPI 路由对外 + tRPC procedures 对 admin。
