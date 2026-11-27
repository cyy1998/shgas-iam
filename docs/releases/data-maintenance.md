# 数据维护

用于分别修复、重建和核验 schema 1 的 User Document 和 Organization Document，也用于恢复 Subject Access。
先核对目标实例，确认 Ops 与目标制品版本匹配，再检查所选操作的 Worker、备份和停流要求。旧代升级或一次性退役见[迁移入口](README.md#一次性迁移与旧版本)。
手册状态与复核日期见[索引条目](../index.md#runbook-data-maintenance)。

## 准备资源与选择操作

命令使用显式 `IAM_OPS_DATABASE_URL`，需要 Redis 的命令还使用 `IAM_OPS_REDIS_URL`。
脚本默认读取 `apps/ops/.env`，进程环境优先；核对实例、DB、queue 和 prefix 与生产者/consumer 一致。
命令不启动 consumer、业务 HTTP 或 Bull Board，重建必须有启用对应模块的 Worker。
配置见[Ops 示例](../../apps/ops/.env.example)，恢复机制见[Subject Access 恢复与重新启用](../../packages/subject-access/README.md#恢复与重新启用)。

| 问题                                               | 选择                   |
| -------------------------------------------------- | ---------------------- |
| User Document Outbox/Rebuild State 或入队/发布失败 | User Document 日常修复 |
| 只有 Subject Access transition/Barrier 积压        | Subject Access 恢复    |
| User Document 缺失、整体损坏或需要当前版本全量构建 | User Document 全量重建 |
| 组织变化未展开、重建失败或过期 processing          | 组织搜索日常修复       |
| 组织搜索首次构建、schema 升级或全量恢复            | 组织搜索全量重建       |

日常 repair 可在线运行。全量维护先准备匹配版本、可恢复备份和容量窗口，再按对应范围停流。

**维护红线：**

1. 全量维护与版本切换期间禁止混跑不兼容的 reader、writer 或 Worker。
2. `status=enqueued`、`publication=not-verified`、队列为空或 `/healthz` 通过都不代表发布完成，数据完整性一律以对应 `verify-*` / `verify` 命令返回 `status=passed`（退出码 `0`）为准。
3. 业务源事实异常须经正式管理入口修正；禁止手改派生文档（含 JSONB）、删除失败任务或 migration journal、重放业务写入，或手动将 Barrier 设为 `enabled` 来绕过恢复门禁。

## 统一 Document 硬切换

适用于旧 Profile v4 / Organization Search schema 1 到 User Document schema 1 / Organization Document schema 1 的不兼容升级。
Custom SSO 调用方同时适配 wire 4；Catalog 保持 3，OIDC 标准字段映射和 session/protocol 代际不推进。

1. **备份与准备** 固定新旧制品与配置，准备可恢复且相互匹配的 PostgreSQL、Redis 备份。核对有效登录状态、UserSession/ClientSession、Code/Token、登录限制、OIDC 密钥、SSO Secret、Internal Secret 与认证 key ring 的保留和回退条件。
2. **停流与排空** 关闭并排空两类文档的读写、认证/SSO/OIDC/Gateway 访问、缓存回填 reader、全部相关源写入和直连/重试。停止旧 Worker、publisher、repair 与一次性命令，确认在途源事务和队列任务已结束；旧 `user-profile` 队列不交给新 consumer 解释。
3. **执行数据库迁移** 在停流下用新制品运行正式 `pnpm --filter @iam/db db:migrate`（不使用 `db:push`）。该迁移链建立六张规范 Document/Outbox/Rebuild State 表，保留源事实与已有处理版本；旧用户派生副本随迁移退役，但迁移完成不代表资料已发布。
4. **启动新版消费者并全量登记** 部署唯一匹配新模型的 reader/writer、`user-document` 与 `organization-document` consumer 和 wire 4 调用方，继续关闭公共流量。按本页两类全量重建流程登记全部对象，包括旧 processed 但内容陈旧、暂停、禁用和删除对象；等待两阶段任务、文档发布及缓存与访问屏障更新收敛。
5. **运行三项完整核验门禁** 完整运行 `iam-ops user-document verify-postgres`、`iam-ops user-document verify-redis` 和 `iam-ops organization-document verify`，任一不完整或失败均保持停流。
6. **验收与恢复流量** 仅开放受控入口，验证详情与搜索同文档、Client 角色隔离、SSO 披露、旧有效凭据续用与必要源变化传播。关闭并排空受控入口及清理写入，等待收敛后再次完整核验三个 gate；全部通过才恢复流量。

不得清空共享 Redis、清会话或借切换撤销有效凭据。失败时保持停流并保留待恢复任务，经正式 repair 或管理入口恢复后重新完整核验；需要回退时整体恢复相互匹配的旧制品、配置与备份，不可逐对象回退。

### 本地跨制品验收

旧代 Document 硬切换的 Windows x64 本地验收使用切换时的固定候选与临时夹具。复现时从对应历史 checkout 运行，制品、配置、顺序和结果以记录为准。[固定复现说明](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/development/commands.md#统一-document-一次性跨制品验收) · [Ticket #294](https://github.com/cyy1998/shgas-iam/issues/294)

目标环境的放流按上节步骤核验。

## User Document 日常修复

依赖恢复后执行：

```bash
pnpm --filter @iam/ops iam-ops user-document repair
```

该命令先回收 stale intent 并处理 transition recovery，再处理 User Document 的 Outbox、Rebuild State、
持久 post-publication 与 Barrier authority repair。保持 `user-document` consumer 运行，根据报告有界重复 repair。
Outbox 与 rebuilds 分别报告 selected/enqueued/failed；postPublication 报告 selected/completed/skipped/failed/exhausted。
active processing 不被夺取；只有已达到 stale-before 的处理才可重新领取，重投时保留原版本号。
Outbox 的 processed 表示重建要求和完成凭据已原子登记；Rebuild State 的 processed 表示 PG 文档或墓碑已提交。
用户的缓存与访问屏障更新单独持久保存，主流程 processed 不代表这些更新已完成。
failed、stale 或发布失败持续存在时，先检查 PostgreSQL、Redis、队列和源事实完整性，再重试。

后处理每个发布版本最多自动尝试 5 次，包含首次与 processing 过期后的重新领取；普通消费和 repair 共用这份预算。
超限后处理任务保留为未完成工作并退出自动领取，后续用户可继续处理。`exhausted` 表示本轮结束后尚未完成且已耗尽预算、
需人工处理的总数，不受本轮 `limit` 限制，可能与本轮 `failed` 重叠；活跃的第 5 次 processing 不计入其中。
`failed` 或 `exhausted` 非零时命令非零退出。新版本发布重置预算，重复队列消息和普通 repair 不重置。
依赖长时间故障可能使一批后处理任务耗尽预算，依赖恢复后仍须显式人工重试，不能仅等待自动 repair。

确认依赖或失败原因已修复，需要批量重新触发已耗尽预算的后处理任务时执行：

```bash
pnpm --filter @iam/ops iam-ops user-document repair -- --force --limit 500
```

`--force` 使本轮选中的超限后处理任务重新获得 5 次预算，并立即消耗第 1 次；未耗尽的任务按原计数继续。
该参数只作用于 User Document 后处理，其他 repair 阶段照常执行。单轮仍受 `--limit` 限制，每个用户最多领取一次；
未选中记录的预算不变，已完成记录和未过期的 processing 不重新领取。积压超过限额时，根据报告继续分批执行；
`failed` 或剩余 `exhausted` 非零仍非零退出。此模式与定向重试参数、`--subject-access-only` 互斥。

确认失败原因已修复，从失败日志的 `userId`、`version` 或只读查询 `user_document_rebuild_state` 确认精确目标，再执行：

```bash
pnpm --filter @iam/ops iam-ops user-document repair -- --retry-user-id 123 --retry-version 42
```

两个参数必须成对提供；该模式只重试指定用户与发布版本的后处理，并继续运行 Subject Access 恢复阶段。
目标必须预算已耗尽且为 failed 或已达到 stale-before 的 processing；版本不匹配、已完成或活跃 processing 均拒绝。
重置预算与新 token 的领取原子完成，首次人工尝试计为 1，失败后仍可在剩余预算内由普通 repair 继续恢复。
该模式与 `--subject-access-only` 互斥，且保留已提交的文档、墓碑与版本。

默认保持 `IAM_WORKER_BULL_BOARD_READ_ONLY=true`；面板 retry/promote/remove/clean 是独立运维动作。
dashboard-only 的 `IAM_WORKER_ENABLED_MODULES=none` 不消费重建任务。
开发面板为 `http://localhost:30016/admin/queues`，health 为 `/healthz`，其他环境以实际配置为准。
普通任务为 `expand-user-document-outbox` 与 `rebuild-user-documents-batch`，consumer 仍接受积压的单条
`rebuild-user-document`。每次唤醒使用独立 UUID job ID；持久 Outbox 完成凭据与 Rebuild State 版本负责幂等和发布仲裁。
consumer 展开及 Worker 周期 repair 的重建请求按 `IAM_WORKER_USER_DOCUMENT_REBUILD_BATCH_SIZE` 切块，
人工 Ops backfill 和 repair 使用 `IAM_OPS_USER_DOCUMENT_REBUILD_BATCH_SIZE`。两者实际每批最多 100 个用户；
consumer 并发配置限制活跃批次数。PG 发布另按约 1 MiB 候选文档数据切小组，超过该大小的单个文档独立处理；
后处理在模块实例内共享最多 4 个主体的默认并发额度，多个任务不会各自再放大这份额度。
repair 的 rebuilds.enqueued 仍按目标用户数报告，不能与 Bull Board 的 batch job 数直接比较。
发布小组遇目标局部错误时可先整体回滚，再有限拆分定位；健康子组继续提交。连接、配置或提交结果未知时停止扩散，保留待恢复任务供核对与 repair。
任务可以部分发布成功；重试会跳过已完成或旧版本目标，Facts 失败仍由独立的后处理任务恢复。
批次日志的 rebuilt 表示已确认 PG 发布，postPublication 另报告后续完成、失败和失去所有权的数量。
批量发布事务与隔离重试使用 30 秒处理预算，PG 锁等待和语句超时不放宽连接上已有的更严格限制；预算耗尽也不能把已确认提交的文档撤销。
调整批大小前核对最早领取到最后发布的耗时、内存和数据库负载，stale-before 必须覆盖合理的整批处理时长。

首次升级批量任务时，先停止并排空全部旧 User Document consumer 与旧 repair 命令，统一替换 Worker 和命令制品后再启动。
新 consumer 可以处理旧单条库存，旧 consumer 不能处理批量任务；回退前须由新制品排空批量任务和在途工作。
正常关闭会等待在途整批结束，强制终止留下的 processing 由正式 repair 恢复。

用户 backfill、repair 与两类 verify 支持 `--deadline-ms <1..300000>`，默认 30000。参数非法时不创建资源；
deadline、SIGINT/SIGTERM、查询/投递失败或必需资源关闭失败均非零退出。命令独立拥有带完整 UUID 的 PG 连接，
取消只作用于本次连接；超时或中断不回滚已经提交的登记，恢复依赖正式 repair/backfill 与完整核验。
verify-postgres 只需 PG，不连接 Redis；verify-redis 还需显式 `IAM_OPS_REDIS_URL`，不创建队列或启动 consumer。
重新启用须通过完整 Facts 门禁：用户的未完成 Outbox、未完成后处理任务或较新版本的保留缓存（含墓碑）均会继续阻挡恢复；依赖恢复后运行 repair 并重新通过门禁即可。

## Subject Access 恢复

仅处理账号访问保护积压时运行：

```bash
pnpm --filter @iam/ops iam-ops user-document repair -- --subject-access-only --limit 500
```

命令依次回收 PostgreSQL stale pending intent、处理 Redis transition recovery、修复 indexed Barrier backlog；
此模式不创建 BullMQ Queue、不重投 User Document，但会更新 PostgreSQL transition intent。
数据库角色需要 schema access、`subject_access_transition` 的 SELECT/UPDATE、authority 查询权限，数据库须具备当前 stale scan partial index。

`IAM_OPS_USER_DOCUMENT_REPAIR_STALE_SECONDS` 默认 300 秒，按数据库时间判断；`--limit` 分别限制每个 Subject Access 阶段。
`--stale-before` 适用于文档 Outbox、Rebuild State 与 post-publication 处理；Subject Access intent 仍使用自己的 stale threshold。
fresh intent、活跃事务锁或未到重试时间的工作留待后续轮次。
reaper 失败时命令非零退出，不继续 Redis 恢复。

观察各阶段 report 的 failed/deferred 和积压是否收敛。持续失败时检查依赖、账号事实和 Facts 发布状态，修复后重跑，不要用 cache warmer 或请求时回填替代正式恢复。

## User Document 全量重建

1. **停流与排空**。关闭并排空以下范围，保留唯一匹配 schema 1 的受控 Worker。

   | 范围     | 需关闭的工作                                                                                                                                            |
   | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 读取     | Internal Detail/用户 Filter DSL、Admin 用户及任职详情、消费 Facts/Subject Access 的认证与 SSO/OIDC/Gateway 访问，包括回填 Redis 的 reader               |
   | 源写入   | 改变 User、Employment、Organization、Position、Role、Role Assignment、Organization Responsibility Assignment 及账号状态/删除/离职的正式入口、导入与脚本 |
   | 派生写入 | 不兼容或非本轮受控的 publisher、repair、后台与 one-shot 工作；包括直连、自动重试及在途事务/任务                                                         |

2. **全量登记并等待收敛**。确认实际停流和排空后执行：

   ```bash
   pnpm --filter @iam/ops iam-ops user-document backfill
   ```

   `--batch-size` 或 `IAM_OPS_USER_DOCUMENT_BACKFILL_BATCH_SIZE` 控制每页登记数量。每页在一个事务中为每个用户登记重建版本和已完成的 Outbox 凭据，
   提交后再按重建批大小入队。同一任务可以重建多个用户，报告中的 registered 和 enqueued 仍按用户计数。
   已提交的页若唤醒失败，由正式 repair 从 Rebuild State 重新入队；命令提前退出时，重跑 backfill 才能登记尚未扫描的用户。
   Backfill 扫描全部源 User，包括 Enable、Pause、Disable 和 deleted，也会推进已经 processed 但内容陈旧的库存。
   等待受控 consumer 发布当前完整 Document 或删除墓碑；缺行不能代替墓碑。完成状态、版本、Outbox 凭据以及缓存与访问屏障更新必须全部收敛。

3. **执行双存储完整性核验**。在独立命令中先 PostgreSQL、后 Redis 核验：

   ```bash
   pnpm --filter @iam/ops iam-ops user-document verify-postgres -- --batch-size 500
   pnpm --filter @iam/ops iam-ops user-document verify-redis -- --batch-size 500
   ```

   PG gate 在一个 RR READ ONLY 事务中扫描完整源库存、文档/墓碑、Rebuild State、Outbox 与历史完成凭据，
   并用同一快照和固定观察时间重建期望事实。更高已完成版本可满足历史请求；合法间接零目标消息允许空 receipt，
   历史关联已物理删除不等于消息损坏。Backfill 原因码不作为就绪条件。
   Redis gate 使用一致的 PG 库存逐个核对完整 Facts 或版本化墓碑与屏障，已删除用户也必须有墓碑和 disabled 屏障，不能跳过。
   两者独立只读，不修复、不入队。只有两次完整扫描均 `status=passed` 且退出 0 才通过。
   任何异常都会阻断恢复，包括缺行、孤立记录、旧 schema 或数据损坏，凭据未完成或不匹配，源事实差异、Facts 与 Barrier 不一致，以及执行超时或报告不完整。
   核验失败时保持停流，经正式 repair、重新发布或管理入口修复后，从头重跑两个完整 gate（不能只重跑失败批次）。

4. **验收与恢复流量**。核验通过后先仅向受控操作者开放必要入口，确认源事实变更可正常发布到 Document 与 Redis Facts、用户详情和 DSL 查询正常、Subject Access 按账号状态放行或拦截。本操作不清理无关会话或凭据，也不推进协议代际。
   验收并清理测试数据后，关闭临时入口并排空，等待新增的 Outbox、Rebuild State、文档发布与恢复任务全部收敛，再依次重跑两个完整 gate。全部通过后恢复受影响入口；验收或放流异常时先关闭不确定入口，修复并重跑受影响检查后再开放。

## 组织搜索日常修复

组织生产者、命令、consumer 和 dashboard 统一使用固定 queue prefix `iam`，不提供独立前缀。
`IAM_OPS_ORGANIZATION_DOCUMENT_QUEUE_PREFIX` 若显式提供，仅接受 `iam`；使用 `organization-document` consumer，不能用 dashboard 代替。

```bash
pnpm --filter @iam/ops iam-ops organization-document repair -- --limit 500
```

命令有界恢复 outbox 与 rebuilds 两阶段的 pending、failed 或过期 processing 并重新唤醒。
组织 consumer 仍按单组织任务处理，重建发布已接入两类 Document 共用的预算、版本/owner 检查和失败回收机制。
锁等待或发布失败时会保留待恢复任务供 repair 重试；文档与完成状态在同一事务内提交。
每轮分别观察 selected、enqueued 与 failed，依赖修复后重复 repair 并等待 consumer 收敛；失败持续时检查数据库、队列与源数据完整性。重建期间合法的旧文档仍可查询。

processing 过期阈值 `IAM_OPS_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS` 默认 300 秒，应覆盖合理处理时长。
仅在确认旧处理停止或过期时使用 `--stale-before <ISO timestamp>`。
backfill/repair/verify 都支持 `--deadline-ms <1..300000>`，默认 30000；deadline、中断或资源关闭失败非零退出，
已提交工作保留。verify 只需 PostgreSQL；backfill/repair 还需队列和工作表写权限。

## 组织搜索全量重建

适用于首次构建、单版本不兼容升级与全量恢复。

1. **停流与排空** 关闭 `POST /internal/organizations/search-dsl`、`GET /internal/organizations/:orgCode` 和 Integration API / Admin API 全部组织写入口，包括 Internal 注册、资料、状态、删除及同类脚本。
   关闭直连/重试，排空在途请求、源事务和任务，停止旧 publisher，启用唯一匹配当前 schema 的受控 consumer。
2. **全量登记并等待收敛** 全量登记并等待两阶段工作完成，按需 repair：

   ```bash
   pnpm --filter @iam/ops iam-ops organization-document backfill -- --batch-size 500
   ```

   批量默认值由 `IAM_OPS_ORGANIZATION_DOCUMENT_BACKFILL_BATCH_SIZE` 控制。
   全部组织（含删除组织）必须发布当前文档或墓碑，不能只检查活跃组织。

3. 在独立命令中完整核验：

   ```bash
   pnpm --filter @iam/ops iam-ops organization-document verify
   ```

   同一一致只读快照覆盖源事实、文档/墓碑、schema、路径、版本、完成凭据和未完成任务；仅 `status=passed` 且退出 0 通过。
   完整检查范围见[组织发布与核验](../../packages/documents/README.md#organization-search-发布与核验)。

4. 保持公共流量关闭，仅开放受控入口，检查新建、祖先改名、状态与删除最终反映到 DSL 完整响应，并核对受影响的组织详情等功能。
5. 关闭临时入口并排空，等待验证和清理产生的变化、Rebuild State、文档发布收敛，再运行完整 verify。
   测试若触发 User Document Outbox/Rebuild State，还须等待其正常发布并检查受影响结果，不因此共同升级两个 schema。
6. 核验与业务检查均通过后恢复组织写入和搜索，观察查询失败、Worker failures 与两阶段积压。

核验为只读操作，不修改数据也不入队；若存在缺行、旧 schema、结构或事实差异、未完成任务、执行错误或报告不完整，均应保持维护并在修复后重新运行完整 verify 及受影响业务检查。在线查询不会因全量覆盖不足整体返回 503，停流必须由部署控制实际完成。

## 周期任务与监控

User Document 与 Organization Document 都支持 Worker 内置周期 repair，两类调度分别配置并独立运行。
两者均按恢复 SLO 设置告警，并保持对应 consumer 运行。
Subject Access 恢复耗时至少考虑 stale threshold、等待下一次调度和有界排空；组织搜索无固定新鲜度 SLA。

提交后唤醒超时或入队失败时，源业务仍已保存，Outbox 留待下一轮 repair；只重投文档任务，不重放保存请求。
两类 producer 均在同一事务内合并通知，分别使用一次总等待预算；大批次分段入队，超时后不继续发送剩余段。
通过以下 Worker 环境变量配置：

| 配置                             | User Document 环境变量                        | Organization Document 环境变量                        | 源码默认值 |
| -------------------------------- | --------------------------------------------- | ----------------------------------------------------- | ---------- |
| 自动恢复开关                     | `IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED`     | `IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED`     | `false`    |
| 轮次结束到下轮开始的间隔（毫秒） | `IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS` | `IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS` | `60000`    |
| 每轮各恢复阶段限额               | `IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT`       | `IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_LIMIT`       | `500`      |
| 单轮命令预算（毫秒）             | `IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS` | `IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS` | `30000`    |

父进程在命令预算后另有有限清理宽限及强制终止兜底。
dev/prod Compose 的 `worker-user-document` 与 `worker-organization-document` 分别默认开启对应任务；源码直接运行时显式设置开关。
只有对应 consumer 已启用才会运行，dashboard-only 不启动任务；两类模块同时启用时仍各自控制开关。
Worker 启动后运行首轮，之后串行运行；普通失败留待下一轮，清理失败则停止自动轮次并记录错误，须排查并重启服务。
任务启动 Worker 自有的私有 repair 子进程，将本服务配置转换为本轮显式输入，并通过领域维护接口复用人工 repair 的完整流程。
Worker 使用 Bun 执行源码。周期修复无需 cron、Docker CLI 或额外维护镜像。
每类任务在同一实例中不重叠，两个文档模块可以各自运行；多实例仍由数据库领取和版本/token 仲裁。
用户后处理 `exhausted` 按上方人工重试流程处理，自动轮次不使用 `--force`。

更新配置并重启匹配版本的 Worker 后，确认出现 `user_document.repair.started` 或 `organization_document.repair.started` 及对应完成或失败事件；依赖恢复后检查
Outbox、Rebuild State 和后处理积压收敛，并将日志与退出状态接入现有告警。
已有外部同类定时任务应停用；需要停流、切换或排空时停止 Worker，或先关闭对应开关并重启，再等待在途修复退出。

| 观察项                                                    | 需要处理的情况                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| repair 调度与命令退出                                     | 调度缺失、连续非零，或 started 后没有完成事件                                   |
| Subject Access reaper / transition recovery               | rolledBack 异常突增，failed/deferred 持续非零                                   |
| Barrier `repairBacklogCount` / `repairBacklogOldestAgeMs` | 数量或最老年龄持续增长；空积压年龄为 null                                       |
| `repairBacklogMetricsAvailable=false`                     | 观察不可用，不能解释为积压为零；先恢复监控/依赖                                 |
| User Document Outbox / Rebuild State / postPublication    | pending、processing、failed、stale 或 mismatch 不收敛；exhausted 非零须人工处理 |
| Organization Document Outbox / Rebuild State              | 任一阶段 failed 或持续积压不收敛                                                |

Barrier 指标只覆盖 Redis indexed backlog，不含 PG-only pending intent 或整个 transition backlog；须结合各阶段报告观察。
遗留 age 索引补记是估计时间。观察失败不一定使 repair 非零退出，不能只依赖退出码告警。
