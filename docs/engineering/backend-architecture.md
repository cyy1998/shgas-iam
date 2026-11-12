# 后端架构与实现约定

本文维护跨应用的依赖、装配、请求处理与一致性约束。运行时拓扑、源码位置与共享契约分别见
[系统架构](system-architecture.md#逻辑拓扑)、[仓库地图](repository-map.md)和[共享契约与数据库](contracts-and-database.md)。
验证方式见[测试规范](testing.md#验证选择)，静态规则见[架构守卫](testing.md#架构守卫)。

## 运行时、分层与装配

### 核心依赖方向

- Route 的类型和值依赖都不得越过业务层访问 repository 或 UnitOfWork。
- Use case 编排跨领域流程，service 提供单领域应用能力，纯领域规则只计算结果。Service 不依赖 use case，纯领域规则不依赖基础设施或 app。
- `@iam/api-core` 通过显式子路径共享 HTTP 装配、请求上下文和响应能力。Worker、Ops 和共享业务包直接使用各 owner 的能力。
- `@iam/runtime` 的 workspace 依赖限于共享契约。App 显式传入配置，负责资源和信号接线。业务 owner 负责自身状态与恢复。`@iam/test-support` 只供开发和测试。

### 业务编排模块的选择与命名

- **Application Use Case**。一个调用方目标涉及跨领域编排、多 repository 的事务操作或按事务结果安排副作用时，放在
  `use-cases/<scope>/<verb-noun>/<verb-noun>.use-case.ts`。使用 `create<VerbNoun>UseCase` 和 `<VerbNoun>UseCase`，
  暴露 `execute(input, options)`，接收 normalized actor、最小 audit request context 等协议无关输入。
- **Application Service**。单个领域的 command/query facade 放在 `services/<domain>/<domain>.service.ts`，按需声明
  repository、UnitOfWork、audit 或 read model port。
- **纯领域规则**。放在 `packages/domain/src/<domain>/`，按职责使用 `*Policy`、`*Rules` 或 `*Specification`。

### Composition 与 Port

API、Admin API、Worker、Ops、Gateway 各自在启动时装配依赖。API 与 Admin API 的 Hono 入口将 env 和 logger 交给
composition，由 composition 创建并接好 repository、UnitOfWork、service、use case、route 和 middleware。
入口再把装配好的 route、middleware 和 app config 交给共享 `createApp`，注册供请求使用的处理链路。

消费方声明窄 port，provider 以结构类型满足它。Use case 的 consumer-owned port 与输入类型和主文件同目录，分别使用 `*.port.ts` 和 `*.type.ts`。

- 在消费方直接写出实际调用的方法签名；不得 import `*.repository`、`repositories/**`，也不得使用
  `Pick<...Repository>` 或 `Pick<...Service>` 派生 port。
- 跨 provider/consumer 使用的 input/result type 放到 domain/contracts、相邻 `*.type.ts` 或 neutral
  protocol/session module，并让 repository/service 同样 import 该 owner；不要从 provider 模块 re-export 来保留旧所有权。
- 可以使用 `Pick<...Port>` 复用另一个 consumer-owned port 的一部分，也可以对 Node/framework platform type 做窄化。
- 用只在类型检查阶段执行的 provider-to-port compatibility assertion 固定 structural compatibility。只有确需字段或语义
  转换时才在 composition 写显式 adapter，并为映射行为补测试；不要添加空转 adapter 或 `as unknown as`。

可替换业务模块导出 factory 和返回类型，例如 `createUserService(deps)` 和
`type UserService = ReturnType<typeof createUserService>`。由 composition 注入实例，静态枚举、schema 和纯规则直接导入。基础设施实例放在 app-local `src/lib/`。

全局 DB 由 composition 或 repository 实现接入，
Redis 单例由 composition 或 Redis 基础设施接入，logger 单例由 composition、app 入口或日志基础设施接入。
App 通过 `@iam/runtime` 显式子路径创建并关闭资源。类型依赖同样遵守边界。

API composition 为用户查询、组织搜索和委托解析装配并关闭各自的专用连接，数据库语句超时独立于 HTTP 请求超时。
[查询资源](../../apps/api/src/composition/internal-query-resource.ts)

## 请求入口与响应

### Route 与 Middleware

请求经过适用的 middleware 后进入 route handler。Route 负责协议解析、认证上下文和响应映射，通过已注入的接口调用
use case 或 service。Admin REST 与 tRPC 复用同一管理操作，Internal Client 认证和绑定归 API。
Gateway 的 `src/http/` 同样保持薄协议入口。

REST 使用 `*.routes.ts`、`*.handlers.ts`、`*.type.ts`。`*.index.ts` 暴露接收已创建依赖的 router factory。
Tier middleware 导出 factory 或注入数组，共享认证 handler 放 app-local `src/middlewares/`。
框架与协议适配模块按 Adapter、Resolver、Policy、Verifier 等实际职责命名。
[协议边界](#custom-sso-与-oidc) · [Admin API 装配与路由](../../apps/admin-api/README.md#装配与路由)

### 请求、审计与可观测上下文

Hono Context 留在协议层。Actor、审计上下文、requestId 和 traceId 显式传给业务、事务和外部 adapter。
下层不重读请求头或依赖全局请求状态。审计上下文独立定义，事件构造保持纯函数，写入通过注入接口。

Trace ID 依次取 `traceparent` 的 trace-id、`x-b3-traceid`、`x-trace-id`。缺失时保留缺失值。
[请求头解析 getTraceIdFromHeaders](../../packages/api-core/src/http/request-log.ts) ·
[观测上下文实现](../../packages/runtime/src/observability/index.ts) · [日志字段与脱敏](#系统日志) · [审计安全边界](#审计安全边界)

### HTTP 响应与 OpenAPI

- Route handler 应返回来自 `@iam/api-core/http` 的共享 response envelope，例如成功 JSON response 使用
  `c.json(resp.ok(data))`，显式失败 envelope 使用 `resp.fail(...)`。
- 当现有 error middleware 已能正确映射 domain/API error 时，优先 throw error。
- 在 OpenAPI route definition 和显式非 200 response 中使用 `@iam/contracts/http` 的状态常量。

[响应实现](../../packages/api-core/src/http/response.ts) · [错误映射](../../packages/api-core/src/middlewares/error-handler.ts)

## 事务与写入恢复

### Transactions 与 afterCommit

必须一起提交或回滚的数据库写入使用同一个 `@iam/unit-of-work` 事务。Composition 从同一事务连接创建 repository、审计等
接口，业务代码通过这些 port 执行事务内操作。禁止嵌套 UnitOfWork，避免内层 `afterCommit` 在外层事务提交前执行。
Port factory 和 callback 共用同一 `afterCommit` 注册口，映射 UnitOfWork 时须保留它。
[UnitOfWork 实现](../../packages/unit-of-work/src/unit-of-work.ts)

需要独立提交的阶段可以按顺序使用各自的事务。Subject Access 先独立持久化 transition intent，再设置 pre-block 屏障，
随后进入业务事务。 [账号生命周期](../../packages/subject-access/README.md#账号生命周期)

事务内只执行可回滚的作用。网络、Redis 写入、会话撤销、通知与 Snapshot 失效放在事务外或提交后。提交后按注册顺序尝试所有任务。

| 模式       | 失败处理                                 |
| ---------- | ---------------------------------------- |
| required   | 记录错误，全部任务尝试后向调用方报告失败 |
| bestEffort | 记录告警，保留业务成功结果               |

提交后失败由调用方修复后续作用，数据库写入已生效。事务适配器原样抛回 callback 错误时，UnitOfWork 按错误对象身份记录一次回滚确认。
Subject Access 消费确认后才能尝试恢复前一屏障。结果未知时由 owner 对照持久事实恢复。

### Admin 同对象写入规范

Admin PostgreSQL 写入在同一 UnitOfWork 内锁定、重验、比较变化、写入并登记审计与文档 Outbox。
公共 mutation 模块编排流程，repository 持锁至事务结束，领域负责转换、比较与审计内容。

- 锁定现存目标和完整的选中级联集合。仅用于读取的父对象走普通预检，创建竞争由唯一约束裁决。组织与路径、闭包关系同事务创建，无需锁整棵父树。
- 先锁 Employment、后锁 Assignment，各表按 ID 升序。直接责任命令只锁 Assignment。Set/Clear Primary 与 Transfer 首次取锁前合并全部目标任职，Transfer 随后锁齐选中责任。
- 账号生命周期先锁 User，再锁精确 transition intent。离职随后锁定选中的 Employment 和 Assignment，锁齐后重验 HR 资格，原子提交事实、审计与 Outbox。
- 锁后写入零行属于不变量失败。同态命令与已结束的级联对象保留历史时间，新插入或未选中记录在本次集合之外。
- 资料编辑只提交变动字段，关联状态以锁后事实为准。同值资料不写审计或 Outbox，合法的显式状态、安全和授权意图保留 no-op 审计。
- 数据库基础层统一提取 SQLSTATE 和 constraint，包括包装错误的 cause。已知唯一冲突按领域映射，未知错误原样上报。事务失败后不得继续查询推断冲突、自动重试或扩大锁范围。

行锁只覆盖已选中的行。父引用、空槽、Primary 唯一性和请求时 HR 范围仍由领域校验及适用的数据库约束负责。
[ADR-0025](../adr/0025-align-admin-mutation-results-with-committed-facts.md)

父组织暂停或停用时，在源事务内预检开放责任。预检拒绝时，事实、审计与两类文档 Outbox 一并回滚。
[组织责任预检](../../packages/assignment-resolution/README.md#organization-responsibility-解析)

### Admin 写入结果与失败恢复

Admin 业务 mutation 返回 `{ changed, result }`。REST 放入 envelope 的 data，tRPC 直接返回。

#### 成功、无变化与领域拒绝

| 操作           | 结果                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| 创建、Transfer | 保留该操作约定的新资源或资源 ID。                                         |
| 密码生成/重置  | result 保留明确授权的一次性生成结果，密码哈希不进入响应或审计。           |
| 普通无资源命令 | result 为 null。                                                          |
| 会话管理       | 保留两类实际终止计数、原批次未完成结果与安全摘要。                        |
| 解除登录限制   | result.failureStateCleared 表达原子清理完成，changed 只表示有效限制变化。 |

空资料更新返回 400，普通缺失和重复删除返回 404，非法生命周期转换或已知唯一冲突返回 409。授权与范围判断先于可公开的存在性、冲突信息。
Client 显式删除后可以重试残余会话清理。 [删除应用](../features/application-integration.md#删除应用)

合法无变化返回 `changed: false`。

#### 已提交、未知与作用后失败

| 错误或情况                                    | 已知事实                                                           | 调用方下一步                                                           |
| --------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `ADMIN_MUTATION_COMMITTED`                    | 业务已提交，必需的提交后任务或生命周期处理失败。                   | 读取已提交详情并持续显示修复提示；先修复后续作用，不自动重放业务写入。 |
| COMMIT 结果不确定                             | 尚不能确认成功提交或确定回滚；保留原未知错误及对应模块的保守处理。 | 读取事实并按对应模块的恢复流程处理，不根据错误推断未生效或自动重试。   |
| `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` | Redis 会话或限制作用已发生或可能发生，审计未确认完成。             | 刷新确认当前状态，保留审计修复提示，不自动重放操作。                   |

读取成功仅确认当前读取结果。缓存传播或审计未确认时保留修复提示。
生成密码未交付时先修复再主动重置。SSO Secret 生成或轮换只返回安全结果，读取响应丢失可主动重读。
[SSO Secret 读取与审计](../../apps/admin-api/README.md#sso-secret-读取与审计)

会话未知作用仍可能生效，确认终止数和 `changed` 只反映确认结果。本人改密的密码提交与后续会话处理分开报告。
[本人改密](../features/login-and-session.md#修改密码与全部下线)

## 认证、会话与访问控制

- **Client 配置与凭据**。一次读取固定 Client 状态和单协议配置，凭据走独立接口。Admin 提交后统一失效，传播失败时数据库写入已生效。
  [Client Snapshot](../../packages/client-snapshot/README.md)
- **登录限制**。API 与 Admin API 使用同一限制能力，应用负责认证和审计。Redis 状态未知时报告暂态失败。
  [Login Restriction](../../packages/login-restriction/README.md)
- **账号访问**。一次业务操作只取一次许可，分支和投影共享，下一次操作重新检查。重新启用依赖已发布的完整 Facts，旧代访问仍失效。
  [Subject Access](../../packages/subject-access/README.md)
- **会话**。Kernel 持有 UserSession 与 ClientSession，子关系受根期限约束，撤销按精确实例执行。调用方经注入的会话接口使用 Kernel，Admin 经注入的撤销接口操作。
  [Session Kernel](../../packages/session-kernel/README.md)
- **主体投影**。按当前披露范围读取同一份已发布 Facts，允许源资料与角色变更延迟。投影复用本操作许可，账号屏障独立生效。
  [Client Subject Projection](../../packages/client-subject-projection/README.md)

### Custom SSO 与 OIDC

协议各自拥有授权、续接、Code、Token 和补偿，单向消费 Kernel、Snapshot、Subject Access 和主体投影。API 负责 HTTP、Cookie、错误和重定向。HTTP adapter 消费完整协议操作，claims 以及 Code/Token 流程由协议包持有。
OIDC 与 Custom SSO 分别独立于另一协议的实现，OIDC 也独立于 app、HTTP 和数据库实现。

Code 固定原 Client、会话实例、用途和授权事实，只消费一次。业务兑换通过适用认证并可靠定位原 ClientSession 后，失败时只对该实例有界尝试撤销。
兑换边界覆盖响应构造，适用的 Token 补偿仅处理本次原始 Token。Token 保存协议校验事实、期限和原会话绑定。Code 消费后失败须重新授权。
[兑换与托管回调](../adr/0035-unify-user-and-client-session-lifecycles.md#一次消费与失败作用) · [OIDC 退出](../../packages/oidc/src/logout.ts) · [OIDC 签名装配](../../apps/api/src/composition/runtime/create-runtime.ts)

### 管理授权

Admin 按请求时的数据库事实授权，已获授权的在途操作可能在并发撤权后完成。
组织责任管理区分 full/scoped，混合角色走 full。HR 在分页前约束 holder 任职组织和目标组织，写入时在事务内重验。
越界隐藏存在性，日志与冲突提示不得泄露范围。`allowedActions` 结合范围、生命周期、父完整性和隐藏阻塞。
[组织责任管理](../features/directory-management.md#组织责任管理)

## 审计与日志

### 审计安全边界

审计仅记录可追责的业务身份和脱敏变化。密码、哈希、验证码、Secret、Token、Cookie、Authorization、
可认证摘要、原始异常及任意上下文不得进入 details。
[Admin 审计实现](../../apps/admin-api/README.md#审计事件与作用后失败)

### 系统日志

- Runtime diagnostics 使用所属 app 的 logger。优先使用结构化 Pino 调用，data object 在前、message 在后，例如
  `logger.info({ userId }, "user synced")`。应用代码避免使用 console，环境校验、进程生命周期、测试、一次性脚本和集中错误处理可按需使用。
- 系统日志使用结构化字段，携带 `event`、`sourceApp` 及适用的 `requestId`、`traceId`。事件名使用稳定小写点分命名，
  不拼接请求 ID、用户标识、client code、动态业务值或原始 URL。OIDC 专属事件沿用 API 的实现。
- 系统日志不采集请求体或响应体。输出到 stdout 前脱敏 Authorization、Cookie/Set-Cookie、密码、Token、Secret、私钥、验证码和 OIDC authorization code。
  SM2 私钥、SM4 key material、nonce/credential 原文、Cap token 与 challenge solution 禁止记录。
  APISIX access log 不含敏感 header 或原始 query。生产者遵守最小字段约束，采集端提供二次脱敏。

[HTTP 日志字段](../../packages/api-core/src/http/request-log.ts) · [logger 与默认脱敏路径](../../packages/runtime/src/logger/index.ts) ·
[OIDC 事件](../../apps/api/src/composition/root-authentication.ts) · [OIDC 错误字段](../../apps/api/src/routes/oidc/oidc.http.ts) · [上下文传递](#请求审计与可观测上下文) · [采集与排障](../releases/observability-system-logs.md)

## 后台处理与恢复

### 读模型发布

源事务提交后，队列负责唤醒消费者。发布与恢复以持久版本和处理凭据为准。
User Document 构建复用有效角色解析，角色变更后的失效处理复用反向解析定位受影响用户。
[文档发布与恢复](../../packages/documents/README.md#共享发布与恢复) · [角色分配解析](../../packages/assignment-resolution/README.md#角色分配解析)

### Worker 运行与维护

Worker 持有常驻消费与自动恢复，Ops 持有人工维护。两者各自装配资源、处理信号与关闭，通过 owner 的公开维护能力协作。
[Worker 周期 repair](../../apps/worker/README.md#周期-repair) · [Ops README](../../apps/ops/README.md)
