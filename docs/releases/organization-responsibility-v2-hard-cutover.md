# Organization Responsibility V2 hard-cutover 与验收手册

Type: runbook

Status: Current

Last verified: 2026-08-21

Next review: 2026-10-31

本手册用于把 Organization Responsibility、Profile/Subject Facts、Internal、Custom SSO 与 OIDC 作为同一 strict V2
代际人工切换。它只编排仓库已有 owner 命令、人工发布动作和可执行 smoke；不会自动 freeze、备份、部署、切流、回滚或
访问 production。真实切换必须由维护者另行授权。

Client epoch 与 artifact 命令的详细输入、TTL 等待和失败恢复仍以
[Client Protocol V2 epoch 与 artifact 清理](client-protocol-v2-artifact-cutover.md) 为准。本手册覆盖完整窗口顺序，并取代
已标记 Superseded 的初代 Custom SSO Subject Projection 切换流程。

## 不变量与禁止事项

- 从第一条 V2 Profile 写入前开始 freeze，直到全部 post-start gate 和 smoke 通过后一次性放流。
- Profile Detail/Search/Subject Facts、Internal、Custom SSO 与 OIDC 必须使用同一个固定 V2 candidate；不得分 runtime
  canary、dual-read、fallback、alias 或现场转换 V1。
- 同一份 immutable Client Protocol manifest 必须覆盖全部非删除且已配置 Custom SSO/OIDC 的 client，并记录 digest。
- 第一次成功的 epoch mutation 是不可回到 V1 的边界。边界后不得恢复 V1 runtime、parser、cache、artifact 或 V1 backup。
- 不使用 Redis `SCAN` 推断完整性，不使用 wildcard delete、`FLUSHDB` 或 `FLUSHALL`，也不运行
  `session:cleanup-custom-sso-cutover` 或 `session:cleanup-legacy-keys`。
- 不把固定维护时长、近规模 rehearsal、抽样、operator confirmation 或“命令已启动”当作 release gate。
- 任一阶段失败都保持相关流量关闭并保存安全诊断。跨 PostgreSQL/Redis 的分阶段命令不宣称全局原子；失败阶段只从已证明的
  safe cursor 或同一 manifest forward 重跑，不能报告部分成功。
- 本流程不实现 automatic orchestrator、global cutover state、release lock、自动切流或自动 rollback。

## 角色、候选与证据

窗口开始前明确一名 release owner，以及 PostgreSQL、Redis、Gateway/traffic、IAM runtime、client owner 和安全观察负责人。
任一负责人缺席、证据存储不可用或 epoch 后 V2-compatible rollback owner 不明确时取消窗口。

发布记录必须在 freeze 前固定：

- candidate commit、所有 runtime image digest、migration version、Gateway manifest digest；
- V2 data rollback backup/version，以及只包含 V2 runtime/config 的 config rollback version；
- PostgreSQL 与 Redis backup identity、创建时间、隔离恢复验证结果和恢复负责人；
- Client Protocol manifest 的只读路径、digest、完整 inventory 和每个协议的 `ownerStatus=confirmed`；
- 旧 writer 最后停止时间、历史最大 TTL，以及所有兼容等待的起止证据；
- 本窗口的 request/trace correlation、受限原始日志位置和聚合验收记录位置。

证据只保存状态、计数、耗时、静态 failure code、requestId/traceId、candidate/digest 和批准的聚合值。不得保存 client secret、
API key、token、cookie、Authorization Code、Subject Identifier、Redis key/payload、SQL row dump、用户 PII 或完整错误对象。

## Freeze matrix

### 必须冻结

- Internal User Detail/DSL 等读取 V2 Profile 的业务流量；
- Custom SSO authorize、callback、token、UserInfo、Gateway authz 和 local-session renewal；
- OIDC authorize、interaction、Code→Token、UserInfo、refresh/renewal；
- IAM login 与 Principal Session renewal；
- User、Employment、Position、Organization、Organization Responsibility、Role Assignment、client 与 client protocol config 写入；
- 旧 Profile/Subject Facts publisher、旧 Worker consumer，以及会生成旧协议 artifact 的 runtime。

freeze 必须从第一条 V2 Profile backfill 写入前生效。仅把 client 置于 Maintenance 不等于完整 identity/config freeze；traffic
owner 必须证明上述入口均已关闭，runtime owner 必须证明旧 writer/consumer 已停止。

### 可以继续

- health、metrics、logs、traces 与只读 monitoring；
- OIDC Discovery、JWKS 和健康检查；
- Admin read、audit read 与受限证据查询；
- logout、revoke 和安全事件处置；
- 本手册明确列出的 migration、backfill、verify、epoch、cleanup、readiness 与 smoke 命令。

允许继续的操作不得隐式触发 identity/client-config mutation、Profile lazy rebuild、V1 read-through 或新协议 artifact 签发。

## 窗口前硬门禁

1. 部署包含当前 owner index 与 cleanup ref 写入能力的兼容 writer，并记录旧 API/OIDC writer 最后停止时间。
2. 完成 [Client Protocol V2 手册](client-protocol-v2-artifact-cutover.md) 要求的历史最大 TTL 等待；缺少历史 TTL 证据则推迟。
3. 在隔离环境验证 PostgreSQL 与 Redis backup 可以恢复，记录恢复耗时和验证摘要；不得在 production 原地试恢复。
4. 固定 V2 candidate、V2-compatible config rollback version 和 manifest digest。candidate 或 manifest 变化即取消本轮并重新审核。
5. 在隔离资源运行受影响测试与本手册“可执行 release smoke”；失败项不得以人工观察替代。

## 维护窗口固定顺序

下面阶段不可重排或并行跨越。每一阶段只有在退出码、结构化 report 和人工 checklist 同时通过后才能进入下一阶段。

### Phase 1 — Freeze、backup 与 candidate 复核

启用完整 freeze，记录生效时间并证明旧 publisher/worker 和旧协议 writer 已停止。随后复核 backup、隔离 restore evidence、
candidate/image/config rollback version 和 manifest digest。freeze 后继续等待
`PENDING_PROVIDER_SESSION_BINDING_TTL_SECONDS`（当前 60 秒）；不得通过修改 TTL 缩短等待。

任一证据不匹配时保持 freeze 并取消窗口；此时尚未写入 V2 Profile，可按批准的普通发布恢复路径退出。

### Phase 2 — 全量 Profile V2 backfill

从 `after-user-id=0` 开始，以稳定 cursor 覆盖全部 User，包括 disabled 与 soft-deleted User：

```bash
pnpm --filter @iam/worker profile-v2:backfill -- --batch-size <positive-integer> --after-user-id <safe-cursor>
```

每批只有在 PostgreSQL Profile/Dirty commit、V2 Subject Facts publish 与 Subject Access Barrier 精确复核全部成功后才记录新的
safe cursor。失败时保持 freeze，从最后已记录 safe cursor 重跑；不得跳过 Integrity Violation、手改 Redis/SQL 或猜测 cursor。

### Phase 3 — 两道 pre-epoch data gate

先 PostgreSQL，后 Redis/Subject Access：

```bash
pnpm --filter @iam/worker profile-v2:verify-postgres -- --batch-size <positive-integer>
pnpm --filter @iam/worker profile-v2:verify-redis -- --batch-size <positive-integer>
```

两道 gate 都从 PostgreSQL 全量 subject inventory 出发。任一 `status=failed`、非零退出、missing/invalid/mismatch 或
Organization Responsibility Integrity Violation 都阻断后续阶段。此时尚未推进 epoch，可修复后重跑，或恢复一致 V1 backup
并退出窗口。

### Phase 4 — Client owner checklist 与 epoch dry-run

逐 client 确认 V2 config 已准备且 owner 接受新 wire，再以同一 immutable manifest 执行：

```bash
pnpm --filter @iam/worker client-protocol:epochs -- dry-run --manifest <manifest.json>
pnpm --filter @iam/oidc-provider client-protocol:artifacts -- dry-run --manifest <manifest.json>
```

`pending` owner、inventory 缺失/多余、protocol mismatch、epoch fence mismatch 或 invalid owner inventory 都阻断 apply。Artifact
dry-run 中存在待删 artifact 是预期 inventory，不表示 cleanup 已通过。

### Phase 5 — 推进 epoch（不可逆边界）

```bash
pnpm --filter @iam/worker client-protocol:epochs -- apply --manifest <manifest.json>
pnpm --filter @iam/worker client-protocol:epochs -- verify --manifest <manifest.json>
```

第一次成功的 PostgreSQL epoch commit 起，只允许 V2-compatible rollback 或 forward-fix。响应丢失时使用同一 manifest 重跑
apply/verify；不得递减 epoch 或切回 V1。verify 未通过时保持 freeze，不能进入 artifact cleanup 或启动业务流量。

### Phase 6 — 精确 artifact cleanup

```bash
pnpm --filter @iam/oidc-provider client-protocol:artifacts -- apply --manifest <manifest.json>
pnpm --filter @iam/oidc-provider client-protocol:artifacts -- verify --manifest <manifest.json>
```

cleanup 只删除 manifest owner 下的 Custom SSO/OIDC protocol binding、credential、artifact、Provider Session binding 和 OIDC raw
objects；必须保留 Principal Session、Profile、Subject Facts、Subject Access Barrier、业务数据与 audit。Adapter/进程失败后可能
已有部分幂等 mutation，但阶段状态仍是 failed；修复 owner 后用同一 manifest forward 重跑，直到 `cleanupPending` 与残留均为零。

### Phase 7 — 启动固定 V2-only runtime

人工部署并启动 Phase 1 固定的 candidate。逐一确认 API、Admin API、Worker、OIDC Provider、Admin、SSO、Gateway route 与
readiness/shutdown owner；任何 runtime、composition 或 route 不是固定 candidate，或出现 V1 fallback/read-through，立即保持
freeze 并执行 epoch 后 V2-compatible 恢复。

### Phase 8 — 重跑两道 data gate

在已启动 V2 runtime 下按 Phase 3 原顺序再次运行 PostgreSQL 与 Redis/Subject Access gate。任一失败都说明 runtime 启动后
数据不再满足发布条件；保持 freeze，不能用 smoke 的局部成功覆盖 gate failure。

### Phase 9 — Full-system 与 release smoke

先在隔离 exact-project 运行完整 Full-system E2E：

```bash
pnpm test:e2e
```

该命令使用动态 Gateway port、空 PostgreSQL/Redis/etcd volumes、真实 migrations、production-owner seed 和同一 project 的
Admin → OIDC journeys，验证：

- Admin 创建跨树 `head` responsibility，Worker 发布 strict V2 Profile/Subject Facts；
- Internal Detail 与 responsibility DSL 读取同一发布结果；
- Custom SSO UserInfo 只在 `profile.employments[].responsibilities` 暴露责任，Gateway Subject Header 与 authorization employment
  排除责任；
- Custom SSO epoch 变化后旧 local artifact 被拒绝，同一 Principal Session 可以签发新的 V2 artifact；
- OIDC Authorization Code→Token→UserInfo 重放 authorization-time `iam:employments` responsibility snapshot；
- Employment Pause 级联暂停 Assignment 后当前 Internal Profile 不再含责任，但先前 OIDC snapshot 保持不变；
- ID Token 排除 `iam:employments`、`iam:authorization` 与 responsibility；
- 任一 journey failure 都先保存有界 Compose/Gateway/Playwright evidence，再 exact-project cleanup；cleanup failure 非零。

随后运行严格 V1 rejection 与 cleanup 保留集的 owner tests：

```bash
pnpm --filter @iam/api test:integration:component -- custom-sso-session-kernel.adapter.integration.test.ts
pnpm --filter @iam/oidc-provider test:unit -- claims-v2.test.ts
pnpm --filter @iam/oidc-provider test:integration:redis -- client-protocol-artifact-cleanup.integration.test.ts
```

这些测试通过受控 fixture 构造公开 V2 API 无法签发的 legacy artifact，并只通过正式 adapter/protocol seam 观察拒绝；不得把
当前 Gateway Subject Header 的稳定 `version: 1` wire 误记为 legacy protocol artifact。Redis integration 必须使用独占临时
resource，并证明 cleanup 后 Principal Session、Profile/Facts/Barrier、业务数据和 audit 保留。

最后在仍处于 freeze 的目标环境逐项执行最小人工 smoke，并记录 request/trace correlation：

1. Internal Detail 与 DSL：同一 Employment/Responsibility 命中且结果完整，无 N+1/partial result。
2. Custom SSO：新 authorize→UserInfo 返回 V2 responsibility；Gateway header 与 authorization projection 不含 responsibility。
3. OIDC：新 Code→Token→UserInfo 返回 authorization-time snapshot；ID Token 不含 employment responsibility。
4. Legacy artifact：批准的过期/旧 epoch 样本稳定返回协议级 unauthorized/invalid grant，不触发 fallback。
5. Principal Session：cleanup 前存在且未 revoke 的协议中性会话可以取得新的 V2 artifact，无需强制全员重新登录。

任一 smoke 失败都保持 freeze、保存诊断并停止；不得继续下一 smoke 后汇总为部分成功。

### Phase 10 — 一次性恢复流量

只有 Phase 8 两道 gate、Phase 9 全部自动与人工 smoke、runtime readiness、owner checklist 同时通过，traffic owner 才一次性恢复
Internal、Custom SSO、OIDC、login/renewal 和 identity/client-config write 流量。恢复后立即观察错误率、latency、Dirty backlog、
Subject Access、epoch reject 与 cleanupPending；任何异常进入 epoch 后响应，不自动切回 V1。

## 失败与 rollback matrix

| 边界 | 允许动作 | 禁止动作 |
|---|---|---|
| 第一条 V2 Profile 写入前 | 取消窗口，按普通发布路径恢复原 runtime/流量 | 在 backup/candidate 未确认时继续 |
| 已写 V2 Profile、尚未 epoch | 从 safe cursor 修复重跑；重跑两 gate；或恢复同一时点一致 V1 PostgreSQL+Redis backup | 只恢复单一存储、跳过 User、保留混合 V1/V2 |
| epoch apply 已提交 | 保持 freeze；同一 manifest verify/forward cleanup；部署固定 V2-compatible rollback 或 forward-fix | 恢复 V1 runtime/parser/cache/artifact、递减 epoch、恢复 V1 backup |
| cleanup 部分失败 | 修复具体 owner/adapter；同一 manifest 重跑 apply→verify；确认 cleanupPending 为零 | wildcard delete、全库 flush、把 partial mutation 记为成功 |
| V2 runtime/gate/smoke 失败 | 保持 freeze；保存诊断；V2-compatible rollback 或 forward-fix；重跑 Phase 8–9 | 自动放流、以局部 smoke 覆盖失败、回到 V1 |
| 放流后异常 | 关闭受影响流量；执行 V2-compatible rollback/forward-fix；重跑 gate/smoke 后再一次性恢复 | 恢复 legacy artifact 或在消费者间混用代际 |

## 最终验收记录

发布记录至少包含：

- candidate/image/config/manifest/backup digest 与隔离 restore 结果；
- freeze 生效、旧 writer 停止、TTL 等待、每阶段开始/结束和一次性放流时间；
- backfill 每批 safe cursor、两轮 PostgreSQL/Redis gate 的状态与聚合计数；
- epoch/artifact dry-run/apply/verify 的安全 report、失败与 forward 重试；
- `pnpm test:e2e`、三项 legacy/cleanup owner tests、受影响 lint/typecheck/test 的结果；
- exact-project descriptor、资源隔离、diagnostics index、cleanup 结果和失败恢复演练；
- Internal/Custom SSO/OIDC/Gateway/ID Token/legacy rejection/Principal Session smoke 摘要；
- remaining operational assumptions：真实数据规模、历史 TTL 证据、backup restore time、client owner 响应、Linux/CI adoption
  状态及任何尚未由 runtime observation 证明的性能阈值。

完成记录只证明本次受控窗口的验收结果，不授权下一次 cutover、deployment、push 或其他外部操作。
