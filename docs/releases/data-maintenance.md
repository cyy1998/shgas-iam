# 数据维护

Type: runbook
Status: Current
Last verified: 2026-11-02
Next review: 2026-12-02

本页维护 User Document / Organization Document schema 1 与 Subject Access。命令名称以当前候选代码为准；
完整 Spec 的目标环境硬切换、备份和受控开放仍由部署侧执行，本地测试不表示目标环境已经迁移。
两个读模型分别修复、重建和核验；一次性退役或旧代升级见[迁移入口](README.md#一次性迁移与旧版本)。

## 准备资源与选择操作

命令使用显式 `IAM_WORKER_DATABASE_URL`，需要 Redis 的命令还使用 `IAM_WORKER_REDIS_*`。
脚本默认读取 `apps/worker/.env`，进程环境优先；核对实例、DB、queue 和 prefix 与生产者/consumer 一致。
命令不启动 consumer、业务 HTTP 或 Bull Board，重建必须有启用对应模块的 Worker。
配置见[Worker 示例](../../apps/worker/.env.example)，恢复机制见[后端架构](../architecture/backend-architecture.md#subject-access-barrier)。

| 问题                                               | 选择                   |
| -------------------------------------------------- | ---------------------- |
| User Document Outbox/Rebuild State 或入队/发布失败 | User Document 日常修复 |
| 只有 Subject Access transition/Barrier 积压        | Subject Access 恢复    |
| User Document 缺失、整体损坏或需要当前版本全量构建 | User Document 全量重建 |
| 组织变化未展开、重建失败或过期 processing          | 组织搜索日常修复       |
| 组织搜索首次构建、schema 升级或全量恢复            | 组织搜索全量重建       |

日常 repair 可在线运行。全量维护先准备匹配版本、可恢复备份和容量窗口，再按对应范围停流；不兼容 reader/writer 不能混跑。
业务源事实异常通过正式管理入口修正，不手改派生文档、删除失败工作或重放业务写入来掩盖问题。

## 统一 Document 硬切换

适用于旧 Profile v4 / Organization Search schema 1 到 User Document schema 1 / Organization Document schema 1 的不兼容升级。
Custom SSO 调用方同时适配 wire 4；Catalog 保持 3，OIDC 标准字段映射和 session/protocol 代际不推进。

1. 固定新旧制品与配置，准备可恢复且相互匹配的 PostgreSQL、Redis 备份。核对有效登录状态、UserSession/ClientSession、Code/Token、登录限制、OIDC 密钥、SSO Secret、Internal Secret 与认证 key ring 的保留和回退条件。
2. 关闭并排空两类文档的读写、认证/SSO/OIDC/Gateway 访问、缓存回填 reader、全部相关源写入和直连/重试。停止旧 Worker、publisher、repair 与一次性命令，确认在途源事务和队列任务已结束；旧 `user-profile` 队列不交给新 consumer 解释。
3. 在停流下用新制品运行正式 `pnpm --filter @iam/db db:migrate`，保留完整迁移链与 journal，不使用 db:push 或删 journal 重放。该链建立六张规范 Document/Outbox/Rebuild State 表，保留源事实与已有处理版本；旧用户派生副本被退役，迁移完成不表示资料已发布。
4. 部署唯一匹配新模型的 reader/writer、`user-document` 与 `organization-document` consumer 和 wire 4 调用方，继续关闭公共流量。按本页两类全量重建流程登记全部对象，包括旧 processed 但内容陈旧、暂停、禁用和删除对象；等待两阶段工作、文档及用户后续责任收敛。
5. 完整运行 `user-document:verify-postgres`、`user-document:verify-redis` 和 `organization-document:verify`。任一不完整或失败均保持停流；健康检查、队列为空、入队完成不替代这些门禁。
6. 仅开放受控入口，验证详情/搜索同文档、Client 角色隔离、SSO 披露、旧有效凭据续用与必要源变化传播。关闭并排空受控入口及清理写入，等待收敛后再次完整核验三个 gate；全部通过才恢复流量。

不得清空共享 Redis、清会话或借切换撤销有效凭据。失败时保留停流和持久恢复义务，按正式 repair/管理入口恢复后重新完整核验；需要回退时使用相互匹配的旧制品、配置与备份，不能混跑新旧 reader/writer 或依赖逐对象回退。
本地迁移、恢复和跨制品演练只证明固定候选，目标环境实际停流、备份与放流由部署操作者完成。

## User Document 日常修复

依赖恢复后执行：

```bash
pnpm --filter @iam/worker user-document:repair
```

该命令先回收 stale intent 并处理 transition recovery，再处理 User Document 的 Outbox、Rebuild State、
持久 post-publication 与 Barrier authority repair。保持 `user-document` consumer 运行，根据报告有界重复 repair。
Outbox 与 rebuilds 分别报告 selected/enqueued/failed；postPublication 报告 selected/completed/skipped/failed。
active processing 不被夺取；只有已达到 stale-before 的处理才可重新领取。重投保留版本，不凭入队成功标记发布完成。
Outbox 的 processed 表示重建要求和完成凭据已原子登记；Rebuild State 的 processed 表示 PG 文档或墓碑已提交。
用户的缓存与访问屏障后续责任另行持久保存，主 processed 不代表这些作用已经完成。
命令的 `publication=not-verified`、入队成功、队列为空或 `/healthz` 成功均不能证明完整。
failed、stale 或发布失败持续存在时，先检查 PostgreSQL、Redis、队列和源事实完整性，再重试。

默认保持 `IAM_WORKER_BULL_BOARD_READ_ONLY=true`；面板 retry/promote/remove/clean 是独立运维动作。
dashboard-only 的 `IAM_WORKER_ENABLED_MODULES=none` 不消费重建任务。
开发面板为 `http://localhost:30016/admin/queues`，health 为 `/healthz`，其他环境以实际配置为准。
普通任务为 `expand-user-document-outbox` 与 `rebuild-user-documents-batch`，consumer 仍接受积压的单条
`rebuild-user-document`。每次唤醒使用独立 UUID job ID；持久 Outbox 完成凭据与 Rebuild State 版本负责幂等和发布仲裁。
同次展开或 repair 的重建请求按 `IAM_WORKER_USER_DOCUMENT_REBUILD_BATCH_SIZE` 切块，实际每批最多 100 个用户；
并发配置限制活跃批次数。PG 发布另按约 1 MiB 候选文档数据切小组，超过该大小的单个文档独立处理；
后处理在模块实例内共享最多 4 个主体的默认并发额度，多个任务不会各自再放大这份额度。
repair 的 rebuilds.enqueued 仍按目标用户数报告，不能与 Bull Board 的 batch job 数直接比较。
发布小组遇目标局部错误时可先整体回滚，再有限拆分定位；健康子组继续提交。连接、配置或提交结果未知时停止扩散，保留持久义务供核对与 repair。
任务可以部分发布成功；重试会跳过已完成或旧版本目标，Facts 失败仍由独立后续义务恢复。
批次日志的 rebuilt 表示已确认 PG 发布，postPublication 另报告后续完成、失败和失去所有权的数量。
批量发布事务与隔离重试使用 30 秒处理预算，PG 锁等待和语句超时不放宽连接上已有的更严格限制；预算耗尽也不能把已确认提交的文档撤销。
调整批大小前核对最早领取到最后发布的耗时、内存和数据库负载，stale-before 必须覆盖合理的整批处理时长。

首次升级批量任务时，先停止并排空全部旧 User Document consumer 与旧 repair 命令，统一替换 Worker 和命令制品后再启动。
新 consumer 可以处理旧单条库存，旧 consumer 不能处理批量任务；回退前须由新制品排空批量任务和在途工作。
正常关闭等待在途整批结束，强制终止留下的 processing 由正式 repair 恢复，不删除持久义务。

用户 backfill、repair 与两类 verify 支持 `--deadline-ms <1..300000>`，默认 30000。参数非法时不创建资源；
deadline、SIGINT/SIGTERM、查询/投递失败或必需资源关闭失败均非零退出。命令独立拥有带完整 UUID 的 PG 连接，
取消只作用于本次连接；超时或中断不回滚已经提交的登记，恢复依赖正式 repair/backfill 与完整核验。
verify-postgres 只需 PG，不连接 Redis；verify-redis 还需显式 `IAM_WORKER_REDIS_*`，不创建队列或启动 consumer。
重新启用不能绕过完整 Facts 门禁：直接用户未完成 Outbox、post-publication 未完成或 retained-newer 缓存（包括墓碑）
均继续阻挡恢复。依赖恢复后运行 repair 并重做完整门禁，不手动启用屏障。

## Subject Access 恢复

仅处理账号访问保护积压时运行：

```bash
pnpm --filter @iam/worker run user-document:repair -- --subject-access-only --limit 500
```

命令依次回收 PostgreSQL stale pending intent、处理 Redis transition recovery、修复 indexed Barrier backlog；
此模式不创建 BullMQ Queue、不重投 User Document，但会更新 PostgreSQL transition intent。
数据库角色需要 schema access、`subject_access_transition` 的 SELECT/UPDATE、authority 查询权限，数据库须具备当前 stale scan partial index。

`IAM_WORKER_USER_DOCUMENT_REPAIR_STALE_SECONDS` 默认 300 秒，按数据库时间判断；`--limit` 分别限制每个 Subject Access 阶段。
`--stale-before` 适用于文档 Outbox、Rebuild State 与 post-publication 处理；Subject Access intent 仍使用自己的 stale threshold。
fresh intent、活跃事务锁或未到重试时间的工作留待后续轮次。
reaper 失败时命令非零退出，不继续 Redis 恢复。

观察各阶段 report 的 failed/deferred 和积压是否收敛。持续失败时检查依赖、账号事实和 Facts publication，恢复后重跑；
不得手工启用 missing/blocking Barrier，也不以 cache warmer 或请求时回填替代正式恢复。

## User Document 全量重建

先关闭并排空以下范围，保留唯一匹配 schema 1 的受控 Worker：

| 范围     | 需关闭的工作                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 读取     | Internal Detail/用户 Filter DSL、Admin 用户及任职详情、消费 Facts/Subject Access 的认证与 SSO/OIDC/Gateway 访问，包括回填 Redis 的 reader               |
| 源写入   | 改变 User、Employment、Organization、Position、Role、Role Assignment、Organization Responsibility Assignment 及账号状态/删除/离职的正式入口、导入与脚本 |
| 派生写入 | 不兼容或非本轮受控的 publisher、repair、后台与 one-shot 工作；包括直连、自动重试及在途事务/任务                                                         |

确认实际停流和排空后执行：

```bash
pnpm --filter @iam/worker user-document:backfill
```

`--batch-size` 或 `IAM_WORKER_USER_DOCUMENT_BACKFILL_BATCH_SIZE` 控制每批登记数量。报告区分 registered 与 enqueued，
登记后的唤醒失败保留 Outbox，由正式 repair 重试。Backfill 扫描全部源 User，包括 Enable、Pause、Disable 和 deleted，
也会推进已经 processed 但内容陈旧的库存；只运行 repair 或只扫 failed 不能完成这项恢复。
等待受控 consumer 发布当前完整 Document 或删除墓碑；缺行不能代替墓碑。完成状态、版本、Outbox 凭据与用户后续责任必须全部收敛。

在独立命令中先 PostgreSQL、后 Redis 核验：

```bash
pnpm --filter @iam/worker user-document:verify-postgres -- --batch-size 500
pnpm --filter @iam/worker user-document:verify-redis -- --batch-size 500
```

PG gate 在一个 RR READ ONLY 事务中扫描完整源库存、文档/墓碑、Rebuild State、Outbox 与历史完成凭据，
并用同一快照和固定观察时间重建期望事实。更高已完成版本可满足历史请求；合法间接零目标消息允许空 receipt，
历史关联已物理删除不等于消息损坏。Backfill 原因码不作为就绪条件。
Redis gate 使用一致的 PG 库存逐个核对完整 Facts 或版本化墓碑与屏障，已删除用户也必须有墓碑和 disabled 屏障，不能跳过。
两者独立只读，不修复、不入队。只有两次完整扫描均 `status=passed` 且退出 0 才通过。
缺行、孤立记录、旧 schema、损坏、未完成或不匹配凭据、事实差异、Facts/Barrier 不一致、timeout 或不完整报告均阻断恢复。
失败时保持停流，经正式 repair/publication 或管理入口修复，再重跑两个完整 gate；不能只重跑失败 batch。

通过后仅为受控操作者开放必要入口，检查源事实变更能发布当前 Document/Facts、用户 Detail/DSL 正常、Subject Access 按账号状态授予或拒绝访问。
保持无关会话与凭据不变；本操作不清会话或推进协议代际。
验证与测试数据清理完成后关闭临时入口并排空，等待新增 Outbox/Rebuild State/publication/recovery 收敛，再依次重跑两个完整 gate。
全部通过后恢复受影响入口；验证或开放失败时重新关闭不确定入口，修复并完成受影响检查后再开放。

## 组织搜索日常修复

组织生产者、命令、consumer 和 dashboard 统一使用固定 queue prefix `iam`，不提供独立前缀。
遗留 `IAM_WORKER_ORGANIZATION_DOCUMENT_QUEUE_PREFIX` 仅接受 `iam`；使用 `organization-document` consumer，不能用 dashboard 代替。

```bash
pnpm --filter @iam/worker organization-document:repair -- --limit 500
```

命令有界恢复 outbox 与 rebuilds 两阶段的 pending、failed 或过期 processing 并重新唤醒。
分别观察 selected/enqueued/failed；`status=enqueued` 与退出 0 只表示投递完成，`publication=not-verified` 不表示发布已核验。
依赖修复后重复 repair 并等待 consumer 收敛；失败持续时检查数据库、队列及源完整性，保留持久工作用于重试。
不能删除工作、手写文档或重放业务写入。合法旧文档在重建期间仍可查询。

processing 过期阈值 `IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS` 默认 300 秒，应覆盖合理处理时长。
仅在确认旧处理停止或过期时使用 `--stale-before <ISO timestamp>`。
backfill/repair/verify 都支持 `--deadline-ms <1..300000>`，默认 30000；deadline、中断或资源关闭失败非零退出，
已提交工作保留。verify 只需 PostgreSQL；backfill/repair 还需队列和工作表写权限。

## 组织搜索全量重建

适用于首次构建、单版本不兼容升级与全量恢复。

1. 关闭 `POST /internal/organizations/search-dsl`、`GET /internal/organizations/:orgCode` 和 API/Admin API 全部组织写入口，包括 Internal 注册、资料、状态、删除及同类脚本。
   关闭直连/重试，排空在途请求、源事务和任务，停止旧 publisher，启用唯一匹配当前 schema 的受控 consumer。
2. 全量登记并等待两阶段工作完成，按需 repair：

   ```bash
   pnpm --filter @iam/worker organization-document:backfill -- --batch-size 500
   ```

   批量默认值由 `IAM_WORKER_ORGANIZATION_DOCUMENT_BACKFILL_BATCH_SIZE` 控制。
   全部组织（含删除组织）必须发布当前文档或墓碑，不能只检查活跃组织。

3. 在独立命令中完整核验：

   ```bash
   pnpm --filter @iam/worker organization-document:verify
   ```

   同一一致只读快照覆盖源事实、文档/墓碑、schema、路径、版本、完成凭据和持久工作；仅 `status=passed` 且退出 0 通过。
   完整检查范围见[组织发布与核验](../architecture/backend-architecture.md#organization-search-发布与核验)。

4. 保持公共流量关闭，仅开放受控入口，检查新建、祖先改名、状态与删除最终反映到 DSL 完整响应，并核对受影响的组织详情等功能。
5. 关闭临时入口并排空，等待验证和清理产生的变化、Rebuild State、文档发布收敛，再运行完整 verify。
   测试若触发 User Document Outbox/Rebuild State，还须等待其正常发布并检查受影响结果，不因此共同升级两个 schema。
6. 核验与业务检查均通过后恢复组织写入和搜索，观察查询失败、Worker failures 与两阶段积压。

核验不修改数据、不入队；缺行、旧 schema、结构/事实差异、未完成工作、执行错误或不完整报告均保持维护。
修复后重新完整 verify 和受影响业务检查。在线查询不会因全量覆盖不足整体返回 503，停流必须由部署控制实际完成。
不能混跑不兼容 reader/writer、删除 migration journal 或手改 JSONB 绕过门禁。

## 周期任务与监控

仓库没有内置周期补偿调度。部署侧安排 repair 的频率、单轮限额与重复排空，并按恢复 SLO 设置告警。
Subject Access 恢复耗时至少考虑 stale threshold、等待下一次调度和有界排空；组织搜索无固定新鲜度 SLA。

| 观察项                                                    | 需要处理的情况                                        |
| --------------------------------------------------------- | ----------------------------------------------------- |
| repair 调度与命令退出                                     | 调度缺失、连续非零，或 started 后没有完成事件         |
| Subject Access reaper / transition recovery               | rolledBack 异常突增，failed/deferred 持续非零         |
| Barrier `repairBacklogCount` / `repairBacklogOldestAgeMs` | 数量或最老年龄持续增长；空积压年龄为 null             |
| `repairBacklogMetricsAvailable=false`                     | 观察不可用，不能解释为积压为零；先恢复监控/依赖       |
| User Document Outbox / Rebuild State / postPublication    | pending、processing、failed、stale 或 mismatch 不收敛 |
| Organization Document Outbox / Rebuild State              | 任一阶段 failed 或持久积压不收敛                      |

Barrier 指标只覆盖 Redis indexed backlog，不含 PG-only pending intent 或整个 transition backlog；须结合各阶段报告观察。
遗留 age 索引补记是估计时间。观察失败不一定使 repair 非零退出，不能只依赖退出码告警。
恢复期间不能通过清库、删除合法 failed job 或手工启用 Barrier 消除告警。
