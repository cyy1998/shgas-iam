# 后端实现约定

本文记录后端实现层规则。结构边界和 composition 规则见
[../architecture/backend-architecture.md](../architecture/backend-architecture.md)。

## HTTP Responses 与 OpenAPI

- Route handler 应返回来自 `@iam/api-core/http` 的共享 response envelope，例如成功 JSON response 使用
  `c.json(resp.ok(data))`，显式失败 envelope 使用 `resp.fail(...)`。
- 当现有 error middleware 已能正确映射 domain/API error 时，优先 throw error。
- 在 OpenAPI route definition 和显式非 200 response 中使用 `@iam/api-core/core/http-status-codes` 常量，而不是
  numeric literal。

## Admin 写入结果与失败恢复

Admin 业务 mutation 返回 `{ changed, result }`；REST 放入现有 envelope 的 data，tRPC 直接返回。
本页拥有调用方可观察的结果及恢复语义；事务与锁序见
[Admin 同对象写入规范](../architecture/backend-architecture.md#admin-同对象写入规范)、
[Transactions 与 afterCommit](../architecture/backend-architecture.md#transactions-与-aftercommit)。
决策理由见 [ADR-0025](../adr/0025-align-admin-mutation-results-with-committed-facts.md)。

### 成功、无变化与领域拒绝

| 操作           | 结果                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| 创建、Transfer | 保留该操作约定的新资源或资源 ID。                                         |
| 密码生成/重置  | result 保留明确授权的一次性生成结果，密码哈希不进入响应或审计。           |
| 普通无资源命令 | result 为 null。                                                          |
| 会话管理       | 保留两类实际终止计数、原批次未完成结果与安全摘要。                        |
| 解除登录限制   | result.failureStateCleared 表达原子清理完成，changed 只表示有效限制变化。 |

空资料更新返回 400，普通缺失和重复删除返回 404，非法生命周期转换或已知唯一冲突返回 409；
Client 显式删除允许重试其残余会话作用的例外见[删除应用](../features/admin/client-sso-configuration.md#删除应用)。
授权与范围判断先于可公开的存在性、冲突信息。

普通同值资料不记变更审计或 dirty；显式生命周期、安全、授权意图的合法 no-op 保留 changed:false 意图审计。
同态命令不改写历史时间，非法转换不伪装成幂等成功。
Internal 委托保持其独立详情/boolean 协议，不套 Admin wire。

### 已提交、未知与作用后失败

| 错误或情况                                    | 已知事实                                                           | 调用方下一步                                                           |
| --------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `ADMIN_MUTATION_COMMITTED`                    | 业务已提交，必需的提交后任务或生命周期处理失败。                   | 读取已提交详情并持续显示修复提示；先修复后续作用，不自动重放业务写入。 |
| COMMIT 结果不确定                             | 尚不能确认成功提交或确定回滚；保留原未知错误及对应模块的保守处理。 | 读取事实并按对应模块的恢复流程处理，不根据错误推断未生效或自动重试。   |
| `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` | Redis 会话或限制作用已发生或可能发生，审计未确认完成。             | 刷新确认当前状态，保留审计修复提示，不自动重放操作。                   |

读取成功不证明缓存传播或审计恢复，不能据此清除修复提示。
生成密码未交付时先修复再主动重置。**SSO Secret 是独立例外**：
生成/轮换只返回安全结果，管理员可经授权且成功提交审计的窄读取取得当前原文；
读取响应丢失可主动重读，不需要再次轮换。未确认读取审计时不交付原文，
详见[Client 配置](../features/admin/client-sso-configuration.md)。

会话未知作用不计入成功数量，即使 changed 和确认终止数为零，也不能把 unknown-only 当成“没有可能作用”。
本人改密的密码提交与后续会话处理分开报告，见[本人改密](../features/sso/login-and-session.md#修改密码与全部下线)。

### 审计安全边界

审计仅记录可追责的业务身份和脱敏变化。密码、哈希、验证码、Secret、Token、Cookie、Authorization、
可认证摘要、原始异常及任意上下文不得进入 details。会话审计也不保存 Redis key、原始 Session Origin 或撤销捕获 identity。
事件字段和 action 由[事件构造器](../../apps/admin-api/src/services/audit/events/)定义，
会话事件见[实现](../../apps/admin-api/src/services/audit/events/session-management.audit.ts)及[行为测试](../../apps/admin-api/src/services/session-management/__tests__/session-management.service.test.ts)。

会话操作先作用于 Redis，再写审计。确认有变化或存在 unknown 时，审计失败使用作用后失败错误；
只有 failed、没有确认变化也没有 unknown 时，仍是普通审计失败。unknown 不计入 changed 或成功终止数。
SSO Secret 读取必须先确认独立审计提交，再交付原文；失败不携带可能含参数的数据库异常。
字段读取、配置与轮换的行为由[Client SSO service](../../apps/admin-api/src/services/client-sso/client-sso.service.ts)及
[集成测试](../../apps/admin-api/test-integration/client/client-sso-management.integration.test.ts)维护。

## Logging

- Runtime diagnostics 使用 app logger（`@api/lib/logger`、`@admin-api/lib/logger`、`@worker/lib/logger` 或 OIDC
  provider logger）。
- 优先使用结构化 Pino 调用，data object 在前、message 在后，例如 `logger.info({ userId }, "user synced")`。
- Application code 中避免使用 `console.log`、`console.warn` 和 `console.error`。
- 可接受的 console 例外包括 env validation、singleton/process lifecycle code、tests、one-off scripts 和 centralized
  error handler。

系统日志使用结构化字段：`event`、`sourceApp`、`requestId`、`traceId`，以及适用的
`method/path/route/statusCode/durationMs`、`clientIp/userAgent` 和 `errorName/errorCode/errorMessage/source`。
`sourceApp` 为 `iam-api`、`iam-admin-api`、`iam-worker` 或 `apisix`；网关另有 `spanId`、`traceparent`。
一般 event 使用稳定小写点分命名，不拼接请求 ID、用户标识、client code、动态业务值或原始 URL。
OIDC 既有事件保留 `oidc_server_error`（error）和 `oidc_protocol_error`（warn），仅记录安全 code/outcome/path/status。

系统日志不采集请求体或响应体。应用 logger 输出 stdout 前脱敏 authorization、cookie/set-cookie、password、
token/accessToken/idToken/refreshToken、secret/clientSecret/privateKey、验证码及 OIDC authorization code。
不得输出 SM2 私钥、SM4 key material、nonce/credential 原文、Cap token 或 challenge solution。
Alloy 二次脱敏常见敏感 key，APISIX access log 不含 body、敏感 header 或原始 query；后续脱敏不代替生产者的最小字段约束。
上下文传递见[后端架构](../architecture/backend-architecture.md#请求审计与可观测上下文)，
采集标签、Dashboard 链接限制和排障见[日志与排障](../releases/observability-system-logs.md)。

## Types、Constants 与 Guard Clauses

- Business query 中优先使用来自 `packages/contracts` 或所属模块的 enum 和 constant，避免 magic strings/numbers，
  尤其是 status、type 和 role-like 字段。
- 当 schema 已是 source of truth 时，优先使用 `z.infer<typeof Schema>` 从 Zod schema 派生 TypeScript type。
- 当 simple guard clause 返回单个明显值时，保持简洁，例如 `if (!entity) return null;`。

## 业务编排模块的选择与命名

新增业务行为时按职责选择落点：

- 一个调用方目标需要协调多个领域、多个 repository transaction，或需要根据 transaction 结果继续执行审计、通知
  等副作用时，实现为 Application Use Case。使用
  `use-cases/<scope>/<verb-noun>/<verb-noun>.use-case.ts`、`create<VerbNoun>UseCase`、
  `<VerbNoun>UseCase`，并让返回对象暴露 `execute(input, options)`。Use-case 只接收 normalized actor、最小 audit
  request context 等协议无关输入，不接收 Hono `Context`。
- 行为围绕 user、role、position 等单个领域能力提供 app-local command/query facade 时，实现为
  `services/<domain>/<domain>.service.ts` 中的 Domain-aligned Application Service。此类 service 可以通过注入使用
  repository、UnitOfWork、audit 和 read model port，但不得 import `use-cases/**`。`UserService`、`RoleService` 是这类
  application facade；不要因为名称含 `Service` 就把它们称为 pure DDD Domain Service。
- 不需要 persistence、transaction、audit、network、Hono 或 composition 的业务规则放在
  `packages/domain/src/<domain>/`。优先按职责命名为 `*Policy`、`*Rules` 或 `*Specification`；避免使用含义模糊的
  `*DomainService`。

Application Use Case 的 consumer-owned ports 与输入类型和主文件同目录，分别使用 `*.port.ts`、`*.type.ts`。
实例在 `composition/use-cases/` 创建，composition root 通过独立 `useCases` 字段把它交给 route。Route 只负责解析
schema/context、调用 use-case/service、映射 VO 和构造 response，不得通过 type-only import 绕过 repository 或
UnitOfWork 边界。

编写或修改 production `*.port.ts` 时：

- 在消费方直接写出实际调用的方法签名；不得 import `*.repository`、`repositories/**`，也不得使用
  `Pick<...Repository>` 或 `Pick<...Service>` 派生 port。
- 跨 provider/consumer 使用的 input/result type 放到 domain/contracts、相邻 `*.type.ts` 或 neutral
  protocol/session module，并让 repository/service 同样 import 该 owner；不要从 provider 模块 re-export 来保留旧所有权。
- 可以使用 `Pick<...Port>` 复用另一个 consumer-owned port 的一部分，也可以对 Node/framework platform type 做窄化。
- 用只在类型检查阶段执行的 provider-to-port compatibility assertion 固定 structural compatibility。只有确需字段或语义
  转换时才在 composition 写显式 adapter，并为映射行为补测试；不要添加空转 adapter 或 `as unknown as`。

## Protocol Adapter 与 Non-Hono Composition

- 直接实现 framework/protocol hooks、并在 public signature 中使用 framework protocol types 的模块使用 Adapter、
  Resolver、Policy、Verifier 等实际角色命名，不因其含业务数据就命名为 Application Service。
- OIDC 协议操作由 `packages/oidc` 拥有，API 的 `routes/oidc/oidc.http.ts` 负责 HTTP 适配，
  `composition/root-authentication.ts` 接入统一 Kernel、Client Snapshot、主体披露与签名能力。旧 Provider app 和 claims hook 已退役，
  不重建旧 Provider facade 或 compatibility alias。
- UserInfo 在 OIDC owner 中按当前允许的披露选择调用 Subject Projection；HTTP adapter 不自行拼装业务 claims、
  重查会话或实现另一套 Code/Token 生命周期。
- Protocol adapter tests 通过正式 factory 注入所需 ports，断言 claims、认证与验证错误、Code/Token 消费及撤销等
  调用方可观察行为；根级 Architecture Guard 只约束稳定的 production module edge owner。

## Audit 与 Architecture Guards

- `services/audit/events` 下的 backend audit event helper 应是纯 payload builder。
- Service 和 handler 通过注入的 root 或 tx audit writer port 写入 audit payload。
- `pnpm check:architecture` 是唯一静态架构入口；package 普通测试不扫描其他 workspace 的 production source。
- 根级 Architecture Guard 扫描受保护 workspace 的 production `*.port.ts`，拒绝 concrete repository import、
  `repositories/**` import 和从 Repository/Service 派生的直接 `Pick`；合法 `Pick<...Port>` 与 platform narrowing
  不应误报。
- Route production module 的 type/value import 都受根 guard 约束：不得 import app-local `*.repository` 或
  `@iam/api-core/uow`；`services/**` 不得反向 import `use-cases/**`。失败信息保留稳定 rule ID、违规文件、行号与
  可操作诊断。
- Package public surface 与 provider/port 结构兼容由 exports 和 typecheck 负责；业务与 transaction 语义由公开
  behavior/contract tests 负责；真实 composition wiring/readiness 由 process smoke 负责；PostgreSQL、浏览器和
  Gateway 事实由各自外部资源通道负责。新增永久静态规则前遵守
  [架构守卫规范](../architecture/architecture-guard.md)的观察模型与准入流程。
