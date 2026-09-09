# 架构验证归属

本文把[系统架构](system-architecture.md)中的关键约束连接到验证 owner、现有入口和证明范围。
它是代表性证据索引，不是逐文件强制测试矩阵、完整覆盖率报告或本次测试通过记录。
测试层级、资源预算与执行时机由[测试编排架构](testing-architecture.md)拥有，静态规则准入由
[架构守卫规范](architecture-guard.md)拥有，命令参数与资源 URL 见[命令入口](../development/commands.md)。

## 谁负责什么

| 责任 | Owner 与完成条件 |
|---|---|
| 定义和维护不变量 | 能力所属 app/package 的实现者维护公开接口契约，并为本次行为变化选择直接观察该事实的测试。跨 runtime 变化同时检查各消费方的契约。 |
| 核对证据是否适用 | 评审者确认测试触及本次变化、使用了正确的真实或替代资源，且结论没有超出断言范围。存在测试文件不等于已经执行，也不等于覆盖全部场景。 |
| 候选交付验证 | 合入或发布负责人按测试编排契约执行最终候选检查，记录候选、命令、结果和未执行项；有 issue 时记录在对应 issue，否则在交付摘要中说明。 |
| 真实环境与放流 | 发布负责人取得目标环境配置、readiness、smoke 和适用 runbook 要求的停流、drain、恢复证据。测试命令不代替这些操作，也不提供部署授权。 |

这里的 owner 是维护职责，不表示每个 app 必须有独立团队，也不建立新的审批或 tracker 流程。

## 静态、类型与收集验证

| 要证明的事实 | 入口与 owner | 范围限制 |
|---|---|---|
| 稳定依赖方向、owner 路径与 Docker build closure | 根 `pnpm check:architecture`；[analyzer](../../scripts/architecture-guard.ts) 与[公开接口 fixtures](../../scripts/__tests__/architecture-guard.test.ts)。 | 仅检查允许观察模型和受保护 source roots，不能证明业务授权、事务原子性或 runtime wiring。 |
| Package 公开出口与结构兼容 | 所属 package exports、消费方 `typecheck`，例如 [Admin ports type contract](../../apps/admin-api/src/__tests__/port-contracts.test.ts)。 | Type-only 兼容不证明浏览器运行时可加载，也不证明 DTO 字段裁剪；对应边界见[共享契约](contracts-and-database.md#现存差距与验证)。 |
| 每个测试候选唯一收集且 root task 可达 | 根 `pnpm check:test-collection`；[collection 入口](../../scripts/check-test-collection.ts)。 | 不读取断言、不推断资源使用；已纳入静态与完整验证入口，成功只证明收集正确，不证明测试断言通过。 |
| 文档登记、状态日期与本地目标存在 | 根 `pnpm check:docs`；[文档检查实现](../../scripts/check-docs-index.ts)。 | 当前检查 `docs/**/*.md`，不验证语义一致性、根 AGENTS.md 链接或 Markdown 锚点；这些变更须另行核对。 |

Architecture Guard 当前 production source roots 为四个后端 app（API、Admin API、OIDC Provider、Worker）及
Session Kernel、Custom SSO、Client Subject Projection、Organization Responsibility Resolution、Role Assignment Resolution、User Profile Read Model 六个包。
Admin/SSO 前端、`api-core`、`domain`、`contracts`、`db`、`jobs`、Gateway 等源码内部不在该扫描范围；被某条规则识别为
依赖目标不等于其内部也被扫描。Docker closure 另按 workspace manifests 与 Dockerfile `COPY` 检查。
改变该覆盖范围时同步维护本说明，不扩张扫描器去推断业务语义。

## 行为、资源与系统验证

下表的 owner 是 workspace 名称；Integration 命令使用
`pnpm --filter <owner> test:integration:<profile>`，其中 profile 只取表中列出的值。表中链接是现有代表性测试，
实现者仍需按本次不变量选择或补充断言，不能把跑完所在 package 当作自动覆盖新行为。

| 契约与 owner | 代表性证据 / profile | 能证明什么，不能替代什么 |
|---|---|---|
| UnitOfWork / `@iam/api-core` | [UoW contract](../../packages/api-core/test-integration/component/unit-of-work.integration.test.ts)；`component`。 | 提交后的顺序、尝试所有 task、required failure 语义；fake adapter 不证明 PostgreSQL 原子性。 |
| Internal Privilege Delegation / `@iam/api` | [写入与解析联验](../../apps/api/test-integration/postgres/privilege-delegation-writes.integration.test.ts)、[读端失败关闭](../../apps/api/test-integration/postgres/privilege-delegation-resolution.integration.test.ts)；`postgres`。 | 公开写入、production UoW 和 resolver 联验组织覆盖、期间、状态、独立事务串行协调与审计失败回滚；不证明引用对象并发生命周期强保证，也不替代目标环境发布验收。 |
| 业务写入、审计与 invalidation / `@iam/admin-api` | [责任任命事务](../../apps/admin-api/test-integration/postgres/organization-responsibility-assignment.integration.test.ts)、[Client mutation](../../apps/admin-api/test-integration/postgres/client-mutation.integration.test.ts)；`postgres`。 | 真实 PostgreSQL 与 production UoW 的 commit/rollback、提交后失败；被替代的 queue 或 Redis seam 不构成真实投递证据。 |
| 历史审计 action 规范化 / `@iam/worker` | [维护命令](../../apps/worker/test-integration/postgres/audit-action-command.integration.test.ts)；`postgres`。 | 真实 CLI/PG 验证八映射、事实与数量保持、冲突零写、锁等待后的全量预检、失败回滚、幂等及独立 verify；不证明目标环境已停写、完成迁移或查询验收。 |
| 迁移后审计查询与展示 / `@iam/admin-api`、`@iam/admin` | [迁移后查询](../../apps/admin-api/test-integration/postgres/audit-action-query.integration.test.ts)；`postgres`。[展示入口](../../apps/admin/test-integration/component/AuditLogTable.integration.test.tsx)；`component`。 | 独立工具迁移混合数据后，真实 Admin service/repository 验证精确 action/outcome、计数、分页与其他事实保持；展示验证规范中文标签及未知原文回退。不替代目标环境发布门禁。 |
| Profile invalidation / publication / `@iam/user-profile-read-model` | [失效归并](../../packages/user-profile-read-model/test-integration/component/user-profile-invalidation.integration.test.ts)用 `component`；[原子发布](../../packages/user-profile-read-model/test-integration/postgres/profile-publication.integration.test.ts)用 `postgres`。 | Source changes 归并、提交后唤醒注册、Profile 与 Dirty Version 同事务发布；不单独证明 BullMQ 已成功处理。 |
| Profile readiness / Employment 诊断 / `@iam/user-profile-read-model`、`@iam/worker` | [双 gate](../../packages/user-profile-read-model/test-integration/component/user-profile-readiness.integration.test.ts)用 `component`，真实库存与缓存使用 package `postgres` / `redis`；[Employment](../../packages/user-profile-read-model/test-integration/postgres/employment-verifier.integration.test.ts)与 [Worker 命令](../../apps/worker/test-integration/postgres/employment-command.integration.test.ts)用 `postgres`。 | 双 gate 验证完整分页和发布收敛；`employment:verify` 单独报告全库非墓碑异常，保持完整 ID 集合、稳定排序与只读访问。Profile builder 的父对象 fail-closed 守卫不替代全库诊断；Full-system E2E 继续运行两道 production gate。 |
| Facts 单调缓存与授权 freshness / `@iam/user-profile-read-model` | [Redis publisher](../../packages/user-profile-read-model/test-integration/redis/subject-facts-publisher-v3.integration.test.ts)用 `redis`；[Facts reader](../../packages/user-profile-read-model/test-integration/postgres/subject-facts-reader.integration.test.ts)用 `postgres`。 | 版本单调写入、strict v3 与 PostgreSQL Dirty 检查；两类资源测试分别证明各自 seam，不等于完整跨存储时序证明。 |
| Client Runtime Snapshot / `@iam/api-core`、`@iam/admin-api`、`@iam/worker` | [Snapshot Redis contract](../../packages/api-core/test-integration/redis/client-runtime-snapshot.integration.test.ts)用 API Core `redis`；上面的 Client mutation 用 Admin API `postgres`；Worker `redis` 验证 production maintenance command。 | Late refill、共享 invalidation、当前 namespace 的 full repair/独立 scan-only verify、部分失败恢复与 non-owner key 保留分别有 owner；旧 Runtime key 残留不使 verify 失败。真实 Admin mutation 与三类 Reader 的联合证据由现有 `client-runtime:hard-cutover-rehearsal` 补充，当前矩阵见[恢复手册](../releases/client-runtime-snapshot-restore.md)。不能证明旧 namespace 已清空或 production 已完成恢复。 |
| Subject Access lifecycle / `@iam/api-core`、`@iam/user-profile-read-model` | [Redis transition/lease/repair](../../packages/api-core/test-integration/redis/subject-access.integration.test.ts)用 API Core `redis`；[durable transition intent](../../packages/user-profile-read-model/test-integration/postgres/subject-access-transition.integration.test.ts)用 Read Model `postgres`。 | 各存储 owner 的原子行为与恢复事实；实际定时调度、恢复 SLO 和持续排空由部署 owner 验收。 |
| Subject Access Permission / `@iam/api-core` | [共享操作容器](../../packages/api-core/test-integration/component/subject-access-operation.integration.test.ts)用 `component`。 | 公开工厂与窄出站 ports 证明 single-flight、结果固定、身份与代际绑定、严格 context、关闭后失效和拒绝撤销范围；晚到清理测试证明传出的原代际范围，不替代真实 Kernel 存储筛选或生产协议入口接入证据。 |
| User Resignation Session 重试 / `@iam/admin-api`、`@iam/session-kernel` | [公开 Resignation 与真实 Redis](../../apps/admin-api/test-integration/redis/resign-user.integration.test.ts)及 Session Kernel owner 的 `redis` 测试；[源事务矩阵](../../apps/admin-api/test-integration/postgres/employment-mutation.integration.test.ts)用 Admin API `postgres`。 | Redis 证据覆盖 pre-block 后原始捕获代际、提交后按代际集合精确撤销、失败后的 no-op 重试及晚到撤销保留重新启用新代；Admin adapter 验证准备失败的 bestEffort 诊断与 callback 前代 fallback。Redis 测试中的 fake PostgreSQL 不证明事务原子性，真实 PG 矩阵单独证明锁序与业务、审计、dirty 原子提交。捕获不是全局快照，不保证捕获后才落库的更早代极迟在途 Session 本次被撤销，也不扩展已 tombstone 对象的派生 cleanup owner。 |
| Session Kernel / LoginRestriction / `@iam/session-kernel`、`@iam/api-core` | [Credential contract](../../packages/session-kernel/test-integration/redis/session-kernel-credential.integration.test.ts)、[LoginRestriction contract](../../packages/api-core/test-integration/redis/login-restriction.integration.test.ts)；`redis`。 | Redis 实时状态、并发和原子清理；不替代 API/OIDC 的协议适配测试，也不保证第三方自有会话退出。 |
| Session Kernel 生命周期时间 / `@iam/session-kernel` | [Redis 时间 contract](../../packages/session-kernel/test-integration/redis/session-kernel-time.integration.test.ts)与现有 Credential、Artifact、prepared revocation contracts；`redis`。 | 四类对象的零/正/负应用偏差、跨实例与前后跳、父上限、lookup 续期、取得时有效性、列表撤销与 pending cleanup 恢复；协议 TTL 消费由各协议 Adapter 证明，不代表生产已切换。 |
| Custom SSO 完整操作与权威期限 / `@iam/custom-sso`、`@iam/api` | [完整操作与内部状态协作](../../apps/api/test-integration/component/custom-sso-session-kernel.adapter.integration.test.ts)、[Cookie handler](../../apps/api/test-integration/component/sso.handlers.integration.test.ts)使用 API `component`；[Grant owner](../../packages/custom-sso/test-integration/redis/authorization-grant-redemption.integration.test.ts)使用 Custom SSO `redis`；[真实完整入口与独立 cleanup](../../packages/custom-sso/test-integration/redis/custom-sso.integration.test.ts) 同属该 profile。 | 完整 factory 联验授权、Secret、续接、Independent/Gateway/ORCAS、UserInfo/authz 与退出；内部矩阵证明两种模式在独立应用偏差、跳变和跨实例下交付、认证与退出；亚秒取整和取得后跨 Credential deadline 不新增拒绝；真实 Kernel Artifact deadline 初始化 Grant、续租/释放/消费/接管保持原期限与唯一赢家，保留不确定写入补偿、Subject Access 和父 Session 保护。不证明第三方自有会话退出或维护切换完成。 |
| Admin capability / HR scope / `@iam/admin-api`、`@iam/admin` | [Policy](../../apps/admin-api/test-integration/component/admin-authorization.policy.integration.test.ts)用 Admin API `component`；[请求时 scope](../../apps/admin-api/test-integration/postgres/hr-administration-scope.resolver.integration.test.ts)用 `postgres`；[HR UI](../../apps/admin/test-integration/browser/hr-administration.spec.ts)用 Admin `browser`。 | 后端策略、数据库事实和 UI 各有验证；Browser 的 mocked backend 不能证明服务端拒绝越权，真实联合路径由 Full-system HR journey 补充。 |
| SSO 登录续接 / `@iam/api`、`@iam/sso` | [Guard use case](../../apps/api/test-integration/component/login-continuation-guard.use-case.integration.test.ts)用 API `component`；[Login Browser](../../apps/sso/test-integration/browser/login.spec.ts)用 SSO `browser`。 | Guard 语义与表单状态；mocked HTTP 不证明真实协议连接或完整第三方登录矩阵。 |
| Gateway 与进程 lifecycle / `@iam/gateway-apisix`、各后端 app | [Gateway commands](../../gateway/test-integration/component/commands.integration.test.ts)用 Gateway `component`；以 API [process entry](../../apps/api/test-integration/process/entry.integration.test.ts) / [composition entry](../../apps/api/test-integration/composition/entry.integration.test.ts)为例，对应 app 使用 `process` / `composition`。 | Process 观察子进程、readiness 与退出清理；composition 按声明连接真实 adapter/resources。Gateway Component 不证明目标 APISIX routes 已发布或生效。 |
| 代表性系统旅程 / `@iam/e2e-system` | 根 `pnpm test:e2e`；[Admin](../../e2e/system/admin-custom-sso.spec.ts)、[HR](../../e2e/system/hr-admin-user-management.spec.ts)、[OIDC](../../e2e/system/oidc-pkce.spec.ts)。 | 固定 synthetic 场景中的真实仓库系统协作。Workspace-local journey 是调试入口；不证明生产代理信任、真实外部集成、备份恢复或全部协议场景。 |

OIDC 校验迁出 Kernel 的直接回归由 `@iam/session-kernel` 的 Artifact Redis contract 和
`@iam/oidc-provider` 的 [真实协议 HTTP/Redis](../../apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts)
拥有：用途/type/已知 Client 拒绝、未消费、同 identity 替换保护、两个 Custom SSO 误投入口、错误 redirect、暂态保留及
已读旧 Credential 在清理/新代签发后恢复的隔离。Code 替换矩阵分别修改 Kernel、Provider 或两侧，直接回读消费标记与替换对象；Binding 正式读取覆盖永久失效的精确级联及 Maintenance 保留。原 Kernel client/version hooks 测试按用途拒绝与精确执行契约替换；
操作 Snapshot 另由 #148/#149 的协议测试拥有。Admin 批量版本选择由
[真实 PG/Redis composition](../../apps/admin-api/test-integration/composition/client-protocol-revocation.integration.test.ts)
和 Kernel 的 [选择撤销 Redis contract](../../packages/session-kernel/test-integration/redis/session-kernel-selected-revocation.integration.test.ts)
分别证明提交版本传播、晚到/乱序与 no-op、双协议边界，以及观察对象 CAS、新代子对象保留与未知版本诊断；
替代 seam 和未装配 cleanup 的证明上限见[工程契约](../features/admin/client-protocol-revocation.md)。

## 聚合 Gate 与人工证据

协议校验的[56 条故事最终核对](../features/sso/protocol-validation-contract.md)逐项连接 #147–151 候选、实现/测试决定与证明边界。
OIDC HTTP/Redis 和 Custom SSO 正式工厂/Redis 把旧对象读取、版本选择清理、新代协议签发及旧请求恢复串在同一测试；
Custom SSO 另证明清理完成后极迟旧 Code 写入及下一调用的精确拒绝。Admin 真实 PG/Redis 联合测试拥有提交传播、晚到/逆序/重试，
其中新代由 Kernel 签发，不能与协议 suite 拼称一个 PG+HTTP 场景。类型和既有边界 Guard 不替代这些直接行为。
[保留对象手册](../releases/protocol-validation-preserving-upgrade.md)的停流、Client 写冻结、drain、统一版本、保留及双协议误投/合法 smoke
仍由环境 owner 验收；旧全清命令不适用于满足当前格式的此次升级，父级聚合与实际环境操作分别记录。

Subject Access 的[最终契约核对](../features/sso/subject-access-operation-contract.md)逐条连接全部 62 条故事与可观察证据。
API Core 共享容器及真实 Redis 证明许可和中性 Kernel 协作；API/Custom SSO HTTP/Redis、Admin REST/tRPC/Redis/PG、
OIDC 正式 Provider/原生 HTTP/Redis 分别证明生产入口的作用顺序和一次检查。最终统一工厂已替换旧生产 wiring，
没有保留旧 fence、Projection Barrier 或账号资料重复裁决。前票中间候选结果不替代最终候选重跑。
Admin prepared 失败诊断由外层 adapter 拥有，Kernel 仅原始读取不透明 context；列表不读目标 Barrier。
现有 OIDC online-auth maintenance Redis contract 验证精确清理、非目标保留、部分失败重跑和独立扫描；
[人工维护手册](../releases/subject-access-operation-cutover.md)的停流、drain、统一版本、清理和重登录仍由环境 owner 验收，
本规格不新增系统 E2E 或自动切换演练。候选实际命令及结果由 #136 和父 #128 记录。

在线认证 Redis 时间的 42 条故事与当前 owner 证据见[最终契约核对](../features/oidc/online-auth-redis-time-contract.md)。
Session/Interaction 的真实 Provider 方法与 Redis adapter、全体在线状态维护的无索引残留/部分失败重跑/独立回读，
继续归既有 OIDC `redis` seam。该规格只采用共享生命周期与真实 Redis、协议 production adapter 两类自动化；
不要求系统 E2E 或自动化维护演练，目标环境人工 gate 按[维护手册](../releases/online-auth-redis-time-cutover.md)单独记录。

Admin 统一 mutation 的逐命令、42 条故事、实现/测试决策及多行取锁证据见
[最终契约核对](../features/admin/admin-mutation-contract.md)。既有三条 Full-system journey 已增加真实 changed/no-op、
重复 End 与同配置保存后的 Session/Code 连续性断言；它们不替代 PostgreSQL 并发、事务失败和真实 Redis 恢复测试。
外部 REST/legacy 消费者与真实部署由[协调切换清单](../releases/admin-mutation-contract-cutover.md)的 owner 核验，不能用本地系统测试代替。

当前[基础 runner](../../scripts/verify.mjs)与[聚合 runner](../../scripts/run-verification-gate.mjs)实际执行：

```text
verify         = static -> typecheck -> test:unit -> build
verify:static  = lint -> check:docs -> check:env-names -> check:architecture -> check:test-collection
verify:ci      = verify -> test:integration
verify:release = verify:ci -> test:e2e
```

`verify` 的 static 阶段与 `verify:static` 共用命令列表，因此上述完整聚合均包含 Collection Guard；
[最终候选验证](testing-architecture.md#默认验证与交付)无需另外重复运行它。命令名 `verify:ci` 不代表已接入 CI 平台；
当前 Linux/真实 CI adoption 仍未验收。未配置的自动合入限制不能用本地执行记录代替。

运维 readiness、repair、verify 是操作命令，不属于测试 collection。它们的成功报告只证明自己的检查范围：
例如 Runtime namespace verify 不证明停流或业务可用；Profile backfill 入队不证明 Profile/Facts 已收敛。
发布负责人按对应 Current runbook 组合这些报告与人工证据，尤其核对：

- [Gateway](../releases/apisix-gateway-release.md)：生效 route、可信代理、真实 IP、限流与目标 upstream smoke。
- [Runtime Snapshot 恢复](../releases/client-runtime-snapshot-restore.md)：freeze、实例与 writer drain、当前 namespace repair/verify、mutation/acquisition smoke 与独立放流 read-back；旧部署或旧备份迁移另行安排。[首次切换历史](../releases/client-runtime-snapshot-hard-cutover.md)仅记录当时的旧代清理与 PONR 边界。
- [User Profile v3](../releases/user-profile-v3-hard-cutover.md)：固定 candidate、writer 停止、完整 backfill、PostgreSQL/Redis 两道 gate 与放流条件。
- [OIDC](../releases/oidc-release-runbook.md)及[观测](../releases/observability-system-logs.md)：目标部署的协议、轮换、采集与查询 smoke。

## 变更时如何维护

新增或改变跨 runtime 能力时，实现者先指认现有权威契约和 owner，明确观察时点、失败路径与恢复责任，再选择最高相关
公开接口的行为验证及必要资源通道。若现有测试没有观察新不变量，应补验证或明确未证明项，不能以相邻绿色测试代替。
只有 owner、公开 seam、验证层或关键证明范围变化时才更新本索引；普通内部测试增删不需要扩展成逐文件清单。
