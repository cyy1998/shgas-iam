# Client Runtime Snapshot 恢复手册

Type: runbook

Status: Current

Last verified: 2026-09-07

Next review: 2026-10-31

本文用于当前 Snapshot 部署在 Redis backup restore 后恢复 Client Runtime。维护 owner 必须保持协议停流，执行全量 repair、
独立 verify 与 mutation/acquisition smoke，最后确认放流。命令不会自动停止实例、冻结写入或控制路由；真实环境操作须有维护者
对窗口、候选和目标环境的授权。本文不证明任何环境已经恢复或完成首次切换。

## 适用范围与 owner

[ADR-0021](../adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) 与
[ADR-0022](../adr/0022-adopt-snapshot-consistency-for-client-traffic-gate.md) 定义 Snapshot 一致性，
[ADR-0023](../adr/0023-retire-legacy-maintenance-support.md) 收窄当前恢复支持范围。

- PostgreSQL 拥有 Client 配置事实。Redis backup 可恢复出格式有效、彼此匹配但过时的 control/payload，因此不能等待 TTL、
  lazy bootstrap 或逐 Client 访问自然收敛，也不能用 targeted repair 代替 restore 后的全量恢复。
- `@iam/api-core` 的 maintenance inventory 只拥有当前 Snapshot namespace，包括共享 control 与三类 payload。
  namespace 中的 `v1` 是当前存储版本。七条旧 OIDC、Custom SSO 与 Traffic Gate pattern 已退出 repair/verify；旧 key
  不会被这些命令清理，其残留不会使 verify 失败。成功报告不能证明旧 namespace 已清空。
- Worker 拥有 Redis-only repair 与 scan-only verify。它们不读取 PostgreSQL、不重放业务 mutation、不推进协议配置版本，
  也不撤销 Session/artifact 或轮换 Secret。Redis 登录状态、Subject Access、Facts 与队列的恢复由各自 owner 负责，
  本流程的成功不代表整个 Redis 服务的业务状态均已恢复；入口见[系统架构](../architecture/system-architecture.md)。
- 旧部署或旧备份的升级迁移须另行固定适用候选、数据范围和操作边界；来源代际无法确认时先保持停流并完成迁移评估。
  不得未经评估将旧版工具直接用于新环境，也不得混跑旧 reader/writer。
  [首次 hard-cutover 手册](client-runtime-snapshot-hard-cutover.md)保留当时的清理、PONR 与发布证据合同，仅作历史版本参考。

## 窗口前准备

维护 owner 固定 API、Admin API、OIDC Provider、Worker 四个 candidate digest，确认它们使用当前 Snapshot protocol；记录
Redis 安全环境 identity、备份来源代际、恢复时间、PostgreSQL 权威来源、操作 owner、窗口以及相关验证结果引用。
凭据与连接配置通过受控环境提供，不写入记录。Worker 使用 `IAM_WORKER_REDIS_HOST`、`IAM_WORKER_REDIS_PORT`、
`IAM_WORKER_REDIS_DB` 与可选 `IAM_WORKER_REDIS_PASSWORD`；正式维护只通过下列 owner commands。

候选发生变更时按受影响范围重新验证。完整候选验证由 release owner 逐项调用，不提供 feature-specific root runner：

```bash
pnpm verify # 包含 Collection Guard
pnpm --filter @iam/api-core test:integration:component
IAM_API_CORE_TEST_REDIS_URL=<namespace-isolated-url> \
  pnpm --filter @iam/api-core client-runtime:hard-cutover-redis
pnpm --filter @iam/api test:integration:component
pnpm --filter @iam/oidc-provider test:integration:component
pnpm --filter @iam/admin-api test:integration:component
IAM_ADMIN_API_TEST_DATABASE_URL=<dedicated-url> \
  pnpm --filter @iam/admin-api test:integration:postgres
IAM_ADMIN_API_TEST_DATABASE_URL=<dedicated-url> \
IAM_API_CORE_TEST_REDIS_URL=<namespace-isolated-url> \
  pnpm --filter @iam/admin-api client-runtime:hard-cutover-rehearsal
pnpm --filter @iam/worker test:integration:component
pnpm --filter @iam/worker test:integration:process
IAM_WORKER_TEST_REDIS_URL=<owner-specific-url> \
  pnpm --filter @iam/worker test:integration:redis
pnpm test:e2e
```

这些是测试环境命令，调用方按[测试架构](../architecture/testing-architecture.md)提供专用、非 production 资源并负责精确清理。
API Core full restore contract 使用现有 `IAM_API_CORE_TEST_REDIS_URL`；Worker 使用 `IAM_WORKER_TEST_REDIS_URL`。测试先证明当前 owner
inventory 为空，只创建并精确清理本次登记的 fixture；七条旧 pattern 对应的 key 是用于证明保留行为的 non-owner fixture，
不因测试 teardown 删除它们而成为维护命令的责任。禁止 `FLUSHDB`/`FLUSHALL`。

保留的脚本名含 `hard-cutover`，不表示其当前报告仍覆盖旧 namespace。Component/Redis 证明 acquisition、late refill、
bootstrap/CAS、当前 namespace 清空、部分失败重跑与 non-owner 保留；Worker Process/Redis 证明 CLI、production wiring、
独立 scan-only verify、safe report 与退出码。Admin rehearsal 通过真实 mutation、required invalidation 与三类公开 Reader
证明 Maintenance 和恢复事实，Adapter contracts 验证 Maintenance 与 acquisition unavailable 的不同映射。
Full-system E2E 证明候选公开功能，均不替代目标环境的停流、drain、restore 或放流证据。

## 恢复顺序

### 1. 停流、冻结与 drain

在恢复备份前关闭 Custom SSO/OIDC client-scoped 协议流量，并冻结全部 Client mutation、client-protocol mutation、相关
one-shot writer 与仓库外 writer。若发现备份已被恢复，立即关闭这些入口；禁止继续依赖缓存读请求。
Maintenance 状态不能替代协议停流或 mutation freeze。

清点并停止、drain API、Admin API、OIDC Provider、Worker 中可能读取或写入 Runtime Snapshot 的实例与任务，包含 job、cron
和人工 one-shot owner。保存各控制面独立 read-back 与实例清单，证明 repair/verify 期间没有请求、后台任务或在途 source load
重新填充 namespace；HTTP health 或请求量为零本身不够。禁止旧代实例与工具加入恢复流程。

由相应基础设施 owner 完成备份恢复并确认目标 Redis identity。只启动固定当前候选的必要维护进程；repair/verify 前的启动预检
不得 acquisition 或写入 Runtime namespace。以上事实不能由 `--protocol-traffic-stopped` 参数自动证明。

### 2. Full repair

记录实际开始时间，由固定 Worker candidate 对目标 Redis 执行：

```bash
pnpm --filter @iam/worker client-runtime:repair -- --all --protocol-traffic-stopped
```

全量与 `--client-code` 模式互斥；缺少显式停流确认时在连接 Redis 前失败。命令以 `SCAN` 与分批 `UNLINK` 清空当前
Module-owned namespace，允许部分完成后安全重跑。保存 safe report、退出码和操作时间；只有 `status=completed` 且退出 0
才进入下一步。失败、中断、超时或资源关闭失败均保持所有入口冻结，修复原因后从头重跑；不能按已删除数量局部放流。

### 3. 独立 verify

保持没有 reader/writer acquisition，另起一次 Worker process：

```bash
pnpm --filter @iam/worker client-runtime:verify -- --all --protocol-traffic-stopped
```

Verifier 只有 scan capability，不执行 eval、unlink 或 repair。必须重新完整扫描当前 owner inventory，只有扫描成功、目标 key
为零、`status=completed` 且退出 0 才通过。计数仅用于诊断。失败时保持冻结，调查扫描错误或重新填充来源，然后重新执行
full repair 与独立 verify。两条 full command 默认各有 5 分钟 deadline；受控演练可用正整数
`IAM_WORKER_CLIENT_RUNTIME_MAINTENANCE_TIMEOUT_MS` 收紧，超时仍须安全失败并关闭资源。

### 4. 当前候选 smoke

确认部署只包含固定的当前候选，继续保持全局路由和 mutation freeze，只为预先登记的 canary Client 开放受控内部路径：

1. 分别 acquisition Traffic Gate、OIDC 与 Custom SSO Snapshot，证明它们从 PostgreSQL bootstrap 并返回预期 present/absent。
2. 通过正式 Admin 路径执行可恢复 mutation，确认 required invalidation 成功，再由三类 Reader 取得 mutation 后事实。
3. 覆盖明确 Maintenance 与无法取得可信 Snapshot 的 fail-closed 行为，分别核对其协议映射。
4. 恢复 canary 业务事实，再 acquisition 三类 Snapshot 并保存对外行为、request/trace reference 与安全事件引用。

不得以 raw Redis key、epoch/generation、payload 或临时 debug endpoint 作为 smoke 证据。Smoke 会正常重新填充缓存，
此前的 zero-key verify 证明的是停流 reset 完成，不要求 smoke 后仍为零。Smoke 失败则重新关闭 canary 路径，保持冻结，
修复当前候选后从 full repair、独立 verify 和完整 smoke 重新执行；不得启动旧 reader/writer。

### 5. 放流与观察

维护 owner 逐项核对固定候选、备份来源/恢复、停流与 drain、repair、verify、smoke 证据，并确认其他受影响状态的恢复 owner
已经满足各自放流条件。协调恢复协议路由、Client mutation、client-protocol mutation 与 one-shot writer，各控制面操作后以
独立 read-back 确认生效且只指向固定当前候选。记录操作、结果与引用；不能用一个 HTTP 200 或总括时间戳代替各入口的证据。

任何放流操作失败、超时、中断或状态不明时，停止后续放流，查询真实状态并关闭已打开或不确定的入口。所有入口确认关闭后，
修复原因并重新核对前置 gate，才可开启新的放流尝试；保留此前失败记录，不能把错误返回当作入口仍关闭。

观察 `client_runtime_snapshot.operation.observed` 与 app-level required invalidation failure。发现恢复错误时保持或重新关闭
入口，修复当前候选；不得通过回启旧代恢复服务。普通单 Client mutation 传播失败可以使用
`pnpm --filter @iam/worker client-runtime:repair -- --client-code <clientCode>`，但它不替代 Redis restore 的上述全量流程。

## 完成记录

保存四 app digest、owner 与窗口、Redis 安全 identity、备份代际与恢复证据、逐项测试结果、freeze/drain 清单、repair/verify
报告及退出码、canary smoke、各放流控制面的独立 read-back、失败尝试与 reconciliation、观察结果和未解决事项 owner。
记录不包含 Redis URL、credential、key、control、payload、Secret 或原始错误；动态值不得进入事件名或 Loki label。

完整扫描的当前 namespace 为零只证明 verify 的范围，不证明旧 namespace 已清空、登录状态已恢复、生产协议可用或历史首次
hard-cutover 已完成。来源代际或恢复范围超出本手册时保持停流，交由独立迁移方案处理。
