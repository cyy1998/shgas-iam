# User Profile v3 单代硬切换维护窗口手册

Type: runbook

Status: Current

Last verified: 2026-08-22

Next review: 2026-10-31

本手册用于在受控维护窗口内，把全局 User Profile 从 v2 原地重建为 v3，并在完整数据门禁与 smoke 通过后一次性恢复
相关流量。它只说明维护者如何调用仓库现有 owner 命令、核对人工门禁和保存证据；不会自动执行 production deployment、
backfill、流量切换、数据库清理或其他 production mutation。每次真实执行都需要独立发布授权、环境变更单和当班负责人。

本流程只切换 User Profile Search Cutover，不切换 Client Protocol。不得运行 `client-protocol:epochs` 或
`client-protocol:artifacts`，不得推进 client epoch，也不得清理 Custom SSO/OIDC protocol artifact。需要进行 Client Protocol
切换时，必须另行使用 [Client Protocol V2 epoch 与 artifact 清理](client-protocol-v2-artifact-cutover.md)，并取得独立授权。

## 切换不变量

- User Profile 始终保持每个 User 一行，通过现有 `user_profile`、dirty、job 和 publication 路径原地重建；不创建 parallel
  generation、shadow table、active-generation selector、第二套 backfill 通道或调用方版本选择。
- 从第一条 v3 Profile 写入前开始 freeze，直到 dirty/job 全量收敛、两道 data gate、runtime readiness 和全部 smoke 同时通过后
  一次性恢复流量。不得让调用方观察部分 v2、部分 v3。
- Profile Detail、Search Document、Subject Facts、Internal direct DSL、Internal legacy adapter、Public adapter 和 Delegation
  基础搜索使用同一个固定 v3 candidate。窗口中更换 commit、image digest、配置或 Worker digest，必须取消当前 candidate 并从
  窗口前检查重新开始。
- `user-profile:backfill` 的 `enqueued` 只表示 job 已投递，不表示重建完成。队列暂时为空、抽样通过、部分 User 成功或人工确认
  都不能替代 dirty/job 收敛与全量门禁。
- 任一 gate、failed/stale dirty、损坏文档、版本或 freshness mismatch、Redis/Subject Facts mismatch、runtime readiness 或 smoke
  失败，都保持流量关闭。修复只能使用现有 repair/retry 与正式业务写入口，不能通过请求时 lazy migration、双读、逐 User
  fallback、手改 Profile JSON 或删除失败记录恢复服务。

## 角色与窗口前证据

窗口开始前明确 release owner，以及 PostgreSQL、Redis、Worker、API/Gateway traffic、业务写入和安全观察负责人。任一负责人
缺席、证据存储不可用、backup 未完成或失败恢复 owner 不明确时取消窗口。

发布记录在 freeze 前固定以下内容：

- candidate commit、API/Admin API/Worker/Gateway image digest、部署配置 digest 和目标环境；
- 当前生产只观察 v2 的版本证据，以及本次固定 v3 builder/Worker 的版本与 digest；
- PostgreSQL、Redis backup identity、创建时间、隔离恢复验证摘要与恢复负责人；
- 当前 dirty/job 状态聚合、failed/stale inventory 和最后一次正常 publication 时间；
- freeze owner、预计开始时间、业务读取与源事实写入的关闭方式、旧 v2 Worker 停止方式；
- request/trace correlation、受限原始诊断位置、聚合验收记录位置和一次性恢复流量的负责人。

证据只保存 candidate/digest、状态、聚合计数、时间、稳定 failure code、requestId/traceId 和受控 artifact 引用。不得保存 API key、
token、cookie、Subject Identifier、真实用户 PII、Redis key/payload、完整 Profile 文档、SQL row dump 或原始错误对象。

## Freeze 边界

### 必须关闭

- Internal User Detail、Internal direct DSL、Internal legacy search、Public search、Delegation search 及其他读取 User Profile 的业务入口；
- User、Employment、Organization、Position、Role、Privilege、Role Assignment、Organization Responsibility 等会改变 Profile 源事实的
  写入入口；
- 旧 v2 Profile/Subject Facts publisher、旧 Worker consumer 和任何旧版本 repair/backfill scheduler；
- 会在窗口内绕过固定 v3 candidate 写入 `user_profile`、dirty 或 Subject Facts 的人工脚本与临时任务。

仅把某个 client 置于 Maintenance 不能证明完整 freeze。traffic owner 必须证明所有 Profile 读取已关闭，业务 owner 必须证明全部
源事实写入已关闭，runtime owner 必须证明旧 writer/consumer 已停止。

### 可以继续

- health、readiness、metrics、logs、traces 和只读 monitoring；
- backup、隔离恢复核对和受限的只读聚合检查；
- 本手册列出的 migration 判断、v3 Worker、backfill、repair、data gate 和 smoke；
- 与本次 Profile 切换无关且不会产生 Profile 源事实写入的安全事件处置。

## 固定执行顺序

以下阶段不可跨越或并行。每一阶段只有在命令退出码、结构化 report 和人工 checklist 同时通过后才能进入下一阶段。

### Phase 1 — Freeze、backup 与 candidate 复核

1. 启用完整 freeze，记录业务读取停止、源事实写入停止和旧 v2 Worker 最后停止时间。
2. 复核 candidate commit、全部 runtime image/config digest、backup identity 与隔离恢复证据。
3. 再次核对尚未启动任何 v3 writer；窗口前请求与存储证据只观察 v2，不存在未知或混合 generation。
4. 记录当前 dirty/job 聚合与 failed/stale inventory。窗口开始时已有未解释失败项则停止，不得用全量 backfill 覆盖原因。

任一证据不匹配时取消窗口。此时不得启动 v3 Worker 或投递 backfill。

### Phase 2 — 条件式数据库 migration

User Profile v2→v3 本身使用现有 JSONB 与版本列，不要求数据库 DDL。发布负责人必须审查 candidate 的真实 migration 清单：

- 没有独立 DDL 时，在发布记录中写明 `migration: not-applicable`，不要为了版本号运行空 migration、生成占位 migration 或预建索引；
- candidate 因其他已批准物理结构确实包含 DDL 时，保持 freeze，使用该 migration 的正式数据库 owner 命令和独立 rollback 手册，
  记录 migration identity、退出码与结果；
- migration identity、review 或 rollback evidence 任一不完整时停止。不得把本手册解释为新增 DDL 的授权。

### Phase 3 — 启动固定 v3 Worker

只部署并启动 Phase 1 固定 digest 的 v3 Worker consumer。API、Gateway Profile routes 和源事实写入仍保持关闭。确认 Worker
readiness、PostgreSQL/Redis/queue 连接、module selection 和全局 Profile schema version 3 后再继续。

Worker 无法启动、digest 漂移、同时存在旧 consumer 或 module selection 不唯一时停止；不得先投递 backfill 再等待正确 Worker。

### Phase 4 — 投递全量 backfill

通过唯一版本无关入口为全部 User 登记 Backfill dirty fact，并投递既有 rebuild job：

```bash
pnpm --filter @iam/worker user-profile:backfill
```

记录命令退出码、`enqueued` 聚合、candidate 和开始/结束时间。`enqueued` 不是 readiness；命令成功后继续保持 freeze。

### Phase 5 — 等待 dirty/job 收敛

等待固定 v3 Worker 消费全部现有 job，并核对全部 User 的 dirty state 与 publication freshness。出现 failed/stale work 时，只在确认
根因和 owner 后使用版本无关 repair 入口：

```bash
pnpm --filter @iam/worker user-profile:repair
```

根据 report 重复有界 repair/等待，直到没有 pending、processing、failed 或 stale dirty，全部应存在的 Profile 都由当前 v3
candidate 发布，且 `sourceDirtyVersion` 与 processed dirty version 一致。不得以 BullMQ 队列为空、抽样 User 成功或只看最新日志
替代该收敛条件。

### Phase 6 — 运行两道全量 data gate

先 PostgreSQL，后 Redis/Subject Facts/Subject Access：

```bash
pnpm --filter @iam/worker user-profile:verify-postgres -- --batch-size <positive-integer>
pnpm --filter @iam/worker user-profile:verify-redis -- --batch-size <positive-integer>
```

两道 gate 都必须对完整 inventory 返回 `status=passed` 且退出码为 0。以下任一结果都阻断切换：

- Profile missing、schema version mismatch、损坏 Detail/Search Document/Subject Facts 或 source freshness mismatch；
- dirty missing、pending、processing、failed、stale 或 Profile/dirty version mismatch；
- Redis Subject Facts missing、invalid、旧版本或与 PostgreSQL/Subject Access 不一致；
- database/Redis unavailable、命令超时、report 不完整或 batch 中部分成功。

失败后保持 freeze，按 Phase 5 的正式 repair/retry 边界处理，并从 Phase 5 收敛检查和两道完整 gate 重新开始。不得只重跑失败 batch
后直接放流。

### Phase 7 — 固定 runtime readiness 与 smoke

先在隔离 exact-project 验证 candidate：

```bash
pnpm test:e2e
```

该命令使用空 PostgreSQL/Redis/etcd volumes、动态 Gateway port、真实 migrations、Gateway、Internal/Public API、Worker、Profile dirty
publication 和 Internal client authentication，验证代表性的 v2→v3 backfill、两道 gate、Search、Employment invalidation 与
diagnostics/cleanup。它不得连接 production endpoint、credential 或数据。

隔离 E2E 通过后，在目标环境继续保持 freeze，启动其余固定 candidate runtime 并确认 readiness。随后只对批准的 synthetic/canary
数据执行以下 smoke，逐项记录 HTTP status、稳定 error code、requestId/traceId 和聚合结果：

1. Internal direct DSL 返回完整 User Profile Detail；User scalar、同一 Employment 的 Organization+Position、Role/Privilege 数组、
   Responsibility target subtree 与 `not exists` 命中预期。
2. 合法无匹配 DSL 返回 `200` 空数组；Pause/Disable User 可见，显式 `status=Enable` 只返回 Enable User。
3. Internal legacy 与 Public adapter 保持各自既有响应形状，并与等价 canonical filter 返回同一用户集合。
4. `/internal/users/search-with-delegation` 先返回相同基础用户集合，再组合当时实时 Privilege Delegation；Delegation 不进入 Search
   Document。
5. Employment Pause 后经真实 invalidation 不再满足 Effective Employment 条件；如本窗口批准恢复/结束 canary，再分别确认 Resume
   后恢复、End 后再次失效。
6. Internal Detail、Internal/Public Search、Delegation 基础搜索与 Subject Facts 都只观察 v3；没有调用方版本选择、v2 fallback 或
   mixed result。

任一 runtime readiness 或 smoke 失败都保持 freeze。即使隔离 E2E、部分目标 smoke 或两道 gate 已通过，也不得恢复任何 Profile
业务流量；修复后至少重跑 Phase 6 两道 gate 与 Phase 7 全部目标 smoke。

### Phase 8 — 一次性恢复流量

只有以下条件同时满足，traffic owner 才能在一个受控动作中恢复全部 Profile 读取和源事实写入：

- Phase 5 dirty/job 完整收敛；
- Phase 6 两道 data gate 均通过；
- 全部固定 runtime readiness 通过，digest 与 Phase 1 candidate 一致；
- Phase 7 隔离 E2E 与全部目标 smoke 通过；
- PostgreSQL、Redis、Worker、API/Gateway、业务写入和安全观察负责人共同确认。

记录统一恢复时间。恢复后立即观察错误率、latency、dirty/job backlog、gate-compatible freshness、Redis mismatch 和 Worker failure；
发现异常时重新关闭全部相关流量，不能只关闭单一入口或让部分调用方继续读取。

## 失败处理矩阵

| 失败边界 | 允许动作 | 禁止动作 |
|---|---|---|
| 第一条 v3 Profile 写入前 | 取消窗口，保持或恢复原 v2 runtime；重新固定 candidate 后另开窗口 | 在 backup、freeze 或 candidate 不完整时继续 |
| 已投递 backfill、dirty/job 未收敛 | 保持 freeze；调查根因；使用既有 repair/retry；重跑完整收敛与两 gate | 以 `enqueued`、队列为空、抽样或部分成功放流 |
| PostgreSQL gate 失败 | 保持 freeze；修复 Profile/dirty/integrity；从 Phase 5 重跑 | 跳过到 Redis gate、手改损坏文档、隐藏失败 User |
| Redis gate 或 mismatch 失败 | 保持 freeze；从 PostgreSQL 权威事实和正式 publication/readiness 边界修复；重跑两 gate | 清库、删除 key、把 Redis miss 当作可接受 cache warm-up |
| runtime readiness 或 smoke 失败 | 保持 freeze；保存诊断；部署同一 candidate 的修复或取消窗口；重跑 gate/smoke | 用局部 smoke 覆盖失败、恢复部分入口、请求时 fallback |
| 放流后异常 | 重新关闭全部相关流量；保存证据；按固定 v3-compatible 修复后重跑收敛、gate、smoke | 恢复混合 v2/v3、启用 dual-read、清理 Client Protocol artifact |

本流程没有自动 rollback。第一条 v3 Profile 写入后，任何恢复方案都必须保持 Profile 数据、reader 与 Worker 的单一一致代际；不得
在同一 live inventory 上重新启动 v2 writer。

## 最终验收记录

发布记录至少包含：

- candidate commit、全部 runtime/config/Gateway digest、目标环境与 backup/隔离 restore 摘要；
- freeze 生效、旧 v2 Worker 停止、固定 v3 Worker 启动和一次性恢复流量的时间；
- migration `not-applicable`，或真实 DDL 的 migration identity、owner 命令和 rollback evidence；
- backfill `enqueued`、dirty/job 各状态聚合、repair 轮次、收敛时间与未决项为零的证据；
- PostgreSQL/Redis 两道 gate 的命令、退出码、`status`、安全聚合计数和失败/重跑记录；
- `pnpm test:e2e` descriptor、diagnostics index、exact-project cleanup 结果，以及目标 runtime readiness/smoke 摘要；
- Internal direct DSL、Internal/Public adapter、Delegation、Employment invalidation、Pause/Disable/status 与 v3-only observation 结果；
- 任一失败的阶段、稳定 failure code、影响范围、保持 freeze 的确认、修复 owner 和从哪一阶段重跑；
- `client-protocol:epochs`、`client-protocol:artifacts`、epoch mutation 和 protocol artifact cleanup 均未执行的确认；
- 尚未由本次窗口证明的 operational assumptions，例如真实数据规模、最长收敛时间、backup restore time 与 Linux/CI adoption。

完成记录只证明本次已获授权窗口的结果，不授权 deployment、下一次 backfill、下一次流量切换、push、Client Protocol 切换或任何
破坏性清理。
