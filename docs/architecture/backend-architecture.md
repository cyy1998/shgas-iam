# 后端架构

本文说明后端的职责、依赖、事务和关键模块协作。文件定位见[仓库地图](repository-map.md)，命名与编写方式见
[后端实现约定](../development/backend-implementation.md)，包出口与 DTO 演进见[共享契约](contracts-and-database.md)。

## 运行时与分层

### 运行时职责

| 运行时    | 职责                                  |
| --------- | ------------------------------------- |
| API       | 登录、SSO/OIDC 与公共、开放和内部接口 |
| Admin API | 管理端 REST 与 tRPC 接口              |
| Worker    | 队列消费、周期恢复与健康检查          |
| Ops       | 一次性人工重建、修复与核验            |
| Gateway   | 独立的网关配置校验、预览、发布与补偿  |

### 核心依赖方向

```text
composition → routes → use-cases → services / ports
                     ↘ services → pure domain logic
```

- 协议入口解析请求、取得认证上下文、调用业务能力并映射响应；REST 与 tRPC 复用同一管理操作。
- Use case 编排跨领域流程；service 提供单个领域的应用能力；纯领域规则只计算结果，不访问基础设施。
- Composition 创建依赖并连接各层。共享 `createApp` 只接收已创建的路由和 middleware，app 私有接线由 app 自己负责。
- Route 的类型和值依赖均不得越过业务层访问 repository 或 UnitOfWork；service 不反向依赖 use case，纯领域规则不依赖 app。
- API、Admin API、Worker、Ops、Gateway 各有独立 composition。Gateway 的 `src/http/` 同样遵守薄协议入口边界。
- `@iam/api-core` 提供显式子路径供 HTTP 应用装配 Hono、OpenAPI 和 tRPC，并共享请求上下文、错误映射、响应和分页。
  Worker、Ops 和共享业务包直接消费所属能力。API 专用的 Internal Client 认证及绑定归 API。
- `@iam/runtime` 的 workspace 依赖限于共享契约。应用传入配置并负责资源和信号的接线，业务能力各自维护状态与恢复。
  `@iam/test-support` 只供开发和测试。

### Composition 与 Port

消费方声明所需的窄接口，provider 通过结构类型满足它；跨层类型归稳定的共享模块或相邻类型文件。
业务模块导出 factory，由 composition 注入运行时依赖。静态枚举、schema 和纯规则直接导入。
具体命名、port 声明与适配规则见[业务编排模块的选择与命名](../development/backend-implementation.md#业务编排模块的选择与命名)。

API/Admin API 的实例装配遵守以下边界：

- 具体 service/repository 的运行时导入与实例化由 composition 负责，业务模块使用注入的实例。
- 全局数据库实例只由 composition 与 repository 实现接入。
- Redis 单例由 composition 或 Redis 基础设施层接入；logger 单例由 composition、app 入口或日志基础设施层接入。

共享资源能力由 `@iam/runtime` 的显式子路径提供。各 app 读取自己的环境、创建资源并负责关闭。API Core 组装 HTTP 日志字段。

类型引用不加载实例，但仍须遵守 route 和 port 的依赖限制。具体检查范围见
[架构守卫](../../scripts/architecture-guard.ts)。

## 请求处理与事务

### 请求、审计与可观测上下文

Hono Context 留在协议层。Actor、审计上下文、requestId 和 traceId 经显式接口传入业务、事务与外部 adapter，
下层不重读请求头，也不依赖隐藏的全局请求状态。审计 context 由独立类型模块持有，事件构造器保持纯函数，写入使用注入的审计接口。

Trace ID 按 `traceparent`、`x-b3-traceid`、`x-trace-id` 优先级解析；traceparent 只取 trace-id。
没有上游 trace 时保留缺失值，不随机补造。字段与脱敏见[Logging](../development/backend-implementation.md#logging)，
业务作用先于审计时的失败处理见[审计安全边界](../development/backend-implementation.md#审计安全边界)。

### Transactions 与 afterCommit

`@iam/unit-of-work` 持有事务编排、提交后任务和回滚确认。一个业务流程只使用一个 UnitOfWork 事务边界。
Composition 用当前事务连接创建 repository、审计和其他
事务接口；业务代码只消费这些接口，不向下传递原始 transaction client。Port factory 和 callback 共用同一个
`afterCommit` 注册口，映射 UnitOfWork 时须保留它。

数据库事务内只执行可随事务回滚的作用。网络请求、Redis 写入、会话撤销和通知放在事务外或提交后执行；
Client Snapshot 失效也遵守这一规则。提交成功后按注册顺序尝试所有任务：

| 模式       | 失败处理                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| required   | 记录错误，全部任务尝试后汇总失败并返回调用方；用于调用契约要求完成的传播 |
| bestEffort | 记录告警，业务结果仍成功；用于可恢复的撤销或重建唤醒                     |

提交后任务失败时数据库已提交，调用方修复后续作用。事务适配器原样抛回 callback 的错误对象时，UnitOfWork 按该对象身份
记录一次回滚确认。事务报错后，Subject Access lifecycle 消费这项确认才尝试恢复前一屏障。未确认的事务结果由所属模块按持久事实恢复。
调用方结果见[Admin 写入结果与失败恢复](../development/backend-implementation.md#admin-写入结果与失败恢复)。

供应商联系人 create-or-attach 使用同手机号的事务 advisory lock，新建与复用路径都先锁后查。
所有此类写入口必须复用同一用例与锁键；这不要求全库手机号唯一。

### Admin 同对象写入规范

Admin PostgreSQL 写入统一在同一 UnitOfWork 内锁定目标，再校验、比较变化、写入并登记审计与文档 Outbox，持锁至事务结束。
公共 mutation 模块负责流程，repository 负责锁定和写入，领域负责转换规则、变化比较及审计内容。

- 锁定拟修改的现存行和级联选中的完整集合，再重验状态。只读父对象普通预检；创建竞争由数据库唯一约束裁决。
- 多行按固定顺序取锁。任职及责任级联先 Employment、后 Assignment，各表按 ID 升序；直接责任命令只锁 Assignment，
  不反向锁父 Employment。Set/Clear Primary 与 Transfer 在首次取锁前合并全部目标任职，Transfer 随后锁齐选中责任。
- 账号生命周期写入先锁 User、后锁精确 transition intent；离职随后锁选中 Employment 和 Assignment，锁齐后重验 HR 资格，原子提交事实、审计与文档 Outbox。
- 锁后写入零行属于不变量失败；已结束的级联对象不重写历史时间。新插入或未被选中的记录不属于本次集合。
- 资料编辑只提交修改字段，关联状态取锁定后的事实。普通同值资料不写审计或文档 Outbox；合法的显式状态、安全和授权意图保留 no-op 审计。
- 已知唯一约束按领域映射冲突；未知数据库错误原样进入异常处理。事务失败后不能继续查询来推断冲突，也不为此自动重试或扩大锁范围。

这些行锁不保护空槽或 phantom，也不把父对象完整性、Primary 唯一性和请求时 HR 范围提升为跨对象串行保证。
各领域仍承担引用、生命周期和授权校验。SQLSTATE 与 constraint 的提取由数据库基础层统一处理，包括包装错误的 cause。
组织创建与路径、闭包关系同事务完成；领域引用预检不额外锁整棵父树。具体返回值、缺失与冲突状态见开发约定，决策见 [ADR-0025](../adr/0025-align-admin-mutation-results-with-committed-facts.md)。

## 认证、会话与访问控制

### Client Snapshot

`@iam/client-snapshot` 统一拥有 Client 缓存控制、普通配置和敏感凭据。普通读取一次固定 Client 状态与单协议配置；凭据通过独立窄接口取得并认证，
普通查询和 DTO 不携带 Secret。认证成功只交付身份信息，敏感观察和比较细节留在模块内。

缓存缺失或损坏才回源；Redis 读取故障直接失败。同一读取器、Client 和失效观察的并发回源合并。
成功失效阻止旧结果晚到回填，新请求不能复用失效前的在途观察；已接受 Snapshot 的调用仍可完成。
发布遇失效冲突至多重取一次，再冲突返回暂态失败。

根出口提供普通读取契约，`/credentials` 提供凭据读取契约及认证。
`/composition` 装配两个 reader、Gate 和统一失效。
数据库 source adapter 由 [DB](../../packages/db/src/client-snapshot.ts) 持有，API 和 Admin API 在装配时注入。
`/maintenance` 提供 Ops 使用的 repair 和独立 verify。`/testing` 提供 Snapshot 专用 Redis fixture。

Admin Client 写入提交后通过装配所得的统一失效操作清除普通与敏感缓存。
合法配置、启停等意图即使 no-op 也保留审计和 required 失效。InternalAuthz 缓存按自身机制失效。
确认提交但传播失败时报告已提交。
COMMIT 未知时保留原错误并保守失效。Secret 重读只读并记审计。配置、启停和轮换均不自动撤销会话。

维护模块只处理当前 owner 库存，保留非目标 Client、其他 owner、旧布局及未知键族，不修改数据库或会话。
Redis 备份恢复后须停流排空、全量修复，再由独立只读核验确认库存清零，不能等待 TTL 自愈。
操作见[Snapshot 修复](../releases/authentication-and-session.md#client-snapshot-修复)，
关键并发行为见[Snapshot 集成测试](../../packages/client-snapshot/test-integration/client-snapshot/client-snapshot.integration.test.ts)。

### Temporary Login Restriction

`@iam/login-restriction` 统一登录失败历史、有效限制、管理查询、解除和派生索引。API 与 Admin API 通过根接口消费业务能力，
由各自的 composition 通过 `@iam/login-restriction/redis` 注入 Redis adapter。键、原子转换和服务端时间由 adapter 持有。
该包的生产代码独立于 API Core、应用和测试支撑。密码和短信认证、用户资料补充、HTTP 映射及审计由应用负责。
登录与管理入口仅消费该能力；解除原子清除限制、失败历史和索引，不创建宽限期或改变已有会话。
无法确认 Redis 状态时报告暂态故障，不能算作凭据错误。管理解除先作用、后写审计，失败处理遵守审计安全边界。
索引不反向决定限制是否生效，缺少用户资料也不能隐藏或阻止解除限制。阈值与字段见[登录功能](../features/sso/login-and-session.md)，
并由[真实 Redis 集成测试](../../packages/login-restriction/test-integration/login-restriction/login-restriction.integration.test.ts)验证原子状态转换。

### Subject Access Barrier

`@iam/subject-access` 拥有账号实时访问屏障。每个业务操作在首次取得可信主体后获取一次许可，固定本次成功、拒绝或暂态结果；
并行分支共享该结果，投影复用许可。下一次操作重新检查，在途已许可请求不因后续禁用而回查。浏览器旅程中的各请求是独立操作。

许可绑定主体、代际和活跃容器，不能伪造、换主体或转交后台；容器关闭后拒绝继续使用。
持久化 context 只记录身份，不能当作许可；缺失或损坏时不得根据当前屏障补齐。重新启用不恢复旧代。
Kernel 检查会话存在、期限、归属和撤销，不解释账号状态；Code 一次消费由协议模块负责。

明确失效拒绝访问，并按原上下文精确撤销；旧代清理不能影响新代。blocking、缺失、损坏或基础设施故障作为暂态失败，
保留可恢复 Cookie。管理会话查询只观察索引和记录，不给目标账号发许可或触发访问清理。
核心操作定义撤销的确认计数、逐项结果与未完成捕获；会话 adapter 通过 Session Kernel 捕获和执行，返回原实例及其失败或未知结果。
API 和 Admin API 通过 [HTTP adapter](../../packages/api-core/src/http/subject-access.ts) 映射核心错误并处理 Cookie，底层写异常不得泄漏原始 Redis 内容。

`/redis` 提供原子存储、bootstrap 与检查，`/lifecycle` 协调账号变更，`/recovery` 提供 repair 与 transition recovery。会话适配器经
`/session-kernel` 提供，单向消费 Kernel。API Core 的 HTTP adapter 使用 Subject Access 根接口。

账号生命周期按以下顺序协调 PostgreSQL 与 Redis：

1. 独立持久化窄 transition intent，再原子 pre-block。
2. 业务事务锁定精确 intent 并记录提交结果；被回收的旧 owner 在写入前被状态检查拒绝。
3. 回滚恢复原状态；禁用类提交后 finalize disabled，再尽力撤销会话。真正重新启用保持 blocking，直到当前 Facts 发布并完成 repair。

同态状态更新恢复原状态；合法重复离职仍尝试生命周期恢复与会话撤销。离职在业务事务前尽力捕获已有会话原上下文，提交后合并捕获代际与 callback 前代精确撤销。
捕获失败退回 callback 前代，未知更早代留待重试；捕获不是全局快照，晚到旧会话由后续重试或访问校验处理。

User Document 持有 PostgreSQL transition intent 及已发布 Document/Facts 的恢复依据实现。各运行时通过 composition 注入这些依赖，
Subject Access 使用同一 UnitOfWork 的回滚确认。

Worker 与 Ops 执行恢复时先用 PostgreSQL 服务端时间回收 stale pending intent，并跳过活跃行锁；失败则停止，随后才处理 Redis transition 与账号修复。
修复按源账号状态决定；启用前须证明当前 Document 与已完成重建一致，完整 Facts 合法且成功发布，直接用户 Outbox 和独立后续义务已满足。
Redis 领取和 lease、确认与新 transition 原子协调，旧 worker 不能删除或推迟新工作。repair 不从缺失屏障直接创建 enabled。
旧调度记录补齐年龄时保留可恢复的最早观察，后续 lease/backoff 不重置年龄。

专用 Subject Access repair 仍需数据库写权限；文档工作的 stale 参数不改变 intent 的服务端时间阈值。
部署方负责配置 Worker 内置周期 repair 和告警，把 stale 阈值、等待下一轮及有界排空计入恢复时限。
步骤见[数据维护](../releases/data-maintenance.md)，关键行为见
[操作许可测试](../../packages/subject-access/test-integration/subject-access/subject-access-operation-kernel.integration.test.ts)。

### Session runtime 与跨 App 边界

Session Kernel 只拥有 UserSession 和 ClientSession，由 Redis 原子状态决定时间、关系、观察与撤销。
它不依赖 Subject Access、协议、API Core 或 app；Code、Token 和续接由各协议拥有。认证用例负责凭据、登录限制、认证方式和审计，随后创建根会话。

Custom SSO 路由与用例通过注入的应用接口访问会话，不直接导入 Kernel、协议内部实现或 app Redis。
Admin 用户和 Client 业务通过撤销接口操作会话，Kernel 接线及原上下文适配由 composition 负责。

根身份、认证事实、context 和期限固定。ClientSession 继承原根与主体，同根同 Client 的 open 原子新建或复用有效实例，
更新协议标记并单调延长到根期限以内。协议凭据期限也受已观察两类会话限制，使用或重新授权不延长旧 Token。

可信观察绑定创建它的 factory 和活跃操作，复制或序列化不能制造观察；迟到结果交付前仍检查操作活跃性。
关闭操作不取消已开始的 Redis 写入。观察可以在本操作复用，下一操作重新观察；内部 ID 查询仍须调用方完成认证、归属与许可检查。
根终止后在线使用拒绝，不依赖子索引枚举或异步 Token 清理；在途授权仍可能落入旧根。

#### Kernel 列表与撤销

列表是有界索引观察，不是完整在线人数；页内坏记录拒绝，多页不构成全局快照。
撤销先捕获全部目标，再执行，不能边删边沿变化游标捕获。捕获前校验目标，已存在的终态也可作为撤销观察，不要求账号许可有效。执行只处理显式目标和稳定实例身份，不扩大子树或替换为当前关系槽。

结果区分已终止、替换、失败和未知；重试只处理原失败或未知集合。没有保存集合时重新查询并明确发起新操作。
响应丢失的作用保持 unknown，重试见终态不重复计数。终态保留原期限，索引清理失败不撤销终态。
协议产物没有 Kernel 第二登记，也没有可靠后台补齐保证。关键行为见
[会话生命周期测试](../../packages/session-kernel/test-integration/session-lifecycle/unified-session-lifecycle.integration.test.ts)。

### Custom SSO 与 OIDC

两协议各自拥有授权、续接、Code 一次消费、Token、交付和补偿，单向消费 Kernel、Client Snapshot、Subject Access 与主体投影。
API 负责 HTTP、Cookie、错误和重定向，不能重建协议状态机；OIDC 不依赖 Custom SSO、app、HTTP 或数据库实现。

Code 固定原 Client、会话实例、用途和授权事实；消费前认证当前 Client 并定位原实例，后续配置不能绕过原用途约束。
消费后失败不恢复 Code 或重放成功结果，适用路径有界终止原 ClientSession；错误 Client 或用途不能撤销无关实例。
托管回调保留独立失败规则，不套用业务兑换撤销。完整兑换覆盖响应构造，补偿只处理本次原始 Token，反向索引不替代权威记录。

Token 记录保存协议校验所需事实、有效期限与原会话绑定；不保存主体资料快照或第三方本地会话。OIDC 退出取消只消费确认，确认作用于请求当前根。
签名配置启动时校验，只公开公钥；生命周期由 API composition 管理。第三方会话、密钥兼容与失败细节分别见
[Custom SSO](../guides/custom-sso.md)、[OIDC](../guides/oidc.md)和[会话维护](../releases/authentication-and-session.md)。

### 角色分配解析

`@iam/assignment-resolution/role-assignment` 统一有效角色与受影响用户的反向解析，调用方不复制 assignment 或组织闭包规则。
Composition 用当前连接创建并复用 resolver，失效模块自行创建事务绑定实例。

正向解析检查任职、分配目标和角色有效性；岗位与直属组织完整性由 Document builder 在发布前校验。
反向解析更保守，不能因角色、岗位或组织已失效而漏掉需重建的用户。管理端 CRUD 可以直接维护 assignment，协议消费已发布 Facts。
理由见 [ADR-0002](../adr/0002-centralize-role-assignment-resolution.md)。

### Organization Responsibility 解析

`@iam/assignment-resolution/organization-responsibility` 负责有效责任和跨树 holder 反向解析，调用方显式提供观察时间。
查询在数据库层排除 Disable 的已结束责任，关联目标的完整性重查也使用相同范围；Enable 与 Pause 的引用、父生命周期、
期间或开放名额异常时整批拒绝，未知责任状态仍报完整性异常。已结束记录保留在管理历史中，不参与当前责任解析和校验。
resolver 不拥有缓存、授权、管理历史或协议输出。
组织变更的失效集合同时包含子树任职用户和责任反向 holder；Type 的披露字段或排序变化也须使 holder 失效。

`@iam/assignment-resolution/organization-responsibility/parent-lifecycle` 独立提供开放责任目标子树的读取与父生命周期拒绝。
API 与 Admin API composition 绑定当前事务；Admin 责任 repository 和父生命周期 participant 复用该能力。
其他模块通过注入的业务 port 消费，不直接导入此写入侧出口。组织暂停或停用按实际修改对象在源事务内检查，
拒绝时源事实、审计与两类文档 Outbox 一起回滚；该预检不增加锁，也不保护随后插入的 phantom。

Admin 通过同一授权能力区分 full 与 scoped。HR 在分页前同时约束 holder 任职组织和目标组织，写入事务内复查双端条件。
越界详情与操作隐藏存在性，拒绝日志不泄漏记录、路径或范围集合。完整管理员和混合角色走 full 分支。
`allowedActions` 综合范围、生命周期、父完整性与隐藏阻塞；唯一冲突按 Full/HR 返回适当的安全说明。
授权按每次请求的数据库事实决定，不保证提交时线性化撤权。

### Client Subject Projection

`@iam/client-subject-projection` 拥有协议中性的 Catalog、披露裁剪和投影。核心通过注入的 Facts 与许可接口协作，
不直接依赖数据库、读模型实现、app、运行支撑、会话运行时或协议包。一次交付用同一份合法 Facts，
仅交付 Subject Identifier 时不读取 Facts。调用方提交主体、Client、披露选择和本操作许可；投影不重新认证或读取 Client 配置。

普通资料和授权都消费已发布 Facts，不在请求时检查重建新鲜度或联查源角色表。角色变更可能在重建前继续交付旧事实，
不承诺固定撤权传播期限；账号访问屏障另行生效。Facts 缺失或主体错配时整份投影失败。

Custom SSO 的浏览器出口 `/wire` 拥有 schema、mapper 和预览，只通过 Projection 根接口取得中性能力，不能访问
其内部实现、持久化或服务端入口。映射后校验主体一致和完整输出。责任随任职资料一起交付，不形成独立 claim 或授权任职字段。
OIDC UserInfo 与 Custom SSO 实际交付时使用当前披露；Code 保留原授权事实，已签发 ID Token 内容固定。
版本和字段分别以各 owner 的 schema 为准，不由调用方选择版本或通过旧格式回退。

代码入口：[Projection](../../packages/client-subject-projection/src/)、[Custom SSO wire](../../packages/custom-sso/src/wire.ts)。
决策见 [ADR-0032](../adr/0032-consume-published-subject-facts-for-authorization.md)。

### Client 委托

`@iam/delegation` 统一创建、生命周期、冲突、范围查询与安全选择器。API 与 Admin API 消费公开接口，分别传入
Client、本人或全局管理范围；app 不互相导入私有实现。解析由 API 在同一观察时刻和数据库快照完成，不进入 Document 或 Subject Facts。

写入按委托人协调：创建先锁 User；更新只预读不可变委托人 ID，取 User 锁后重读记录和范围，再校验并写入事实及审计。
同一委托人的写入共用该锁，冲突校验与写入在锁内完成；这些写入不登记 Document Outbox。
委托引用的删除门禁由 User、Client、Organization 各自的写入口执行。
状态、冲突及删除限制见[应用委托](../features/delegation/client-delegation.md)，设计理由见
[ADR-0020](../adr/0020-provide-fail-closed-privilege-delegation-resolution.md)。

## 读模型与异步处理

`@iam/documents` 的包内更新核心由 User Document 与 Organization Document 共同消费，负责事务绑定登记与通知合并、领取、完成凭据重放、
重建版本与处理所有权仲裁、批量重建编排、原子发布和两阶段 repair。文档模块提供来源解释、关联展开、构建和写入适配器，
用户模块另拥有 Facts 缓存和 Subject Access 后续责任。共用编排不合并两类文档的数据或事务。

`@iam/documents/user` / `@iam/documents/organization` 的 producer 由 API/Admin API composition 接入，worker 由 Worker composition 接入；query repository 由查询 composition 接入。业务模块只消费注入能力，不自行跨出口创建实现。

API/Admin API 在每个源事务内分别合并两类 Document 唤醒，每类提交后整次入队共用 2 秒预算，
每个 transport 批次最多 500 个任务，超时后停止发送剩余批次。唤醒失败保留源事实、审计和 Outbox，
由 bestEffort 返回原业务结果，Worker 周期 repair 重新投递；迟到或重复消息仍由持久凭据和版本仲裁。
`@iam/jobs` 统一 producer 的分批、总预算、随机任务身份与确认数校验，以及专用连接和关闭。
HTTP producer 与维护命令使用专用快速失败连接，连接无响应时释放 socket；常驻 Worker 保留长期重连。

共享重建编排在领取版本与处理 token 后，用同一个只读源快照调用文档构建适配器，并核对结果身份、版本和覆盖范围。
对象资料异常独立失败，源查询失败使该批构建失败，未完成领取按原 owner 条件释放或由 stale repair 回收。
发布按数量和文档字节分组，锁定并重验版本和 owner，将文档或墓碑、processed 及 owner 登记的后续义务原子提交。
确定回滚的目标局部错误可有界拆分隔离；连接、配置或未知提交结果停止扩散重试。已确认提交的对象仍交给 owner 后处理，
不因其他对象或后续批次失败而丢失。共享实现见[重建编排](../../packages/documents/src/update/batch-rebuild.ts)。

### User Document 失效

源事实与 Outbox 消息同事务提交，调用方提交实际源变化，不预先固化最终关联用户集合。消息保存来源、必要的原关联及直接用户身份；删除角色分配、结束任职和责任仍保留原受影响对象。提交后才以一致观察展开依赖，原子登记目标 Rebuild State 版本和消息完成凭据。
Outbox processed 表示全部目标重建要求已经持久登记，不表示入队或文档已发布。重复完成消息复用凭据而不推进新版本；队列只唤醒，丢失唤醒由两阶段 repair 恢复。登记覆盖组织子树任职者与跨树责任持有人、岗位、角色和分配，不依赖角色 code 前缀。

### User Document Subject Facts publication

普通重建将同次 Outbox 展开或 repair 唤醒的用户请求交给共享重建编排，有界批次内共享业务构建读取。
批次不成为新的持久业务对象，各用户仍独立保存版本与处理结果，不跨独立 Outbox 等待凑批；旧单对象任务也经同一编排执行。
构建与发布的批界可以不同；PG 发布按用户数和文档字节数再切成小组，单个大文档独立处理。
接口见[更新处理器](../../packages/documents/src/user/worker/user-document-update.processor.ts)。

每次构建固定源快照和观察时点，读取开放任职并校验岗位、组织与完整路径，再投影有效任职及角色的明确 Client 归属。
PostgreSQL 每个用户只保存一份业务 document 及身份、schema、sourceVersion、发布时间等技术元数据；不再保存 detail、searchDoc、subjectFacts 或独立基础资料副本。Admin 和源账号查询保留管理专属模型。

User 的写入适配器在共享发布事务内登记 post-publication 义务；重领更换 owner，同版本旧 owner 也不能完成新工作。
活跃锁下无法释放的记录交给 repair，已确认提交的对象不会因后续子组失败而撤销。

PG 提交确认后才处理外部作用。用户后处理集合领取、批量读取已发布文档，并按每个对象的版本和独立 token 写回完成或失败；
Facts 与 Subject Access 仍逐主体执行，共享模块实例的有界并发额度。已知结果及时成批写回，不等待同页最慢成员；
Access lease 在实际执行该主体修复时领取，不为整页提前占用。Redis 失败不回滚文档，主 processed 也不解除后续恢复责任。
正常消费和 repair 复用[后处理器](../../packages/documents/src/user/worker/user-document-post-publication.processor.ts)。
两条入口共用每个发布版本的自动尝试预算，领取与过期接管都消耗一次机会；耗尽后保留未完成义务并报告人工处理，
不占用后续 repair 的领取额度。活跃的最后一次尝试仍可完成，新版本发布重新获得预算。
人工重试可以指定用户与发布版本，或显式强制批量 repair；预算重置与新 owner 的领取原子完成，
批量模式只重置本轮已锁定且满足领取条件的耗尽义务，仍受 limit 与 stale 条件约束。
迟到 owner 继续受版本与 token 仲裁约束。操作与超限报告见[日常修复](../releases/data-maintenance.md#user-document-日常修复)。
只有已删除用户发布 document=null，未删除的 Pause/Disable 仍有完整文档；源行缺失不是墓碑。Redis 使用持久带版本墓碑，阻止旧 publisher 或回填复活；比较版本保持 bigint 精度。缓存失败保留持久 post-publication 工作供 repair。

Facts reader 合法缓存命中直接返回；缺失、损坏或主体错配时按主体合并回源，从已发布 document 派生同版本 Facts 或墓碑并尽力回填。回填失败仍可使用合法 PG 结果；Redis 读取故障不回源，不查询源业务表或旧副本。读取诊断只含操作、结果和耗时，观测失败不改变认证。
重新 Enable 仍要求当前源账号允许、全部直接用户 Outbox 完成、当前完整 Facts 与已完成重建匹配、PG/Redis 与 post-publication 满足恢复条件；retained-newer 缓存尤其墓碑不能被忽略，删除屏障保持 disabled。

Internal 搜索与精确详情直接读取当前 schema 已发布目录；详情返回完整公开文档，搜索先完整校验并按 Client 生成公开内容，再执行 select。默认身份字段、合法选择路径与部分输出结构由[公开文档搜索契约](../../packages/contracts/src/document-search.ts)沿公开 schema 派生。角色条件和输出都先绑定认证 Client。无本 Client 角色的有效任职仍保留空 roles，内部 Client 归属、数据库 ID 和管理历史不公开。无可读条目的详情返回 404，损坏或查询失败返回 503，不回源拼装。

正式用户 PG gate 在一个 REPEATABLE READ READ ONLY 事务完整核对全部源用户、文档/墓碑、Outbox、Rebuild State、主及后续处理凭据、源事实与孤立记录；Redis gate 用一致 PG 库存检查完整 Facts/墓碑与屏障。两者只读、不入队、不修复，Backfill 原因码不是就绪条件。不能跳过删除用户或仅核对数量。
用户 PG gate 复用逐对象构建结果，将已知源完整性与 schema 问题按用户汇总并继续后续分页；数据库、Redis、未知构建异常或构建结果覆盖不完整仍中断核验。
取消信号传入清单查询、分页、构建批次和 Redis 检查，在关键读取前后检查；取消后不再启动后续工作，也不返回完整核验报告。
数据库回退需匹配旧制品与备份，不删除 migration journal 重放迁移。维护见[数据维护](../releases/data-maintenance.md)，接线验证见[Ops 维护测试](../../apps/ops/test-integration/user-document/user-document-maintenance.integration.test.ts)。

Employment verifier 独立以一致只读快照检查任职及父对象，报告 blocker；不推断历史结束时间或生成修复 SQL。

### Organization Search 发布与核验

`@iam/documents/organization` 独立拥有 `organization_document_outbox`、`organization_document_rebuild_state` 和
`organization_document`，通过共享核心处理来源消息、重建要求与发布。源事务用实际修改结果登记变化：创建、状态和删除登记自身，
code/name/type 变化登记子树；零行修改不登记。提交后按当前闭包展开，后续创建的后代由自己的变化登记覆盖。

展开在一致快照中锁定并重验领取 token，原子登记目标版本和 Outbox 完成凭据。完成消息重复投递只唤醒原版本，不推进新版本。
并发展的确定回滚可重试一次，仍失败则保留消息供后续恢复，不重放源业务写入。
repair 在源事件和重建两阶段回收失败或过期工作，跳过活跃事务；重领更换 token，旧 owner 即使持有同版本也不能发布或完成新工作。

组织现有单对象任务以单元素请求接入共享重建编排，构建适配器在该只读事务内校验完整路径；不额外开启嵌套源事务。
发布复用相同的版本/owner 仲裁、等待预算、确定回滚重试与失败回收，将文档或删除墓碑与 processed 同事务提交。
只有已删除源对象发布墓碑，源行缺失属于完整性错误。墓碑保留版本仲裁事实。
搜索和 Internal 精确详情只读当前 schema 的可见已发布文档，允许延迟，不联查源表或执行全量覆盖检查。
详情没有可读条目返回 404，损坏或查询失败返回 503；404 不证明源对象不存在。

独立 verifier 在同一 `REPEATABLE READ READ ONLY` 事务读取源组织、闭包、文档/墓碑、Rebuild State 和 Outbox 凭据，
完整检查覆盖、结构、源事实、处理版本及孤立记录，不写数据或派发任务。历史完成事件可以指向较早版本，不能指向未完成的更高版本。
核验失败须修复后重新全量检查，不能抽样放流。
关键验证见[恢复测试](../../packages/documents/test-integration/organization/recovery/recovery.integration.test.ts)与
[核验测试](../../packages/documents/test-integration/organization/verification/verification.integration.test.ts)，操作见
[组织搜索维护](../releases/data-maintenance.md#组织搜索全量重建)。

### Filter 引擎

共享引擎按调用方显式公开的文档结构派生校验与参数化 JSONB 条件。目标列由 repository 提供，输入不能指定任意 SQL 或路径。
入口检查外层请求，repository 在查询前使用受校验的 compiler；递归解析前执行语言预算检查。
引擎只拥有语言、作用域和编译，不持有数据库连接、源表或发布状态。结果预算、排序、超时和错误映射由读模型及入口负责。
接口见[Filter 引擎](../../packages/filter-engine/src/)，调用规则见[搜索接入](../guides/search.md)。

### Internal 查询资源

Internal 用户查询、组织搜索和委托解析分别使用专用数据库连接，由 API composition 创建、注入并在关闭时释放。
数据库语句超时与 HTTP 请求超时分别设置；不能仅靠请求超时限制数据库执行时间。
连接与预算配置见[查询资源实现](../../apps/api/src/composition/internal-query-resource.ts)，装配约束见
[查询资源测试](../../apps/api/src/composition/__tests__/internal-user.composition.test.ts)。

### Worker 运行与维护

Worker 通过公开 workspace package 复用业务能力，不导入 API 私有实现。
Worker composition 拥有模块选择、队列注册、consumer、health/readiness、Bull Board 和关闭顺序。
未知模块启动失败；模块反序关闭，信号由 app 处理，业务包不持有进程生命周期。
Ops 统一 `iam-ops` CLI 使用独立的 `IAM_OPS_*` 配置和 `apps/ops/.env`，按所选命令校验实际所需资源，不读取 Worker 配置或接受旧维护别名。Ops 与 Worker 不导入对方或其他 app 的私有源码。
人工命令按实际需要使用窄 composition：重建复用普通发布路径，核验使用独立只读连接，Redis 维护不加载无关数据库或队列。

启用 User Document 或 Organization Document consumer 的 Worker 可通过各自的环境变量开启周期 repair，
启动时运行首轮，上一轮结束后按配置间隔运行下一轮。两类调度共用实现并独立运行，一类失败不阻塞另一类。
每轮启动 Worker 自有的私有 repair 子进程，使用本轮显式输入与独立连接，保留限额、deadline、完整恢复顺序及后处理尝试预算；超时不重放源业务写入。
Worker 停机先停止调度并终止、等待所属 repair 进程，再确认该轮 PostgreSQL invocation 已关闭，随后关闭常驻资源。
每轮连接 UUID 由父进程持有并显式传给子进程；强制终止绕过子进程信号处理时，父进程仍通过数据库 owner 精确取消并在返回前确认清理。
轮次清理失败则停止该类后续调度；停机时保留失败，不把进程退出或稍后的 SQL timeout 当作清理成功。
人工入口与自动子进程通过 User Document、Organization Document 各自的 `/maintenance` 公开出口复用维护能力。
User Document owner 统一编排 stale transition 回收、backlog 观察、transition 恢复、Document/后处理与 Subject Access 修复和结果汇总。
app 显式装配依赖、注册信号并呈现报告；领域接口不读取 app 配置或持有进程生命周期。
PostgreSQL invocation 的独立连接、语句超时及精确取消由 `@iam/db/maintenance` 拥有；
`@iam/runtime/maintenance` 提供离线 Redis、deadline 和聚合关闭，信号由 app 显式接入；队列由 `@iam/jobs` 拥有。
原始执行失败和必需关闭失败均保留；自动子进程的资源清理失败同样停止后续轮次。
`@iam/runtime/process` 管理 POSIX 所属进程树和 Windows Job。Windows 源码模式使用 Runtime 源码目录中的 launcher 与 supervisor，
standalone Worker 从可执行文件的同级目录加载 `windows-job-launcher.exe` 与 `windows-job-supervisor.ps1`。
对应开关关闭、未启用该 consumer 或 dashboard-only 时不启动该周期任务。多实例复用持久领取和版本仲裁，不依赖进程内计时器实现跨实例互斥。
接线见[周期恢复](../../apps/worker/src/composition/document-repair-schedule.ts)，配置与运行检查见[数据维护](../releases/data-maintenance.md#周期任务与监控)。

组织写入命令与 consumer 共用正式队列前缀，repair 只重新投递，发布仍由普通 consumer 完成。
只读 verifier 的取消仅作用于本次连接身份、数据库和角色；deadline、中断或关闭失败均非零退出。
会话维护通过各 owner 的公开维护出口按 namespace 和前缀处理全部版本与键类型，保留非目标库存，不按损坏记录的 schema 决定清理范围。
`/maintenance` 与 `/testing` 分开，当前维护不探测或转换其他旧布局。命令入口见[开发命令](../development/commands.md)。

## 网关配置发布

Gateway service 拥有认证、规划、发布和补偿；composition 注入当前 Client 窄读取与固定 APISIX 目标。
每请求只读数据库认证，在途操作不因后续凭据变化中止。发布从读取前态到补偿结束持有本实例执行权，失败后停止正向写入并补偿已尝试目标。
允许短暂部分生效，补偿失败或未知后阻断本实例；断连不终止原操作，不自动重试。
此保证以无其他实例或外部并发写入为前提；服务没有持久恢复任务，正常关闭等待在途操作，崩溃或未知结果由人工核对恢复。
见[Gateway 接入](../guides/gateway.md)、[发布手册](../releases/apisix-gateway-release.md)及
[发布生命周期测试](../../apps/gateway/test-integration/runtime/publication-lifecycle.integration.test.ts)。
