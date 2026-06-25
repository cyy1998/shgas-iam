# IAM Service 架构评审报告

## 背景

本报告对 IAM Service 项目的整体架构进行全面评审，涵盖项目结构、分层设计、数据库、安全性、代码质量等维度，识别当前存在的问题并提出改进建议。

---

## 一、架构优点

项目在以下方面做得较好：

1. **清晰的分层架构** — Route Handler -> Service -> Repository -> Prisma，职责分离明确
2. **OpenAPI 集成** — 使用 `@hono/zod-openapi` 将路由定义与 API 文档统一，Zod schema 同时承担校验和文档职责
3. **类型安全链路** — Prisma 生成类型 -> Zod schema 校验 -> TypeScript interface 推导，类型从数据库到 API 响应一路连贯
4. **事务设计模式** — Repository 函数默认参数 `tx: PrismaTransaction = prisma`，使事务和非事务调用统一
5. **Singleton + HMR** — `createSingleton()` 工具避免热重载时重复初始化客户端
6. **路由自动注册** — 文件系统扫描 `src/routes/` 自动发现并注册路由，减少手动维护

---

## 二、关键问题

### 2.1 安全问题 (CRITICAL)

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | **MAGIC_CODE 后门** | `src/routes/auth/auth.service.ts:18,29` | 密码登录和手机登录均接受 `MAGIC_CODE` 绕过验证，任何知道此环境变量值的人可登录任意账户 |
| 2 | **弱随机数生成** | `src/utils/encryption.utils.ts:12` | `generateRandomPassword` 使用 `Math.random()`，不具备密码学安全性，应使用 `crypto.getRandomValues()` |
| 3 | **重定向 URL 校验不足** | `src/routes/sso/sso.service.ts` | 使用 `startsWith()` 校验重定向 URL，`https://example.com` 可匹配 `https://example.com.evil.com`，应改为 URL 解析后精确匹配 host |
| 4 | **缺少速率限制** | 全局 | 认证端点无速率限制，暴力破解无阻碍 |
| 5 | **缺少 CORS / 安全头** | `src/lib/core/create-app.ts` | 无 CORS 策略、无 CSP、无 `X-Frame-Options` 等安全头 |
| 6 | **Swagger 文档无鉴权** | `src/lib/core/create-app.ts:74` | `/doc/scalar` 对外暴露完整 API 结构，无任何访问控制 |
| 7 | **无路由级权限校验** | `src/routes/admin/` 各模块 | 中间件只验证登录状态，不校验角色/权限，已认证用户可调用所有 admin 接口 |

### 2.2 性能问题

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | **N+1 查询** | `src/services/user/user.service.ts:25-44` | `_getUserDetail()` 对每个 employment 分别查询 roles 和 privileges，3 个任职产生 7 次 DB 查询，应通过 Prisma `include` 或批量查询优化 |
| 2 | **同样的 N+1** | `src/services/employment/employment.service.ts` | `_getEmploymentsDetail()` 存在相同模式 |
| 3 | **内存分页** | `src/utils/page.util.ts` | `paginate()` 先查全量数据再截取，大数据集下性能差，应改为数据库级 `skip/take` |
| 4 | **注释掉的索引** | `src/db/schema.prisma:35,71,106,195,262` | `username`、`orgCode`、`posCode`、`roleCode`、`privilegeCode` 均为高频查询字段，索引被注释掉 |

### 2.3 代码质量

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | **查询构造逻辑重复约 260 行** | `user.repository.ts:57-163` 与 `employment.repository.ts:7-121` | 几乎相同的 OR 条件构造和角色过滤逻辑，应抽取共享函数 |
| 2 | **验证码校验函数重复** | `mobile.service.ts` 和 `session.service.ts` | 相同逻辑存在两处定义 |
| 3 | **Prisma 错误处理不检查错误码** | `role.service.ts:62-74,88-94,111-119,134-142` | 捕获 `PrismaClientKnownRequestError` 后不检查 `err.code`，将所有错误当作唯一约束冲突处理 |

### 2.4 架构设计问题

| # | 问题 | 说明 |
|---|------|------|
| 1 | **认证中间件分散注册** | 每个 admin 路由模块都重复 `router.use(prefix, publicAuthenticationHandler)`，应在路由组级别集中配置 |
| 2 | **错误处理用 `console.error`** | `error.handler.ts:20` 未使用项目配置的 pino logger，生产环境应统一日志 |
| 3 | **HTTP 客户端不统一** | 部分用 `axios`（orcas.ts），部分用 `fetch`（wechat.ts），增加维护成本 |
| 4 | **环境变量校验不完整** | `IAM_API_DATABASE_URL` 等 app 数据库连接参数不在 `env.ts` 的 Zod schema 中验证 |
| 5 | **默认密码机制** | 已移除；密码为 null 的用户不再通过默认密码验证 |
| 6 | **魔法数字 `-1`** | `schema.prisma:44-45` — `parentId: -1` 表示根节点，应使用 `null` |
| 7 | **`oidc-provider` 已安装未使用** | `package.json` 中存在依赖但代码中未引用，SSO 采用自定义实现 |
| 8 | **`bcrypt` 和 `bcrypt-ts` 双重依赖** | `package.json` 同时存在两个 bcrypt 库 |

### 2.5 一致性问题

| # | 问题 | 说明 |
|---|------|------|
| 1 | **文件命名** | `.type.ts` vs `.types.ts` 混用 |
| 2 | **Schema Converter 命名** | `EmploymentDtoConverterSchema` / `OrganizationDtoConverterSchema` / `PrivilegeDelegationDetailDtoConverterSchema` 命名规则不统一 |
| 3 | **状态枚举值不一致** | `PositionStatus.Disable = 4` 而其他 Status 枚举 `Disable = 3` |
| 4 | **Schema 文件分布不一致** | admin 路由有 `.schema.ts` 做 DTO->VO 转换，其他路由没有 |
| 5 | **错误处理策略不一致** | 部分 service 抛异常，部分返回 null；部分捕获 ZodError，部分不捕获 |

---

## 三、改进建议（按优先级排序）

### P0 — 安全紧急修复

1. **移除 MAGIC_CODE 后门** — 删除 `auth.service.ts` 中的 `password !== config.MAGIC_CODE` 分支
2. **加强重定向 URL 校验** — 使用 `new URL()` 解析后比较 origin
3. **添加速率限制中间件** — 至少在 `/auth/*` 路径上配置
4. **实现路由级权限校验** — 在 admin 中间件中校验用户角色/权限

### P1 — 性能优化

5. **消除 N+1 查询** — 用 Prisma `include` 一次查询 employment + roles + privileges
6. **启用注释掉的数据库索引** — 取消 `schema.prisma` 中索引的注释
7. **数据库级分页** — 将 `paginate()` 从内存分页改为 `skip/take`

### P2 — 代码质量

8. **抽取公共查询构造逻辑** — 将 user/employment repository 中重复的 ~260 行查询条件提取为共享函数
9. **统一错误处理** — error handler 使用 pino logger；Prisma 错误检查具体 error code
10. **清理冗余依赖** — 移除 `bcrypt`（保留 `bcrypt-ts`）和未使用的 `oidc-provider`

### P3 — 架构优化

12. **中间件集中注册** — 在路由组级别统一应用认证中间件，而非每个模块重复配置
13. **统一 HTTP 客户端** — 全部使用 `fetch` 或全部使用 `axios`
14. **补全环境变量校验** — 将 `IAM_<APP>_DATABASE_URL` 等加入各 app 的 `env.ts` Zod schema
15. **统一命名规范** — 文件名统一用 `.type.ts`（单数）；Converter schema 采用统一命名模式
16. **添加安全头和 CORS** — 配置 Hono 的 CORS 中间件和安全头中间件

---

## 四、总结

项目的基础架构设计合理——分层清晰、类型安全、OpenAPI 集成良好。主要风险集中在：

- **安全层面**：MAGIC_CODE 后门、缺少路由级权限校验、无速率限制
- **性能层面**：N+1 查询模式、内存分页、索引缺失
- **工程质量**：大量代码重复、命名不一致、错误处理策略混乱

建议优先处理 P0 安全问题，再逐步推进性能和代码质量改进。
