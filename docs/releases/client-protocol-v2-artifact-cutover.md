# Client Protocol V2 epoch 与 artifact 清理

Status: Current

Last verified: 2026-08-23

Next review: 2026-10-31

本手册只说明 Client Protocol V2 epoch 与协议产物清理。命令不会自动 freeze、运行 data gate、切换 runtime、恢复流量、
执行 smoke 或 production cutover；这些动作仍由维护窗口负责人显式编排。

Custom SSO 的 active Subject Claim Catalog 由服务端统一固定为当前 V2。数据库 migration 会删除所有非空配置中的历史
`subjectClaimCatalogVersion` key，并用当前 strict schema 验证其余内容；未知 claim 或其他损坏配置会令 migration 失败。
不得手工修剪损坏配置或把旧 marker 写回数据库。

## Manifest 与人工责任

manifest 必须覆盖 PostgreSQL 中全部非删除且已配置 Custom SSO/OIDC 的 client，包括禁用中的 client、协议和
`iam-admin`。每个非空协议目标固定声明执行前的 `expectedEpoch` 和人工维护的 `ownerStatus`：

```json
{
  "version": 2,
  "clients": [
    {
      "clientCode": "portal",
      "customSso": {
        "expectedEpoch": 3,
        "ownerStatus": "confirmed"
      },
      "oidc": {
        "expectedEpoch": 7,
        "ownerStatus": "confirmed"
      }
    }
  ]
}
```

`pending` 会阻断 apply；`confirmed` 表示 owner 已确认 `expectedEpoch` 所围栏的完整当前数据库配置。命令不会根据配置内容自动
确认 owner。没有配置某协议时必须写 `null`，不得通过遗漏 client 或协议缩小 inventory。旧 manifest 中的
`targetCatalogVersion` 会被 strict parser 拒绝，不再作为兼容输入。

完成 schema migration 后，每个 Custom SSO 配置都按服务端当前 V2 Catalog 解释。命令在同一个完整 inventory
`FOR UPDATE` transaction 中只推进协议 epoch，不再读取或改写 per-Client Catalog marker。
`expectedEpoch + 1` 数据库保持 no-op，但每个包含 Custom SSO 或 OIDC target 的 Client 仍在提交后通过共享 Client Runtime
Snapshot control 恰好完成一次 required invalidation。命令不再建立 legacy Custom SSO runtime ownership fence，也不再续租 heartbeat 或执行
complete/abort settlement。所需 Snapshot invalidation 失败会令命令失败，但不会伪装成数据库 transaction 已回滚。

## 执行顺序

进入维护窗口前必须先部署包含当前 owner index 与 cleanup ref 写入逻辑的 API/OIDC Provider，并记录旧 writer 全部停止的
时间。以下两个兼容等待都完成前不得 freeze 或执行本命令：

- 从最后一个旧 OIDC writer 停止起，至少等待旧部署历史配置的
  `IAM_OIDC_PROVIDER_GLOBAL_SESSION_TTL_SECONDS`、`IAM_OIDC_PROVIDER_AUTHORIZATION_CODE_TTL_SECONDS`、
  `IAM_OIDC_PROVIDER_INTERACTION_TTL_SECONDS`、`IAM_OIDC_PROVIDER_ACCESS_TOKEN_TTL_SECONDS` 和
  `IAM_OIDC_PROVIDER_ID_TOKEN_TTL_SECONDS` 的最大值。旧 writer 曾使用过更大值时必须取历史最大值，不能用降低当前配置缩短等待。
  这样可以让旧代码提前丢失 client owner index 的 OIDC object 全部自然耗尽；新 writer 在等待期间继续建立单调 TTL index。
- 从最后一个旧 API writer 停止起，至少等待旧部署历史最大的 `IAM_API_AUTH_CODE_TTL_SECONDS`，让没有 redemption cleanup
  ref 的旧 Custom SSO Grant 与 redemption record 一起自然耗尽。

缺少部署时间、历史 TTL 或完整等待证据时必须推迟切换，不能把 operator confirmation 当作数据证明，也不能用 Redis
`SCAN`、通配符删除或降低 TTL 配置替代等待。

维护窗口负责人随后保持协议流量关闭并完成独立 data gates。freeze 后必须至少再等待
`PENDING_PROVIDER_SESSION_BINDING_TTL_SECONDS`（当前 60 秒），让 owner index 上线前创建的 pending Provider Session
Binding 自然耗尽。然后按现有 Phase 4–7 依次执行，不增加额外切换阶段：

```bash
# Phase 4: epoch dry-run
pnpm --filter @iam/worker client-protocol:epochs -- dry-run --manifest <manifest.json>

# Phase 5: epoch apply + verify
pnpm --filter @iam/worker client-protocol:epochs -- apply --manifest <manifest.json>
pnpm --filter @iam/worker client-protocol:epochs -- verify --manifest <manifest.json>

# Phase 6: artifact apply + verify
pnpm --filter @iam/oidc-provider client-protocol:artifacts -- apply --manifest <manifest.json>
pnpm --filter @iam/oidc-provider client-protocol:artifacts -- verify --manifest <manifest.json>

# Phase 7: start V2-only runtime（由维护窗口负责人执行）
```

epoch apply 在一个 PostgreSQL transaction 中锁定全部已配置协议的 client，验证 manifest 完整覆盖与 epoch fence 后，
对每个尚未应用的协议恰好推进一次。即使 selection 未变化也必须推进。第一次成功提交是永久拒绝旧 artifact 的不可逆边界；
命令只接受 `expectedEpoch` 或已推进的 `expectedEpoch + 1`，因此提交后响应丢失可以原 manifest forward 重跑，但不得递减
epoch、恢复旧 parser/cache/artifact，或把流量提前打开。

artifact command 只读取 Session Kernel 的精确 client+protocol owner index、OIDC raw provider object 的精确 client
index，以及 pending Provider Session Binding 的精确 client index。它不接受 pattern，不使用 Redis `SCAN` 推断生产
inventory，也不执行 `FLUSHDB`/`FLUSHALL`。`dry-run` 只输出 binding、credential、artifact、pending binding 和 OIDC
model 的安全计数；`apply` 撤销 owner 已声明的 Grant、Code、Token、Provider Session、Binding、Gateway Local Session
等协议对象；`verify` 要求 owner inventory、stale 与 invalid 计数均为零。

## 保留集与失败处理

cleanup 明确保留 Principal Session、Profile、Subject Facts、Subject Access Barrier、client/用户业务数据和 audit。
报告不输出 token、Redis key、metadata 或 cleanup ref。任一 cleanup adapter 失败、owner inventory 无效或 verify 仍有残留时，
命令非零退出，不能把该轮记录为成功。

带 cleanup ref 的 Session Kernel 对象先原子进入 `cleanupPending` inventory，再调用外部 cleanup adapter。adapter 失败或
进程在调用后异常退出时，tombstone 会保持无 TTL 且继续被精确 inventory 发现；修复 adapter 后以同一 manifest 再次
执行 `apply` 会幂等重试，全部 cleanup 成功后才移除 pending marker，并恢复 tombstone 原有的 replay 截止时间。
`verify` 要求 `cleanupPending` 为零。该机制只延长失败对象的内部 tombstone，不把 cleanup ref 写入报告或日志。

epoch 已提交后的任何失败都只允许保持流量关闭并 forward：修复具体 owner cleanup 后，以同一 manifest 重跑 epoch verify、
artifact apply 和 artifact verify。完成本手册并不授权恢复流量；runtime smoke 与恢复动作属于后续明确的 production cutover。
