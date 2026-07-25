# 深化 User Profile 失效模块并退役 Scope Expansion

## Problem Statement

IAM 的 User Profile 是用户基础身份、任职、角色和权限的稳定档案视图。当前任何可能改变该视图的业务写入，都必须由调用方显式选择受影响范围、`UserProfileDirtyReason`、事务提交后的调度方式，以及需要复制到队列消息中的 request/trace metadata。

这套投影机制已经泄漏到 API 和 Admin API 的 21 个生产调用点。用户、任职、组织、岗位和角色流程不仅要完成自己的领域写入，还要理解 User Profile 如何展开 scope、何时推进 `dirtyVersion`、如何注册 `afterCommit`、如何选择队列 reason，以及失败后为什么要依赖 repair。相同知识被重复写入业务模块及其测试，增加新写路径时也很容易漏掉失效或选择错误范围。

Worker 的 backfill、repair 和旧 scope expansion 路径又分别重复了“解析用户、标记 dirty、生成 versioned job、批量入队”的部分行为。`ExpandUserProfileScope` 已经没有生产 producer，但其 job name、payload schema、producer 方法、worker consumer 和公开 scope enum 仍然存在，使一个已经停止使用的中间协议继续扩大模块接口，并给未来发布留下兼容负担。

现有可靠性模型本身不在本次问题范围内：源事务内持久化 `user_profile_dirty` 是事实，提交后 BullMQ 唤醒是 best-effort，失败后由 repair 根据当前 `dirtyVersion` 恢复。目标是在不改变这套模型、不修改数据库 schema 和 rebuild job wire contract 的前提下，把全部投影知识收拢到一个深模块，并彻底退役未使用的 scope-expansion 协议。

## Solution

建立事务绑定的 `UserProfileInvalidation` 模块，向业务调用方只暴露 `recordChanges`。调用方提交一组 `UserProfileSourceChange`，描述 user、employment、organization、position、role 或 role-assignment 发生了变化；模块自行推导受影响用户与 canonical reason，在源事务中写入 versioned dirty fact，并登记一次提交后批量 rebuild 唤醒。

UnitOfWork 在创建 transaction ports 时同时提供 `afterCommit` 和 observability lifecycle。API 和 Admin API 的 transaction composition 使用当前 transaction `DbClient` 创建 User Profile 失效模块，模块内部拥有 dirty persistence、受影响用户解析和 tx-bound role resolver。业务调用方不再接触 scope enum、dirty reason、原始 projection repository、`afterCommit` 或 request/trace 字段。

Worker maintenance 复用同一非公开 dirty/delivery workflow。Backfill 分页扫描用户、推进版本并立即批量入队；repair 只重投已有 dirty row 的当前版本，不推进版本。Rebuild worker 继续拥有 claim、build、processed、failed 状态机。

删除 `ExpandUserProfileScope` job name、payload schema、producer、consumer、公开 scope enum 及已经失去调用方的 scope 分支。发布前必须证明旧消息和所有可能的旧 producer 已经清零；API 与 Admin API 先发布，worker 在最终队列复核后最后发布。

## User Stories

1. 作为 IAM 用户，我希望我的稳定 User Profile 在基础身份信息变化后被重建，以便后续查询不会返回旧资料。
2. 作为 IAM 用户，我希望任职创建、修改、调动、停用或删除后档案及时更新，以便组织、岗位、角色和权限视图反映当前事实。
3. 作为 IAM 用户，我希望主任职变化后档案及时更新，以便所有依赖主任职的展示和查询保持正确。
4. 作为外部供应商联系人，我希望首次注册同时创建用户和任职后只产生一份一致的失效事实，以便档案不会经历部分更新。
5. 作为已有供应商联系人，我希望新增任职后只按任职变化触发重建，以便不制造无关的用户变化原因。
6. 作为离职用户，我希望 User Resignation 同时表达用户禁用和任职结束，以便稳定档案完整反映离职结果。
7. 作为 IAM 管理员，我希望组织信息或状态变化后所有受影响用户的档案被重建，以便组织路径和授权不会陈旧。
8. 作为 IAM 管理员，我希望岗位信息或状态变化后所有受影响用户的档案被重建，以便岗位视图和授权不会陈旧。
9. 作为安全管理员，我希望角色状态变化后所有可能保留旧授权的用户被保守重建，以便不会因状态更新顺序漏掉陈旧权限。
10. 作为安全管理员，我希望角色分配创建后目标范围内的用户档案被重建，以便新授权可见。
11. 作为安全管理员，我希望角色分配范围修改后原范围和新范围可能受影响的用户得到覆盖，以便授权变化完整生效。
12. 作为安全管理员，我希望角色分配删除后仍能通过被删除记录的领域 target 找到受影响用户，以便旧授权不会残留。
13. 作为业务模块维护者，我希望只描述发生了什么领域变化，以便不需要理解 User Profile 投影范围。
14. 作为业务模块维护者，我希望不再选择 `UserProfileDirtyReason`，以便原因策略只有一个事实来源。
15. 作为业务模块维护者，我希望不再传递 `afterCommit`，以便提交后调度是失效模块的实现细节。
16. 作为业务模块维护者，我希望不再复制 request ID 和 trace ID，以便 transaction observability 自动进入队列唤醒。
17. 作为业务模块维护者，我希望 `recordChanges` 不返回投影内部计数，以便调用方不会依赖 dirty row 或 job 数量。
18. 作为业务模块维护者，我希望没有受影响用户时调用安全 no-op，以便无需在每个流程重复空集合判断。
19. 作为业务模块维护者，我希望 scope 解析或 dirty 写入失败时源事务失败，以便领域事实与失效事实不会分离。
20. 作为业务模块维护者，我希望提交后入队失败不撤销已经提交的业务事实，以便维持现有 best-effort 语义。
21. 作为 User Profile 维护者，我希望 change 到 scope 和 reason 的映射集中在一个模块，以便修改一次即可覆盖全部调用方。
22. 作为 User Profile 维护者，我希望多个 change 影响同一用户时只写一次 dirty fact，以便不会无意义推进多个版本。
23. 作为 User Profile 维护者，我希望同一 transaction 多次记录同一用户时只唤醒最新 `dirtyVersion`，以便旧 job 不与最新事实竞争。
24. 作为 User Profile 维护者，我希望同一 transaction 只登记一个 rebuild callback，以便队列写入可以批量执行。
25. 作为 User Profile 维护者，我希望 reason 去重并按固定顺序保存，以便同一变化集合产生确定结果。
26. 作为 User Profile 维护者，我希望受影响用户去重并稳定排序，以便测试、日志和 job 批次保持确定性。
27. 作为 User Profile 维护者，我希望组织、岗位、角色和任职 target 解析使用当前 transaction 数据，以便提交前解析与最终写入一致。
28. 作为授权维护者，我希望角色反向解析继续采用 ADR 定义的保守语义，以便角色、岗位或组织刚被停用时仍不会漏重建。
29. 作为 worker 维护者，我希望 rebuild processor 只负责 dirty 状态机和档案构建，以便 maintenance 行为不再混入处理器。
30. 作为 worker 维护者，我希望 backfill 复用正式 dirty/version/job 规则，以便全量重建与在线变更保持一致。
31. 作为 worker 维护者，我希望 backfill 分批处理并延续现有批量配置，以便不会一次加载全部用户。
32. 作为 worker 维护者，我希望 repair 重投当前版本而不生成新版本，以便恢复投递不会伪造新的源变化。
33. 作为 worker 维护者，我希望 failed、stale pending 和 stale processing 行继续可修复，以便 best-effort 入队失败有可靠恢复路径。
34. 作为队列维护者，我希望 rebuild payload 与 deterministic job ID 保持不变，以便本次重构不影响正在使用的 worker 协议。
35. 作为队列维护者，我希望不再产生 `expand-user-profile-scope` 消息，以便无调用的中间协议可以永久删除。
36. 作为发布维护者，我希望删除 consumer 前能够证明 waiting、delayed、active、failed 和 repeatable 的旧 job 都已清零，以便不会丢弃合法工作。
37. 作为发布维护者，我希望 API 和 Admin API 先停止旧协议生产、worker 最后升级，以便协议退役有明确安全顺序。
38. 作为发布维护者，我希望无法证明旧队列为空时阻止 worker 升级，以便不以推测替代兼容证据。
39. 作为数据库维护者，我希望本次不新增表、列或 migration，以便模块深化与持久化演进保持独立。
40. 作为运维人员，我希望现有 Bull Board、日志和 repair 命令继续可用，以便故障处理方式不因重构改变。
41. 作为测试维护者，我希望主要行为通过 `UserProfileInvalidation` 接口验证，以便内部 repository 或查询重构不会迫使测试重写。
42. 作为测试维护者，我希望 UnitOfWork lifecycle 有独立契约测试，以便 after-commit 与 observability 注入不会退化。
43. 作为测试维护者，我希望旧 scope job 被 contract 明确拒绝，以便协议不会通过遗留 enum 或 schema 悄然回归。
44. 作为架构维护者，我希望守卫禁止业务代码重新导入 scope、reason 或原始 projection repository，以便模块 seam 长期保持。
45. 作为架构维护者，我希望 API、Admin API 和 worker 的真实 composition 通过 process smoke，以便新的 wiring 不只在类型层成立。
46. 作为未来维护者，我希望 `PrivilegeUpdated` 历史值仍可被读取，以便旧 dirty row 不因 scope 协议退役而失效。
47. 作为未来维护者，我希望尚无真实写入方的 privilege change 不进入公开接口，以便不为假设需求扩大 seam。
48. 作为代码维护者，我希望旧 marker、旧 producer 方法和被替代测试被直接删除，以便迁移遵循 replace-don't-layer。
49. 作为代码维护者，我希望 User Profile implementation 不再出现在 app repository 聚合中，以便投影知识局部化在所属 package。
50. 作为项目维护者，我希望当前架构文档、测试架构和发布手册同步反映最终行为，以便后续 agent 不依赖历史评审页猜测。

## Implementation Decisions

- `@iam/user-profile-read-model` 拥有新的事务绑定模块 `UserProfileInvalidation`，其业务接口只有 `recordChanges`。
- `recordChanges` 接收只读的 `UserProfileSourceChange` 集合并返回 `Promise<void>`。它不返回 marked count、user IDs、dirty version 或 job IDs。
- `UserProfileSourceChange` 是 discriminated union，包含 `user`、`employment`、`organization`、`position`、`role` 和 `role-assignment` 六类。
- `user` 与 `employment` change 携带 `userId`；`organization`、`position` 和 `role` 分别携带对应实体 ID；`role-assignment` 携带 `RoleAssignmentTargetType` 与 `targetId`。
- 不增加公开 privilege change。以后只有出现真实 privilege 写入调用方时才扩展接口。
- 调用方必须在相关领域写入完成后、同一 UnitOfWork transaction 内调用 `recordChanges`。该顺序是接口不变量。
- `recordChanges` 成功表示 dirty fact 已写入且 rebuild wake-up 已登记，不表示 BullMQ 已经成功入队。
- 无合法 change 或无受影响用户时方法成功 no-op，不写 dirty row，也不登记 callback。
- change 到 reason 的映射由模块持有：user、employment、organization、position、role/role-assignment 分别映射到对应 dirty reason。
- 多 reason 使用固定顺序：User、Employment、Organization、Position、Role、Privilege、Manual、Backfill。该顺序同时决定 rebuild payload 的首要 reason。
- 直接 user 与 employment change 不查询 scope；它们直接以 `userId` 形成候选用户。
- organization、position、role 和 role-assignment target 通过 package 内部 affected-user repository 解析。Role target 使用共享角色反向 resolver 的保守语义。
- role-assignment 的 Organization、Position、Employment target 分别映射到对应受影响用户查询。删除 assignment 后仍使用删除前保存的 target。
- 模块按 user ID 合并所有 change，去重 reason，并在一次 `recordChanges` 调用中对每个用户只执行一次 dirty version 推进。
- 同一 transaction 内的模块实例维护 pending wake-up map。多次调用命中同一用户时，map 只保留最后返回的 dirty row，因此提交后只发送最新版本。
- 第一次产生非空 dirty 结果时登记唯一的 best-effort after-commit callback；后续调用只更新 pending map。
- callback 按 user ID 稳定排序并使用现有 bulk producer 入队。现有 addBulk chunk 大小继续是实现细节。
- `requestedAt` 由模块 clock 生成；request ID 与 trace ID 来自 transaction lifecycle 的 observability，不再由业务调用方传入。
- scope 解析、dirty 写入或 callback 登记前的同步错误向上传播并使 transaction 回滚。
- BullMQ 入队错误发生在 commit 后，由 UnitOfWork 按 best-effort 规则记录；已经提交的领域事实和 dirty fact不回滚，repair 是恢复路径。
- UnitOfWork 的 transaction-port factory 增加第二个 lifecycle 参数，包含同一个 `afterCommit` registration port 和当前 transaction observability。
- transaction callback 继续暴露 `tx.afterCommit`，因此 User Resignation 的 session revocation 等其他提交后行为不需要迁入 User Profile 模块。
- API 与 Admin API 的 transaction composition 使用 transaction `DbClient` 创建失效模块。模块内部创建 dirty repository、affected-user repository 和 tx-bound role resolver。
- API 与 Admin API 的普通 repository 聚合不再创建或暴露 User Profile dirty/scope repository。
- 所有 21 个生产调用点迁移为领域 change；新供应商创建和 User Resignation 在同一次调用中同时记录 user 与 employment。
- 角色状态变化记录 role change；角色分配创建、范围修改和删除记录 role-assignment change，不再保留 app-local assignment-to-scope helper。
- Worker maintenance 成为 backfill 与 repair 的公开 worker seam。Rebuild worker service 只保留 claim、build、upsert/delete、processed、failed 和 stale 处理。
- Backfill 分页扫描全部用户，对每批使用 Backfill reason 标记 dirty，并在当前 worker 命令中立即 bulk enqueue。
- Repair 扫描 failed、stale pending 和 stale processing row，按现有规则重置 stale processing，然后直接重投当前 row；repair 不调用 mark dirty，也不推进 `dirtyVersion`。
- Transactional invalidation 与 worker maintenance 复用同一个非公开 dirty/payload/delivery workflow，但分别使用 after-commit delivery 和 immediate delivery adapter。
- BullMQ 是 remote-owned seam；生产使用现有 queue producer adapter，测试使用内存 queue adapter。After-commit 是进程内实现细节，不出现在业务接口。
- Job producer 只保留实际使用的批量 rebuild enqueue；删除单条 enqueue、scope expansion enqueue 和 scope job ID builder。
- 删除 `ExpandUserProfileScope` job name、payload schema、payload type、worker switch branch、processor、测试和所有公开 export。
- 删除 `UserProfileScopeType`。内部 affected-user 解析使用模块私有目标类型，不保留旧 enum 的 compatibility alias。
- 删除旧 scope repository 中只服务于 scope-expansion 协议的 all-users、user-ids、user-id、privilege-id 和 privilege-code 分支。Backfill 继续使用独立分页扫描。
- `UserProfileDirtyReason.PrivilegeUpdated` 保留，以兼容数据库中可能存在的历史 `reason_codes`；它不再对应公开 scope 或 source change。
- `RebuildUserProfile` payload、queue name、dirty row schema、状态机和 deterministic `userId + dirtyVersion` job ID 完全不变。
- 本次不新增 outbox、数据库表、列、索引、constraint 或 migration。
- User Profile 架构守卫定位为维护性回归检查：按仓库约定的规范 casing 覆盖静态 named/type import 与 re-export、常规跨 package 内部静态路径，以及直接出现的 legacy identifier，用于发现业务 production module 重新引用 `UserProfileDirtyReason`、已删除的 scope 类型、原始 dirty/affected-user repository、旧 marker 方法或 job producer。
- 该守卫不是源码安全边界，不承诺阻止刻意混淆、动态求值或变量 `import()`、string-named specifier、非规范 casing、quoted nested destructuring 等写法；production exports、typecheck 与 lint 继续作为并行防线。
- Current 后端架构文档记录新的 module seam、lifecycle 注入与 composition ownership；测试架构记录 Admin API process-smoke adoption；发布手册记录协议退役与队列门禁。
- Admin API 增加与现有 API 相同资源模型的真实 Bun entry smoke，使用最小环境、不可达外部依赖和 OpenAPI readiness probe。
- 发布产物来自同一变更集。先部署 API 和 Admin API，确认不再产生旧 job；旧 worker 保持运行直至旧 job 清零；最终停止旧 worker、复核并部署新 worker。
- 队列排空必须覆盖 waiting、delayed、active、failed 和 repeatable job。无法证明所有 producer 已停止或旧 job 已清零时，worker 升级被阻止。

## Testing Decisions

- 好的测试穿过已确认的公开 seam，断言调用方可观察行为，不断言私有 helper、内部文件布局或某条 SQL 文本。
- 本 feature 的首要 seam 是 `UserProfileInvalidation.recordChanges`。它承载 change 映射、affected-user 解析结果、reason 合并、dirty version 和 after-commit wake-up 的行为测试。
- UnitOfWork lifecycle 是第二个 seam，测试 transaction-port factory 能看到与 callback 相同的 after-commit registration port 和当前 observability。
- Worker maintenance 与 rebuild processor 是第三组 seam：maintenance 覆盖 backfill/repair，processor 覆盖 rebuild dirty 状态机。
- Shared job contracts、API/Admin architecture suites 和 process-smoke entry 是兼容、结构和真实 wiring 的外层 seam。
- 测试只在数据库、BullMQ、clock 和 transaction lifecycle 等系统边界使用 fake 或 mock；不 mock change mapper、reason policy 或 dirty workflow 的私有 helper。
- User Profile 失效接口测试以已知 literal 作为期望，避免用生产 mapper 重新计算 expected reason 或 scope。
- 测试覆盖每一种 source change：user、employment、organization、position、role，以及三种 role-assignment target。
- 测试覆盖 user 与 employment 同时变化时只产生一个 dirty row，并以 canonical 顺序保存两个 reason。
- 测试覆盖多个 scope 命中同一用户时的用户去重、reason 合并和稳定 user ID 顺序。
- 测试覆盖空 change、无受影响用户和无效直接 ID 不写 dirty、不登记 callback。
- 测试覆盖一次调用只批量标记一次；同一 transaction 多次调用只登记一个 callback，并只入队每个用户最新版本。
- 测试覆盖 dirty row 的 `dirtyAt` 与 rebuild payload 的 `requestedAt` 使用注入 clock，request/trace metadata 来自 lifecycle。
- 测试覆盖 scope 解析或 dirty persistence 失败时 transaction 拒绝且 after-commit callback 不执行。
- UnitOfWork 测试覆盖 transaction rollback 不执行 factory 或 callback 登记的任务，以及 commit 后按注册顺序执行。
- 测试覆盖 rebuild enqueue 失败按 best-effort 记录且不把已经提交的 transaction 结果改为回滚。
- Backfill 测试覆盖分页边界、最后不足一批、空库、去重、Backfill reason、版本推进和总 enqueue count。
- Repair 测试覆盖 failed、stale pending、stale processing、非 stale processing、reset CAS 失败，以及重投时不调用 mark dirty。
- Rebuild processor 测试继续覆盖 claim miss、rebuilt、missing profile delete、processed CAS stale、builder failure 和 failed CAS stale。
- Contracts 测试证明 `UserProfileJobNameSchema` 和 payload schema 接受现有 rebuild job，并明确拒绝字符串 `"expand-user-profile-scope"` 与旧 scope payload。
- Producer 测试证明 rebuild job ID 和 payload 兼容，并只暴露 bulk enqueue。
- API 与 Admin API 调用方测试只断言提交的领域 change；删除对 scope、reason、`afterCommit` 和 projection metadata 的断言。
- User Resignation 测试分别验证 User Profile change 与 session revocation；后者继续通过通用 `tx.afterCommit`，避免两个 seam 混淆。
- Architecture tests 证明 21 个旧 marker 调用归零，并在仓库约定的规范 casing、静态 named/type import 与 re-export、常规跨 package 内部静态路径和直接 legacy identifier 范围内检查业务 production modules 的 projection 细节回归；app repository composition 不再拥有 dirty/affected-user repository。
- Boundary helper tests 固定上述维护性检查的可观察范围，不枚举刻意混淆、动态求值或变量 import、string-named specifier、非规范 casing、quoted nested destructuring 等对抗性语法。
- Architecture tests 证明旧 job name、scope schema、producer 和 worker consumer 不再出现在 production exports；`PrivilegeUpdated` 仅作为持久化兼容 reason 保留。
- API process smoke 更新后继续验证真实 Bun entry、env parsing、production composition 与 OpenAPI readiness。
- Admin API 新 process smoke 复用共享 harness，使用唯一端口、独立临时目录、最小 env、真实 production composition 和 `/admin/doc` readiness probe。
- Prior art 包括现有 dirty marker/worker behavior tests、UnitOfWork after-commit tests、API/Admin architecture guards，以及 API/OIDC 使用的共享 process-smoke harness。
- 开发内循环运行 User Profile Read Model、API Core、API、Admin API 和 Worker 的聚焦测试、lint 与 typecheck。
- 文档变化运行 `pnpm check:docs`，所有实现 ticket 在提交前运行 `git diff --check`。
- 新增或实质修改 API/Admin composition 后分别运行 package-local `test:smoke`。最终实现内容准备合入时只运行一次完整 `pnpm verify`。
- 本次没有 schema 或查询语义迁移，不新增 PostgreSQL 外部测试通道；已有 role-assignment resolver PostgreSQL 规则矩阵继续作为反向解析语义的事实来源。

## Out of Scope

- 新增 transactional outbox、CDC、消息表、投递 daemon 或 exactly-once 保证。
- 修改 `user_profile_dirty`、`user_profile` 或任何源表的 schema、索引、constraint 和 migration。
- 修改 rebuild queue name、rebuild payload 字段、dirty status、attempt 规则或 deterministic job ID。
- 修改 User Profile 的数据结构、查询接口、档案 builder 内容或搜索行为。
- 新增 privilege 管理写路径、公开 privilege source change 或新的 privilege dirty scope。
- 删除 `UserProfileDirtyReason.PrivilegeUpdated` 历史值或清理已有 dirty row。
- 改变 Effective Role 或角色反向受影响用户解析的 ADR 语义。
- 修改用户、任职、组织、岗位、角色或角色分配的业务 CRUD 规则。
- 修改 User Resignation 的 session revocation 行为或把所有通用 after-commit 行为收拢到 User Profile 模块。
- 修改 BullMQ 全局 retry、retention、concurrency、dashboard 或 Redis 配置。
- 自动执行生产队列清理、部署或 rollback；实现只提供代码、测试和发布手册。
- 处理架构评审中的其他候选模块。
- 修改前端、OIDC Provider、Custom SSO、Gateway 或外部 HTTP/tRPC contract。
- 保留旧 scope job 的 compatibility consumer、adapter、alias、双写或 shadow processing。

## Further Notes

- 测试 seam 已在方案确认阶段锁定为 User Profile invalidation、UnitOfWork lifecycle、worker maintenance/rebuild、contracts/architecture/process smoke，不再需要额外访谈。
- 本规格有意选择协议删除而非兼容保留。队列排空证据是 worker 发布门禁，不是可选 smoke。
- 当前仓库搜索未发现 `ExpandUserProfileScope` 的生产 producer；发布前仍必须确认部署环境不存在仓库外 producer、延迟 job 或 repeatable registration。
- `PrivilegeUpdated` 的保留只服务历史持久化兼容，不代表存在或计划新增 privilege invalidation interface。
- 2026-07-25 维护者明确将架构守卫限定为仓库惯例下的维护性回归检查，而非安全沙箱；避免为对抗性语法重新引入通用 dataflow/alias 分析复杂度。
- 旧架构评审页是问题线索，不是当前事实来源；实现、可执行测试、Current 文档和本规格共同构成交付依据。
- 本地 issue tracker 不在 spec 上维护生命周期字段。后续 `/to-tickets` 生成的 implementation tickets 使用 `ready-for-agent` 状态。
