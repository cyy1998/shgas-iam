# 共享契约与数据库

本文记录 package 边界、repository 事务规则，以及 Drizzle/PostgreSQL 布局约定。修改数据库 schema 或 migration 前，
先使用 schema 相关 skill 并遵守 workflow 门禁。

## 共享 Package 边界

- 跨 app enum 和稳定常量放在 `packages/contracts`。
- client-scoped 主体信息裁剪、Subject Claim Catalog 与协议中性投影类型放在
  `packages/client-subject-projection`。调用方只通过公开 `resolve` Interface 提交 Subject Identifier、
  `clientCode` 和 `SubjectClaimSelection`；Subject Facts、Subject Access 与 Authorization Freshness 由
  composition 注入最窄 port。协议 wire mapper 只能消费 package root public Projection Interface，不能导入其他
  core subpath 或直连 Facts persistence、client 配置、runtime 与 transport。Custom SSO V2 wire 的 runtime schema、
  派生 TypeScript type、mapper 与 preview 统一由 `@iam/client-subject-projection/custom-sso` 拥有；API 只能复用该
  schema 添加 OpenAPI metadata，不得重写第二份 wire shape。Package root 拥有 Catalog/Selection V2、带 canonical responsibility 子项的协议中性
  Employment Profile、V2 projection service 与 Custom SSO V2 strict wire；responsibility 仍是
  `profile:employments` 的原子子项，不形成独立 claim，也不进入 authorization employment。
- 共享 DTO schema、DTO type、pure domain rule、audit helper 和可复用 business error 放在 `packages/domain`。
- 共享 BullMQ helper 放在 `packages/jobs`。
- 角色分配的正向 Effective Role 与反向受影响用户解析放在 `packages/role-assignment-resolution`；该 package
  接收 composition root 提供的 `DbClient`，调用方不复制 assignment 或组织闭包匹配规则。
- Organization Responsibility 的正向 Effective Type/target identity 与按 target Organization/Type 的反向 holder
  Employment 解析放在 `packages/organization-responsibility-resolution`。该 package 只接收 `DbClient` 和调用方给定的
  observation time；引用、父生命周期、Period 与 Open cardinality 异常整批 fail closed，调用方不得复制 SQL 或读取时修复。
- Role Assignment 正向解析只把 Employment 本身、assignment target 和角色的启用/删除状态作为运行时有效性，并由
  resolver 过滤可选
  client 范围；Employment 的 Position 与直属 Organization 状态属于 Employment Integrity，不再由正向解析静默过滤。
  User Profile Builder 在发布前加载并校验全部 Open Employment 的父对象事实，异常时整次 fail closed。反向 dirty-scope
  解析有意更保守，只过滤失效任职，不因角色、岗位或组织已失效而漏掉重建。
- Role Assignment 的正向与反向操作都批量接收 ID、处理重复和空输入，并返回稳定排序结果。Admin 角色管理 CRUD 与
  role-privilege 聚合仍属于
  调用方，不进入 resolver。
- user-profile read-model producer/query/worker 逻辑放在 `packages/user-profile-read-model`。该 package 拥有
  version-bound Subject Facts 构建、`user_profile` 与 dirty row 的 PostgreSQL atomic publication、提交后的
  Redis monotonic publisher，以及 `subject-facts` subpath 下的 Redis read-through、单主体 single-flight、
  PostgreSQL 窄行重载与 Dirty freshness 仲裁；调用方不复制 profile/facts projection、cache repair 或版本仲裁规则。
- User Profile v3 通过 `@iam/user-profile-read-model` 默认入口暴露 schema、Redis publisher/cache、strict Subject Facts
  read-through/freshness reader 与只读 query seam；builder/publication 只由 `worker` subpath 组装。Internal Detail、Internal/Public
  legacy adapter 与 Delegation 基础搜索从同一个 `user_profile` v3 row 返回严格 Detail；canonical Filter engine 只查询并校验已发布的
  Search Document，Internal Filter DSL 从同一行的类型化列返回 `UserProfileBase`，不读取 Detail 或回查 source tables。Responsibility Snapshot 子项复用 Client Subject Projection
  的协议中性 contract，read-model 仍拥有 resolver 驱动的 Snapshot build。版本无关 Worker maintenance/readiness 命令复用
  同一 dirty/job/publication 与两项全量 gate；active Worker consumer、Internal User、Custom SSO 与 OIDC composition 只使用
  v3，同一 live User 不得混写、双读、fallback 或建立版本选择。Client Protocol V2 不随 Profile 命令推进。
- App-private enum、schema 和 error 可以留在所属 app 内。

## Repositories 与 Transactions

- 仓储使用来自 `@iam/db` 的 Drizzle，并通过 `createXRepository(db)` factory 创建；`db` 绑定 root
  `DbClient` 或 transaction `DbClient`。
- Business service 方法不应把 `tx` 参数传给 repository 调用。
- 事务性后端 workflow 应使用 app-local `UnitOfWork`。
- Transaction callback 接收 tx-bound repository、audit writer port 和 `afterCommit` registration port；业务代码不传递
  raw transaction client。
- Redis/cache/OIDC/SMS/fetch side effect 默认不在数据库 transaction callback 内直接执行；应在 callback 外执行，
  或注册 after-commit task。唯一例外是
  [后端架构](backend-architecture.md#client-subject-projection)
  定义的既有 Custom SSO Client runtime pre-commit coordination fence：它必须在 Client row lock 后、任何业务
  写入前建立，只保存有界 TTL ownership token，并具备 heartbeat、commit 前 ownership check、已确认 rollback
  才 abort、`afterCommit.required` complete 与 reader fail-closed。Client create 因不存在可锁行而不使用该例外，
  只在 commit 后 required invalidation。不得借此在 transaction 内执行不可逆业务副作用。
- `required` after-commit 用于调用契约要求完成的动作，失败会在数据库提交后返回错误；`bestEffort` 用于可恢复动作，
  失败只记录日志。两种模式都不能回滚已经提交的业务事实。完整语义见
  [后端架构](backend-architecture.md#transactions-与-aftercommit)。

## Drizzle Schema 布局

- Drizzle table definition 放在 `packages/db/src/schema/<domain>/*.ts`。
- Relation definition 放在 `packages/db/src/relations/<domain>/*.ts`。
- Migration 放在 `packages/db/src/migrations/`。
- 保持 domain-level 和 top-level schema/relation export 同步，例如 `packages/db/src/schema/core/index.ts`、
  `packages/db/src/relations/core/index.ts`、`schema/index.ts` 和 `relations/index.ts`。
- 使用 `snakeCase.table` / `snakeCase.schema`；TypeScript property 名称保持 camelCase，数据库 table/column 名称
  使用 snake_case。
- 使用 `drizzle-orm/zod` 生成 table-derived Zod schema。
- Join table 的 primary key、index 和 uniqueness constraint 保持显式定义。

### User Profile publication schema

- `user_profile` 的 current shape 固定为 17 列。`subject_identifier`、`name`、`source_dirty_version` 与
  `subject_facts` 均为 `NOT NULL`，`subject_identifier` 由普通唯一索引保证全表唯一；收紧 migration 在任何 DDL
  之前验证全量 user/profile/dirty coverage、Subject Identifier 映射、schema/version 与 Subject Facts shape，失败时
  使用 `23514` 中止且不改变 staged schema。
- `source_dirty_version` 的数据库 CHECK 只接受正 bigint；`subject_facts` 的数据库 CHECK 只约束为 JSON object，
  strict v3 与顶层只允许 `employments` 由唯一 active Worker writer 和 read-side parser 在应用边界保证。数据库仍可
  保留历史 V1 row 供迁移核验，但 active runtime 不双读、不 fallback。查询用 `search_doc` 保留现有 GIN，
  `subject_facts` 不建立 GIN。普通唯一索引需要在 maintenance
  freeze 中执行；显式 rollback 只回退本次收紧的唯一索引、四个 `NOT NULL` 与相关 CHECK。Drizzle-migrated database
  必须通过 package rollback command 在同一 transaction 内精确补偿该 migration 的 name、folder timestamp 与 SHA-256
  journal identity；不得删除或改写其他 migration 行。同名 identity 不一致时 fail closed，raw-SQL rehearsal 则可直接运行
  migration 目录中的幂等 DDL rollback。
- Worker publication transaction 必须锁定并重验同一 `user_profile_dirty` 的 user/version/processing 状态，再以
  单调 `source_dirty_version` 写入或删除 profile，并在同一 transaction 标记 dirty processed。Redis publication
  只能发生在 PostgreSQL 提交后，失败不得回滚已提交事实。
- Employment Cutover Verifier 通过 `@iam/user-profile-read-model/worker` 的公开 read-side seam 在 PostgreSQL
  `READ ONLY` transaction 中取得按 Employment ID 排序的一致 snapshot，只联接 Position 与直属 Organization 事实。
  Verifier 不写数据库、不从 `updateTime` 推断结束时间，也不生成修复 SQL；全部非墓碑 blocker 以稳定分类和完整
  Employment ID 集合报告，Legacy Employment Tombstone 只计数。
