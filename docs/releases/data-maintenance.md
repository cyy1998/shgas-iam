# 数据维护

Type: runbook
Status: Current
Last verified: 2026-10-25
Next review: 2026-11-25

本页维护当前 User Profile v4、Subject Access 与 Organization Search schema 1。
两个读模型分别修复、重建和核验；一次性退役或旧代升级见[迁移入口](README.md#一次性迁移与旧版本)。

## 准备资源与选择操作

命令使用显式 `IAM_WORKER_DATABASE_URL`，需要 Redis 的命令还使用 `IAM_WORKER_REDIS_*`。
脚本默认读取 `apps/worker/.env`，进程环境优先；核对实例、DB、queue 和 prefix 与生产者/consumer 一致。
命令不启动 consumer、业务 HTTP 或 Bull Board，重建必须有启用对应模块的 Worker。
配置见[Worker 示例](../../apps/worker/.env.example)，恢复机制见[后端架构](../architecture/backend-architecture.md#subject-access-barrier)。

| 问题                                         | 选择                |
| -------------------------------------------- | ------------------- |
| Profile dirty 或入队/发布失败                | Profile 日常修复    |
| 只有 Subject Access transition/Barrier 积压  | Subject Access 恢复 |
| Profile 缺失、整体损坏或需要当前版本全量构建 | Profile 全量重建    |
| 组织变化未展开、dirty 失败或过期 processing  | 组织搜索日常修复    |
| 组织搜索首次构建、schema 升级或全量恢复      | 组织搜索全量重建    |

日常 repair 可在线运行。全量维护先准备匹配版本、可恢复备份和容量窗口，再按对应范围停流；不兼容 reader/writer 不能混跑。
业务源事实异常通过正式管理入口修正，不手改派生文档、删除失败工作或重放业务写入来掩盖问题。

## Profile 日常修复

依赖恢复后执行：

```bash
pnpm --filter @iam/worker user-profile:repair
```

该命令先回收 stale intent 并处理 transition recovery，再并行处理 Profile dirty 与 Barrier authority repair；重投不推进 dirtyVersion。
保持 `user-profile` consumer 运行，根据报告有界重复 repair，直到 dirty/job 与 Facts publication 收敛。
入队成功只表示已派发，队列为空或 `/healthz` 成功不能单独证明 Profile 完整。
failed、stale 或发布失败持续存在时，先检查 PostgreSQL、Redis、队列和源事实完整性，再重试。

默认保持 `IAM_WORKER_BULL_BOARD_READ_ONLY=true`；面板 retry/promote/remove/clean 是独立运维动作。
dashboard-only 的 `IAM_WORKER_ENABLED_MODULES=none` 不消费重建任务。
开发面板为 `http://localhost:30016/admin/queues`，health 为 `/healthz`，其他环境以实际配置为准。
当前 job 为 `rebuild-user-profile`，ID 为 `rebuild-user-profile|<userId>|<dirtyVersion>`。

## Subject Access 恢复

仅处理账号访问保护积压时运行：

```bash
pnpm --filter @iam/worker run user-profile:repair -- --subject-access-only --limit 500
```

命令依次回收 PostgreSQL stale pending intent、处理 Redis transition recovery、修复 indexed Barrier backlog；
此模式不创建 BullMQ Queue、不重投 Profile，但会更新 PostgreSQL transition intent。
数据库角色需要 schema access、`subject_access_transition` 的 SELECT/UPDATE、authority 查询权限，数据库须具备当前 stale scan partial index。

`IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS` 默认 300 秒，按数据库时间判断；`--limit` 分别限制每个 Subject Access 阶段。
`--stale-before` 只适用于 Profile dirty。fresh intent、活跃事务锁或未到重试时间的工作留待后续轮次。
reaper 失败时命令非零退出，不继续 Redis 恢复。

观察各阶段 report 的 failed/deferred 和积压是否收敛。持续失败时检查依赖、账号事实和 Facts publication，恢复后重跑；
不得手工启用 missing/blocking Barrier，也不以 cache warmer 或请求时回填替代正式恢复。

## Profile 全量重建

先关闭并排空以下范围，保留唯一匹配 v4 的受控 Worker：

| 范围     | 需关闭的工作                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 读取     | Internal Detail/用户 Filter DSL、Admin 用户及任职详情、消费 Facts/Subject Access 的认证与 SSO/OIDC/Gateway 访问，包括回填 Redis 的 reader               |
| 源写入   | 改变 User、Employment、Organization、Position、Role、Role Assignment、Organization Responsibility Assignment 及账号状态/删除/离职的正式入口、导入与脚本 |
| 派生写入 | 不兼容或非本轮受控的 publisher、repair、后台与 one-shot 工作；包括直连、自动重试及在途事务/任务                                                         |

确认实际停流和排空后执行：

```bash
pnpm --filter @iam/worker user-profile:backfill
```

批量大小由 `IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE` 控制。backfill 推进版本并增加队列工作，不是 no-op。
覆盖所有 User，包括禁用与已删除用户；等待受控 consumer 发布，按需 repair，直到没有 pending、processing、failed 或 stale dirty，
Profile 为 v4 且 sourceDirtyVersion 与 processed dirty version 一致。

在独立命令中先 PostgreSQL、后 Redis 核验：

```bash
pnpm --filter @iam/worker user-profile:verify-postgres -- --batch-size 500
pnpm --filter @iam/worker user-profile:verify-redis -- --batch-size 500
```

两者都须完整扫描、`status=passed`、退出 0。缺行、旧版本、损坏、Facts/Barrier 不一致、timeout 或不完整报告均阻断恢复。
失败时保持停流，经正式 repair/publication 或管理入口修复，再重跑两个完整 gate；不能只重跑失败 batch。

通过后仅为受控操作者开放必要入口，检查源事实变更能发布当前 Profile/Facts、用户 Detail/DSL 正常、Subject Access 按账号状态授予或拒绝访问。
保持无关会话与凭据不变；本操作不清会话或推进协议代际。
验证与测试数据清理完成后关闭临时入口并排空，等待新增 dirty/publication/recovery 收敛，再依次重跑两个完整 gate。
全部通过后恢复受影响入口；验证或开放失败时重新关闭不确定入口，修复并完成受影响检查后再开放。

## 组织搜索日常修复

组织生产者、命令、consumer 和 dashboard 统一使用固定 queue prefix `iam`，不提供独立前缀。
遗留 `IAM_WORKER_ORGANIZATION_SEARCH_QUEUE_PREFIX` 仅接受 `iam`；使用 `organization-search` consumer，不能用 dashboard 代替。

```bash
pnpm --filter @iam/worker organization-search:repair -- --limit 500
```

命令有界恢复 sourceChanges 与 rebuilds 两阶段的 pending、failed 或过期 processing 并重新唤醒。
分别观察 selected/enqueued/failed；`status=enqueued` 与退出 0 只表示投递完成，`publication=not-verified` 不表示发布已核验。
依赖修复后重复 repair 并等待 consumer 收敛；失败持续时检查数据库、队列及源完整性，保留持久工作用于重试。
不能删除工作、手写文档或重放业务写入。合法旧文档在重建期间仍可查询。

processing 过期阈值 `IAM_WORKER_ORGANIZATION_SEARCH_REPAIR_STALE_SECONDS` 默认 300 秒，应覆盖合理处理时长。
仅在确认旧处理停止或过期时使用 `--stale-before <ISO timestamp>`。
backfill/repair/verify 都支持 `--deadline-ms <1..300000>`，默认 30000；deadline、中断或资源关闭失败非零退出，
已提交工作保留。verify 只需 PostgreSQL；backfill/repair 还需队列和工作表写权限。

## 组织搜索全量重建

适用于首次构建、单版本不兼容升级与全量恢复。

1. 关闭 `POST /internal/organizations/search-dsl` 和 API/Admin API 全部组织写入口，包括 Internal 注册、资料、状态、删除及同类脚本。
   关闭直连/重试，排空在途请求、源事务和任务，停止旧 publisher，启用唯一匹配当前 schema 的受控 consumer。
2. 全量登记并等待两阶段工作完成，按需 repair：

   ```bash
   pnpm --filter @iam/worker organization-search:backfill -- --batch-size 500
   ```

   批量默认值由 `IAM_WORKER_ORGANIZATION_SEARCH_BACKFILL_BATCH_SIZE` 控制。
   全部组织（含删除组织）必须发布当前文档或墓碑，不能只检查活跃组织。

3. 在独立命令中完整核验：

   ```bash
   pnpm --filter @iam/worker organization-search:verify
   ```

   同一一致只读快照覆盖源事实、文档/墓碑、schema、路径、版本、完成凭据和持久工作；仅 `status=passed` 且退出 0 通过。
   完整检查范围见[组织发布与核验](../architecture/backend-architecture.md#organization-search-发布与核验)。

4. 保持公共流量关闭，仅开放受控入口，检查新建、祖先改名、状态与删除最终反映到 DSL 完整响应，并核对受影响的组织详情等功能。
5. 关闭临时入口并排空，等待验证和清理产生的变化、dirty、文档发布收敛，再运行完整 verify。
   测试若触发 Profile dirty，还须等待其正常发布并检查受影响结果，不因此共同升级两个 schema。
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
| Profile dirty/job 与 Facts publication                    | pending、processing、failed、stale 或 mismatch 不收敛 |
| Organization sourceChanges / rebuilds                     | 任一阶段 failed 或持久积压不收敛                      |

Barrier 指标只覆盖 Redis indexed backlog，不含 PG-only pending intent 或整个 transition backlog；须结合各阶段报告观察。
遗留 age 索引补记是估计时间。观察失败不一定使 repair 非零退出，不能只依赖退出码告警。
恢复期间不能通过清库、删除合法 failed job 或手工启用 Barrier 消除告警。
