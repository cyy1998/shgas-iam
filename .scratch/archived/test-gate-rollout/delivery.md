# 测试 Gate 发布开发记录

## 当前状态

- 正式范围：[spec.md](spec.md)。
- 目标分支：`main`；功能分支：`codex/test-gate-rollout`。
- [01 — 发布完整 Provider-neutral Gate Interface](issues/01-publish-provider-neutral-gates.md) 已完成实现、聚焦验证与
  Standards/Spec 双轴复审，状态为 `resolved`。Review fixed point 为
  `26687727e05f50e0b3611dc6c983f9e97204c5cb`，implementation commit 为 `692fd281`，review fix commit 为
  `ac3057d6`。
- `verify:ci` 与 `verify:release` 已作为 provider-neutral root commands 发布；Windows 本地当前候选周期已在同一次完整连续
  流程中取得三组绿色聚合 evidence。维护者裁定允许根因修复后从头重启整体流程；历史正式失败和 setup retries 已保留，且
  未宣称 Linux/真实 CI 已验收。
- [02 — 取得最终聚合证据并收口 Current Docs](issues/02-capture-final-evidence-and-docs.md) 已完成真实聚合 evidence 与第四轮
  Standards/Spec 双轴复审；本地 closeout validation 随后发现 Test Collection Guard 的 OIDC real Redis/总文件数 literal
  未随新增测试更新。定向复审进一步确认这些 exact counts 本身属于已退役 live-equality baseline；现已改为动态验证 canonical
  path ownership、跨 profile 唯一性与关键 entry seam 归属，最终 `pnpm verify` 以 root tests 120/120、714 expects 通过。
  最终完整复审为 Standards 0 findings、Spec 0 findings，Ticket 已 `resolved`。Review fixed point 仍为
  `eb1943c9ded32094f31e99178b1c01a18ab785f6`，最终 reviewed candidate 为
  `a919f4626fe8d51d5eb0d99c21ccceeb8f061d08`。
- 第七次完整流程在最终 production tree 上通过 Windows `pnpm verify` 3/3、全资源 `pnpm verify:ci` 1/1 与干净 E2E
  `pnpm verify:release` 1/1；后续 test-only seam fixes 未改变 production，维护者授权只运行 real Redis/component/lint/typecheck/
  docs/diff 聚焦验证。全部失败与 retries 历史仍保留，Linux/真实 CI 继续为 `pending`。两个 tickets 均为 `resolved`；merge、
  push、PR、release、部署与 archive 仍未授权。

## 验收与验证计划

- Ticket 01 使用受控 child commands 覆盖 `verify:ci`/`verify:release` 的完整顺序、fail-fast、下游未启动与 owner failure
  propagation，并运行受影响 root tooling lint/typecheck 与 `git diff --check`。
- Ticket 02 在最终候选树运行一次完整连续、流程内部无 retry 的 Windows `pnpm verify` 3/3、全资源 `pnpm verify:ci` 1/1、
  干净 E2E `pnpm verify:release` 1/1，记录简短脱敏摘要、历史 retries 和 cleanup 结果。
- Ticket 02 运行 `pnpm check:docs` 与 `git diff --check`，确认 Linux/真实 CI 仍标记 `pending`，且 Gate docs 只链接 owner
  contract。
- 准备本地合入时仍按仓库 workflow 另行取得一次性收尾授权；命令发布不构成 provider、release 或部署授权。

## 事件

- 2026-08-03 — Authorization：维护者明确授权发布四份正式 specs、delivery journals 与 24 张 implementation tickets；
  未授权代码实现或任何 Gate evidence 运行。
- 2026-08-03 — Publication：本 feature 的 spec、delivery 与 2 张 tickets 已发布；所有 tickets 保持
  `ready-for-agent`，production/test/tooling 尚未修改。
- 2026-08-06 — Implementation：以 `26687727e05f50e0b3611dc6c983f9e97204c5cb` 为 fixed point，通过 `692fd281`
  发布 `verify:ci = verify -> test:integration` 与 `verify:release = verify:ci -> test:e2e`；两个 Gate 只顺序组合 owner
  commands，并保留 fail-fast、owner diagnostics、exit code 与可观察 signal 结果。
- 2026-08-06 — Repair：双轴首轮 review 的两项 Standards findings 由 `ac3057d6` 修复；共享 recorder harness 统一净化
  Gate、Integration 与 verify 的测试控制变量并消除重复的临时日志、spawn 和 cleanup 结构。
- 2026-08-06 — Validation：root orchestration 53/53、Gate/finding 聚焦测试 9/9 通过；root lint、17 个 workspace
  typecheck、Test Collection Guard 与 `git diff --check` 通过。未运行 Windows `verify` 3/3、全资源 `verify:ci` 或干净
  `verify:release` evidence，Linux/真实 CI 继续保持 `pending`。
- 2026-08-06 — Review：对 fixed point 到候选实现的完整范围复审，最终 Standards 0 findings、Spec 0 findings；Ticket 01
  验收项全部满足并标为 `resolved`，依赖前沿推进到 Ticket 02。
- 2026-08-06 — Validation blocked：Ticket 02 的任务专属 PostgreSQL/Redis 资源预检通过，包含 cleanup Redis 受限 ACL、
  初始空 logical DB 与连通性检查。第一次且唯一一次 Windows `pnpm verify` 已启动，但本地 PowerShell 日志捕获包装器把
  child output record 提升为 terminating error，命令在返回可接受的退出结果前中断；没有通过结果可计入。依照无 retry
  约束未重跑，也未启动 `verify:ci` 或 `verify:release`，Current docs 与 candidate commit 未修改。两个任务容器、临时完整
  日志均已删除，未生成新的 E2E artifact；Linux/真实 CI 继续保持 `pending`。
- 2026-08-06 — Authorization：维护者确认第一次中断属于任务外层 PowerShell 捕获问题，授权修正捕获方式后开启一次新的
  Ticket 02 evidence 运行；仓库生产与测试行为、零 retry 和 cleanup 契约不变。
- 2026-08-06 — Validation blocked：新运行的任务专属 PostgreSQL/Redis 资源预检通过，Windows `pnpm verify` 原始连续
  3/3 通过且无 retry；随后全资源 `pnpm verify:ci` 的唯一 attempt 在 Redis profile 非零退出，Admin API production
  runtime 报告 `WRONGPASS`/`NOAUTH` authentication mismatch。依照 fail-fast 与无 retry 约束没有重跑，且未启动
  `verify:release`；Current docs、验收项与 candidate commit 未修改。两个任务容器、临时完整日志均已删除，未生成新的
  E2E artifact；Linux/真实 CI 继续保持 `pending`。
- 2026-08-06 — Authorization：维护者根据只读诊断确认继续，授权只修正 caller-owned 普通 Redis 的 default-user/password
  配置，并开启一次新的 Ticket 02 evidence 运行；cleanup Redis 继续使用独立 restricted named ACL user，仓库 owner
  production/test contract 不变。
- 2026-08-06 — Validation blocked：第三次运行在正式 evidence 前证明五个普通 Redis URL 的原始连接与派生 production
  tuple/default-user 连接均通过，同时通过 cleanup ACL/空库/identity 与 PostgreSQL readiness 预检。Windows
  `pnpm verify` 原始连续 3/3 通过且无 retry；全资源 `pnpm verify:ci` 的唯一 attempt 随后在 OIDC Provider composition
  非零退出，PostgreSQL 报告缺少 `user_profile_dirty` relation。依照 fail-fast 与无 retry 约束没有重跑，且未启动
  `verify:release`；Current docs、验收项与 candidate commit 未修改。两个任务容器、临时完整日志均已删除，未生成新的
  E2E artifact；Linux/真实 CI 继续保持 `pending`。
- 2026-08-06 — Authorization：维护者根据 PostgreSQL 只读诊断再次确认继续，授权为各 owner 使用 task-owned 独立
  databases，对 API/OIDC composition exact databases 应用完整 migrations 并在正式 evidence 前核对 journal 与 required
  schema；Redis 资源契约不变。
- 2026-08-06 — Validation blocked：第四次运行的六个 PostgreSQL databases readiness、API/OIDC migrations 与 schema
  inventory、五个普通 Redis 双路径连接及 cleanup ACL/空库/identity 均在正式 evidence 前通过。Windows `pnpm verify`
  原始连续 3/3 通过且无 retry；全资源 `pnpm verify:ci` 的唯一 attempt 中 API composition 通过，但 OIDC Provider
  composition 以 Postgres client 收到 Object 而非 string/buffer 的 `TypeError` 非零退出。依照 fail-fast 与无 retry
  约束没有重跑，且未启动 `verify:release`；Current docs、验收项与 candidate commit 未修改。两个任务容器、临时完整日志
  均已删除，未生成新的 E2E artifact；Linux/真实 CI 继续保持 `pending`。
- 2026-08-06 — Authorization：维护者根据只读诊断确认 OIDC composition 共用 raw postgres.js/Drizzle client 属于仓库测试
  wiring bug，授权分离 raw fixture client 与 Drizzle client，并在修正后开启新的 Ticket 02 evidence。聚焦运行进一步暴露
  Session destroy 遗留 reverse UID mapping 后，维护者授权在现有 public Redis adapter seam 内补齐最小 cleanup 与回归断言。
- 2026-08-06 — Implementation：`d14e9083` 为 OIDC composition 分离 raw fixture 与 Drizzle PostgreSQL clients，避免 Drizzle
  serializer mutation 污染 raw JSON seed；Session destroy 在 Provider Session anchor 成功销毁后，于同一个 Redis `DEL`
  中删除可解析 payload 对应的 reverse UID mapping。公开 adapter component 回归 14/14、真实 composition 1/1、OIDC lint、
  typecheck 与 `git diff --check` 通过。
- 2026-08-06 — Validation blocked：第五次运行的六个 PostgreSQL database readiness、API/OIDC migrations 与 journal/schema
  inventory、五个普通 Redis 双路径连接、cleanup ACL/空库/identity 以及初始 E2E Docker inventory 均在正式 evidence 前
  通过。Windows `pnpm verify` 原始连续 3/3 通过且无 retry；全资源 `pnpm verify:ci` 的唯一 attempt 运行期间 Docker
  Desktop Linux engine 退出，OIDC composition 随后因 Redis/PostgreSQL connection refused 非零退出。依照 fail-fast 与
  无 retry 约束没有重跑，且未启动 `verify:release`；E2E 未开始且未生成新 artifact，Current docs、验收项与 candidate
  commit 未修改。完整临时日志与 helper 已删除；两个精确命名任务容器待 engine 可用后确认并清理。Linux/真实 CI 继续
  保持 `pending`。
- 2026-08-06 — Authorization/Cleanup：维护者授权 Ticket 02 范围内后续问题自动诊断、最小修复、清理并重跑，要求保留全部
  原始失败与 retry 历史；Docker Desktop 恢复后，已精确删除第五次运行遗留的两个任务容器，并确认 gate02 container/network/
  volume inventory 为零。
- 2026-08-06 — Setup retry：新的 evidence runner 第一次在 formal marker 前因 PowerShell 把 Docker 拉取 `redis:8.8` 的正常
  stderr 提升为 terminating error 而停止；第二次在 formal marker 前完成 API migration，但 `Start-Process` timeout overload
  未提供可观察 exit code，被 runner 保守判为非零。两次都没有启动 Gate，task-owned containers 均清理，E2E artifact 为零；
  runner 分别改为显式隔离 native stderr 与使用 `-Wait` 取得可靠 exit code 后继续。
- 2026-08-06 — Validation：第六次正式运行在 Windows 上通过六个独立 PostgreSQL databases readiness、API/OIDC 完整
  migrations 与 journal/schema inventory、五个普通 Redis raw URL/production tuple default-user 双路径连接、cleanup Redis
  restricted ACL/空库/identity，以及初始 clean E2E inventory。随后 `pnpm verify` 连续 3/3 通过（79.7s、10.1s、9.1s），
  全资源 `pnpm verify:ci` 1/1 通过（425.0s），clean `pnpm verify:release` 1/1 通过（783.5s）。本轮顶层命令内部没有 retry，
  但 feature 历史存在五次正式失败和本轮前两次 setup retries，故不声明满足原始 no-retry acceptance。
- 2026-08-06 — Cleanup/Docs：第六次运行的 task-owned containers 与 Full-system exact project containers/networks/volumes
  最终 inventory 均为零；唯一新增 E2E result directory、完整临时日志和 helper 已精确删除，未保存 machine receipt、完整日志
  或 secret。Current commands/testing docs 已收口三个 Gate 的语义、Windows 本地聚合 evidence 与 adoption 状态；Linux/真实
  CI 继续保持 `pending`。Ticket 仍为 `claimed`，等待独立 Standards/Spec 双轴复审。
- 2026-08-06 — Decision：维护者明确裁定 evidence acceptance 以最终存在一次完整连续、流程内部 fail-fast 且无单阶段 retry
  的绿色链为准；环境或代码根因诊断修复后允许从 Windows `verify` 3/3 起整体重启。先前五次正式失败和两次 setup retries
  继续如实保留，但不再阻止第六次完整成功流程用于验收。该裁定已同步到正式 spec、Ticket 02 与 Current testing docs；Ticket
  仍保持 `claimed`、checklist 未勾选，等待双轴复审。
- 2026-08-06 — Review：以 `eb1943c9ded32094f31e99178b1c01a18ab785f6` 为 fixed point 的双轴首轮 review 得到 Spec 0
  findings、Standards 1 个 P1。`d14e9083` 引入的 Session destroy 无条件删除 UID reverse mapping；同 UID 已被新 session id
  接管时，旧 artifact 延迟销毁会删除新 owner，违反 owner-aware compare-delete 边界。
- 2026-08-06 — Repair：按 TDD 在 public `RedisOidcAdapter` seam 先加入 stale-destroy 回归，红灯为 14 pass/1 fail；
  `d1c7d03e` 随后以单个原子 Lua 操作删除旧 artifact/consumed key，并仅在 reverse key 当前值仍等于旧 session id 时删除 UID
  mapping。回归转为 15/15，既有 Provider Session anchor destroy 语义保持通过；全新 PG18.4/Redis8.8 上 OIDC composition
  1/1 通过（15.1s），OIDC lint、typecheck 与 `git diff --check` 通过。
- 2026-08-06 — Validation：production tree 改变后的第七次完整流程通过六个独立 PostgreSQL databases readiness、API/OIDC
  migrations 与 journal/schema inventory、五个普通 Redis raw URL/production tuple default-user 双路径连接、cleanup Redis
  restricted ACL/空库/identity，以及初始 clean E2E inventory。随后 `pnpm verify` 连续 3/3 通过（99.0s、10.1s、9.1s），
  全资源 `pnpm verify:ci` 1/1 通过（366.2s），clean `pnpm verify:release` 1/1 通过（603.2s）；流程内部无 retry。
- 2026-08-06 — Cleanup：第七次运行的 task-owned containers 与 Full-system exact project containers/networks/volumes 最终
  inventory 均为零；唯一新增 E2E result directory、完整临时日志和 helper 已精确删除，未保存 machine receipt、完整日志或
  secret。Linux/真实 CI 继续保持 `pending`，Ticket 仍为 `claimed`、checklist 未勾选，等待 Standards/Spec 复审。
- 2026-08-06 — Review：第二轮完整范围复审得到 Spec 0 findings、Standards 1 个 P1。component `FakeRedis.eval` 根据
  `delete_owned_session_artifact` marker 自行实现 compare-delete，导致 stale-destroy 回归没有执行真实 production Lua，违反
  Redis/Lua 行为必须归属真实 `redis`/`composition` profile 的测试架构规则。
- 2026-08-06 — Decision：维护者裁定本轮只改变测试 seam，production code 相对 `c31a4cbc` 未变；第七次完整
  3/3 → 1/1 → 1/1 evidence 继续适用于同一 production tree。本轮只运行受影响聚焦验证，明确不重跑 root `verify`、
  `verify:ci` 或 `verify:release`。
- 2026-08-06 — Repair/Validation：component 删除 stale-destroy 语义断言及 marker 解释，三 key `EVAL` 只返回固定 protocol
  stub；stale-destroy 公共行为回归迁入 OIDC real Redis profile，在 task-owned Redis8.8 上实际执行 production Lua，验证旧 id
  artifact 删除、新 id artifact 保留、UID reverse key 仍指向新 id，且 `findByUid` 返回新 owner。真实 Redis 单文件 1/1、
  component 文件 14/14、OIDC typecheck 与 `git diff --check` 通过；OIDC lint 首次发现新增 `describe` 标题大小写规则，最小
  修正后通过。task-owned Redis container 精确清理且 inventory 为零；composition 与 root Gates 按维护者裁定未重跑。
- 2026-08-06 — Review：第三轮完整范围复审得到 Standards 0 findings、Spec 1 个 P2。维护者授权的正常 Session destroy
  cleanup 回归在 test-seam 修复时被移除；real Redis 文件仅证明 stale destroy 保留新 owner，未证明当前 owner 销毁时 artifact、
  consumed 与 reverse UID keys 全部清除。
- 2026-08-06 — Repair/Validation：在现有 real Redis public adapter seam 增加正常 owner 分支，通过 `upsert`、`consume`、
  `destroy` 建立并销毁真实状态；destroy 前三个 keys inventory 为 `[1,1,1]`，之后为 `[0,0,0]`，且 `findByUid` 返回
  `undefined`。task-owned Redis8.8 单文件 2/2、component 文件 14/14、OIDC lint、typecheck 与 `git diff --check` 通过，
  Redis container 精确清理且 inventory 为零。production code 未变，composition 与 root Gates 按维护者裁定未重跑。
- 2026-08-06 — Review：以 `eb1943c9ded32094f31e99178b1c01a18ab785f6` 为 fixed point、
  `9dfe2914e48c3a5e79366796ce28a8d60547bde0` 为最终 candidate 的第四轮完整范围复审得到 Standards 0 findings、Spec 0
  findings。第七次 3/3 → 1/1 → 1/1 完整 evidence 与随后维护者授权的 test-only 聚焦验证均保持有效；Ticket 02 全部验收项
  已满足并标为 `resolved`，Linux/真实 CI 继续保持 `pending`。
- 2026-08-06 — Closeout validation blocked：`b0e6a7bd` resolved handoff 后的本地 `pnpm verify` 在 root Test Collection Guard
  失败；新增第二个 OIDC real Redis 测试文件后，canonical literals 仍期望 `integration/redis` 为 1、`allFiles` 为 25，实际
  分别为 2 与 26，root 结果为 119/120。验证按 fail-fast 非零退出；Ticket 02 重新标为 `claimed`，最终 evidence 与 Current
  docs/canonical consistency 两项验收重新等待复审。
- 2026-08-06 — Repair/Validation：仅将 root Test Collection Guard 的 OIDC `integration/redis` literal 从 1 更新为 2、
  `allFiles` literal 从 25 更新为 26。聚焦 `scripts/__tests__/test-orchestration.test.ts` 53/53、538 expects 通过，
  `git diff --check` 通过；最终 `pnpm verify` 通过，其中 root tests 为 120/120。此前第七次完整 3/3 → 1/1 → 1/1 evidence、
  全部失败与 retries 历史及 Linux/真实 CI `pending` 状态不变；Ticket 02 保持 `claimed`，等待定向复审，未创建新 handoff。
- 2026-08-06 — Review：对 `2d432c79` 的定向复审得到 Spec 0 findings、Standards 1 个 P1。OIDC collection 测试中的逐 profile
  exact counts 与 canonical total literal 构成已退役 live-equality/migration baseline；每增加合法测试都要求修改 root test，违反
  Collection Guard 只动态验证唯一收集、路径归属与 task 可达性且不保存逐文件 mapping 的架构契约。
- 2026-08-06 — Repair/Validation：移除 OIDC 的全部逐 profile/总数量 literals，不建立替代的逐文件或数量 baseline；改为对实际
  收集结果动态验证 canonical root 归属、跨 profile 唯一性，并明确 process/composition entry resource seams 由对应 profile
  收集。聚焦 `scripts/__tests__/test-orchestration.test.ts` 53/53、539 expects 通过；最终 `pnpm verify` 通过（79.4s），其中 root
  tests 为 120/120、714 expects。Ticket 02 保持 `claimed`，等待定向复审，未创建新 handoff；既有完整 evidence、失败与 retries
  历史及 Linux/真实 CI `pending` 状态不变。
- 2026-08-06 — Review/Handoff：以 `eb1943c9ded32094f31e99178b1c01a18ab785f6` 为 fixed point、
  `a919f4626fe8d51d5eb0d99c21ccceeb8f061d08` 为最终 candidate 的完整双轴复审得到 Standards 0 findings、Spec 0 findings。
  OIDC Collection Guard live-equality finding 已由动态 path ownership、唯一性与关键 seam 归属断言修复，最终 `pnpm verify` 保持
  root tests 120/120、714 expects 通过；Ticket 02 全部验收项满足并标为 `resolved`。Linux/真实 CI 继续保持 `pending`，merge、
  push、PR、release、部署与 archive 仍未授权。
