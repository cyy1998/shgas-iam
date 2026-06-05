## 1. 基础结构同步

- [x] 1.1 在 `apps/admin-api/src/lib/logger/index.ts` 新增 app-local logger singleton，并让 `apps/admin-api/src/app.ts` import 该 logger。
- [x] 1.2 在 `apps/admin-api/src/middlewares/authentication.handler.ts` 集中定义 `adminAuthenticationHandler`。
- [x] 1.3 更新 `apps/admin-api/src/routes/admin/_middleware.ts` 与 `apps/admin-api/src/routes/trpc/_middleware.ts`，让两个 tier 复用同一个 `adminAuthenticationHandler`。
- [x] 1.4 统一两个后端配置：`tsconfig.json` 都包含 `"types": ["bun"]` 和 `exclude: ["scripts"]`，`eslint.config.js` 都 ignore `"scripts/**"`。
- [x] 1.5 统一后端 `src/index.ts` 中 env import/变量命名风格，保持 `port` 与 `fetch` 导出行为不变。

## 2. route 命名与结构整理

- [x] 2.1 将 `apps/api/src/routes/auth/auth.types.ts` 重命名为 `auth.type.ts`，并更新所有 import。
- [x] 2.2 将 `apps/api/src/routes/public/public.types.ts` 重命名为 `public.type.ts`，并更新所有 import。
- [x] 2.3 检查两个后端 route module，确认 REST-only route 使用 `*.handlers.ts`，REST + tRPC route 使用 `*.adapter.ts` 与 `*.trpc.ts`。
- [x] 2.4 清理 route type 文件中的陈旧注释，保留实际使用的 route handler/type 定义。

## 3. 结构噪音与约定记录

- [x] 3.1 检查空目录 `apps/admin-api/src/lib/clients` 与 `apps/api/src/lib/async-jobs`，删除无引用且无明确用途的空目录，或记录保留理由。
- [x] 3.2 将本次后端结构约定同步到 `AGENTS.md` 或附近项目文档，说明 logger、middleware、route 命名和配置边界规则。

## 4. 验证

- [x] 4.1 运行 `pnpm --filter @iam/api typecheck`。
- [x] 4.2 运行 `pnpm --filter @iam/admin-api typecheck`。
- [x] 4.3 运行 `pnpm --filter @iam/api lint`。
- [x] 4.4 运行 `pnpm --filter @iam/admin-api lint`。
- [x] 4.5 用 `rg` 检查旧文件名和旧 logger/middleware 定义没有残留引用。
