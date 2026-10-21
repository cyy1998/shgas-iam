# User Profile 与 Subject Access 维护

Type: runbook
Status: Current
Last verified: 2026-10-21
Next review: 2026-11-21

本页覆盖当前 Profile v4、Dirty Queue、Subject Facts 与 Subject Access 的日常修复和全量恢复，
以及[权限点退役的一次协调切换](#权限点退役的协调切换)。
旧队列、旧角色表及 v2→v3 升级只在[固定历史手册](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases)
中维护来源说明。角色事实与发布语义见[后端架构](../architecture/backend-architecture.md#user-profile-subject-facts-publication)，
不因运维操作改变。会话和 Client Snapshot 由[统一维护手册](unified-session-maintenance.md)负责。

## 选择操作与准备资源

| 需要处理的问题                               | 入口与作用                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| enqueue 失败、唤醒丢失、dirty 工作未完成     | `user-profile:repair` 按 dirty row 当前版本重投，不为重投推进版本；还执行 Subject Access 恢复。                                      |
| 仅 Subject Access Barrier/transition backlog | `user-profile:repair -- --subject-access-only --limit <n>`；不创建 BullMQ Queue或重投 Profile，但会写 PostgreSQL transition intent。 |
| 主动全量重建当前 Profile                     | `user-profile:backfill` 新增 Backfill dirty fact、推进 dirtyVersion 并投递 rebuild job，需要容量和恢复窗口。                         |
| 确认全量数据可用                             | 先 `user-profile:verify-postgres`，再 `user-profile:verify-redis`；不以队列为空、enqueued 或样本成功替代。                           |

使用 Worker 的显式 `IAM_WORKER_DATABASE_URL`、`IAM_WORKER_REDIS_*` 和当前配置，
核对目标 PostgreSQL、Redis DB/queue/prefix、候选与权限。command-only 入口不启动 consumer、HTTP 或 Bull Board，
真正重建由启用 `user-profile` 模块的 Worker 执行。配置见[Worker 环境示例](../../apps/worker/.env.example)。

日常 repair 可与当前 runtime 并行，不要求执行首次升级的全局停流流程。
全量恢复须固定备份、数据基线、候选和容量窗口，按下节关闭受影响入口并排空在途工作；
保留匹配当前 v4 的受控 Worker 处理重建。恢复期间不得让不兼容 reader/writer 混跑。

## 全量维护的停流范围

发布负责人按目标部署列出每个入口、全部副本、直连地址、后台与 one-shot 任务及其控制面，至少覆盖：

| 范围         | 必须停止的访问与工作                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 业务读取     | Internal 用户 Detail、用户 Filter DSL、Admin 用户及任职详情，以及消费 Subject Facts 或 Subject Access 的认证、SSO/OIDC 授权、兑换、UserInfo、managed Gateway 访问和其他受影响协议访问；包括可能回填 Redis 的 reader。           |
| 源事实写入   | API/Admin API 中改变 User、Employment、Organization、Position、Role、Role Assignment、Organization Responsibility Assignment 的正式入口，以及账号状态、删除和离职等 Subject Access mutation；同类导入、脚本和后台写入也须冻结。 |
| 派生状态写入 | 全部不兼容或非本轮受控的 Profile/Facts publisher、repair 和其他会写 Subject Access 的任务；固定受控 Worker 候选及本轮维护命令。                                                                                                 |

分别读回部署控制面，保存关闭状态、资源和配置身份、负责人及时间；关闭直连和自动重试路径后，
排空所有副本的在途请求、源事务、旧重建/发布任务及 one-shot 工作，再允许全量维护。
停流配置已提交、零请求量、队列暂空或等待 TTL 都不能代替关闭与排空证据。
命令不会自动完成停流；无法确认任一应停入口或任务已关闭时，不能开始全量重建或放流。
受控 smoke 的临时开放与再次收敛见[恢复验收与失败处理](#恢复验收与失败处理)。

## 日常修复

修复依赖后运行：

```bash
pnpm --filter @iam/worker user-profile:repair
```

根据 report 有界重复 repair 并观察 dirty/job 收敛。重投只说明工作已派发，不保证 Profile 或 Redis publication 完成。
修复失败时保存安全诊断、处理 PostgreSQL/Redis/队列或事实完整性原因，再重试；不能删除 pending/failed dirty fact
来掩盖积压。合法 failed job 也不得静默删除；Bull Board retry/promote/remove/clean 是独立、限定范围的运维操作，
默认保持 `IAM_WORKER_BULL_BOARD_READ_ONLY=true`。

Worker health 与队列视图可辅助排障：

```bash
curl -fsS http://localhost:30016/healthz
```

开发 Bull Board 为 `http://localhost:30016/admin/queues`；实际入口以部署配置为准。
dashboard-only service 使用 `IAM_WORKER_ENABLED_MODULES=none`，不消费工作。
当前 job 为 `rebuild-user-profile`，ID 为 `rebuild-user-profile|<userId>|<dirtyVersion>`；
观察完成、跳过、stale、失败及 dirty/publication 状态，不能只看健康接口。

## Subject Access 恢复与外部调度

独立处理 Barrier backlog：

```bash
pnpm --filter @iam/worker run user-profile:repair -- --subject-access-only --limit 500
```

两个 repair 模式均按以下顺序处理 Subject Access；普通模式在 transition recovery 后还启动 Profile dirty 维护：

1. PostgreSQL reaper 使用数据库 server time 和 `IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS`（默认 300 秒）
   判断 stale，单个有界写事务最多回收 limit 个 stale pending intent 为 `rolled_back`/`rollback`，
   覆盖尚未进入 Redis index 的 PG-only gap。
   fresh intent 和被活跃 mutation transaction 锁定的行留待后续轮次。
2. Redis transition recovery 按 transition ID 在行锁下读取精确 PostgreSQL receipt：
   committed 按原目标恢复，pending 先原子 rollback，receipt 缺失只 deferred，不猜测账号状态。
3. authority repair 领取 indexed Barrier backlog，对照 PostgreSQL 账号、Profile、Dirty 和 Facts publication 收敛。
   Enable 需 Profile/processed Dirty 一致且当前 Facts CAS 发布成功；禁用/删除按账号事实收敛为 disabled。

数据库角色需要 schema access、`subject_access_transition` 的 SELECT/UPDATE 及 authority 查询权限，
数据库须具有当前 stale scan partial index。reaper 失败会非零退出，不继续 Redis recovery 或 authority repair。
`--limit` 分别限制各 Subject Access 阶段；`--stale-before` 仅用于 Profile dirty，不能替代 intent 的 server-time 阈值。
Redis 领取使用 lease/fence，不能手工去重或让旧 worker 覆盖新转换。

仓库没有 scheduler。部署负责人须安排外部周期触发、频率、单轮限额、重复排空、告警与恢复 SLO；
最坏耗时应覆盖 stale threshold、等待下一次调度和有界排空三段。监控以下结构化事件：

| 事件                                                                                                     | 关键观察                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Subject Access stale transition intent reap started` / `Subject Access stale transition intents reaped` | limit、staleAfterSeconds、rolledBack；started 后无对应完成、异常突增需告警。                                  |
| `Subject Access transition recovery backlog processed`                                                   | prepared、rolledBack、deferred、failed、limit。                                                               |
| `Subject Access repair backlog observed before processing`                                               | repairBacklogCount、repairBacklogOldestAgeMs，记录本轮处理前积压。                                            |
| `Subject Access repair backlog processed`                                                                | disabled、enabled、deferred、failed、stable、limit，以及处理后 repairBacklogCount、repairBacklogOldestAgeMs。 |
| `Subject Access repair backlog observation unavailable`                                                  | repairBacklogMetricsAvailable=false、repairBacklogPhase；区分 before-processing 与 after-processing。         |

`repairBacklogCount` 是当前 Redis indexed Barrier repair backlog 的主体数，包含已领取或等待重试的项；
`repairBacklogOldestAgeMs` 按 age 索引记录的 entered-at 与 Redis 时间计算最老积压时长，领取和重试不会重置该记录，空积压为 `null`。
遗留项缺少 age 索引时使用补记的估计时间，不能据此恢复精确的首次入队时刻；规则见
[Subject Access Barrier](../architecture/backend-architecture.md#subject-access-barrier)。
这两项不统计 PostgreSQL-only pending intent 或整个 transition recovery backlog，须结合上表各阶段报告观察。
它们来自 repair 命令的结构化日志，不能从 `/healthz` 成功推定积压为零。

观察失败时命令继续恢复，并记录 metrics unavailable；它不表示 count=0 或 backlog 已排空，也不一定导致非零退出。
部署告警应覆盖积压数量、最老积压时长、连续观察不可用、调度缺失以及 started 后缺少完成报告；
阈值由部署负责人按恢复 SLO 配置，无法观察时先恢复监控和依赖，再重新取得完整证据。

命令非零退出、failed/deferred 持续非零时，先处理依赖和 publication 原因，再等待 retry 到期或重跑。
不得通过手工写 Redis、cache warmer、read-through 或请求路径把 missing/blocking Barrier 改为 enabled。

## 全量重建与恢复

完成资源、备份、[停流与排空](#全量维护的停流范围)和当前 Worker 核对后执行：

```bash
pnpm --filter @iam/worker user-profile:backfill
```

批量大小由 `IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE` 配置。backfill 会推进版本和增加队列压力，
不是 no-op；`enqueued` 不是 readiness。等待 Worker 发布完整 inventory，按需 repair，直到没有
pending、processing、failed 或 stale dirty，Profile 为当前 v4 且 sourceDirtyVersion 与 processed dirty version 一致。
inventory 覆盖全部 User，包括禁用及已删除用户；不能只对活跃账号执行 backfill 或核验。

随后在独立命令中先 PostgreSQL、后 Redis/Subject Facts/Subject Access 全量核验：

```bash
pnpm --filter @iam/worker user-profile:verify-postgres -- --batch-size 500
pnpm --filter @iam/worker user-profile:verify-redis -- --batch-size 500
```

两道 gate 必须完整扫描，均为 `status=passed` 且退出 0。Profile/dirty 缺失、版本或 freshness 不一致、损坏文档、
Facts/Barrier 缺失或不一致、资源故障、timeout、报告不完整或批次部分成功，都阻断恢复放流。
失败时保持 freeze，经正式 repair/publication 或审计业务入口修复源事实，重新确认收敛并重跑两道完整 gate；
不手改生成文档、不清库、不将 Redis miss 当作 gate 成功，也不只重跑失败 batch 后直接开放。

## 恢复验收与失败处理

两道完整数据 gate 通过后核对固定 runtime readiness。受影响公共流量与非本轮写入继续关闭，
仅为指定操作者和受控对象临时开放 smoke 所需的正式入口，并独立读回这一受限状态。
如果部署无法限制访问范围，则在隔离入口执行，不能为 smoke 提前恢复公共流量。验证：

- 源事实变更产生 dirty 并发布当前 Profile/Facts；Employment 暂停/恢复和角色变化影响相应读取。
- Internal Detail 与 Internal Filter DSL 使用当前 v4；Filter DSL 的响应与范围遵守
  [DSL 契约](../features/user-profile-search/filter-dsl.md)，不以 Profile 清理改变查询协议。
- Subject Access 按账号状态拒绝或授予新操作许可；责任完整性失败通过
  [正式管理入口](../features/organization-responsibility/hr-admin-management-design.md)处理，不能绕过双端范围和审计。
- 非目标账号、Client/凭据、会话、审计及无关 Redis 数据与基线一致；本流程不推进协议代际或清理会话产物。

smoke 完成后先关闭临时入口并排空其在途请求。由受控 Worker 完成测试写入及清理动作产生的全部 dirty、
Profile/Facts publication 和 Subject Access 恢复；重新确认收敛，再先 PostgreSQL、后 Redis 重跑两道完整 gate。
首轮 gate 不能证明 smoke 后状态。若再次写入、修复或清理改变数据，重新排空、收敛并完整核验。

任一 readiness/smoke 或最终 gate 失败时，关闭临时入口并保持公共流量关闭；修复后重跑失效的验收，
再完成上述收敛和完整 gate。满足全部条件才由负责人逐项恢复相关读取与写入并读回控制面；失败或未知按
[放流与人工恢复责任](unified-session-maintenance.md#放流与人工恢复责任)重新关闭。
恢复后观察错误率、latency、dirty/job backlog、Facts mismatch 和 Worker failures；异常时重新关闭受影响范围。

保存候选、资源身份、时间、命令退出码与聚合 report、数据基线和放流读回结果，不保存敏感原文。
日志与健康检查不替代数据 gate，本地测试也不证明实际环境恢复已完成。

## 权限点退役的协调切换

本节适用于仍运行 Profile v3、Catalog/Selection v2 和 Custom SSO wire v2、且已完成 Client Delegation
单 Client 模型迁移的来源。它执行 [ADR-0045](../adr/0045-retire-privilege-permission-points.md) 的一次协调发布；
实施与候选证据见 [Spec #269](https://github.com/cyy1998/shgas-iam/issues/269)。新装空库直接执行完整正式 migrations。
更早的数据库或会话来源先恢复匹配的历史流程，不能把不同来源混成同一次切换。

### 固定输入与保留基线

发布负责人在停流前固定来源与目标提交、API/Admin API/Worker/前端/Gateway 制品、实际资源身份、配置和恢复责任人。
备份 PostgreSQL（含 migration journal 与两张待删源表）和实际使用的 Redis，验证备份可恢复，并保管匹配旧制品。
恢复方案须处理备份之后的安全作用及新写入，不能通过回放登录态备份恢复已撤销的访问。

记录角色、角色分配、用户、任职、组织、Client 及其凭据、现行 Client Delegation 和历史审计的非目标基线。
同时记录有效 UserSession/ClientSession、两协议 Code/Token/认证续接及无关 Redis 数据的值、类型和绝对期限摘要；
沿用[非目标基线的采集与判定](unified-session-maintenance.md#非目标基线的采集与判定)的受控采集方式，不把原值或凭据写入普通日志。
Profile/Dirty/Facts 缓存和本轮 rebuild 工作是明确的修改对象，不将其变化误记为源事实丢失。

### 停流、迁移与重建

1. 按[完整停流范围](#全量维护的停流范围)逐副本关闭并读回控制面，包括后台、one-shot、旧 repair、自动重试、
   回填 reader、源事实写入及旧权限绑定入口。停止全部旧 publisher，排空在途请求、事务及旧队列可执行任务。
   有未知结果或未处理的旧任务时保持关闭，先用匹配旧制品完成恢复；不能把旧 job 交给新 consumer 重试。
2. 核对备份与基线后，由部署环境显式提供 `DATABASE_URL`，执行：

   ```bash
   pnpm --filter @iam/db db:migrate
   ```

   正式链包含 `20261021120501_retire_privilege`，仅删除 `role_privilege`、`privilege` 及其专属结构。
   审查正式 SQL，并只读核对该项 journal 已登记一次、两表不存在和非目标源数据保留。
   不重写旧 SQL/snapshot/journal，不使用 `db:push`、权限点归档或临时手工清表替代。
   已存在的 Client Delegation 必须保留；不得把本次退役误做成再次清空委托。

3. API/Admin API 及所有受影响业务入口继续关闭。先用唯一固定的新 Worker 制品执行
   `user-profile:backfill`，覆盖包括禁用、删除用户在内的全量 inventory，再启动受控 v4 consumer。
   backfill 将旧 dirty 原因改为当前 Backfill 并推进版本；必须先完成这一阶段，再运行新 `user-profile:repair`。
   排队成功不等于重建完成，不能仅等待旧缓存 TTL 或依赖请求时回填。
4. 等待全部重建及 Subject Access 收敛，按[全量恢复](#全量重建与恢复)在独立命令中先运行
   `user-profile:verify-postgres`，再运行 `user-profile:verify-redis`。两者完整扫描、`status=passed` 且退出 0 后，
   才允许进入受控 smoke；旧代际、损坏、缺失、版本不一致、部分批次或未知结果均保持停流。

迁移后的独立 schema 核对示例（使用部署实际 schema）：

```sql
SELECT to_regclass('public.role_privilege') AS removed_role_privilege,
       to_regclass('public.privilege') AS removed_privilege,
       to_regclass('public.client_delegation') AS retained_client_delegation;
```

schema 核对只能证明源表状态，不能代替 Profile、Search Document、Subject Facts 和 Redis 的完整数据门禁。

### 配对升级、受控 smoke 与放流

接入应用在恢复入口前确认以下变更，并取得其负责人验收：

- Detail、Search Document 和 Facts 为 Profile v4，各层权限点及名称派生字段删除；原权限搜索路径返回 422。
- Catalog/Selection v3、Custom SSO 主体 wire v3；`iam:authorization` 保留角色与任职，删除顶层及嵌套权限点。
  `subjectClaims`、`allowedScopes` 名称及既有选择沿用，不返回空权限数组，也不提供调用方选版或旧字段解释。
- Client 委托改用 `CLIENT_DELEGATION.*` 错误，用户删除门禁为 `USER.HAS_OPEN_CLIENT_DELEGATION`；HTTP 状态及业务含义保持。
- 应用自己保存的缓存、本地会话及其他旧权限副本已清理或停止消费。IAM 重建完成或用户重新登录不能替代这项外部证据。

仅为指定操作者临时开放受限正式入口，验证角色与 Client 隔离、空角色、Admin/HR 动作和组织范围、委托三端生命周期，
以及 managed Gateway 的新交付。使用切换前真实建立、仍在原期限内的 Cookie、Code、Token 和认证续接：
旧 Token 的 UserInfo 应交付新结构，旧 Code 可完成兑换，旧续接可完成原授权；失效、撤销、Client 状态及 Subject Access
拒绝继续生效。不得在 Facts 尚未就绪时试兑旧 Code，避免触发协议原有的消费失败补偿。

会话和协议持久格式、namespace、身份、访问代际、issuer 与签名键保持原样，不主动注销、续期或清空实时登录态。
旧 Code 和 Token 因正常消费产生的必要变化按各自协议记录，原绝对期限不能延长；已签 ID Token 内容保持固定。
本次不调用 `session:clear`、不清空整个 Redis，也不把 Snapshot 修复混入未授权的凭据轮换。

smoke 后关闭临时入口并排空，在受控 Worker 完成新增 dirty/publication/recovery 后，重新取得两道完整 gate 和非目标保留证据。
只有配对升级、第三方旧副本处理、数据门禁、runtime readiness、smoke 及保留核验全部明确通过，才逐项恢复入口并读回控制面。
保存制品与备份引用、关闭/排空证据、migration/双 gate 报告和退出码、smoke、第三方签认及最终放流证据。

任一失败或结果未知时停止后续开放，重新关闭已开放或不确定的入口并排空。可用当前正式修复完成恢复时先修复再完整重验；
需要回退时，由恢复负责人使用匹配制品与备份恢复一致状态并处理备份后的变化，再取得全部适用验收。
不能仅回退旧应用连接已删表的新库，不能删 journal 重放旧链，也不能恢复在线双代或兼容分支。
本地测试和手册不表示已在生产或第三方系统执行这些操作。
