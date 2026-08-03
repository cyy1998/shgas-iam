# Custom SSO Subject Projection 手动联合演练记录

Type: release-record
Status: Historical
Last verified: 2026-08-02
Next review: n/a

## 适用边界

本记录只保存 Ticket 12 在本机专用临时 PostgreSQL/Redis 环境的简洁人工摘要，不代表生产环境已经切换，也不替代发布、
数据库、Redis、Gateway 和安全负责人的生产窗口审批。真实窗口仍按
[硬切换与回滚手册](custom-sso-subject-projection-release.md)执行。

维护者决定最终验收由维护者或 agent 按 runbook 组合现有公开接口、package 命令与 process smoke 手动完成；不要求或
提交根级一键 orchestrator、JSONL receipt、机器 evidence manifest/transcript 或自动 phase 状态机。旧 artifact 的认证
失效由 Ticket 11 后当前 runtime 删除旧 owner 并 fail closed 保证，cleanup 只做六类 key 的 inventory hygiene；本记录不
声称历史版本或 cleanup 前的旧 artifact 曾可认证。

维护者另明确：完整 cutover runbook 联合演练与 10,002 行近规模性能验收可以作为两个专门执行分别完成；两项仍均为
Ticket 12 必需证据，但不要求共享数据集、临时环境或执行批次。该拆分只收窄 Ticket 12 的证据编排，不代表生产切换、
容量阈值或发布已经批准。

## 已退役的早期自动演练摘要

候选 `1374e4ecd2e253fd7a8adf0c02e79d447113ae13` 曾在单节点环境装载 user/profile/dirty 各 10,002 条、Gateway/
Independent client 各 6 个，并完成备份恢复、backfill/verify、cleanup、process smoke、性能与 rollback。该次自动产物和
机器 evidence 已按最新维护者决策退役，不再作为当前验收依据；保留以下聚合历史值仅用于解释性能 fixture：

| 项目 | 人工摘要 |
|---|---|
| backfill / verify | 21 batches；scanned/verified 10,002/10,002；failure 0 |
| cleanup inventory | 6 类命中并删除；residual 0；OIDC 4→4；current Session 3→3 |
| cache | cold 250 / hit ratio 0；warm 1,000 / hit ratio 1 |
| latency | cold/warm Redis p95 9/6 ms；cold Profile DB p95 45 ms |
| single-flight | 32 readers / 1 Profile load |
| rollback | tightening index 0；精确 migration journal row 0；列恢复 nullable |

## 当前候选的手动联合演练

当前 Ticket 仍为 `claimed` / open，checkbox 仍未勾选。2026-08-02 手动演练验证候选
`0a8efc23` 基线及本记录同一 focused change；最终 commit 由 branch history 与交接记录标识，避免文档对自身 commit
产生循环引用。以下只记录非敏感聚合结果，不写 Secret、Token、Subject Facts、完整 Redis key、逐用户 Dirty
状态/版本或连接凭据。本轮使用 owner-labeled 临时 PostgreSQL、Redis 和 Redis restore container；其中 Redis 是维护者
明确批准的非生产、独占、可销毁 logical DB，不是共享/生产 Redis 清理授权。

| Gate | 结果 | 非敏感摘要 |
|---|---|---|
| hermetic / external lane | 通过 | API smoke 在 shell 预置无效 test URL 时仍使用不可达 PG 与自有 RESP fixture，2/2；API/OIDC external 缺任一必需 URL 均在收集期 fail fast；显式 lane uncached、单 worker/根级单并发，并要求专用 PG + Redis |
| freeze / backup restore | 通过 | 合成 inventory 为 3 users、2 clients、3 Redis operational records；freeze 后 target writer、旧 Worker 与外部 PG activity 均为 0；PostgreSQL source/restore 的 user/client/profile 均为 3/2/0 且 aggregate digest 一致，Redis RDB restore 为 3/3 owned records |
| manifest / Secret delivery | 通过 | manifest 为 Gateway 1、Independent 1；首次 delivery `pending` 正确留下 1 blocker。一次性输出在仓库外以 exclusive create 建立，受保护 ACL 仅当前 owner，已存在路径正确拒绝；本机只模拟确认流程，不声称生产 recipient 已确认 |
| production backfill / verify | 通过 | 首轮 2 batches，scanned/rebuilt 3/3、Facts 3、Barrier seeded 3、Secret client 1、blocker 1；pending verify 按预期仅有 enabled-state 与 delivery 两类 failure 各 1。确认后重跑为 scanned/reused 3/3、rebuilt 0、new Secret 0、Barrier retained 3；verify 为 users/profiles/verified 3/3/3、failure 0 |
| Worker stop / prewarm | 通过 | 旧 Worker/runner 为 0；停止旧 publisher 后使用 production command 从 cursor 0 幂等预热，最终 verify 仍为 3/3/3、failure 0 |
| 四类 production/public flow | 通过 | Gateway callback 正确消费 Grant 并签发最小 Local Session；真实 `/public/user-info` 在 Projection Not Ready 时为 503、`Retry-After: 7`、不清 Cookie，恢复后同一 Local Session 重试 200。Independent 同一 Grant/code 首次 token exchange 为相同 503，恢复后同 code 200；另覆盖 replay、Secret rotate、disable。OIDC 真实 authorize→token→UserInfo→logout 并证明 snapshot replay；账号 lifecycle 覆盖 disable、Barrier unavailable、re-enable blocking 与 repair 收敛 |
| cleanup | 通过 | 当前候选既有六类 allowlist 演练：各命中并删除 1，clean verify、重复 apply/verify 均为 0；合成 OIDC/current Session 各 1 保留。r4 未扩大 production cleanup allowlist |
| performance / observability | 通过 | 10,002 users/profiles、12 clients；prewarm 884.101 ms、verify 986.676 ms；完整比较见下表。日志 scanner 未发现 Secret/Token/code，repair 输出只有 count/age |
| rollback / forward recovery | 通过 | auth traffic 与 writer 为 0 时 production CLI 首次 `rolled-back`、第二次 `already-rolled-back`；前向 migration 成功，最终 verify 3/3/3、failure 0。只证明兼容 DDL/journal 往返，不恢复旧 runtime、payload 或 Session |
| focused repository validation | 通过 | external lane orchestration contract 16/16；API external 1/1（26 assertions），OIDC external 1/1，API Core real Redis 25/25；API/OIDC 对 `rediss:` 均在连接前 fail fast；共享 external resource helper 4/4；Admin lifecycle 20/20（83 assertions），near-scale 1/1（16 assertions）；最终候选完整 `pnpm verify` 通过 |
| owned resource cleanup | 通过 | 精确删除 3 个本轮 owner-labeled container 与受保护临时目录；复查该 owner container 与 temp path 均为 0，删除不可恢复 |

### 性能与观测阈值比较

以下阈值只用于本次临时 rehearsal 的通过/失败判断，不是生产审批值；生产窗口仍须在开始前由负责人批准独立阈值。
`/auth/authz` cache-hit PostgreSQL 增量固定为硬门禁 `0`。

| 指标 | 基线/受控故障 | 预热后/收敛后 | 本次阈值 | 结果 |
|---|---:|---:|---:|---|
| cache hit ratio | 0 / 250 requests | 1 / 1,000 requests | `>= 0.99` | 通过 |
| Redis p95 | 6 ms | 7 ms | `<= 50 ms` | 通过 |
| Profile DB p95 / warm loads | 41 ms | 0 loads | `<= 100 ms` | 通过 |
| Dirty DB p95 | 26 ms | 22 ms | `<= 100 ms` | 通过 |
| single-flight wait p95 | n/a | 7 ms；32 readers / 1 load / 31 joins | `<= 50 ms` | 通过 |
| Projection Not Ready | fault 1/1 | steady 0/1,000 | `0% steady` | 通过 |
| Access unavailable | missing Barrier 1/1 为 503、无 Cookie | steady 0/20 | `0% steady` | 通过 |
| repair backlog count / oldest | 1 / 34 ms；backoff 1 / 39 ms | 0 / n/a | `0 / n/a` | 通过 |
| authz PostgreSQL increment | 不可达 PG control | 0 | `0`（硬门禁） | 通过 |

## 实际命令面

- Hermetic smoke：`pnpm --filter @iam/api test:smoke`、`pnpm --filter @iam/oidc-provider test:smoke`；预置
  `IAM_*_TEST_*_URL` 只用于证明 smoke 不读取它们。
- 真实 entry：设置四个 test-only URL 后运行 `pnpm test:external`；也分别运行
  `pnpm --filter @iam/api test:external` 与 `pnpm --filter @iam/oidc-provider test:external`。未设置 URL 的失败
  是显式 fail-fast 证据，不记录 URL 值。
- Backfill/verify：production-mode `pnpm --filter @iam/worker subject-projection:backfill -- --manifest <path>
  --secret-output <new-path> --batch-size 2 --after-user-id 0`，确认后不带 Secret 输出路径幂等重跑；每轮后运行
  `subject-projection:verify -- --manifest <path> --batch-size 2`。
- cleanup：在专用 Redis DB 上依次运行 `pnpm --filter @iam/api-core
  session:cleanup-custom-sso-cutover -- --dry-run --batch-size 2`、同格式的 `--verify` 与 `--apply`，
  然后重复 apply/verify。
- 近规模、backlog 和 rollback：`pnpm --filter @iam/user-profile-read-model test:rehearsal`、
  `pnpm --filter @iam/api-core test:redis`；专用数据库上依次运行
  `pnpm --filter @iam/db db:migrate`、`pnpm --filter @iam/db subject-projection:rollback`、重复 rollback
  和 `db:migrate`，最后再运行 production-mode Worker verify。
- Focused 门禁：受影响 workspace 的 lint/typecheck/smoke、`bun test scripts/__tests__/test-orchestration.test.ts`、
  `pnpm check:architecture`、`pnpm check:docs` 与 `git diff --check`。

## 偏差、边界与后续事项

- API external 首次在 Client constraint 处失败，根因是 fixture 把 JSON 当作未定型文本传给 driver；改为 driver JSON
  parameter 后通过。随后纠正了 Independent 返回的 local-session `sid` 契约预期；均为测试 fixture/断言错误。
- OIDC external 首次被 login resolution 拒绝，根因是 fixture 只有 Profile、没有 authoritative user row；补齐合成账号后
  公开流程通过。Provider 当前 ID Token 公开契约只保证稳定 `sub`，Profile/授权 claims 由 UserInfo snapshot replay 验证。
- 第一次切流复测误用了临时 PostgreSQL 密码假设，在业务进程启动前即 authentication failed；改为只在进程内读取专用
  container 配置且不打印后通过。该失败不属于产品回归。
- 初次 pending manifest verify 的两项 failure 是预期 blocker 证明；本机把 delivery 改为 confirmed 只模拟安全交付流程，
  不代表任何生产 client owner 已接收 Secret。
- 近规模为 10,002 条的本机合成数据，不是生产容量证明；本次阈值也不替代生产批准。
- rollback 只恢复兼容 schema 并精确补偿 migration journal；不恢复旧字段、payload 或已清理
  Session。

### 已知风险跟踪（未解决）

| ID | 当前状态 | Owner | 目标日期 | 跟踪位置 |
|---|---|---|---|---|
| `T12-RISK-QST-01` | Query Session Token 外部行为保持不变；本 feature 未修复 | IAM API owner | 2026-09-30 | [Ticket 12 known-risk follow-up registry](../../.scratch/archived/custom-sso-subject-projection/delivery.md#ticket-12-known-risk-follow-up-registry) |
| `T12-RISK-ORCAS-01` | ORCAS transport 外部行为保持不变；本 feature 未修复 | IAM + ORCAS integration owner | 2026-10-31 | [Ticket 12 known-risk follow-up registry](../../.scratch/archived/custom-sso-subject-projection/delivery.md#ticket-12-known-risk-follow-up-registry) |
