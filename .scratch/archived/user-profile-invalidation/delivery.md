# User Profile 失效深化开发记录

## 当前状态

- 2026-07-25 已发布 feature spec，并按维护者确认的 expand–migrate–contract 方案发布 10 张 implementation tickets。
- `01 — 扩展 UnitOfWork transaction lifecycle` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `02 — 建立事务绑定的直接用户失效内核` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `03 — 完成范围型变化解析与应用 composition` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `04 — 让 worker maintenance 复用统一 dirty workflow` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `05 — 迁移用户与任职写路径` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `06 — 迁移组织与岗位写路径` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `07 — 迁移角色与角色分配写路径` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `08 — 收缩旧失效接口和投影 composition` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `09 — 彻底退役 ExpandUserProfileScope 协议` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- `10 — 锁定架构边界与发布准备度` 已实现并通过双轴评审，ticket 状态为 `resolved`。
- 21 个生产旧 marker 调用已全部完成迁移，production 旧 marker 调用为 0；旧 marker 与投影 composition
  surface 已收缩到 User Profile package seam，旧 scope-expansion 协议及专用 repository 已完全退役。
- 当前无剩余 implementation ticket；feature implementation 与最终 fixed-point review 均已完成。
- 下一安全动作是等待维护者明确确认目标分支 `main`、merge strategy（默认建议 squash），并授权一次本地事务：处理目标
  分支漂移、运行一次 `pnpm verify`、调用 `archive-feature`、本地 merge、确认交付提交可达并删除本地功能分支。
- 该授权不包含 push、远端分支删除或 deploy。
- 目标分支为 `main`，功能分支为 `codex/user-profile-invalidation`。

## 验收与验证计划

- Ticket 内循环优先运行 User Profile Read Model、API Core、API、Admin API 和 Worker 的最高相关接口测试，以及受影响 workspace 的 lint/typecheck。
- Composition ticket 必须运行 API 与 Admin API 的 package-local process smoke。
- 文档 ticket 运行 `pnpm check:docs`；每张 ticket 提交前运行 `git diff --check`。
- 全部 tickets 及其 Standards/Spec 评审已清零；`pnpm verify` 尚未运行，按 workflow 保留到明确授权本地归档与合入后，
  在最终实现内容上运行一次。
- 发布前按 spec 执行旧 scope job producer 停止确认、队列全状态排空和 worker-last 门禁；实际部署不属于本地实现授权。

## 事件

- 2026-07-25 — Decision：以事务绑定的 `UserProfileInvalidation.recordChanges` 作为业务调用方唯一 seam。
- 2026-07-25 — Decision：本次彻底退役 `ExpandUserProfileScope` job、schema、producer、consumer 和公开 scope enum。
- 2026-07-25 — Decision：维持 transaction dirty fact、best-effort after-commit BullMQ wake-up 与 repair 恢复，不引入 outbox 或数据库 migration。
- 2026-07-25 — Decision：保留 `UserProfileDirtyReason.PrivilegeUpdated` 以兼容历史 dirty row，但不增加公开 privilege change。
- 2026-07-25 — Authorization：维护者确认 10-ticket 拆分及 blocking edges，仅授权发布 tickets。
- 2026-07-25 — Published：implementation tickets 已按依赖顺序写入本地 tracker；首个依赖前沿为 ticket 01。
- 2026-07-25 — Resolved Ticket 01：implementation commit
  `4f3c59c2a44658919d937243da48896e21b441ae`；UnitOfWork 聚焦测试 8/8、API Core 全量测试 103/103，
  API Core lint/typecheck 与 API、Admin API 下游 typecheck 均通过；Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Resolved Ticket 02：implementation commit
  `9c37086ebf0770c401558ee9c40f265ad2b85f5a`；User Profile invalidation seam 测试 9/9、package 测试
  44/44，lint/typecheck 与 API、Admin API、Worker 下游 typecheck 均通过；Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Resolved Ticket 03：implementation commit
  `e4b3b65924c2bce3ca8b6d1e1335e30e05e444fe`；首次 Standards 评审指出 Admin API 缺少真实 entry smoke
  及相应编排和资源守卫，并指出 affected-user repository 测试 fake 依赖查询顺序，fix commit
  `027351c1c7aae8c7a62607489c5959f303c68514` 完成加固；后续 Current 测试文档同步 finding 由 fix commit
  `57eaf846547970dbf0083bc75901974ff6363abf` 修复。User Profile 53/53、Role Resolution 7/7、API Core
  103/103、API 214/214、Admin API 122/122、两端 architecture 与 smoke、根编排 14/14 及相关 lint/typecheck、
  `pnpm check:docs` 均通过；最终 Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Resolved Ticket 04：implementation commit
  `a085db03649d508b16c7f3a91e7288fb888b6c13`；首次 Standards 评审指出 worker consumer 依赖 provider-owned
  类型、缺少真实 entry smoke、测试耦合 Drizzle fluent chain 与内部 compatibility factory，以及 module 返回
  speculative `rebuildProcessor`，fix commit `4cb17f85778690e01065d7e937c2f8f6c7c39e99` 完成加固。User Profile
  59/59、Worker 14/14、Contracts 18/18、Jobs 7/7、API/Admin API/Role Resolution architecture
  21/21、15/15、5/5、API/Admin API/Worker smoke 各 1/1、根编排 15/15 及相关 lint/typecheck、
  `pnpm check:docs` 和 `git diff --check` 均通过；最终 Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Resolved Ticket 05：implementation commit
  `a5c3c135ce1174feb8695d4bc57722ab2215bf7a` 将 API 与 Admin API 的 14 条用户、任职、供应商和 User
  Resignation 写路径迁移到 `recordChanges`，并保持 session revocation 的通用 `tx.afterCommit` 行为。首次 Spec
  评审有 1 个 partial finding，首次 Standards 评审有 1 个 hard finding：供应商 transaction 未把 request
  observability 交给 lifecycle，且五个 consumer port 依赖 provider-owned 的宽
  `UserProfileSourceChange`，形成 speculative generality。Fix commit
  `067cb1a22f9b9a6b9c074f81ff6c140e2d3a28ca` 增加新旧供应商共同 transaction seam 的 observability
  测试，并把五个 port 收窄为相邻的 user-only、employment-only 或二者 union contract。最终 API focused
  18/18、Admin API focused 29/29、API 215/215、Admin API 122/122、User Profile 59/59、API Core
  103/103、API/Admin API architecture 21/21、15/15、两端 smoke 各 1/1 及相关 lint/typecheck 均通过；
  `rg` 确认本票 14 个 `recordChanges` 调用且旧 projection 引用为 0，剩余 7 个旧 marker 仅属于 Ticket 06/07；
  `pnpm check:docs` 与 `git diff --check` 通过；最终 Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Resolved Ticket 06：implementation commit
  `5ed176f04761603986ef3c7c971674ca541442e2` 将 API 组织更新、Admin 组织更新与删除、Admin 岗位更新与删除
  5 条写路径迁移到最窄 organization-only 或 position-only `recordChanges` port，并保持领域写入、审计和事务错误
  行为不变。Focused 14/14、API 215/215、Admin API 122/122、User Profile 59/59、API Core 103/103，
  API/Admin API architecture 与 port contracts 22/22、16/16，两端 process smoke 各 1/1，四个相关 workspace
  lint/typecheck、`pnpm check:docs` 与 `git diff --check` 均通过；`rg` 确认本票 5 个 `recordChanges` 调用且旧
  marker 引用为 0，剩余 2 个旧 marker 仅属于 Ticket 07；Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Resolved Ticket 07：implementation commit
  `063af710b87fa99a65643b97799e523167fb7321` 将角色状态变化、角色分配创建、范围修改和删除迁移到最窄
  role-only 或 role-assignment-only `recordChanges` port。范围修改在一次调用中覆盖写前与写后 target，删除使用
  删除前保存的 target；app-local assignment-to-scope 映射已移除，领域 CRUD、审计和 API 行为保持不变。Role service
  8/8、Role adapter 3/3、Admin API 125/125、Admin architecture 与 port contracts 16/16、Role Resolution 7/7、
  User Profile 59/59、API Core 103/103、Admin process smoke 1/1、Admin lint/typecheck、`pnpm check:docs` 与
  `git diff --check` 均通过；21 个生产旧 marker 调用已全部迁移，production 旧 marker 调用与本地 scope mapping
  均为 0；Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Decision：维护者将 User Profile 架构守卫定位为仓库惯例下的维护性回归检查，而非安全边界；
  不再扩展刻意混淆、变量 dynamic import、string-named specifier、非规范 casing 或 quoted nested destructuring
  等对抗性语法，以避免重新引入通用 dataflow/alias 分析复杂度；production exports、typecheck 与 lint
  继续作为并行防线。
- 2026-07-25 — Resolved Ticket 08：initial implementation `1bcb8eda`，fix chain
  `707b737e`、`038bf9e8`、`779d8388`、`fa42aa81`，scope decision `20d29ae0`。Boundary 6/6、
  API/Admin architecture 22/22、16/16，API Core 103/103、User Profile 64/64、API 216/216、
  Admin API 126/126、Worker 14/14、Contracts 18/18、Jobs 7/7，三端 smoke、七个 workspace
  lint/typecheck、docs guard 与静态审计均通过；最终 Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Resolved Ticket 09：implementation `00544e1e` 退役 scope-expansion contract、producer、
  worker consumer、job ID helper 与专用 repository；review fixes `f45bf85b`、`e360bdd1` 加固 worker 拒绝边界、
  收窄 queue port、删除泛型 payload registry、同步 Current 文档并补齐 factory 返回类型。Contracts 19/19、
  Jobs 6/6、User Profile 60/60、Worker 14/14、API Core 103/103、Role Resolution 7/7、API 216/216、
  Admin API 126/126，API/Admin/Role architecture 22/22、16/16、5/5，三端 process smoke、根 lint/typecheck、
  docs guard、静态审计与 `git diff --check` 均通过；最终 Standards/Spec 评审均为 0 findings。
- 2026-07-25 — Resolved Ticket 10：implementation `c0dfd827` 将 User Profile boundary guard 收敛到仓库惯例的
  static named/type import 与 re-export、常规跨 package 路径和直接 legacy identifier，并增加 production export
  guard；Current backend/testing docs 固定 `UserProfileInvalidation` ownership 与公开测试 seam，Current runbook
  固定 producer 停止证明、waiting/delayed/active/failed/repeatable 五态清零和 API → Admin API → worker-last 门禁。
  Review fix `47666c70` 删除旧 dirty-marker ownership 陈述，明确 projection repositories 与 tx-bound role resolver
  由失效模块内部创建。User Profile 59/59、API 216/216、Admin API 126/126、Worker 14/14、Contracts 19/19、
  Jobs 6/6、API Core 103/103，API/Admin architecture 22/22、16/16，API/Admin/Worker process smoke 各 1/1，
  七个相关 workspace lint/typecheck、`pnpm check:docs`、`git diff --check` 与 production legacy `rg` 均通过；
  最终 Standards 0 findings、Spec 0 findings。`pnpm verify` 尚未运行，按 workflow 保留到显式本地归档与合入授权后一次。
- 2026-07-25 — Final Review：以 merge-base `628ed885ba28a84adb0cd637ab3c1649c335acc4` 至 HEAD 的 98 files
  为完整集成范围，复核 21 个旧写点映射、UnitOfWork lifecycle、transaction-bound invalidation、worker
  maintenance/rebuild、queue wire 兼容与旧协议退役、API/Admin composition、architecture/export guards、Current
  docs 和 worker-last runbook。最终 Standards 0 findings、Spec 0 findings；550 个定向普通测试、API/Admin/Worker
  process smoke 3/3、`pnpm check:docs`、`git diff --check` 与 clean tree 均通过。`pnpm verify` 尚未运行，按 workflow
  保留到维护者显式授权本地归档与合入事务后一次。
