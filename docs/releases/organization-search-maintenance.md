# Organization Search 维护

Type: runbook
Status: Current
Last verified: 2026-10-14
Next review: 2026-10-31

本页覆盖当前 Organization Search schema 1 的首次构建、单版本不兼容升级、补偿及全量恢复。
源组织与闭包仍是权威事实，查询和发布语义见[Organization Filter DSL](../features/organization-search/filter-dsl.md)。
组织维护独立于[User Profile 与 Subject Access](user-profile-maintenance.md)，不要求它们同时升级或核验。
本页是操作流程；本地受控验证不表示目标环境已执行维护或部署。

## 配置与操作入口

固定候选、来源 schema、备份和目标资源身份。使用 Worker 的显式 `IAM_WORKER_DATABASE_URL`；
backfill/repair 还使用 `IAM_WORKER_REDIS_*`。组织队列统一使用 `@iam/jobs` 的固定 `DEFAULT_QUEUE_PREFIX`（`iam`），
与 API/Admin 源事务生产者、正式 Worker consumer 及队列面板保持一致，命令不提供独立前缀。
此前 Worker-only 的 `IAM_WORKER_ORGANIZATION_SEARCH_QUEUE_PREFIX` 配置仅接受遗留默认值 `iam`，非默认值在创建资源前明确拒绝。
核对数据库和 Redis DB 与实际生产者/消费者一致，环境配置见[Worker 示例](../../apps/worker/.env.example)。
scripts 默认读取 `apps/worker/.env`，已有进程环境变量优先；命令不启动业务 HTTP、Bull Board 或 consumer。

| 操作         | 命令及报告含义                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全量登记     | `pnpm --filter @iam/worker organization-search:backfill -- --batch-size 500`；为全部组织创建源变化，沿普通展开、构建、发布路径处理，`publication: not-verified`。 |
| 有界补偿     | `pnpm --filter @iam/worker organization-search:repair -- --limit 500`；恢复两阶段未完成、失败或过期 ownership 并重新唤醒，`status: enqueued` 只表示投递。         |
| 独立全量核验 | `pnpm --filter @iam/worker organization-search:verify`；只连接 PostgreSQL，完整扫描当前源事实、发布记录和工作；`status: passed` 且退出 0 才满足数据门禁。         |

重建由启用 `organization-search` 模块的正式 Worker 完成，可与 `user-profile` 独立选择；
不能用 dashboard-only 的 `IAM_WORKER_ENABLED_MODULES=none` 代替消费者。
backfill 批量配置为 `IAM_WORKER_ORGANIZATION_SEARCH_BACKFILL_BATCH_SIZE`，默认 500；
repair 的 processing 过期阈值为 `IAM_WORKER_ORGANIZATION_SEARCH_REPAIR_STALE_SECONDS`，默认 300 秒。
阈值应覆盖合理处理时长，避免回收仍在执行的工作；持有处理事务行锁的工作会被跳过。
显式 `--stale-before <ISO timestamp>` 仅在确认旧处理已停止或已过期时使用。
三个命令均支持 `--deadline-ms <1..300000>`，默认 30000，并在 deadline 或可捕获中断时进入资源关闭流程。
三种命令使用专用 PostgreSQL 连接，将查询超时与本轮 deadline 配对；
异常或中断时只取消本角色、本数据库、本次命令的活动查询，并关闭相关连接。
backfill/repair 另外使用有界队列唤醒和队列关闭。
资源关闭失败同样非零退出。
数据库角色须具备相关表 SELECT 权限，backfill/repair 另需写工作表权限；取消只作用于本角色、本数据库、本次专用连接。
核验的常规数据 transaction 是只读的；deadline/中断时控制连接调用 `pg_cancel_backend`，属于本次查询的资源取消，
不修改业务源事实、派生文档或工作记录。数据只读并不表示没有服务器控制调用。

## 日常补偿与外部调度

队列是唤醒通道，源变化和 dirty 才是持久恢复事实。源事务提交后 enqueue 失败、任务重试耗尽或进程中断，
均不得通过重放业务写入、删除工作、手写文档或队列为空来宣告恢复。

依赖恢复后有界重复 repair，等待普通消费者完成两个阶段。报告分别观察 `sourceChanges` 与 `rebuilds` 的
`selected/enqueued/failed`；任一 failed、命令非零或积压不收敛时处理数据库、队列及源完整性原因。
每轮在两个阶段各选取最多 `--limit` 条 pending、failed 或过期 processing 工作，默认 limit 使用上述 backfill 批量配置。
重领保留 desired version、诊断和尝试次数，新 ownership token 拒绝旧处理器；重复 repair 不为重投推进版本。
旧处理器即使持有同版本候选，也不能完成或覆盖重领后的工作；每次唤醒使用新的队列 job ID。
队列失败记录以及 PostgreSQL 的 attempts、lastError 用于追查重试耗尽原因。
合法旧文档在重建期间继续可搜索，搜索请求不修复数据。

`status: enqueued` 且退出 0 只表示本轮选中工作投递完成，`publication: not-verified` 表示未核验发布；
空批次同样不证明全库完整。任一投递失败报告 `status: failed` 并退出 1。
deadline、SIGINT 或 SIGTERM 会停止本轮并关闭资源，保留已提交工作，不输出成功投递报告；
强制杀进程可能留下 processing，后续按过期阈值回收。

部署负责人安排外部周期调用、频率、限额、连续排空、命令失败和持久积压告警。
本仓库不提供调度系统或 Worker 内置周期补偿，也不承诺固定新鲜度 SLA。
常规补偿可在当前 runtime 下进行；首次、升级和全量恢复使用下文维护窗口。

## 首次、升级与全量恢复

1. 发布负责人暂停新 `POST /internal/organizations/search-dsl` 和 API/Admin API 的全部正式组织写入口，
   包括 Internal 注册、资料、状态及删除；取得并保存控制面停流读回与在途请求 drain 证据。
   停流按实际部署入口实施，不依赖请求时自动覆盖率校验。
2. 停止并 drain 旧组织发布任务和其他组织 publisher，固定匹配当前 schema 的构建器。
   保持读取与写入关闭，启动该版本的受控 `organization-search` consumer；不得混跑不兼容 writer。
3. 执行全量 backfill。等待全部源变化展开、全部源组织（包括已删除组织）发布当前文档或删除墓碑，
   必要时运行 repair 并重复排空。`enqueued`、几个样本或队列为空不能代替完成。
4. 另起 `organization-search:verify`。它在同一个一致只读快照中核对覆盖、schema、严格结构与完整源路径、
   源事实及删除状态、处理版本、完成凭据和全部持久工作。必须完整报告 `status: passed` 且退出 0。
5. 保持组织搜索公共流量与非本轮组织写入关闭，核对当前 runtime readiness，仅为指定操作者和受控组织临时开放 smoke 所需正式入口，
   独立读回受限状态。验证新建、祖先改名、状态、删除的最终文档和新 DSL 完整响应，
   以及组织详情、用户 DSL 和已退役搜索入口的适用 smoke。若无法限制访问，使用隔离入口，不提前恢复公共流量。
   测试对象在 User Profile 等读模型中的预期连带变化单独记录，其他非目标状态须符合维护前基线。
6. 关闭临时入口并排空其在途请求，等待 smoke 写入与清理产生的全部源变化、dirty 和文档发布收敛，
   按需 repair，再独立执行完整 `organization-search:verify`，必须 `status: passed` 且退出 0。
   若测试触发 User Profile dirty，还须等待其正常发布并按[Profile 维护](user-profile-maintenance.md)核对适用的恢复状态；
   不因此变更 Profile schema 或要求两个读模型共同升级。
   首轮核验不证明 smoke 后状态；任何后续写入或修复都要求再次排空、收敛并完整核验。
7. 全部条件满足后由负责人逐项恢复组织写入与新 DSL，读回控制面，并观察查询失败、Worker failures 和两阶段积压。
   保存候选、资源身份、时间、实际命令、退出码、聚合报告及停流/放流读回；避免保存凭据或文档敏感原文。

首次构建与不兼容升级均只发布单一当前 schema，不允许调用方选择版本、跨 schema 双读或 fallback。
维护期间正常查询的缺行和旧 schema 行仍只被过滤；线上没有“覆盖尚未齐全就整体 503”的新增门禁。
组织详情继续读取既有源事实；已退役搜索入口的范围见 [ADR-0043](../adr/0043-retire-public-and-legacy-internal-directory-search.md)。
User Profile 版本、发布、恢复及账号访问保护各自拥有其维护窗口。

## 独立全量只读核验

`organization-search:verify` 在同一个一致只读事务中完整读取源组织、全部发布记录（含删除墓碑）、
dirty 与源变化事件，并重建闭包和祖先事实，不分批提交；一致快照与发布存储规则见
[Organization Search publication schema](../architecture/contracts-and-database.md#organization-search-publication-schema)。

核验覆盖全量组织、当前 schema、严格文档与层级路径、源事实及删除状态、发布版本与 processed dirty 版本、
两阶段完成凭据、源变化登记的重建请求是否履行，以及无源对象的孤立记录。
历史 processed 事件可以保留较早处理版本，但不能指向未完成的更高版本。
缺行、旧 schema、结构或源路径损坏、事实差异、未完成工作与凭据异常均报告 `failed`。
报告按稳定分类列出完整、排序后的 Organization ID 和源变化 UUID，不采样。

核验不修复源事实、不生成文档、不标记工作或入队。完整报告 `status: passed` 且退出 0 才满足数据门禁，
`failed` 对应退出 1；数据库执行失败、deadline、中断或资源关闭失败也非零退出。
不能用 `enqueued`、队列为空、成功样本、单个 batch 或未完成的扫描代替完整核验。
在线查询不执行这项门禁，仍按功能契约过滤缺行和非当前 schema。

## 失败与恢复责任

核验 `failed`、执行错误、超时、中断、关闭失败、报告不完整或 smoke 失败时，继续保持维护。
核验分类与完成条件见[独立全量只读核验](#独立全量只读核验)。
smoke 失败先关闭临时入口并排空；放流任一步失败、超时或状态未知，立即停止后续开放，按
[放流与人工恢复责任](unified-session-maintenance.md#放流与人工恢复责任)关闭已开放或状态不确定的入口，
独立确认关闭并排空后再修复和重验。

修复依赖后经普通 repair/publication 收敛；源完整性异常由负责人依据真实业务与审计记录批准修正，
核验不生成修复 SQL，也不自动修改源事实。升级或派生文档整体损坏时使用匹配构建器重新全量 backfill。
修复后重新执行完整 verify 及失效 smoke，不能只重跑失败 batch 后放流。
无法恢复时保留备份、固定候选和失败记录，保持停流，由发布负责人恢复匹配制品与数据；
不要通过删除 migration journal、混跑旧 reader/writer 或手改 JSONB 绕过门禁。
