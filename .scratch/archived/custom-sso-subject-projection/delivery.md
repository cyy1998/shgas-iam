# Custom SSO Client Subject Projection 安全修复开发记录

## 当前状态

- 目标分支：`main`，记录 spec 时 tip 为 `c4cf03f9`。
- 功能分支：`codex/custom-sso-subject-projection`。
- Tickets 01–12 均已 `resolved`，当前没有 active ticket；Ticket 12 的全部验收 checkbox 已勾选。
- Ticket 12 已按 runbook 完成人工联合演练、近规模性能观测、外部 lanes、Admin Playwright、最终 `pnpm verify` 和
  Standards / Spec 双轴评审；整个 feature 的 implementation 与 ticket handoff 已完成，但尚未归档或本地合入。
- Ticket 12 保留 Subject Access repair age lazy migration 与近规模性能 fixture 的 canonical claim seed；根级 one-shot、
  receipt/manifest 状态机和仅服务于它的 process-tree fixture 已退出验收范围。
- 下一安全动作：主会话报告 feature 已完成，并按 workflow 一次性请求本地收尾授权；获授权前不 archive、merge 或删除
  功能分支，push 仍需单独许可。

## 验收与验证计划

- 主要行为 seam 是 Client Subject Projection contract；协议、数据库原子发布、Redis 原子状态、Session Kernel、
  Admin API 和浏览器 E2E 只补充该 seam 无法证明的系统边界。
- 每张 ticket 运行最高层相关测试、受影响 workspace lint/typecheck 和必要的 PostgreSQL、Redis、smoke 或浏览器
  外部通道，并运行 `git diff --check`。
- 文档 ticket 运行 `pnpm check:docs`；稳定 module edge 变化运行 `pnpm check:architecture`。
- Ticket 12 已在最终实现内容上运行一次 `pnpm verify`，并完成 Standards / Spec 双轴评审；后续本地收尾仍遵循
  workflow 的目标分支漂移、归档与 squash merge 约束。

## Ticket 12 维护者 Decision

- 旧 artifact 的认证失效由 Ticket 11 后当前 production runtime 删除旧 owner 并 fail closed 保证；cleanup 仅负责六类
  legacy key 的范围受控 inventory hygiene，不是认证失效机制。
- Ticket 12 不要求证明 legacy artifact 在历史版本或 cleanup 前可认证。历史 adapter、手写 parser 和
  “owner pre-success -> cleanup 后失败”不得作为验收依赖；纯 cleanup inventory/shape contract 不得称为认证 owner flow。
- 当前验收证明：当前 production entry 在 cleanup 前后拒绝 legacy-shaped token/code/Local Session 且不读取旧 key；
  cleanup dry-run/verify/apply 精确、幂等删除六类 key并保留 OIDC/current Session；Gateway、Independent、OIDC 与账号
  lifecycle 通过真实 production/public entry 可用且正确。
- 最终验收不要求根级一键 orchestrator、JSONL receipt、机器 evidence manifest/transcript 或自动 phase 状态机。既有机器
  evidence 不再作为 Ticket 12 产物或当前验收依据；保留的 Historical 文档只记录简洁的人类可读结果。
- 完整 cutover runbook 联合演练与 10,002 行近规模性能验收可作为两个专门执行分别完成；两项仍均为 Ticket 12 必需
  证据，但不要求共享数据集、临时环境或执行批次。该拆分不代表生产切换、容量阈值或发布已获批准。

## Ticket 12 验收、验证与 r7 review 摘要

- Ticket 12 的实现、修复与验收提交使用 inclusive range `ec1e5d05^..e17288e0`，共 28 个 focused commits：
  `ec1e5d05` 至 `dd5d26c3` 建立演练、观测、cleanup、近规模 fixture 与记录；`4189abf4` 至 `8dd41a50` 闭环 repair、
  process ownership、production/public smoke 和验收口径；`516e435f` 至 `3a9d63ca` 收敛为人工联合验收并记录结果；
  `0a8efc23`、`75e4cd76`、`e17288e0` 加固外部 gate 与剩余资源 owner 生命周期。
- 人工联合演练覆盖 Gateway、Independent、OIDC、账号 lifecycle、legacy inventory cleanup、显式 rollback、repair 与
  observability；近规模执行使用 10,002 条 fixture。真实 PostgreSQL 5 lanes 共 84/84、Redis 4 lanes 共 40/40、
  Admin Playwright 28/28，临时容器、随机 schema、临时目录和 listener 均已精确清理并复核为零。
- 最终冻结内容上的 `pnpm verify` 通过 static 17/17、typecheck 16/16、ordinary test 16/16、smoke 5/5 与 build 2/2。
  最后资源加固还通过 API production smoke 2/2（57 assertions）、共享 lifecycle 4/4、PostgreSQL public harness
  contract 2/2、真实 PostgreSQL focused 4/4（12 assertions）、User Profile ordinary 103/103（310 assertions）和
  orchestration 16/16（182 assertions），以及受影响 lint/typecheck、docs/architecture guards 与差异检查。
- r7 Spec review findings 为 0。r7 Standards review 的以下两项由维护者于 2026-08-02 明确接受为
  deferred/non-blocking；两项均未修复，也不作为 Ticket 12 或 feature 完成的阻塞项：
  - `T12-R7-PG-CREATE-ACK-LOSS` — 原 finding：`postgres-test-harness` 只有在 `CREATE SCHEMA` 调用成功返回后才记录
    schema ownership；若 PostgreSQL 服务端已创建 schema、但响应在客户端确认前丢失并抛错，异常清理会跳过
    `DROP SCHEMA`。当前风险边界仅是专用测试数据库可能残留一个随机命名 schema；已确认返回后的部分创建、body 失败和
    多清理失败路径均已有独立清理/聚合契约，不涉及 production runtime 或业务数据。本项保持 deferred，不能宣称已修复。
  - `T12-R7-OIDC-CLAIMS-SURFACE` — 原 finding：OIDC production composition 仍返回当前 production consumer 未使用的
    `providerRuntime.claims` 表面。当前风险边界是 composition interface 偏宽带来的可读性、误用与后续维护漂移风险；
    claims 在 provider/adapter 构造中的实际行为仍被使用，现有 production 认证路径不依赖这个额外返回属性，未发现当前
    协议或安全行为变化。本项保持 deferred，不能宣称已删除或已修复。

## Ticket 12 Known-risk follow-up registry

| ID | 风险 | 状态 | Owner | 目标日期 | 跟踪位置 |
|---|---|---|---|---|---|
| `T12-RISK-QST-01` | Query Session Token 的 query 接收、传递、相关日志/响应头行为 | open；本 feature 未修复 | IAM API owner | 2026-09-30 | 本表 `T12-RISK-QST-01`；发布 runbook 的“已知后续风险”回链此 ID |
| `T12-RISK-ORCAS-01` | ORCAS Cookie/query/endpoint 与外部 session transport | open；本 feature 未修复 | IAM + ORCAS integration owner | 2026-10-31 | 本表 `T12-RISK-ORCAS-01`；发布 runbook 的“已知后续风险”回链此 ID |

## Ticket 08 验收与验证摘要

- Gateway Local Session、共享认证上下文与 Independent Credential 均保持最小引用；公开 UserInfo 按当前 Client
  配置实时投影，Gateway Header 只允许 Subject Identifier、username 和 name，ORCAS、数据库 ID、任职、phone 与
  `iam:authorization` 不进入该 Header。
- Client 状态、Custom SSO 配置版本、Subject Access Barrier 与投影 Subject 均 fail closed；交付前后两次 Client
  检查、401/503、Cookie 清理、`Retry-After`、Query Session Token 和 ORCAS transport 行为均由公开 seam 测试覆盖。
- 只选 Subject Identifier 的 authz 路径为零 Subject Facts read；有效 Redis Facts cache hit 路径为零 PostgreSQL
  查询，UserInfo 与 authz 的 client 隔离及 header/body 一致性均已验证。
- 最终相关验证通过：API ordinary tests 382/382；Session Kernel focused tests 66/66；API lint 与 typecheck；测试
  编排 16/16；`check:docs`、`check:architecture`、`check:env-names`、root lint、`git diff --check` 与 staged diff
  check。
- 第三轮完整复审为 Spec findings 0；Standards hard findings 0，另有 2 个 judgement duplication smell，最初经维护者
  授权 deferred/non-blocking，不作为 Ticket 08 完成门槛；维护者后来授权修复，并由 implementation commit
  `16a5e628061145ba504234f3dedac72085dc9b33` 完成：
  - `packages/api-core/src/custom-sso/client-runtime-cache.ts` 中 `completeCustomSsoClientRuntimeMutation` 与
    `abortCustomSsoClientRuntimeMutation` 的 finish Lua、3 个 Redis keys 与 mutation ID 调用形状已集中为私有实现。
  - `apps/api/src/services/sso/custom-sso-subject-delivery.ts` 中 UserInfo/authz 重复“当前 Client → Selection →
    Projection → Subject 校验 → 二次当前 Client 校验”流水线已集中为单一 module 内部实现。

## Ticket 09 验收与验证摘要

- OIDC 按实际 scope 构造协议中性的 Subject Selection；标准 `profile`、phone、任职与当前 client 授权保持显式边界，
  `sub` 继续等于稳定 Subject Identifier，OIDC wire 与 Custom SSO 配置、Secret、artifact 和 session 生命周期隔离。
- Claims Snapshot 在 Authorization Code 前固化 Subject、client、实际 scope、OIDC config version 及 Provider/Principal
  Session 绑定；authorization freshness 失败返回 `temporarily_unavailable` 且不发 Code，Token 与 UserInfo 只转移或
  重放快照，不二次读取 Profile 或重新计算 Selection。
- 复审修复补齐了 client-scoped Provider Session binding、silent authorization、principal rotation、并发授权 attempt
  隔离、共享 anchor 保留与完整 lifecycle fence；消费侧类型不再允许半个 fence，provider 实现保留运行时防御。
- 8 个 implementation/fix commits 为 `4884a841`、`f0877ab6`、`19c38c75`、`f384c808`、`e249fce4`、
  `bb97ac1b`、`2c6a74ee`、`d9aefc27`。
- 最终验证通过 OIDC ordinary unit 102/102、HTTP smoke 15/15、真实 Redis contract 5/5、Contracts 28/28 与 Admin
  ordinary 43/43；OIDC lint/typecheck、Architecture Guard、工作树与 staged diff checks 均通过。
- 最终候选 `d9aefc27` 的双轴复审为 Standards hard findings 0、judgement findings 0，Spec findings 0。

## Ticket 10 验收与验证摘要

- 以 `d0e7ad65` 为 review fixed point，`06f1aab0` 建立版本化批量 backfill、独立 verify、显式 Client manifest 与
  一次性 Secret 交付、全 Subject Facts/Access Barrier 预热、分阶段约束收紧、普通唯一索引和显式 rollback；
  `62bdf101` 闭环首轮复审 findings，`cc7a75f2` 闭环次轮命令退出竞态。
- 大表索引决策由 10,002-row 近似规模 PostgreSQL rehearsal 证明：普通唯一索引会等待写入者，因此必须在 maintenance
  freeze 内执行，不把并发 DDL 放入普通 transaction。Rollback 以 migration name、folder millis 与 SHA-256 校验
  identity，锁定 journal，并在同一 transaction 中完成 DDL 补偿与 exact journal delete；真实 forward → rollback →
  forward replay、identity mismatch、二次幂等和其余 15 条 journal row 不变均已验证。
- 临时专用 PostgreSQL/Redis 容器实际验证通过：DB PostgreSQL lane 初始 runner 7/7，加入 journal replay 后完整 lane
  9/9；User Profile focused PostgreSQL files 的 authority runner 当时报告 4/4、Subject Facts reader 1/1、publication
  9/9、cutover rehearsal 1/1，review fix 后 Ticket 相关 publication + cutover files 报告 10/10；Worker Client cutover
  PostgreSQL contract 1/1、6 assertions；User Profile Redis lane 4/4；API Core Redis lane 22/22。临时容器与随机 schema
  已清理，地址未写入仓库。
- 完整 `pnpm --filter @iam/user-profile-read-model test:postgres` 不宣称 green：既有
  `subject-access-transition.postgres.test.ts` 在 Bun external promise matcher 上挂起；direct-await 诊断还暴露两个
  Ticket 10 范围外的既有 contract 缺口——wrapped PostgreSQL error code 不可见，以及 `committed` + NULL target 未被
  CHECK 拒绝。诊断性改动已完全恢复，仅上述 Ticket 相关 focused PostgreSQL files 计为 green。
- 最终本地回归包括 Worker ordinary tests 27/27、完整 production process smoke 4/4、DB ordinary tests 15/15、
  verifier smoke 连续复跑 5/5，以及 Worker/DB lint、typecheck、docs/env/architecture guards 和差异检查。第二、三轮
  reviewer 未配置专用 URL，未自行重跑外部 lanes，只复核实现代理证据与本地 ordinary/smoke/static。
- 首轮 Standards hard finding 是 production composition cutover wiring 缺少对应 process smoke，由真实 command
  composition smoke 闭环；Standards judgement finding 是 page/integer guards 与 profile-row mapping 重复，由
  package-private shared guard/row mapper 闭环。Spec B1 由统一 Redirect Pattern validator 和 wildcard/public-suffix/
  query/fragment 反例闭环；B2 由未删除 intent inventory 口径及真实 PG apply/verify/reapply contract 闭环；B3 由上述
  journal-aware rollback identity、事务与 replay contract 闭环。
- 次轮 Standards hard / Spec high finding 同源于 `void main().catch` 的 fire-and-forget 入口，verify runtime error 可提前
  `exit 0`；修复进一步定位到 `closeDb()` 等待失败查询，最终由 Bun/ESM top-level await、仅 command-only 的 1 秒 DB
  close 上限和拆分 process smoke 闭环。三轮完整范围复审结束后最终 Standards findings 0、Spec findings 0。

## Ticket 11 验收与验证摘要

- 4 个 focused production/test commits 为 `cd234082`、`a1c94af0`、`b6d5ca39`、`6e2b9cc5`：初始实现移除 legacy
  Custom SSO runtime/config/session surface；后续修复收紧 generic Client fail-closed schema、专用 cutover cleanup 与
  production composition smoke，拒绝重复或尾随 profile override，并以 `--no-env-file` 隔离真实 Bun smoke 环境。
- 初始实现 ordinary tests 1160/1160，API/Worker/Admin API production smoke 7/7，11 个受影响 workspace
  lint/typecheck、Admin build、architecture/docs guards 均通过；真实临时 PostgreSQL focused contract 1/1（6
  assertions）与临时 Redis cleanup dry/apply 也通过。
- 首轮修复后 Domain 69/69、API Core 214/214、API 386/386、Admin API 225/225 ordinary tests 与 API smoke 1/1
  （26 assertions）通过；真实临时 Redis 的专用 profile 删除 6 个 legacy key 并保留 2 个 OIDC key。
- 次轮修复后 API Core ordinary 221/221（923 assertions）、smoke 4/4（25 assertions）及相关 lint/typecheck/guards
  通过；真实临时 Redis 中恶意尾随 profile override 以 `exit 1` 在任何 Redis 命令前失败并保留 8/8 keys，正确专用
  命令仍删除 6 个 legacy key、保留 2 个 OIDC key。
- 最后一项 smoke 环境修复后 focused smoke 1/1（4 assertions）、API Core smoke 4/4（25 assertions）、ordinary
  221/221（923 assertions）、root lint 17/17（0 errors，29 个既有 warnings）、root typecheck 16/16、Architecture
  Guard 与差异检查均通过。
- 第四轮完整累积 diff 终审为 Standards hard findings 0、judgement findings 0，Spec findings 0。Standards reviewer
  复跑 6 个受影响 workspace lint/typecheck/ordinary tests、API Core/API process smoke 与 guards；Spec reviewer 的聚焦
  ordinary tests 117/117、process smoke 5/5、受影响 typecheck/guards 通过。Spec reviewer 未重跑需专用 URL 的 Worker
  PostgreSQL lane，其真实临时 PostgreSQL 证据已在初始实现轮取得。

## 事件

- 2026-07-30 — Decision：完成 Subject Identifier、Client Subject Projection、Subject Facts/Freshness、Subject
  Access Barrier、Custom SSO 配置与 Secret、Grant、HTTP、OIDC Snapshot、维护窗口和 Admin 统一编辑页设计。
- 2026-07-30 — Decision：测试优先复用 Projection、Custom SSO use-case、User Profile Worker、Session Kernel、OIDC
  claims、Admin service/adapter 和 Client Playwright 的现有公开 seam，不为测试新增低层 helper。
- 2026-07-30 — Validation：发布 spec 前 `pnpm check:docs` 与 `git diff --check` 已通过；implementation 尚未开始。
- 2026-07-30 — Publication：维护者确认采用 12 张 tracer-bullet ticket；全部以 `ready-for-agent` 发布，初始依赖前沿
  为 Ticket 01，implementation 仍未开始。
- 2026-07-31 — Implementation：Ticket 01 完成协议中性 Subject Identifier、最小 Principal Reference、Session Kernel
  与 API/Admin/OIDC composition 的身份契约切换。
- 2026-07-31 — Validation：受影响 ordinary tests、lint/typecheck、DB/architecture/docs guards 与 process smoke
  通过；真实 `@iam/db test:postgres` 因缺少 `IAM_DB_TEST_DATABASE_URL` 未执行，该 lane 已验证会快速失败且不
  fallback 或 skip。
- 2026-07-31 — Review：Ticket 01 经三轮 Standards / Spec 双轴评审后 findings 清零，进入 tracker handoff。
- 2026-07-31 — Implementation：Ticket 02 完成协议中性 Client Subject Projection、Subject Claim Catalog V1、
  client-scoped authorization 裁剪、Custom SSO V1 wire mapping 与对应 Architecture Guard。
- 2026-07-31 — Validation：Ticket 02 的公开 contract、受影响 lint/typecheck、Architecture Guard、文档与差异检查
  均通过。
- 2026-07-31 — Review：Ticket 02 经三轮 Standards / Spec 双轴评审后 findings 清零，进入 tracker handoff。
- 2026-07-31 — Implementation：Ticket 03 完成 Subject Facts 与完整 Profile 构建、PostgreSQL 原子版本化发布、
  Subject 级 Redis compare-and-set，以及 User Profile Worker wiring。
- 2026-07-31 — Review：复审修复隔离了 legacy detail/search 与严格 Subject Facts 过滤，补齐 Docker build closure、
  独立 stale/删除 PostgreSQL contracts，并将 Redis 失败日志收敛为不含 Facts payload 的白名单诊断。
- 2026-07-31 — Validation：相关 ordinary tests、lint/typecheck、Architecture Guard、docs guard 与差异检查全绿；
  真实 PostgreSQL/Redis 外部 lanes 因专用 URLs 未配置未实际绿，但均 fail-fast、无 fallback、无 skip。Docker Linux
  engine 不可用，因此未实际 build；静态 Docker closure guard 已通过。
- 2026-07-31 — Review：Ticket 03 最终多轮 Standards / Spec 双轴评审 findings 均为 0，进入 tracker handoff。
- 2026-07-31 — Implementation：Ticket 04 完成 Subject Facts read-through、Subject 级 single-flight、窄行
  PostgreSQL 重载、Redis 版本 CAS、authorization freshness 仲裁与 Custom SSO 安全 503 adapter；实际 Custom
  SSO/OIDC production composition 延后至 Tickets 08/09。
- 2026-07-31 — Validation：四个受影响 workspace 的 417 个 ordinary tests、lint/typecheck、Architecture Guard、
  docs guard 与差异检查通过；PostgreSQL/Redis 外部 lanes 因专用 URLs 缺失未实际绿，但均 fail-fast、无 fallback、
  无 skip，并保留随机隔离。production composition 未改变，因此 process smoke 不适用。
- 2026-07-31 — Review：Ticket 04 首轮 Standards / Spec 双轴评审 findings 均为 0，进入 tracker handoff。
- 2026-07-31 — Implementation：Ticket 05 完成严格版本化 Subject Access Barrier、Session/Credential fail-closed
  enforcement、账号 lifecycle pre-block/finalize/rollback、session-generation scoped revocation、Redis repair 与
  PostgreSQL durable transition intent/reaper。主要 focused commits 从 `1ff2f63d` 至 `b2fc8d51`：
  `1ff2f63d`、`16d84b8d`、`8c3b624d`、`d06d9f6a`、`180ce859`、`6afcdd94`、`bead3342`、`33fb9296`、
  `709b4937`、`91532cd1`、`119dd15e`、`dfa6cdd8`、`b2fc8d51`。
- 2026-07-31 — Validation：Ticket 05 的相关 ordinary tests、lint/typecheck、process smoke、migration check、
  Architecture Guard、docs guard 与差异检查通过。外部通道所需 `IAM_API_CORE_TEST_REDIS_URL`、
  `IAM_USER_PROFILE_TEST_DATABASE_URL`、`IAM_USER_PROFILE_TEST_REDIS_URL`、`IAM_API_TEST_DATABASE_URL` 和
  `IAM_DB_TEST_DATABASE_URL` 均未配置；对应 lanes 只验证了缺少专用资源时 fail-fast、无 fallback/skip，未实际绿。
- 2026-07-31 — Review：Ticket 05 经多轮 Standards / Spec 双轴评审与 focused 修复，最终
  Standards findings 0、Spec findings 0，进入 tracker handoff。
- 2026-07-31 — Implementation：Ticket 06 完成独立、版本化且 Secret 安全的 Custom SSO Client 配置生命周期、
  Admin API 管理、Runtime Secret Reader、统一 Client 编辑页及 OIDC 隔离回归。8 个 focused commits 为
  `178b9346`、`0f87b0df`、`887a38c1`、`853ccdee`、`8402ea74`、`eccbf1b2`、`5997f371`、`89ce95f0`。
- 2026-07-31 — Validation：Ticket 06 的 API/Admin ordinary tests、lint/typecheck、Admin API process smoke、
  Architecture Guard、Admin build 与差异检查通过；Admin `clients.spec` E2E 7/7。完整 Admin E2E 为 26/27，
  唯一 sessions pagination 失败已在固定点 `e40a589d` 以相同行号和相同超时复现，确认不是 Ticket 06 回归。
  `IAM_DB_TEST_DATABASE_URL` 缺失，因此 PostgreSQL migration contract 未实际绿。
- 2026-07-31 — Review：Ticket 06 经多轮 Standards / Spec 双轴评审和 focused 修复，最终
  Standards findings 0、Spec findings 0，进入 tracker handoff。
- 2026-07-31 — Implementation：Ticket 07 完成严格 Redirect Pattern 与实际 Redirect/state 绑定、可恢复且一次性的
  Grant 租约状态机、Independent 专属 Secret 验证、POST Basic/form token exchange、最小 Credential 与
  client-scoped Subject Projection，并将 Session Kernel artifact 消费收敛为内部 exact-payload CAS。7 个 focused
  commits 为 `2d400b8f`、`d504a061`、`314c31a8`、`0e41b0d4`、`b62ef934`、`e709d6d3`、`c4b0003f`。
- 2026-07-31 — Validation：最终实现 `pnpm verify` 通过 static 17/17、typecheck 16/16、ordinary test 16/16、
  smoke 5/5 与 build 2/2；独立复跑 API Core 194/194、API 292/292、OIDC Provider 80/80、Admin 41/41、
  Gateway 39/39、Contracts 18/18、Client Subject Projection 17/17，Ticket 07 API focused tests 120/120。
  dev/prod IAM manifests 均通过且各含 14 routes，`git diff --check` 通过。
- 2026-07-31 — Validation：未配置 `IAM_API_CORE_TEST_REDIS_URL`，因此外部 Redis contract lane 为
  0 pass / 4 fail 的预期 fail-fast，并明确提示 caller-provided dedicated Redis 与 no fallback；该 lane 保持
  non-green，不能视为已通过。
- 2026-07-31 — Review：以 `8333cb0f` 为 fixed point、`c4b0003f` 为最终实现候选的累计复审中，
  Standards findings 0、Spec findings 0；先前 Session Kernel consumer seam Judgment 已由隐藏 testing factory、
  resolve-time serialized payload CAS 与 production/testing 等价条件关闭。
- 2026-07-31 — Resolution：Ticket 07 的全部验收项已勾选并标记为 `resolved`；依赖前沿推进到
  Tickets 08、09、10，下一张按编号调度 Ticket 08。
- 2026-08-01 — Implementation：Ticket 08 完成 Gateway Local Session、最小共享认证上下文、实时 Client Subject
  Projection、受限 Gateway Header、公开 UserInfo、ORCAS 隔离及稳定错误/Cookie/OpenAPI 契约；复审修复进一步收紧
  consumer-owned ports、Credential logout 实时 Client/config 校验、Cookie 过期协议复用与审计类型。
- 2026-08-01 — Validation：API ordinary tests 382/382、Session Kernel focused tests 66/66、API lint/typecheck、
  测试编排 16/16、docs/architecture/env/root lint 与差异检查全部通过。
- 2026-08-01 — Review：Ticket 08 第三轮完整双轴复审为 Spec findings 0、Standards hard findings 0；2 个
  judgement duplication smell 的位置与维护风险已记录，维护者明确授权 deferred/non-blocking。
- 2026-08-01 — Resolution：Ticket 08 的全部验收项已勾选并标记为 `resolved`；按维护者要求在 Ticket 08 完成后
  停止，本次不领取 Ticket 09。
- 2026-08-01 — External Test Stabilization：问题 3 先由 `ce34b716` 对齐 API PostgreSQL fixture contract 与类型化
  receipts，再由 judgement fix `20a78ffe` 收敛 receipts 的原子写入；`278e1a57` 修复 API Core Redis 的 lazy query
  matcher hang，`bb272518` 修复 `@iam/db` PostgreSQL lane 的 lazy query matcher hang 与 Admin sessions pagination
  遗留断言。本轮问题 1 验证使用临时 Redis/PostgreSQL 资源，相关地址或配置未写入仓库。
- 2026-08-01 — Validation：主会话最终验证 API `test:postgres` 1/1、API Core Redis 21/21（232 assertions）、DB
  PostgreSQL 4/4（18 assertions）与 Admin E2E 27/27 全部通过；`@iam/api`、`@iam/api-core`、`@iam/db`、
  `@iam/admin` 四个 workspace 的 lint/typecheck 均通过，Admin lint 仅保留 25 个既有 warning。
- 2026-08-01 — Review：第二轮双轴复审清零，Standards hard findings 0、judgement findings 0，Spec findings 0。
- 2026-08-01 — Implementation：Ticket 09 完成实际 scope 到 Subject Selection 的映射、Authorization Code 前 OIDC
  Claims Snapshot、Token/UserInfo 快照转移与 OIDC/Custom SSO 隔离；8 个 focused commits 为 `4884a841`、
  `f0877ab6`、`19c38c75`、`f384c808`、`e249fce4`、`bb97ac1b`、`2c6a74ee`、`d9aefc27`。
- 2026-08-01 — Validation：OIDC ordinary unit 102/102、HTTP smoke 15/15、真实 Redis contract 5/5、Contracts
  28/28、Admin ordinary 43/43、OIDC lint/typecheck、Architecture Guard 与差异检查均通过。
- 2026-08-01 — Review：最终候选 `d9aefc27` 的双轴复审清零，Standards hard findings 0、judgement findings 0，
  Spec findings 0。
- 2026-08-01 — Resolution：Ticket 09 的全部验收项已勾选并标记为 `resolved`；下一安全动作是等待维护者继续授权，
  再由主会话 dispatch Ticket 10，本次不领取 Ticket 10。
- 2026-08-01 — Repair：维护者授权修复 Ticket 08 原 deferred 的两个 judgement duplication smell；implementation
  commit `16a5e628061145ba504234f3dedac72085dc9b33` 集中 runtime mutation finish 与 UserInfo/Gateway delivery 流水线。
- 2026-08-01 — Validation：API Core focused tests 16/16、API subject delivery focused tests 18/18，
  `@iam/api-core` 与 `@iam/api` 的 lint/typecheck、`git diff --check` 和 staged diff check 均通过。
- 2026-08-01 — Review：上述 repair 的双轴复审清零，Standards hard findings 0、judgement findings 0，
  Spec findings 0。
- 2026-08-01 — Implementation：Ticket 10 以 `d0e7ad65` 为 fixed point；`06f1aab0` 完成维护窗口批量 backfill、
  独立 verify、显式 Client manifest/Secret 交付、Subject Facts/Access Barrier 预热、约束收紧 migration、索引锁证据与
  显式 rollback。
- 2026-08-02 — Validation：临时专用 PostgreSQL/Redis 容器实际通过 DB PostgreSQL 最终 runner 9/9、Ticket 相关 User
  Profile focused PostgreSQL files、Worker Client cutover PostgreSQL contract 1/1（6 assertions）、User Profile Redis
  4/4 与 API Core Redis 22/22；临时容器和随机 schema 已清理。完整 User Profile PostgreSQL suite 因既有 transition
  external matcher hang 及两个范围外 contract 缺口不宣称 green，诊断改动已恢复。
- 2026-08-02 — Review：首轮 Standards hard/judgement 与 Spec B1/B2/B3 findings 由 `62bdf101` 闭环：补齐真实 command
  composition smoke，共享 page/integer guards 和 profile-row mapper，严格验证 Redirect Pattern，以未删除 SSO intent
  盘点 Client，并建立 journal-aware、identity-bound、transactional rollback/replay contract。
- 2026-08-02 — Review：次轮 Standards hard / Spec high finding 同源于 fire-and-forget 命令入口可能让 verifier runtime
  error 提前 `exit 0`；`cc7a75f2` 以 Bun/ESM top-level await、command-only bounded DB close 及拆分 process smoke 闭环。
- 2026-08-02 — Validation：最终本地回归通过 Worker ordinary 27/27、完整 smoke 4/4、DB ordinary 15/15、verifier
  smoke 连续复跑 5/5，以及 Worker/DB lint、typecheck、docs/env/architecture guards 与差异检查。第二、三轮 reviewer
  未配置专用 URL，未自行重跑外部 lanes。
- 2026-08-02 — Review：三轮完整 Standards / Spec 复审结束后最终 Standards findings 0、Spec findings 0。
- 2026-08-02 — Resolution：Ticket 10 的全部验收项已勾选并标记为 `resolved`；下一安全前沿推进到 Ticket 11，本次不
  领取或 dispatch Ticket 11。
- 2026-08-02 — Implementation：Ticket 11 通过 `cd234082` 移除 legacy Custom SSO surfaces；`a1c94af0`、
  `b6d5ca39`、`6e2b9cc5` 分别闭环 generic Client/cutover 边界、profile override 与 smoke env 隔离 findings。
- 2026-08-02 — Validation：受影响 ordinary、production/process smoke、lint/typecheck、Admin build、
  architecture/docs guards 与差异检查通过；临时 PostgreSQL/Redis contract 证明 cutover 只删除目标 legacy artifact、
  保留 OIDC artifact，恶意 profile override 在 Redis 前失败。临时资源已清理，地址未写入仓库。
- 2026-08-02 — Review：第四轮完整累积 diff 终审清零，Standards hard findings 0、judgement findings 0，Spec
  findings 0。
- 2026-08-02 — Resolution：Ticket 11 的全部验收项已勾选并标记为 `resolved`；Tickets 01–11 均已完成，Ticket 12
  位于依赖前沿并保持 `ready-for-agent`。本次未领取或执行 Ticket 12，未 push、merge 或 archive，feature 尚未完成。
- 2026-08-02 — Ticket 12 Maintainer Decision：旧 artifact 失效由 Ticket 11 后当前 runtime 删除旧 owner 并 fail closed
  保证；cleanup 降格为六类 legacy key 的 inventory hygiene，不要求证明历史版本或 cleanup 前可认证。Ticket 12 继续
  保持 `claimed` / open，checkbox 未勾选，feature 未完成。
- 2026-08-02 — Cleanup：只读核对 owner 后精确删除 Ticket 12 review spike 的 2 份历史 archive/offline install、匹配
  process 与 `iam-ticket12-review-redis`；删除前 Redis DB 10/11 均为 0，独立残留审计 archive/process/container/name/
  旧 listener 均为 0，未触碰用户或其他 agent 资源。
- 2026-08-02 — Acceptance Repair：API production-entry smoke 删除测试内 legacy parser 与 owner pre-success 断言，改为
  cleanup 前后均通过真实 authorize/callback/UserInfo/authz entry 证明 legacy-shaped artifact fail closed 且旧 key 零读取；
  Current runbook、Historical record 与新 rehearsal observation schema 已按 inventory/shape 和当前 entry 口径更正；旧
  machine evidence 保持原字节并明确标记为 superseded，不作为当前验收。
- 2026-08-02 — Ticket 12 Acceptance Simplification：维护者决定用临时近规模环境中的手动联合演练和现有公开命令完成
  最终验收，不再提交根级 one-shot、JSONL receipt、机器 evidence manifest/transcript 或自动 phase 状态机；机器 evidence
  目录和仅服务于 orchestrator 的 fixture 删除，Ticket 仍保持 `claimed` / open，checkbox 暂不勾选。
- 2026-08-02 — Ticket 12 Evidence Split Decision：完整 cutover runbook 联合演练与 10,002 行近规模性能验收可分别执行；
  两项仍均为 Ticket 12 必需证据，不要求共享数据集、临时环境或批次，且不构成任何生产切换、容量或发布批准。
- 2026-08-02 — Ticket 12 Manual Validation：候选 `be77c8ce` 在本轮专用临时 PostgreSQL/Redis 中完成 Gateway、
  Independent、OIDC、账号 lifecycle、cleanup、10,002 条近规模 fixture、显式 rollback CLI 往返、repair/
  observability 与性能验收；真实 PostgreSQL 5 lanes 共 84/84、Redis 4 lanes 共 40/40、Admin Playwright
  28/28 与完整 `pnpm verify` 均通过。详细非敏感聚合值记录于 Historical rehearsal record。
- 2026-08-02 — Ticket 12 Resource Cleanup：只读核对名称与 owner label 后，精确删除本轮两个临时 container
  和一个旧 receipt 临时目录；owner container/temp/listener 复查均为 0。Ticket 继续保持 `claimed` / open，
  checkbox 未勾选，未 push、merge 或 archive。
- 2026-08-02 — Ticket 12 Final Implementation：从 `ec1e5d05` 至 `e17288e0` 的 28 个 focused commits 完成 runbook、
  人工联合演练、近规模性能验收、观测/cleanup、production/public smoke 与外部资源 owner 生命周期加固。
- 2026-08-02 — Ticket 12 Final Validation：真实 PostgreSQL/Redis、Admin Playwright、相关 ordinary/process smoke、
  lint/typecheck、docs/architecture guards 与最终 `pnpm verify` 均通过；临时容器、schema、目录和 listener 复核为零。
- 2026-08-02 — Ticket 12 r7 Review：Spec findings 0；Standards findings
  `T12-R7-PG-CREATE-ACK-LOSS` 与 `T12-R7-OIDC-CLAIMS-SURFACE` 经维护者接受为 deferred/non-blocking，当前均未修复，
  风险边界和决定稳定记录于“Ticket 12 验收、验证与 r7 review 摘要”。
- 2026-08-02 — Resolution：Ticket 12 全部验收项已勾选并标记为 `resolved`；Tickets 01–12 均已完成，feature 的
  implementation、验证、双轴评审与 tracker handoff 完成。尚未 archive、merge、push 或删除功能分支；下一步由主会话
  按 workflow 请求一次性本地收尾授权。
