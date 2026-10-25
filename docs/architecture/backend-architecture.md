# 后端架构

本文说明后端的职责、依赖、事务和关键模块协作。文件定位见[仓库地图](repository-map.md)，命名与编写方式见
[后端实现约定](../development/backend-implementation.md)，包出口与 DTO 演进见[共享契约](contracts-and-database.md)。

## 运行时与分层

### 运行时职责

| 运行时    | 职责                                     |
| --------- | ---------------------------------------- |
| API       | 登录、SSO/OIDC 与公共、开放和内部接口    |
| Admin API | 管理端 REST 与 tRPC 接口                 |
| Worker    | 队列消费、读模型重建、维护命令与健康检查 |
| Gateway   | 独立的网关配置校验、预览、发布与补偿     |

### 核心依赖方向

```text
composition → routes → use-cases → services / ports
                     ↘ services → pure domain logic
```

- 协议入口解析请求、取得认证上下文、调用业务能力并映射响应；REST 与 tRPC 复用同一管理操作。
- Use case 编排跨领域流程；service 提供单个领域的应用能力；纯领域规则只计算结果，不访问基础设施。
- Composition 创建依赖并连接各层。共享 `createApp` 只接收已创建的路由和 middleware，app 私有接线由 app 自己负责。
- Route 的类型和值依赖均不得越过业务层访问 repository 或 UnitOfWork；service 不反向依赖 use case，纯领域规则不依赖 app。
- API、Admin API、Worker、Gateway 各有独立 composition。Gateway 的 `src/http/` 同样遵守薄协议入口边界。

### Composition 与 Port

消费方声明所需的窄接口，provider 通过结构类型满足它；跨层类型归稳定的共享模块或相邻类型文件。
业务模块导出 factory，由 composition 注入运行时依赖。静态枚举、schema 和纯规则直接导入。
具体命名、port 声明与适配规则见[业务编排模块的选择与命名](../development/backend-implementation.md#业务编排模块的选择与命名)。

API/Admin API 的实例装配遵守以下边界：

- 具体 service/repository 的运行时导入与实例化由 composition 负责，业务模块使用注入的实例。
- 全局数据库实例只由 composition 与 repository 实现接入。
- Redis 单例由 composition 或 Redis 基础设施层接入；logger 单例由 composition、app 入口或日志基础设施层接入。

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

一个业务流程只拥有一个 UnitOfWork 事务边界，不嵌套 UnitOfWork。Composition 用当前事务连接创建 repository、审计和其他
事务接口；业务代码只消费这些接口，不向下传递原始 transaction client。Port factory 和 callback 共用同一个
`afterCommit` 注册口，映射 UnitOfWork 时须保留它。

数据库事务内只执行可随事务回滚的作用。网络请求、Redis 写入、会话撤销和通知放在事务外或提交后执行；
Client Snapshot 失效也遵守这一规则。提交成功后按注册顺序尝试所有任务：

| 模式       | 失败处理                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| required   | 记录错误，全部任务尝试后汇总失败并返回调用方；用于调用契约要求完成的传播 |
| bestEffort | 记录告警，业务结果仍成功；用于可恢复的撤销或重建唤醒                     |

提交后任务失败不能回滚数据库，也不能据此自动重放业务写入。事务结果未知时先保留未知状态，由模块核对事实并恢复。
调用方结果见[Admin 写入结果与失败恢复](../development/backend-implementation.md#admin-写入结果与失败恢复)。

供应商联系人 create-or-attach 使用同手机号的事务 advisory lock，新建与复用路径都先锁后查。
所有此类写入口必须复用同一用例与锁键；这不要求全库手机号唯一。

### Admin 同对象写入规范

Admin PostgreSQL 写入统一在同一 UnitOfWork 内锁定目标，再校验、比较变化、写入并登记审计与 dirty，持锁至事务结束。
公共 mutation 模块负责流程，repository 负责锁定和写入，领域负责转换规则、变化比较及审计内容。

- 锁定拟修改的现存行和级联选中的完整集合，再重验状态。只读父对象普通预检；创建竞争由数据库唯一约束裁决。
- 多行按固定顺序取锁。任职及责任级联先 Employment、后 Assignment，各表按 ID 升序；直接责任命令只锁 Assignment，
  不反向锁父 Employment。Set/Clear Primary 与 Transfer 在首次取锁前合并全部目标任职，Transfer 随后锁齐选中责任。
- 账号生命周期写入先锁 User、后锁精确 transition intent；离职随后锁选中 Employment 和 Assignment，锁齐后重验 HR 资格，原子提交事实、审计与 dirty。
- 锁后写入零行属于不变量失败；已结束的级联对象不重写历史时间。新插入或未被选中的记录不属于本次集合。
- 资料编辑只提交修改字段，关联状态取锁定后的事实。普通同值资料不写审计或 dirty；合法的显式状态、安全和授权意图保留 no-op 审计。
- 已知唯一约束按领域映射冲突；未知数据库错误原样进入异常处理。事务失败后不能继续查询来推断冲突，也不为此自动重试或扩大锁范围。

这些行锁不保护空槽或 phantom，也不把父对象完整性、Primary 唯一性和请求时 HR 范围提升为跨对象串行保证。
各领域仍承担引用、生命周期和授权校验。SQLSTATE 与 constraint 的提取由数据库基础层统一处理，包括包装错误的 cause。
组织创建与路径、闭包关系同事务完成；领域引用预检不额外锁整棵父树。具体返回值、缺失与冲突状态见开发约定，决策见 [ADR-0025](../adr/0025-align-admin-mutation-results-with-committed-facts.md)。

## 认证、会话与访问控制

### Client Snapshot

API Core 独占 Client 缓存控制、普通配置和敏感凭据。普通读取一次固定 Client 状态与单协议配置；凭据通过独立窄接口取得并认证，
普通查询和 DTO 不携带 Secret。认证成功只交付身份信息，敏感观察和比较细节留在模块内。

缓存缺失或损坏才回源；Redis 读取故障直接失败。同一读取器、Client 和失效观察的并发回源合并。
成功失效阻止旧结果晚到回填，新请求不能复用失效前的在途观察；已接受 Snapshot 的调用仍可完成。
发布遇失效冲突至多重取一次，再冲突返回暂态失败。

Client 写入提交后统一失效普通与敏感缓存，合法配置、启停等意图即使 no-op 也保留审计和 required 失效；InternalAuthz 缓存按自身机制失效。确认提交但传播失败时报告已提交；
COMMIT 未知时保留原错误并保守失效。Secret 重读只读并记审计。配置、启停和轮换均不自动撤销会话。

维护模块只处理当前 owner 库存，保留非目标 Client、其他 owner、旧布局及未知键族，不修改数据库或会话。
Redis 备份恢复后须停流排空、全量修复，再由独立只读核验确认库存清零，不能等待 TTL 自愈。
操作见[Snapshot 修复](../releases/authentication-and-session.md#client-snapshot-修复)，
关键并发行为见[Snapshot 集成测试](../../packages/api-core/test-integration/client-snapshot/client-snapshot.integration.test.ts)。

### Temporary Login Restriction

API Core 统一登录失败计数、限制状态和派生索引，Redis adapter 拥有键、原子转换和服务端时间。
登录与管理入口仅消费该能力；解除原子清除限制、失败历史和索引，不创建宽限期或改变已有会话。
无法确认 Redis 状态时报告暂态故障，不能算作凭据错误。管理解除先作用、后写审计，失败处理遵守审计安全边界。
索引不反向决定限制是否生效，缺少用户资料也不能隐藏或阻止解除限制。阈值与字段见[登录功能](../features/sso/login-and-session.md)及代码。

### Subject Access Barrier

API Core 拥有账号实时访问屏障。每个业务操作在首次取得可信主体后获取一次许可，固定本次成功、拒绝或暂态结果；
并行分支共享该结果，投影复用许可。下一次操作重新检查，在途已许可请求不因后续禁用而回查。浏览器旅程中的各请求是独立操作。

许可绑定主体、代际和活跃容器，不能伪造、换主体或转交后台；容器关闭后拒绝继续使用。
持久化 context 只记录身份，不能当作许可；缺失或损坏时不得根据当前屏障补齐。重新启用不恢复旧代。
Kernel 检查会话存在、期限、归属和撤销，不解释账号状态；Code 一次消费由协议模块负责。

明确失效拒绝访问，并按原上下文精确撤销；旧代清理不能影响新代。blocking、缺失、损坏或基础设施故障作为暂态失败，
保留可恢复 Cookie。管理会话查询只观察索引和记录，不给目标账号发许可或触发访问清理。
错误与 HTTP 映射由[Subject Access adapter](../../packages/api-core/src/subject-access/)维护，底层写异常不得泄漏原始 Redis 内容。

账号生命周期按以下顺序协调 PostgreSQL 与 Redis：

1. 独立持久化窄 transition intent，再原子 pre-block。
2. 业务事务锁定精确 intent 并记录提交结果；被回收的旧 owner 在写入前被状态检查拒绝。
3. 回滚恢复原状态；禁用类提交后 finalize disabled，再尽力撤销会话。真正重新启用保持 blocking，直到当前 Facts 发布并完成 repair。

同态状态更新恢复原状态；合法重复离职仍尝试生命周期恢复与会话撤销。离职在业务事务前尽力捕获已有会话原上下文，提交后合并捕获代际与 callback 前代精确撤销。
捕获失败退回 callback 前代，未知更早代留待重试；捕获不是全局快照，晚到旧会话由后续重试或访问校验处理。

Worker 恢复先用 PostgreSQL 服务端时间回收 stale pending intent，并跳过活跃行锁；失败则停止，随后才处理 Redis transition 与账号修复。
修复按数据库账号状态决定；启用前须证明当前 Profile 与 processed dirty 一致、Facts 合法且成功发布。
Redis 领取和 lease、确认与新 transition 原子协调，旧 worker 不能删除或推迟新工作。repair 不从缺失屏障直接创建 enabled。
旧调度记录补齐年龄时保留可恢复的最早观察，后续 lease/backoff 不重置年龄。

专用 Subject Access repair 仍需数据库写权限；dirty 的 stale 参数不改变 intent 的服务端时间阈值。
部署方负责外部周期调度和告警，把 stale 阈值、等待下一轮及有界排空计入恢复时限。
步骤见[数据维护](../releases/data-maintenance.md)，关键行为见
[操作许可测试](../../packages/api-core/test-integration/subject-access/subject-access-operation-kernel.integration.test.ts)。

### Session runtime 与跨 App 边界

Session Kernel 只拥有 UserSession 和 ClientSession，由 Redis 原子状态决定时间、关系、观察与撤销。
它不依赖协议、API Core 或 app；Code、Token 和续接由各协议拥有。认证用例负责凭据、登录限制、认证方式和审计，随后创建根会话。

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

两协议各自拥有授权、续接、Code 一次消费、Token、交付和补偿，单向消费 Kernel、Client Snapshot 与主体投影。
API 负责 HTTP、Cookie、错误和重定向，不能重建协议状态机；OIDC 不依赖 Custom SSO、app、HTTP 或数据库实现。

Code 固定原 Client、会话实例、用途和授权事实；消费前认证当前 Client 并定位原实例，后续配置不能绕过原用途约束。
消费后失败不恢复 Code 或重放成功结果，适用路径有界终止原 ClientSession；错误 Client 或用途不能撤销无关实例。
托管回调保留独立失败规则，不套用业务兑换撤销。完整兑换覆盖响应构造，补偿只处理本次原始 Token，反向索引不替代权威记录。

Token 记录保存协议校验所需事实、有效期限与原会话绑定；不保存主体资料快照或第三方本地会话。OIDC 退出取消只消费确认，确认作用于请求当前根。
签名配置启动时校验，只公开公钥；生命周期由 API composition 管理。第三方会话、密钥兼容与失败细节分别见
[Custom SSO](../guides/custom-sso.md)、[OIDC](../guides/oidc.md)和[会话维护](../releases/authentication-and-session.md)。

### 角色分配解析

`@iam/role-assignment-resolution` 统一有效角色与受影响用户的反向解析，调用方不复制 assignment 或组织闭包规则。
Composition 用当前连接创建并复用 resolver，失效模块自行创建事务绑定实例。

正向解析检查任职、分配目标和角色有效性；岗位与直属组织完整性由 Profile builder 在发布前校验。
反向解析更保守，不能因角色、岗位或组织已失效而漏掉需重建的用户。管理端 CRUD 可以直接维护 assignment，协议消费已发布 Facts。
理由见 [ADR-0002](../adr/0002-centralize-role-assignment-resolution.md)。

### Organization Responsibility 解析

独立 resolver 负责有效责任和跨树 holder 反向解析，调用方显式提供观察时间。
引用、父生命周期、期间或开放名额异常时整批拒绝；resolver 不拥有缓存、授权、管理历史或协议输出。
组织变更的失效集合同时包含子树任职用户和责任反向 holder；Type 的披露字段或排序变化也须使 holder 失效。

Admin 通过同一授权能力区分 full 与 scoped。HR 在分页前同时约束 holder 任职组织和目标组织，写入事务内复查双端条件。
越界详情与操作隐藏存在性，拒绝日志不泄漏记录、路径或范围集合。完整管理员和混合角色走 full 分支。
`allowedActions` 综合范围、生命周期、父完整性与隐藏阻塞；唯一冲突按 Full/HR 返回适当的安全说明。
授权按每次请求的数据库事实决定，不保证提交时线性化撤权。

### Client Subject Projection

`@iam/client-subject-projection` 拥有协议中性的 Catalog、披露裁剪和投影。核心通过注入的 Facts 与许可接口协作，
不直接依赖数据库、读模型实现、app、会话运行时或协议包。一次交付用同一份合法 Facts，
仅交付 Subject Identifier 时不读取 Facts。调用方提交主体、Client、披露选择和本操作许可；投影不重新认证或读取 Client 配置。

普通资料和授权都消费已发布 Facts，不在请求时检查 dirty 新鲜度或联查源角色表。角色变更可能在重建前继续交付旧事实，
不承诺固定撤权传播期限；账号访问屏障另行生效。Facts 缺失或主体错配时整份投影失败。

Custom SSO 的浏览器出口 `/wire` 拥有 schema、mapper 和预览，只通过 Projection 根接口取得中性能力，不能访问
其内部实现、持久化或服务端入口。映射后校验主体一致和完整输出。责任随任职资料一起交付，不形成独立 claim 或授权任职字段。
OIDC UserInfo 与 Custom SSO 实际交付时使用当前披露；Code 保留原授权事实，已签发 ID Token 内容固定。
版本和字段分别以各 owner 的 schema 为准，不由调用方选择版本或通过旧格式回退。

代码入口：[Projection](../../packages/client-subject-projection/src/)、[Custom SSO wire](../../packages/custom-sso/src/wire.ts)。
决策见 [ADR-0032](../adr/0032-consume-published-subject-facts-for-authorization.md)。

### Client 委托

`@iam/delegation` 统一创建、生命周期、冲突、范围查询与安全选择器。API 与 Admin API 消费公开接口，分别传入
Client、本人或全局管理范围；app 不互相导入私有实现。解析由 API 在同一观察时刻和数据库快照完成，不进入 Profile 或 Subject Facts。

写入按委托人协调：创建先锁 User；更新只预读不可变委托人 ID，取 User 锁后重读记录和范围，再校验并写入事实及审计。
同一委托人的写入共用该锁，冲突校验与写入在锁内完成；这些写入不登记 Profile dirty。
委托引用的删除门禁由 User、Client、Organization 各自的写入口执行。
状态、冲突及删除限制见[应用委托](../features/delegation/client-delegation.md)，设计理由见
[ADR-0020](../adr/0020-provide-fail-closed-privilege-delegation-resolution.md)。

## 读模型与异步处理

User Profile 的包外装配按出口分工：producer 由 API/Admin API composition 接入，worker 由 Worker composition 接入，
query repository 由 API composition 接入。业务模块消费装配后注入的能力，不自行跨出口创建实现。

### User Profile 失效

业务写入只提交源变化，事务绑定的 invalidation 模块负责解析受影响用户、登记 dirty 和提交后唤醒。
调用方不选择 dirty reason、不持有投影 repository，也不自行入队。源事实与 dirty 在同一事务提交。
登记成功不代表入队或发布完成，提交后的入队失败由 repair 恢复。

### User Profile Subject Facts publication

Worker 在构建前固定候选版本，读取全部开放任职并校验岗位和直属组织完整性，再投影当前有效任职。
角色、Client 和组织路径按稳定顺序输出，合法的无角色任职保留空授权集合。

发布事务锁定 dirty 行，重验 user、版本与 processing 状态，单调写入 Profile 并同时标记 processed。
过期候选不能覆盖新版本。PostgreSQL 提交后才向 Redis 发布，版本比较须保持 bigint 精度；缓存失败不回滚数据库。
失败诊断只记录安全字段，原始 Redis 错误、命令或 Facts 不进入日志。

Facts reader 在合法缓存命中时直接返回；缺失、损坏或主体错配时按主体合并回源，读取一行已发布 Facts 并尽力回填。
回填失败仍可使用合法数据库结果，Redis 读取故障不回源；不读取 Detail、搜索文档、dirty 或源业务表。
读取观测只含操作、结果和耗时，观测失败不改变认证结果。

同一 Profile 行承载 Detail、Search 与 Facts。Internal 查询只消费当前 schema 的已发布数据，不能混写、双读或回退旧格式。
数据库约束与应用严格解析分别承担其检查范围；恢复放流前由完整 PG/Redis 核验确认覆盖与版本一致。
数据库回退须匹配旧制品和备份，不删除 migration journal 重放迁移。

Employment verifier 使用一致只读快照核对任职及父对象，报告完整 blocker 集合；不推断历史结束时间或生成修复 SQL。
维护与关键恢复验证见[数据维护](../releases/data-maintenance.md)及
[Profile 维护测试](../../apps/worker/test-integration/user-profile/user-profile-maintenance.integration.test.ts)。

### Organization Search 发布与核验

组织读模型独立拥有源变化、dirty、文档和恢复流程。源事务用实际修改结果登记变化：创建、状态和删除登记自身，
code/name/type 变化登记子树；零行修改不登记。提交后按当前闭包展开，后续创建的后代由自己的变化登记覆盖。

展开事务锁定并重验领取 token，原子登记目标版本和事件完成凭据。已完成事件重复投递只唤醒原版本，不推进新版本。
repair 在源事件和重建两阶段回收失败或过期工作，跳过活跃事务；重领更换 token，旧 owner 即使持有同版本也不能发布或完成新工作。

构建使用一致源快照并校验完整路径。发布锁定 dirty、重验版本和 owner，将文档或删除墓碑与 processed 同事务提交。
墓碑保留版本仲裁事实。在线查询只读当前 schema 的可见已发布文档，允许延迟，不联查源表或执行全量覆盖检查。

独立 verifier 在同一 `REPEATABLE READ READ ONLY` 事务读取源组织、闭包、文档/墓碑、dirty 和变化凭据，
完整检查覆盖、结构、源事实、处理版本及孤立记录，不写数据或派发任务。历史完成事件可以指向较早版本，不能指向未完成的更高版本。
核验失败须修复后重新全量检查，不能抽样放流。
关键验证见[恢复测试](../../packages/organization-search-read-model/test-integration/recovery/recovery.integration.test.ts)与
[核验测试](../../packages/organization-search-read-model/test-integration/verification/verification.integration.test.ts)，操作见
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
命令按实际需要使用窄 composition：重建复用普通发布路径，核验使用独立只读连接，Redis 维护不加载无关数据库或队列。

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
