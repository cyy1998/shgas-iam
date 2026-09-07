# Client Runtime Snapshot hard-cutover 与验收手册

Type: runbook

Status: Historical

Last verified: 2026-09-03

Next review: n/a

> 本文是首次旧代切换的历史版本参考，正文操作与证据合同保留当时语境，不代表当前候选的命令支持范围，也不证明任何环境已完成切换。
> 按 [ADR-0023](../adr/0023-retire-legacy-maintenance-support.md)，当前 full repair/verify 只拥有当前 Snapshot namespace，
> 不再清理或验证本文所列旧 Runtime keys。当前日常恢复须使用[恢复手册](client-runtime-snapshot-restore.md)。
> 旧部署或旧备份升级迁移须另行固定适用候选与操作边界，不能未经评估将本文旧版工具用于新环境，也不得混跑旧 reader/writer。

本手册用于首次激活 ADR-0021 与 ADR-0022 定义的 Client Runtime Snapshot cache protocol，修复 issue #27 的 OIDC late-refill，并把 OIDC、Custom SSO 与 Client Traffic Gate 切换到一份 per-Client Redis control。它只编排 owner command、人工发布动作与可执行 smoke，不会自动 freeze、部署、drain、切流、访问 production 或创建 production receipt；真实切换必须由维护者另行授权。

Client Runtime Snapshot Module、三类 Adapter、Admin mutation wrapper、Worker targeted/full repair、独立 verify 与
对应测试通道均已落地。本手册现在是首次激活的可执行合同，但 readiness 完成不构成 production 操作授权；没有维护者对具体
窗口、候选与目标环境的单独授权时，不得执行 freeze、部署、drain、PONR receipt、namespace reset 或切流。

## 不变量与禁止事项

- PostgreSQL 不保存 cache revision；本次没有 DDL 或数据 migration，发布记录必须写 `migration: not-applicable`。
- 旧版与新版 reader/writer 不能在开放 Client mutation 时混跑。Maintenance 不是 mutation freeze，也不能替代协议停流。
- 全部 Client mutation、client-protocol mutation、相关 one-shot writer、Custom SSO 与 OIDC 协议流量必须在 namespace reset 前保持关闭。
- 旧 API、Admin API、OIDC Provider、Worker 与仓库外同代 writer 必须全部 drain；不得只根据健康检查推断旧实例已经退出。
- 新 envelope 只写入版本化 namespace，不写 legacy key；正式 repair/verify 不允许使用裸 Redis 命令、`FLUSHDB` 或 `FLUSHALL`。
- PONR receipt 是唯一不可逆决策边界；它必须在旧代 drain、candidate preflight 通过且 namespace reset 尚未开始时记录。receipt
  一经记录就不得启动旧 reader、writer 或 one-shot owner，只能保持停流并 forward-fix 新代。
- repair、verify、release receipt 与业务 smoke 是彼此独立的 gate，任何一个成功都不能替代其他 gate。
- Redis backup restore 在任何时间发生后，都必须先关闭协议流量，再执行本手册的全量 repair、verify 与 smoke；不得等待 TTL 或访问自然收敛。

## Owner 与命令合同

| 能力 | Owner | 合同 |
|---|---|---|
| shared control、三类 payload、bootstrap、CAS、namespace inventory、repair/verify | `@iam/api-core` | deep Module 隐藏 key、Lua、epoch/generation 与扫描实现 |
| Client mutation ordering 与 required invalidation | `admin-api` | app-local target-bound mutation wrapper |
| 单 Client/full repair 与 full verify CLI | `worker` | Redis-only command composition；结构化 safe report；失败非零退出 |
| OIDC/Custom SSO/Traffic Gate acquisition smoke | 对应 runtime app | 只通过公开 runtime 行为验证，不读取 control token 或原始 key |
| freeze、drain、PONR receipt、namespace reset、部署与切流 | release owner | 人工编排并保存证据；应用不自动操作 production control plane |

Worker 已提供两个独立入口，package script 与参数固定为：

```bash
pnpm --filter @iam/worker client-runtime:repair -- --client-code <clientCode>
pnpm --filter @iam/worker client-runtime:repair -- --all --protocol-traffic-stopped
pnpm --filter @iam/worker client-runtime:verify -- --all --protocol-traffic-stopped
```

`repair` 的单 Client 与全量模式互斥。全量 repair 使用 `SCAN` 与分批 `UNLINK` 清空 Module-owned versioned namespace 和 legacy Runtime keys；允许失败后从头安全重跑。`verify` 必须重新完成独立全扫描，并只在目标 key inventory 为零时通过。两者都不得读取 PostgreSQL、调用 ClientService、推进协议配置版本、撤销 Session/artifact 或轮换 Secret。

## 发布前候选与证据

发布 owner 在窗口开始前固定一份不可变候选记录：

```yaml
issue: 27
migration: not-applicable
releaseOwner: <name>
candidate:
  api: <image-or-commit-digest>
  adminApi: <image-or-commit-digest>
  oidcProvider: <image-or-commit-digest>
  worker: <image-or-commit-digest>
candidateVerification:
  commands: <owner-command-result references>
  status: <passed>
  completedAt: <immutable timestamp>
  evidence: <reference>
candidateRevisions: []
redisTarget: <safe-environment-identity>
freeze:
  protocolTrafficClosedEvidence: <reference>
  clientMutationFreezeEvidence: <reference>
  clientProtocolMutationFreezeEvidence: <reference>
  oneShotWriterFreezeEvidence: <reference>
drain:
  oldRuntimeInventory: <reference>
  oldApiEvidence: <reference>
  oldAdminApiEvidence: <reference>
  oldOidcProviderEvidence: <reference>
  oldWorkerEvidence: <reference>
  externalWriterEvidence: <reference>
pointOfNoReturn:
  at: null
  owner: null
  evidence: null
namespaceResetStartedAt: null
namespaceResetOwner: null
namespaceResetEvidence: null
repair:
  status: null
  exitCode: null
  report: null
verify:
  status: null
  exitCode: null
  report: null
smoke:
  initialThreeSnapshots: null
  mutation: null
  postMutationThreeSnapshots: null
  maintenanceOutcome: null
  acquisitionUnavailableOutcome: null
  restoredThreeSnapshots: null
  evidence: null
reopenEvents: []
observation:
  boundedEventSummary: null
  requiredInvalidationFailures: null
```

`reopenEvents` 初始为空。恢复生命周期只追加事件，不更新既有行；每个事件使用下列结构：

```yaml
eventId: <monotonic safe identifier>
attemptId: <monotonic safe identifier>
at: <immutable timestamp>
type: <attempt-started|gate-open-intent|gate-open-confirmed|gate-not-open-confirmed|gate-open-failed-or-unknown|gate-closed-confirmed|gate-close-failed-or-unknown|attempt-failed|attempt-completed>
gate: <protocol-routes|client-mutation|client-protocol-mutation|one-shot-writer-or-null>
intentEventId: <reference-or-null>
resultEventId: <reference-or-null>
routeInventory: <protocol-routes-open-reference-or-null>
evidence: <reference>
reasonReference: <safe-reference-or-null>
```

`type` 的 gate 生命周期值固定为 `gate-open-intent`、`gate-open-confirmed`、`gate-not-open-confirmed`、
`gate-open-failed-or-unknown`、`gate-closed-confirmed` 与 `gate-close-failed-or-unknown`；另外保留 `attempt-started`、
`attempt-failed` 与 `attempt-completed`。每个 attempt 内每种 gate 最多出现一个 `gate-open-intent`，而且 release owner 必须先持久化
intent，才能调用对应 control plane。没有 intent 的 gate 是 `not-attempted`，不能因为调用没有返回就写成 not-attempted。

每个 open intent 的第一次结果必须通过 `intentEventId` 指回它，并且只能是以下三者之一：

- `gate-open-confirmed`：control-plane 调用后又以独立 read-back 证明 gate 已指向固定 candidate；API 返回成功本身不够。
- `gate-not-open-confirmed`：调用失败或未生效后，通过实际状态 reconciliation 证明 gate 始终安全关闭；错误返回本身不够。
- `gate-open-failed-or-unknown`：timeout、transport error、矛盾 read-back 或任何不能证明 opened/closed 的结果。进程中断导致 intent
  没有结果事件时，在恢复控制后必须先追加该 unknown 事件及恢复证据；追加前同样按 unknown 阻塞，不得补写 confirmed 结果猜测。

任一 gate 未取得 `gate-open-confirmed`，或 attempt 在 completed 前中断时，立即停止发起后续 gate intent，并且只能按以下全局唯一顺序
关闭该 attempt：

1. 按 `gate-open-intent.eventId` 递增顺序，为**所有**尚无第一次结果的 intent 追加 `gate-open-failed-or-unknown`；已有三态结果的
   intent 不追加第二个结果。
2. 全部 intent 都有第一次结果后，追加唯一 `attempt-failed`；已存在时不重复追加。
3. `attempt-failed` 之后才开始 reconciliation/close。只有 `gate-not-open-confirmed` 可直接证明安全关闭；`gate-open-confirmed` 与
   `gate-open-failed-or-unknown` 都必须查询真实 control-plane 状态、执行必要的 close，并以 `gate-closed-confirmed` 及独立 read-back
   evidence 结束。close 或 reconciliation 不能确认时追加 `gate-close-failed-or-unknown` 并保持发布阻塞。

close 结果通过 `intentEventId` 指向原 intent，并用 `resultEventId` 指向已存在的 open 结果。任一 intent 尚未达到
`gate-not-open-confirmed` 或 `gate-closed-confirmed`，都禁止创建新 attempt。恢复一个已有 `attempt-started`、但既无
`attempt-failed` 也无 `attempt-completed` 的中断 attempt 时，不得从中断点继续发起 intent；必须完整执行上述 1→2→3 顺序，
不得先写 `attempt-failed` 或先 close 再补 unknown result。

因此“不得重复 reopen”限定为同一 attempt 内同一 gate 只有一个 intent；跨 attempt 再次打开只允许在上一失败 attempt 的所有 intent
均已确认安全关闭、修复 control plane 并复核全部前置 gate 后发生。gate 的当前状态从 read-back confirmed 事件推导；intent、错误返回、
timeout 或 attempt status 都不能单独证明开闭状态。

`attempt-completed` 只能在同一 attempt 对四种 gate 各有唯一 `gate-open-intent` 与引用该 intent 的唯一
`gate-open-confirmed`、没有 failed/not-open/unknown/closed 事件且所有前置 gate 仍有效时追加。只有 `protocol-routes` 的 confirmed-open
事件必须携带 `routeInventory`，三个 mutation/writer gate 各自携带独立 evidence。同一 attempt 不得同时 failed 与 completed；完成后
不得再创建 reopen attempt。先前失败 attempt、reconciliation、close 及其证据永久保留。

记录只能保存安全 identity、digest、时间、owner 与 report reference，不得包含 Redis URL、credential、payload、Secret、epoch/generation 或原始错误。
四个 candidate digest、逐 owner command 的结果引用、`migration: not-applicable`、freeze/drain、PONR receipt、namespace reset、
repair/verify 的 status 与退出码、完整 smoke 和最终 completed reopen attempt 都是独立必填证据；不能用一个总括的“passed”替代。
`pointOfNoReturn.at` 是唯一不可逆决策边界，必须严格早于只记录实际 reset 的 `namespaceResetStartedAt`。模板中的 `null` 表示该人工
阶段尚未执行，不得预填为通过。

候选记录是 append-only ledger。PONR 前更换任一 app digest 时，取消当前记录并从 candidate verification 开始一份新记录；PONR
后若 forward-fix 必须生成新 candidate，则在 `candidateRevisions` 追加完整 revision，不得覆写原 candidate、既有测试证据或 PONR
receipt。每个 revision 必须记录新的四 app digest、完整 owner test matrix 与 Full-system E2E 证据，重新 drain 所有旧 revision
实例和外部 writer，并在 namespace repair/verify/smoke 前证明当前部署只包含该 revision。缺少任一重验或再次 drain 证据时不得继续。

## 实现候选验证

进入维护窗口前，发布平台或 release owner 必须针对同一固定候选，从专用、非 production 测试资源逐项运行并记录下列 owner
commands。仓库不提供 feature-specific 聚合脚本；各命令的退出状态与输出引用必须独立保存：

```bash
pnpm verify
pnpm check:test-collection

pnpm --filter @iam/api-core test:integration:component
IAM_API_CORE_TEST_REDIS_URL=<namespace-isolated-url> \
IAM_API_CORE_CLEANUP_TEST_REDIS_URL=<exclusive-disposable-url> \
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

完整证据矩阵为：

1. `pnpm verify` 与 `pnpm check:test-collection`，覆盖 lint、文档/env/architecture/test collection guards、全仓 typecheck、
   Unit 与 build。
2. `@iam/api-core` Component 后紧跟专用的 `client-runtime:hard-cutover-redis` 真实 Redis contract：普通 Snapshot contract 使用
   `IAM_API_CORE_TEST_REDIS_URL`，会扫描并删除全部 Module-owned versioned/legacy inventory 的 full restore contract 只使用调用方显式
   提供、初始为空且可销毁的 `IAM_API_CORE_CLEANUP_TEST_REDIS_URL`，不比较或推断其他环境的 host、port 或 logical DB identity；覆盖 late refill、CAS
   conflict/ABA、bootstrap winner、corrupt payload、受控
   source fact 变更后 Module 三类 Reader 重取新事实、targeted/full repair、partial failure rerun 和 full verify。
3. API、OIDC Provider 与 API Core app-local Component contract：Custom SSO、OIDC 与 Traffic Gate Adapter 的
   present/absent/Maintenance/unavailable 映射，以及 OIDC active-version lookup 复用 Snapshot acquisition。
4. Admin API Component、PostgreSQL contract 与可重复 composition rehearsal：已知 code 和 legacy ID 两种 target binding、confirmed
   rollback、unknown COMMIT conservative invalidation、required after-commit failure；rehearsal 从固定前置事实出发，通过真实 Admin
   target-bound mutation 提交 PostgreSQL、required invalidation 更新真实 Redis，再由 OIDC、Custom SSO 与 Traffic Gate 公开 Reader
   重新 acquisition 验证 Maintenance 事实；随后确定性注入一次可信 Snapshot acquisition failure，并分别断言 OIDC
   `temporarily_unavailable`、Custom SSO retryable unavailable 与 Traffic Gate `read-failed`，证明 unavailable 与 Maintenance
   是不同公开业务结果；最后通过相同 Admin 路径恢复并再次取得原始事实。
5. Worker Component、Process 与 owner-specific Redis Integration：参数互斥、traffic-stopped confirmation、production Redis wiring、
   safe report、退出码和 non-owner sentinel 保留。
6. 固定候选新代的 Full-system E2E。它只能证明候选公开功能，不能证明 production 已停流、旧实例已 drain、namespace reset
   已记录或 namespace 已 reset。

按维护者对 #69 的决定，Worker targeted/full repair 与 verify 的 Redis Integration 沿用 #68 的 owner-specific
`IAM_WORKER_TEST_REDIS_URL`；测试 harness 不跨可见环境推断 hostname、port 或 logical DB identity，只登记并精确清理本次
fixture，同时保留 non-owner sentinel 证明。

所有真实 I/O 测试先普通 `await` 完成操作，再做同步断言；Redis 测试不得接触共享 runtime identity。
composition rehearsal 的可重复入口是
`pnpm --filter @iam/admin-api client-runtime:hard-cutover-rehearsal`；它只创建并删除本次专属 PostgreSQL schema 与
Redis owner-marker keys，显式保留 non-owner sentinel，再恢复 canary 业务事实。候选证据保存命令、退出状态与测试输出引用，
不得把临时 payload、Redis key 或 credential 写入 release receipt。
这些测试命令不会创建或清理调用方提供的 PostgreSQL/Redis；调用方必须按测试架构提供专用资源并在完成或失败后精确清理。
Full-system E2E 仍由自身 exact-project lifecycle 创建、诊断并清理 Docker 资源。

## Hard-cutover 阶段

### 1. Freeze 与停流

关闭并验证以下入口：

- Custom SSO 与 OIDC client-scoped 在线协议流量；
- 全部公开 Client generic/OIDC/Custom SSO/Traffic Gate mutation；
- `client-protocol` mutation、epoch/cutover、repair/backfill 及其他可能写 Client 或 legacy/new Runtime key 的 one-shot command；
- 仓库外由相同数据库或 Redis identity 驱动的 Client writer。

保持 discovery、JWKS、health 等不读取 Client Runtime Snapshot 的公共端点不影响本 gate，但不能用这些端点的健康状态证明协议流量已经关闭。把每项 control-plane 证据写入候选记录。

### 2. Drain 旧代

停止并 drain 全部旧 API、Admin API、OIDC Provider 与 Worker，清点 deployment、replica、job、cron 与人工 one-shot owner。证明没有旧进程仍能读取或写入 legacy/new Runtime namespace；只观察请求量为零或实例 health 不足以通过本 gate。

旧代完全 drain 后，启动固定的新代 candidate，但继续保持外部协议 route、Client mutation、client-protocol mutation 与 one-shot
writer 关闭。只执行不会取得 Client Runtime Snapshot 或写入 Runtime namespace 的 startup/configuration preflight。

### 3. 记录 point of no return

release owner 复核以下条件后，在 namespace reset 尚未开始时写入不可修改的 `pointOfNoReturn.at`、owner 与证据引用：

- `protocolTrafficClosedEvidence`、`clientMutationFreezeEvidence`、`clientProtocolMutationFreezeEvidence` 与
  `oneShotWriterFreezeEvidence` 四个独立 freeze 面均已记录并复核仍然生效；
- 旧 reader、writer 与 one-shot owner 已全部 drain；
- 四个 app 的 candidate digest 与预先固定记录一致；
- Redis target identity 已由 release owner 对照固定环境配置确认；
- repair、verify 与 smoke owner 在场并能保存 safe report。

receipt 写入前，可以在继续停流并证明 namespace reset 尚未开始的前提下放弃 candidate，按旧代既有 runbook 恢复。receipt
一经写入即越过唯一 PONR，即使 `namespaceResetStartedAt` 仍为空也只允许保持停流并 forward-fix 新代，不得整代或部分恢复旧版本。

### 4. Full repair

由固定 Worker candidate 对目标 Redis 执行：

```bash
pnpm --filter @iam/worker client-runtime:repair -- --all --protocol-traffic-stopped
```

release owner 在把下列已校验命令交给固定 Worker 执行的同一动作中写入 `namespaceResetStartedAt`、`namespaceResetOwner` 与
`namespaceResetEvidence`，只记录实际 reset 的开始；不得把它解释为第二个 PONR，也不得在缺少既有 `pointOfNoReturn` receipt 时启动命令。
保存完整 safe report 与退出码。非零退出、命令中断、扫描或 unlink 部分完成时，保持所有 freeze，不得按扫描数或删除数局部放流；修复原因后从头重跑幂等 full repair。

### 5. 独立 verify

repair 成功后另起一次 Worker process 执行：

```bash
pnpm --filter @iam/worker client-runtime:verify -- --all --protocol-traffic-stopped
```

verify 必须重新扫描 Module-owned versioned 与 legacy inventory；只有完整扫描成功、目标 key 为零且退出码为零时通过。保存 report。verify 不读取 PostgreSQL，也不证明流量控制、drain 或业务功能。

### 6. Mutation 与 acquisition smoke

继续保持全局 route 和 mutation freeze，只为预先登记的 canary Client 打开受控内部路径：

1. 分别取得 Traffic Gate、OIDC 与 Custom SSO Runtime Snapshot，证明三类 Adapter 能从 PostgreSQL bootstrap 并返回预期的 present/absent 结果。
2. 执行一次可恢复的 canary Client mutation，证明 Admin required invalidation 成功；随后三类 reader 都重新取得 mutation 后的 PostgreSQL 事实，不能返回 mutation 前 payload。
3. 覆盖一次明确 Maintenance Snapshot 与一次无法取得可信 Snapshot 的 fail-closed 映射，确认二者不混为同一业务错误。
4. 恢复 canary 业务事实，再次取得三类 Snapshot；保存对外行为、request/trace reference 和 safe structured event，不保存 payload 或 control 内容。

不得用 raw Redis key、epoch/generation 或临时 debug endpoint 作为 smoke 合同。smoke 失败时保持 freeze 并 forward-fix 新代；修复后重新执行 full repair、verify 与完整 smoke。

### 7. 一次性恢复

只有候选记录中的 freeze、drain、PONR receipt、namespace reset、repair、verify、mutation smoke 与 acquisition smoke
全部通过，release owner 才协调恢复 Client mutation、client-protocol mutation、one-shot writer 与 Custom SSO/OIDC 协议流量。
恢复不是灰度混跑旧代；所有 route 只能指向已固定的新代 digest。每个 gate 的 control-plane 调用前必须先保存唯一
`gate-open-intent`；最终 completed attempt 必须对四种 gate 各有且只有一个引用该 intent 的 `gate-open-confirmed`，并分别保存独立
read-back evidence。不能用 API 成功、protocol route inventory 或一个总括 timestamp 代替 mutation/writer gate 的 confirmed-open
证据。失败或 unknown attempt 的所有 intent 都确认安全关闭后，新 attempt 才能按事件规则再次打开它们。

恢复后观察稳定事件 `client_runtime_snapshot.operation.observed` 与 app-level required invalidation error。高频 observer 不记录 `clientCode`；低频处置日志可以记录 `clientCode` 普通字段，但任何动态值不得成为 event 或 Loki label。发现错误时继续 forward-fix，不启动旧代。

## 失败处理矩阵

| 失败时点 | 必须动作 | 禁止动作 |
|---|---|---|
| PONR receipt 写入前 | 保持 freeze；证明 namespace reset 未开始后可放弃 candidate，整代恢复旧版本 | 在旧新 writer 混跑时恢复 mutation |
| PONR receipt 写入后、reset 开始前 | 保持停流与 mutation freeze；原地修复，或按 append-only revision 规则完整重验并再次 drain 后继续 forward path | 覆写原 candidate/PONR receipt；缺少完整重验或再次 drain 就更换 candidate；启动任何旧 reader/writer/one-shot owner |
| PONR receipt 写入后 repair/verify 失败 | 保持停流与 mutation freeze；修复新代并重跑 full repair、verify | 启动旧 reader/writer；按删除计数局部放流 |
| PONR receipt 写入后 smoke 失败 | 保持 freeze；forward-fix 后从 full repair 开始重验 | 绕过 failed Adapter 或只开放某一种协议 |
| reopen 返回失败或明确未打开 | 停止新 intent；确认所有 intent 已有第一次结果后追加唯一 `attempt-failed`，再开始 reconciliation；`gate-not-open-confirmed` 可作为该 gate 的 closed 证据，其他已发起 intent 必须取得 `gate-closed-confirmed` | 把错误返回直接当作 closed；先 close 后补 failure ledger；继续发起后续 gate intent |
| reopen timeout、进程中断或结果 unknown | 停止新 intent；先按 intent eventId 顺序为所有无结果 intent 追加 `gate-open-failed-or-unknown`，再追加唯一 `attempt-failed`，最后 reconciliation/close；只有所有 intent 都取得 not-open/closed confirmed 后才可新 attempt | 把缺失结果当作 not-attempted；先写 attempt-failed 或先 close；在 reconciliation 未完成时重试 open/开始新 attempt |
| reopen reconciliation/close 失败 | 追加 `gate-close-failed-or-unknown`，保持新代与其他 gate freeze，人工修复并继续 reconciliation | 猜测 gate 已关闭；覆写旧事件；把入口路由回旧代 |
| 后续 Redis backup restore | 立即关闭协议流量；执行 full repair、verify、完整 smoke | 依赖 TTL、lazy bootstrap 或逐 Client repair 代替全量流程 |

## 发布完成记录

窗口结束前保存：

- 固定 candidate digest、逐 owner command 结果、append-only revision（如有）与 `migration: not-applicable`；
- `protocolTrafficClosedEvidence`、`clientMutationFreezeEvidence`、`clientProtocolMutationFreezeEvidence`、
  `oneShotWriterFreezeEvidence` 四个独立 freeze 证据，以及旧实例和 writer drain 证据；
- PONR receipt timestamp、owner 与证据，以及独立的 namespace reset 开始证据；
- repair/verify safe report、退出码与 Redis safe identity；
- canary mutation/acquisition smoke reference；
- 完整 append-only `reopenEvents`：最终 completed attempt 对 protocol route、Client mutation、client-protocol mutation 与 one-shot
  writer 各有且只有一个 intent 和 confirmed-open，分别带独立 read-back evidence，protocol route 另带 route inventory；所有先前
  failed/unknown attempt 的 intent 都以 confirmed-not-open 或后续 confirmed-closed 安全终止；
- 观察窗口内的 bounded event 汇总及所有 required invalidation failure；
- 未解决异常、后续 owner 与 deadline。

不得把一次成功的 Full-system E2E、空 Redis volume 启动、repair 删除数或 HTTP health 单独记录为 production hard-cutover 完成证据。
