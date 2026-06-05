## Context

`apps/api` 与 `apps/admin-api` 都通过 `createApp`、`app.config.ts`、tier `_middleware.ts` 和自动发现的 `*.index.ts` route module 组成后端应用。两者的业务职责不同：`apps/api` 面向 public/open/internal/sso/auth 等 REST tier，`apps/admin-api` 面向 admin REST 与 tRPC；因此 routes 和 services 不应强行完全同形。

当前不一致主要集中在横切结构：`apps/api` 将 logger 放在 `src/lib/logger/index.ts`，`apps/admin-api` 在 `src/app.ts` 内直接创建 logger；`apps/api` 有 app-level `src/middlewares/authentication.handler.ts`，`apps/admin-api` 在两个 tier `_middleware.ts` 中重复创建 admin authentication handler；route type 文件存在 `.type.ts` 与 `.types.ts` 混用；两个后端配置文件的 Bun type、scripts exclude/ignore 和入口命名风格不完全一致。

## Goals / Non-Goals

**Goals:**

- 统一两个后端 app 的入口装配风格，让 `src/app.ts` 只负责创建 app、装配 env/logger/routes/middlewares。
- 统一 app-local 基础设施 singleton 的摆放，包括 logger 和 Redis 等 `src/lib` 下的基础设施模块。
- 统一 app-level middleware helper 的摆放，让 tier `_middleware.ts` 保持薄装配层。
- 统一后端 TypeScript/ESLint 配置中的 Bun runtime type 与 scripts 排除规则。
- 统一 route 文件命名规则，并将已有 REST route type 文件收敛为 `.type.ts`。
- 保持 REST-only 与 REST + tRPC route 的结构差异可解释、可重复。

**Non-Goals:**

- 不合并 `apps/api` 与 `apps/admin-api` 的业务 service、repository、schema 或 audit event。
- 不改变 REST path、OpenAPI schema、tRPC router shape、认证策略、审计语义或数据库 schema。
- 不新增共享 package，也不把现有 app-local 逻辑迁移到 `packages/domain` 或 `packages/api-core`。
- 不处理第三层的深层领域抽象收敛。

## Decisions

1. 将 logger 作为 app-local lib singleton，而不是在 `app.ts` 内直接创建。

   `apps/admin-api` 新增 `src/lib/logger/index.ts`，内容与 `apps/api` 的模式一致：读取本 app 的 `env`，调用 `@iam/api-core/logger` 的 `createLogger` 并导出 `logger`。`src/app.ts` 只 import `logger` 并传给 `createApp`。

   备选方案是把两个 app 的 logger factory 进一步下沉到 `packages/api-core`，但当前差异只在 app env alias 和 singleton 暴露路径，新增共享抽象收益不高。

2. 将 admin authentication handler 提取到 app-level `src/middlewares/authentication.handler.ts`。

   `apps/admin-api/src/routes/admin/_middleware.ts` 与 `apps/admin-api/src/routes/trpc/_middleware.ts` 保持 tier 装配职责，只引用同一个 `adminAuthenticationHandler`。这样与 `apps/api` 的 public/internal authentication handler 模式一致，也避免两个 tier 重复创建配置对象。

   备选方案是保留重复代码，因为重复量很小；但认证配置包含 Redis、user schema、client code 和 role code，属于容易漂移的安全相关横切点，应统一来源。

3. 保留 REST-only 与 REST + tRPC route 的命名差异，但明确规则。

   REST-only route 使用 `*.routes.ts`、`*.handlers.ts`、`*.type.ts`。REST + tRPC 共享 operation 使用 `*.routes.ts`、`*.adapter.ts`、`*.trpc.ts`、`*.type.ts`。`apps/admin-api` 的 adapter 模式是为了让同一 operation 同时产生 REST handler 和 tRPC procedure，不要求 `apps/api` 复制该模式。

   备选方案是把所有 route 都改成 `*.adapter.ts`，但这会让 REST-only route 引入不必要的概念，削弱文件名表达力。

4. 统一后端配置文件的 runtime 约定。

   两个后端 `tsconfig.json` 都显式包含 `"types": ["bun"]`，并都排除 `scripts`；两个后端 `eslint.config.js` 都 ignore `scripts/**`。这样 package-level `typecheck` 与 `lint` 对应用源码保持同一边界。

   备选方案是只修缺失项，但保持同构配置能降低以后复制配置时的误差。

5. 清理低价值结构噪音。

   对空占位目录和 route type 文件中的陈旧注释进行清理或明确保留理由。若目录没有被 import、没有文档说明、没有近期用途，应删除；若保留，应有可理解的上下文。

## Risks / Trade-offs

- [Risk] 文件移动或重命名可能遗漏测试 mock/import 路径。→ Mitigation：实现时用 `rg` 查找旧路径，并运行两个后端的 focused `typecheck`。
- [Risk] admin `_middleware.ts` 提取后可能改变 handler 创建时机。→ Mitigation：保持 module-level singleton，与当前 module import 时创建 handler 的行为等价。
- [Risk] `.types.ts` 改名会影响测试或 route imports。→ Mitigation：逐文件更新 import，并运行 `pnpm --filter @iam/api typecheck`。
- [Risk] 配置统一可能让此前未纳入 lint/typecheck 的脚本被继续排除。→ Mitigation：本次目标是后端 app 源码结构同步；脚本质量检查应另开范围处理。
- [Risk] 文档规则过细会和未来业务演进冲突。→ Mitigation：规则只约束横切结构和命名，不约束业务 domain 必须同形。
