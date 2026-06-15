# TypeScript 通用最佳实践审查记录

## 背景

本文记录 2026-06-15 对 IAM Service 当前代码库进行的一次 TypeScript 最佳实践轻量审查，重点观察类型安全、类型边界、工具链门禁、前端异步控制流与运行时校验的一致性。

本次只做探索和文档沉淀，未修改业务代码。OpenSpec 当前无活动 change。

## 总体判断

项目整体 TypeScript 基线较好，后端和共享包普遍开启了 `strict`、`noUncheckedIndexedAccess`、`verbatimModuleSyntax` 等关键选项，`pnpm typecheck` 全量通过。主要风险不是大面积类型失控，而是少数边界通过 `any`、双重断言或直接 JSON 断言绕开了 TypeScript 与运行时校验。

更值得优先处理的是前端 lint 门禁未接入脚本：`apps/admin` 和 `apps/sso` 有 ESLint 配置，但没有 `lint` script，根级 `pnpm lint` 实际不会覆盖这两个前端应用。

```
TypeScript 风险分布

工具链门禁
  ├─ 后端 / 共享包: lint + typecheck 已接入
  └─ admin / sso: typecheck 已接入，lint script 缺失

类型边界
  ├─ 动态 import: 依赖调用点泛型，缺少模块 shape 校验
  ├─ 外部 JSON / Redis: 少数 parse 后直接 as SomeType
  └─ 前端 DTO: 个别 as unknown as 绕过形状差异

运行时控制流
  └─ 前端登录跳转路径使用永不 resolve 的 Promise
```

## 主要问题

### P1: 前端 ESLint 配置未接入 package scripts

**最佳实践风险**：质量门禁不完整，React / hooks / import / unused 规则无法在常规 lint 中生效。

当前 `apps/admin` 与 `apps/sso` 均存在 Umi ESLint 配置：

- `apps/admin/.eslintrc.js`
- `apps/sso/.eslintrc.js`

但两个 package 的 scripts 里没有 `lint`：

- `apps/admin/package.json:5`
- `apps/sso/package.json:5`

根级 `turbo.json:13` 定义了 `lint` task，`pnpm lint` 只会执行有 `lint` script 的包。本次验证中根级 lint 只执行了 8 个 task，而 workspace scope 中包含 10 个包；`@iam/admin` 和 `@iam/sso` 没有被覆盖。

单独验证：

- `pnpm --filter @iam/admin lint` 失败：`None of the selected packages has a "lint" script`
- `pnpm --filter @iam/sso lint` 失败：`None of the selected packages has a "lint" script`

**影响**：

- 前端代码中 hooks 依赖、未使用变量、可疑 Promise、React 规则等问题不能通过常规 CI / 本地 lint 暴露。
- `.eslintrc.js` 容易形成“看似配置了，实际没运行”的假安全感。

**建议**：

1. 为 `@iam/admin` 和 `@iam/sso` 增加 `lint` script，例如运行 Umi ESLint 覆盖 `src`、配置文件与 mock。
2. 若部分生成目录不适合 lint，通过 ignore 精确排除 `.umi`、`.umi-production`、`dist` 和明确的生成代码。
3. 将 `pnpm lint` 输出中的 task 数作为后续检查信号，确保前端被纳入根级门禁。

### P1: 前端使用永不 resolve 的 Promise 表达重定向控制流

**最佳实践风险**：异步函数返回语义不清，调用方可能永久 pending。

以下路径在认证失败或维护模式跳转后返回永不 resolve 的 Promise：

- `apps/admin/src/app.ts:31`
- `apps/admin/src/app.ts:74`
- `apps/admin/src/lib/api-client.ts:21`
- `apps/sso/src/utils/request.ts:73`
- `apps/sso/src/utils/request.ts:78`
- `apps/sso/src/utils/request.ts:88`
- `apps/sso/src/utils/request.ts:108`

这种写法能阻止后续逻辑继续执行，但它让函数签名仍表现为会正常返回 `T` 或 `Response`，调用方无法通过类型系统理解“这里已经跳转，不会得到业务数据”。

**影响**：

- 上层 `finally`、loading 状态、请求队列或 React Query / tRPC 调用方可能长期处于 pending。
- 错误处理链路无法区分认证跳转、维护跳转与真实网络错误。
- 后续维护者容易复制这种模式，形成隐式控制流。

**建议**：

1. 引入明确的 redirect/auth error，例如 `AuthRedirectError`、`MaintenanceRedirectError`。
2. 跳转后 `throw` 明确错误，或集中在请求层处理并 reject。
3. 若确实需要中断当前生命周期，封装为命名函数并让返回类型体现 `never` 语义，避免散落 `new Promise(() => {})`。

### P1: 生产代码仍存在局部 `any` 与双重断言

**最佳实践风险**：类型逃逸集中在框架边界与核心查询 helper，后续形状变化不会被 TypeScript 捕获。

典型位置：

- `apps/api/src/app.ts:8` 与 `apps/admin-api/src/app.ts:8`：`globImport<{ default: any }>` 用于动态路由发现。
- `apps/api/src/app.ts:9` 与 `apps/admin-api/src/app.ts:9`：`globImport<{ default: any[] }>` 用于 tier middleware。
- `packages/api-core/src/core/create-app.ts:14`：`OpenAPIHono<any>` 作为 AnyRouter。
- `packages/api-core/src/core/define-config.ts:35`：tier routes 使用 `OpenAPIHono<any>`。
- `apps/api/src/services/user/user.repository.ts:68`：Drizzle alias table 以 `any` 传入 `employmentHasRoleCondition`。
- `packages/api-core/src/middlewares/error-handler.ts:24`：`c.get("logger" as never) as ErrorLogger | undefined`。
- `apps/admin/src/pages/users/components/UserDetailDrawer.tsx:225`：`row as unknown as EmploymentVo`。

其中动态路由发现属于框架边界，短期可接受；但用户详情页的双重断言会掩盖 `EmploymentDetailDto` 与 `EmploymentVo` 的真实差异。当前二者结构相近，因此能运行，但后端 VO 增减字段时 TypeScript 不会提醒这条路径。

**影响**：

- route / middleware 模块导出形状错误时，编译期难以发现。
- Drizzle query helper 的表别名类型被抹平，字段变更时缺少约束。
- 前端详情 DTO 与列表 VO 混用，后续 UI 依赖字段可能在运行时才暴露问题。

**建议**：

1. 将 `globImport` 的调用类型收敛为项目自有类型，例如 `{ default: AnyRouter }` 与 `{ default: TierMiddleware[] }`。
2. 对动态 import 的模块 shape 做轻量运行时断言，错误信息指向具体文件。
3. 为 Drizzle alias helper 补具体 table/alias 类型，避免业务查询 helper 接收 `any`。
4. 前端将转岗弹窗参数改成真正需要的最小类型，或显式构造 `EmploymentVo` 所需字段，而不是双重断言。

### P2: 少数 JSON / Redis 边界 parse 后直接断言

**最佳实践风险**：外部输入绕过运行时 schema，缓存污染或版本漂移时才报错。

项目里已经有较好的模式，例如 `apps/oidc-provider/src/session/provider-session.ts:43` 先将 JSON 解析为 `unknown`，再通过 Zod schema 校验。

但仍有少数位置直接断言：

- `apps/api/src/lib/integrations/cap/cap.client.ts:25`：`JSON.parse(value) as ChallengeData`
- `apps/oidc-provider/src/repositories/client.repository.ts:27`：`JSON.parse(cached) as OidcClientRuntimeMetadata`
- `gateway/src/apisix-admin-client.ts:56`：直接返回 `JSON.parse(text)`，后续依赖调用方处理 unknown shape
- `packages/contracts/src/auth/login-credential.ts:112`：泛型 `decodeJson<T>()` 返回 `JSON.parse(...) as T`

其中 contracts 的登录凭证解析后续有 `assertEnvelope`、`assertPlaintext` 等校验，风险较低；Redis/cache 与第三方 HTTP 返回更适合统一为 `unknown -> schema.safeParse`。

**影响**：

- 缓存旧版本、手工污染或第三方返回异常时，类型系统无法防止错误对象进入业务逻辑。
- 运行时错误可能出现在更深层调用栈，定位成本更高。

**建议**：

1. 对 Redis / cache payload 建立 Zod schema 或复用 DTO schema。
2. 统一 parse helper：返回 `unknown`，由边界函数负责 schema 校验与缓存清理。
3. 对网关 Admin API response 保持 `unknown`，在 `unwrapApisixList` 等函数中继续收窄。

### P2: 生成 / 示例代码留在 admin 源码树并全量禁用 lint

**最佳实践风险**：全局 namespace、`any` 和禁用规则污染业务项目。

相关文件：

- `apps/admin/src/services/demo/UserController.ts:1`
- `apps/admin/src/services/demo/typings.d.ts:1`
- `apps/admin/src/services/demo/typings.d.ts:4`
- `apps/admin/mock/userAPI.ts:7`

这些文件看起来是 OneAPI / Umi 示例或生成代码，使用 `/* eslint-disable */`、`declare namespace API` 与多处 `any`。本次搜索未发现业务页面引用 `apps/admin/src/services/demo`。

**影响**：

- 全局 `API` namespace 可能与后续真实 OpenAPI 生成类型冲突。
- 当 admin lint 接入后，这类文件会成为需要额外处理的噪音。

**建议**：

1. 若已无业务用途，删除 demo service 与 mock。
2. 若需要保留示例，移到明确的 generated 或 example 目录，并从业务 tsconfig / lint 中排除。
3. 避免在业务源码树里引入全局 namespace，优先使用模块化导出类型。

### P3: Zod 推导类型以空 interface 形式导出

**最佳实践风险**：风格与 TypeScript 类型别名最佳实践不完全一致，风险较低。

典型位置：

- `apps/admin-api/src/services/position/position.type.ts:4`
- `apps/admin-api/src/services/client/client.type.ts:11`
- `apps/api/src/services/privilege/privilege.type.ts:4`
- `apps/api/src/services/user/user.type.ts:8`

当前写法类似：

```ts
export interface UserQueryDto extends z.infer<typeof UserQueryDtoSchema> {}
```

当类型完全来自 Zod schema 时，`type UserQueryDto = z.infer<typeof UserQueryDtoSchema>` 更直接，也避免 interface declaration merging 带来的开放性。

**影响**：

- 当前影响主要是风格与可读性，不构成立即风险。
- 如果有人利用 interface merging 扩展 DTO，可能让 schema 与 TS 类型分离。

**建议**：

在后续触碰相关文件时顺手改为 `type`，不建议单独为此开大范围重构。

## 配置观察

### 做得较好的地方

- 多数后端 / 共享包开启 `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`、`verbatimModuleSyntax`。
- `packages/db`、`packages/domain`、`packages/contracts`、`packages/api-core`、`apps/api`、`apps/admin-api`、`gateway` 均有 package 级 `lint`、`test`、`typecheck`。
- 前端 `apps/admin`、`apps/sso` 已有 `typecheck` script，并通过 Umi 生成 tsconfig 启用了 `strict`。
- 代码中已经开始使用 `satisfies`、`as const` 和 Zod schema parse，这些是值得继续扩展的好模式。

### 可逐步增强的地方

- `allowJs: true` 在后端和 Umi 生成 tsconfig 中存在。当前实际业务 JS 文件很少，风险有限；若后续 JS 变多，需要配合 `checkJs` 或限制 JS 进入业务源码。
- `skipLibCheck: true` 是 monorepo 常见取舍，不建议贸然关闭；如遇类型依赖升级问题，可针对关键包做额外验证。
- `noUnusedLocals`、`noUnusedParameters` 当前关闭，主要依赖 ESLint；因此前端 lint 接入更重要。

## 建议路线

### 第一阶段：补齐门禁

1. 为 `@iam/admin`、`@iam/sso` 增加 `lint` script。
2. 确认根级 `pnpm lint` 实际覆盖 10 个 workspace package。
3. 对 demo / generated 文件做保留或删除决策，避免前端 lint 接入后产生噪音。

### 第二阶段：收敛高风险类型边界

1. 收敛动态 route / middleware import 的 `any`。
2. 为 Redis / cache JSON payload 增加 schema 校验。
3. 清理 `as unknown as`，优先处理 `UserDetailDrawer` 到 `TransferModal` 的 DTO/VO 形状混用。

### 第三阶段：改善控制流语义

1. 将登录、维护、未授权跳转抽象为明确错误或明确 `never` 辅助函数。
2. 统一 admin 和 sso 请求层的认证失败处理。
3. 补充针对请求层 401 / maintenance 的前端测试或轻量 smoke 场景。

## 验证记录

本次审查执行了以下命令：

```bash
openspec list --json
pnpm typecheck
pnpm lint
pnpm --filter @iam/admin lint
pnpm --filter @iam/sso lint
```

结果：

- `openspec list --json`：无活动 change。
- `pnpm typecheck`：通过，10/10 package successful。
- `pnpm lint`：通过，但只执行 8/10 package lint task，未覆盖 `@iam/admin` 与 `@iam/sso`。
- `pnpm --filter @iam/admin lint`：失败，package 没有 `lint` script。
- `pnpm --filter @iam/sso lint`：失败，package 没有 `lint` script。
