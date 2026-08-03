# 10 — 建立维护窗口 backfill 与全量门禁

**What to build:** 提供可重复演练的批量 backfill、验证与约束收紧流程，在硬切换前为所有 Subject 建好 Profile/Facts/Access Barrier，并把现有 Custom SSO Client 显式迁移到新配置。

**Blocked by:** 03, 05, 06

**Status:** resolved

- [x] 所有 schema 变化都通过新 migration 分阶段完成，不修改历史 migration 或 snapshot；先允许回填，再在全量验证后收紧约束和索引。
- [x] 版本化 backfill command 采用批处理、可断点重复执行并提供独立 verify 模式，不以单用户循环 mutation、schema push、运行时 lazy migration 或双读完成迁移。
- [x] User Profile/Facts backfill 覆盖全部用户，包括禁用和软删除账号，并为每个用户保留原 Subject Identifier、发布可验证的 schema/version 与 processed Dirty 状态。
- [x] Access Barrier backfill 覆盖全部 Subject：不可用账号形成 `disabled`，可用账号只有在当前 Profile/Facts 发布完成后形成 `enabled`；不存在用缺失 record 表示启用的情况。
- [x] Client backfill 通过显式迁移清单确认每个已启用 Custom SSO Client 的 mode、Redirect、Claims、callback/logout、ORCAS 与目标 enabled 状态，不从 OIDC 配置或模糊默认值推断。
- [x] Independent Client 的新 Secret 只生成和展示一次，并在清单中记录已安全交付的确认状态而非 Secret；未确认 Client 不能通过切换门禁。
- [x] 全量 verify 至少检查用户/Subject/Profile/Barrier 数量、Subject 非空与唯一、schema 版本、source/Dirty version 一致、Dirty processed、Facts 可解析、Client config 合法及 Independent Secret 就绪；任一失败返回可定位报告并阻止收紧或切换。
- [x] verify 成功后将 User Profile 的 Subject Identifier、source Dirty Version 与 Subject Facts 收紧为目标非空约束，并建立 Subject Identifier 唯一索引及必要 Client check constraints。
- [x] 大表唯一索引是否并发创建由生产规模近似环境的锁等待证据决定；并发 DDL 不得放入普通事务。
- [x] 迁移流程不支持 `userExcluding`、默认宽 Claims 或其他按用户绕过；每次运行记录版本、批次进度、失败与可安全重试边界。
- [x] 真实 PostgreSQL rehearsal 证明 backfill 幂等、verify 失败阻断、约束收紧、索引行为与显式数据库回滚步骤；Redis contract 证明批量 Barrier/Facts 预热不覆盖更新版本。

交付摘要：

- review fixed point 为 `d0e7ad65`；implementation/fix commits 为 `06f1aab0`、`62bdf101`、`cc7a75f2`。
- 本地 ordinary/focused tests、Worker production process smoke、受影响 Worker/DB lint 与 typecheck、
  `check:docs`、`check:env-names`、`check:architecture` 及 `git diff --check` 均通过。最后一次退出生命周期修复后，
  Worker ordinary tests 27/27、完整 smoke 4/4、DB ordinary tests 15/15；verifier process smoke 另连续复跑 5/5。
- 临时专用 PostgreSQL/Redis 容器上的实际外部资源验证：DB PostgreSQL lane 初始 runner 7/7，加入 Drizzle journal
  replay 后完整 lane 9/9；User Profile focused PostgreSQL files 中 authority runner 当时报告 4/4、Subject Facts
  reader 1/1、publication 9/9、cutover rehearsal 1/1，review fix 后 Ticket 相关 publication + cutover files 报告
  10/10；Worker Client cutover PostgreSQL contract 1/1、6 assertions；User Profile Redis lane 4/4；API Core Redis
  lane 22/22。临时容器与随机 schema 均已清理，地址未写入仓库。
- 完整 `pnpm --filter @iam/user-profile-read-model test:postgres` **不宣称 green**：既有
  `subject-access-transition.postgres.test.ts` 会在 Bun external promise matcher 上挂起；诊断改为 direct-await 后又
  暴露两个与 Ticket 10 无关的既有 contract 缺口——wrapped PostgreSQL error code 不可见，以及 `committed` + NULL
  target 未被 CHECK 拒绝。诊断性改动已完全恢复，本 ticket 只声明上述 Ticket 10 相关 focused PostgreSQL files green。
- 三轮完整 Standards / Spec 复审结束后最终为 Standards findings 0、Spec findings 0；第二、三轮 reviewer 未配置专用
  URL，因此未自行重跑外部 lanes，只复核实现代理证据与本地 ordinary/smoke/static 结果。
