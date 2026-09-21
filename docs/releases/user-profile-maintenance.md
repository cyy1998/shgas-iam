# User Profile 与 Subject Access 维护

Type: runbook
Status: Current
Last verified: 2026-09-21
Next review: 2026-10-31

本页覆盖当前 Profile v3、Dirty Queue、Subject Facts 与 Subject Access 的日常修复和全量恢复。
旧队列、旧角色表及 v2→v3 升级只在[固定历史手册](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases)
中维护来源说明。事实及权限语义见[后端架构](../architecture/backend-architecture.md#user-profile-subject-facts-publication)，
不因运维操作改变。会话和 Client Snapshot 由[统一维护手册](unified-session-maintenance.md)负责。

## 选择操作与准备资源

| 需要处理的问题 | 入口与作用 |
|---|---|
| enqueue 失败、唤醒丢失、dirty 工作未完成 | `user-profile:repair` 按 dirty row 当前版本重投，不为重投推进版本；还执行 Subject Access 恢复。 |
| 仅 Subject Access Barrier/transition backlog | `user-profile:repair -- --subject-access-only --limit <n>`；不创建 BullMQ Queue或重投 Profile，但会写 PostgreSQL transition intent。 |
| 主动全量重建当前 Profile | `user-profile:backfill` 新增 Backfill dirty fact、推进 dirtyVersion 并投递 rebuild job，需要容量和恢复窗口。 |
| 确认全量数据可用 | 先 `user-profile:verify-postgres`，再 `user-profile:verify-redis`；不以队列为空、enqueued 或样本成功替代。 |

使用 Worker 的显式 `IAM_WORKER_DATABASE_URL`、`IAM_WORKER_REDIS_*` 和当前配置，
核对目标 PostgreSQL、Redis DB/queue/prefix、候选与权限。command-only 入口不启动 consumer、HTTP 或 Bull Board，
真正重建由启用 `user-profile` 模块的 Worker 执行。配置见[Worker 环境示例](../../apps/worker/.env.example)。

日常 repair 可与当前 runtime 并行，不要求执行首次升级的全局停流流程。
全量恢复则须固定备份、数据基线、候选和容量窗口，冻结相关 Profile 读取、源事实写入及其他 publisher；
保留当前受控 Worker 处理重建。恢复期间不得让不兼容 reader/writer 混跑。

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
   判断 stale。单个有界写事务按 `update_time`、`id` 选取最多 limit 个 pending intent，
   通过 `FOR UPDATE SKIP LOCKED` 更新为 `rolled_back`/`rollback`，覆盖尚未进入 Redis index 的 PG-only gap。
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

| 事件 | 关键观察 |
|---|---|
| `Subject Access stale transition intent reap started` / `Subject Access stale transition intents reaped` | limit、staleAfterSeconds、rolledBack；started 后无对应完成、异常突增需告警。 |
| `Subject Access transition recovery backlog processed` | prepared、rolledBack、deferred、failed、limit。 |
| `Subject Access repair backlog processed` | disabled、enabled、deferred、failed、stable、limit。 |

命令非零退出、failed/deferred 持续非零时，先处理依赖和 publication 原因，再等待 retry 到期或重跑。
不得通过手工写 Redis、cache warmer、read-through 或请求路径把 missing/blocking Barrier 改为 enabled。

## 全量重建与恢复

完成资源、备份、freeze 和当前 Worker 核对后执行：

```bash
pnpm --filter @iam/worker user-profile:backfill
```

批量大小由 `IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE` 配置。backfill 会推进版本和增加队列压力，
不是 no-op；`enqueued` 不是 readiness。等待 Worker 发布完整 inventory，按需 repair，直到没有
pending、processing、failed 或 stale dirty，Profile 为当前 v3 且 sourceDirtyVersion 与 processed dirty version 一致。

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

数据 gate 后核对固定 runtime readiness，在受控数据上验证：

- 源事实变更产生 dirty 并发布当前 Profile/Facts；Employment 暂停/恢复和角色变化影响相应读取。
- Internal Detail、Internal/Public Search 及 Delegation 基础搜索使用当前 v3；Filter DSL 的响应与范围遵守
  [DSL 契约](../features/user-profile-search/filter-dsl.md)，不以 Profile 清理改变查询协议。
- Subject Access 按账号状态拒绝或授予新操作许可；责任完整性失败通过
  [正式管理入口](../features/organization-responsibility/hr-admin-management-design.md)处理，不能绕过双端范围和审计。
- 非目标账号、Client/凭据、会话、审计及无关 Redis 数据与基线一致；本流程不推进协议代际或清理会话产物。

任一 readiness/smoke 失败继续保持关闭，修复后重跑失效的收敛、完整 gate 和 smoke。
满足全部条件才由负责人恢复相关读取与写入并读回控制面；失败或未知按
[放流与人工恢复责任](unified-session-maintenance.md#放流与人工恢复责任)重新关闭。
恢复后观察错误率、latency、dirty/job backlog、Facts mismatch 和 Worker failures；异常时重新关闭受影响范围。

保存候选、资源身份、时间、命令退出码与聚合 report、数据基线和放流读回结果，不保存敏感原文。
日志与健康检查不替代数据 gate，本地测试也不证明实际环境恢复已完成。
