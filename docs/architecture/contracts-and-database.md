# 共享契约与数据库

本文记录 package 边界、repository 事务规则，以及 Drizzle/PostgreSQL 布局约定。修改数据库 schema 或 migration 前，
先使用 schema 相关 skill 并遵守 workflow 门禁。

## 共享代码选址

先查已有能力 owner，再按消费方与运行环境选择落点。下面的规则约束新增代码与受影响的修改；既有实现的收敛范围见
[现存差距与验证](#现存差距与验证)。共享不等于集中到 `contracts`，文件名含 DTO 也不构成提升为共享代码的理由。

| 位置 | 职责与允许依赖 |
|---|---|
| `packages/contracts` | 跨端或跨应用的稳定枚举、常量、runtime schema、派生类型及紧贴这些契约的协议 helper；不依赖数据库、app 或服务端基础设施。 |
| `packages/domain` 的纯规则文件 | 根据显式输入计算结果或抛出业务错误；依赖共享常量、纯 helper 和业务错误，不依赖数据库、OpenAPI、网络、运行时实例或 composition。 |
| `packages/domain` 的 DTO/schema/mapper | 后端复用的领域输入输出；允许依赖数据库字段 schema、Drizzle schema 派生工具和既有 OpenAPI 工具，不执行数据库访问。 |
| `packages/domain` 的 error/audit helper | 可复用业务错误和纯审计 payload 构造；实际审计写入由后端注入的能力负责。 |
| 专用能力包 | 拥有完整业务能力及其公开 schema、类型和行为；已有 owner 的协议 schema 继续留在该 owner，例如 Custom SSO wire 由 projection 包拥有。 |
| `packages/db`、`packages/api-core`、`packages/jobs` | 分别拥有持久化定义与查询基础能力、后端基础设施、BullMQ 基础能力；业务事实的解析规则由业务 owner 持有。 |
| app 内部 | 单 app 的 enum、schema、error、流程类型和页面模型；有实际共享消费者后再评估提升位置。 |

`domain` 当前同时包含纯规则和数据库派生 DTO；“纯”约束适用于规则文件，不代表整个 package 无数据库依赖。
新增纯规则放在所属领域中按职责命名的文件，DTO/mapper 依赖规则，规则不反向依赖 DTO 或其聚合出口。

### 公开接口与运行环境

- 跨包通过 `package.json` 声明的公开出口消费能力，不通过相对源码路径或未公开的深层路径访问实现。
- 公开出口不自动代表浏览器可用。浏览器运行时代码不 value-import `domain`、`db` 或后端基础设施；共享 runtime
  schema 使用 `contracts` 或支持浏览器的专用能力出口，类型共享使用 type-only import。
- Admin 可以从后端公开 tRPC 入口进行 type-only 推断，推断集中在 app-local service/client 边界；不为此复制一套
  DTO 到 `contracts`。前端职责见 [前端架构](frontend-architecture.md)。
- 已有 runtime schema 时，从 schema 派生 TypeScript type；解析与 mapper 复用同一个 shape owner。Protocol entry
  可以添加 OpenAPI metadata，不另写一份相同 wire shape。
- 协议 helper 只实现该契约的编码、解码或续接语义，不承载 app 业务流程或数据库、网络请求。现有 SSO 导航恢复
  helper 通过调用方传入的窄接口操作 browser history 和派发事件；平台适配应保持显式，不在共享模块中绑定 app 实例。
- `contracts` 当前 root 还公开登录 credential 的加解密 helper。它们是跨运行时协议实现，依赖 `sm-crypto`、
  Web Crypto 及 `btoa`/`atob` 等能力，并使用时间和随机数；不属于纯规则。修改这些 helper 或引入新的消费运行环境时，
  核验实际执行分支所需的平台能力。本约定保留现有出口，不据此允许任意平台实现进入 `contracts`，也不声称 root
  re-export 的所有代码必然进入每个浏览器 bundle。

### 独立模块与独立包

独立模块不一定需要独立 workspace package。新建包应说明稳定的业务职责、实际消费者或具体的依赖隔离需求，
以及希望隐藏的实现；文件数量、提炼出一个 helper 或假设未来复用都不足以单独证明建包必要性。

多个独立模块可以共享一个包，通过明确的公开 subpath 保持职责分离。合并包前应界定业务收录范围，并评估依赖并集、
测试与构建失效粒度；不要求仅因共享包就互相调用。`resolution` 只是处理方式，不能成为所有解析逻辑的默认落点。
选择独立包或共享包时，不以独立发布作为没有实际需求支撑的理由。

当前三个服务端能力包的分工如下；本约定不改变它们的物理布局：

| 包 | 当前职责与消费关系 |
|---|---|
| `role-assignment-resolution` | 统一有效角色与角色变化影响用户的解析；管理后端授权和 User Profile 构建/失效使用同一规则。 |
| `organization-responsibility-resolution` | 统一有效责任与 holder 反向解析；当前生产直接消费者是 User Profile Read Model，用于构建和变更影响分析。 |
| `user-profile-read-model` | 拥有派生档案的失效、重建、PostgreSQL 发布、Redis 缓存、查询与恢复；由 API、Admin API、OIDC Provider、Worker 按职责消费。Read Model 为读取整理数据，也负责写入和维护这些派生数据。 |

## DTO 字段与兼容演进

- 新增或修改跨边界 DTO 字段形状时，使用显式 `pick` 或 `z.object` 确定允许字段；允许从已经明确选字段的 DTO
  继续 `omit`、`extend` 或调整可选性。直接从整表 shape 排除少数字段，不能保证新增数据库字段仍留在持久化边界内。
- 请求输入、响应输出与内部敏感记录分别定义。数据库新增字段不能自动成为可提交或可返回字段；修改数据库字段时
  检查其派生 DTO，受影响且仍自动继承整表字段的跨边界 DTO 在该次改动中收敛到显式字段集合。
- DTO schema 要在实际输入解析或输出 mapper/serializer 边界生效；仅声明类型或 schema 不证明运行时输出已被裁剪。
- 字段新增、删除、类型、必填性、可空性及未知字段解析策略变化都要检查消费者。新增响应字段也可能被旧 strict
  parser 拒绝，不能一律认定为向后兼容。是否使用 `.strict()` 由协议要求决定，不统一收紧所有 DTO。
- 兼容发布应说明新旧生产者/消费者的可共存组合与部署顺序；不能共存时使用对应功能的协调切换契约。消费范围包括
  浏览器、后端、Worker、外部协议客户端及会跨发布保留的消息或缓存（按实际契约涉及范围检查），不建立通用双版本框架。

## 专用能力包契约

- client-scoped 主体信息裁剪、Subject Claim Catalog 与协议中性投影类型放在
  `packages/client-subject-projection`。调用方只通过公开 `resolve` Interface 提交 Subject Identifier、
  `clientCode` 和 `SubjectClaimSelection`；Subject Facts、Subject Access 与 Authorization Freshness 由
  composition 注入最窄 port。协议 wire mapper 只能消费 package root public Projection Interface，不能导入其他
  core subpath 或直连 Facts persistence、client 配置、runtime 与 transport。Custom SSO V2 wire 的 runtime schema、
  派生 TypeScript type、mapper 与 preview 统一由 `@iam/client-subject-projection/custom-sso` 拥有；API 只能复用该
  schema 添加 OpenAPI metadata，不得重写第二份 wire shape。Package root 拥有 Catalog/Selection V2、带 canonical responsibility 子项的协议中性
  Employment Profile、V2 projection service 与 Custom SSO V2 strict wire；responsibility 仍是
  `profile:employments` 的原子子项，不形成独立 claim，也不进入 authorization employment。
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

## 现存差距与验证

当前部分 User、Client、Role DTO 仍由整表 schema 或排除字段派生，不能视为已满足显式字段规则。修改这些 DTO 的
形状或其来源数据库字段时按上述规则收敛；不因无关改动批量迁移。既有 crypto root 出口按前述运行环境约定维护，
新增 subpath 或搬迁实现应作为明确的结构变更处理。

| 要证明的事实 | 验证方式 |
|---|---|
| 公开出口可用、类型结构兼容 | package exports 与消费方 typecheck；类型正确不等于浏览器运行时可加载。 |
| DTO 输入与输出字段受控 | 公开解析/mapper 的行为测试，覆盖允许字段、额外存储字段不外溢、敏感字段裁剪及协议要求的未知字段处理。 |
| 共享出口支持目标浏览器 | 相关前端构建；涉及平台能力时补对应运行环境的执行验证。 |
| 业务解析、发布与恢复行为 | 最高相关公开接口的行为测试，以及涉及 PostgreSQL/Redis 等资源的 Integration 通道。 |
| 稳定依赖方向与 owner 路径 | 仅在既有 Architecture Guard 覆盖范围内由其检查；新增规则须通过准入流程。 |

当前 Architecture Guard 不覆盖这里全部通用共享包分层、浏览器运行环境或 DTO 字段规则；这些约束仍需实现时审查并选择
对应验证。不要用源码字符串检查推断 Zod 链、运行时字段裁剪或 bundle 行为。验证层与准入条件见
[架构守卫规范](architecture-guard.md)，测试通道见 [测试编排架构](testing-architecture.md)。

## Repositories 与 Transactions

- 仓储使用来自 `@iam/db` 的 Drizzle，并通过 `createXRepository(db)` factory 创建；`db` 绑定 root
  `DbClient` 或 transaction `DbClient`。
- Business service 方法不应把 `tx` 参数传给 repository 调用。
- 事务性后端 workflow 应使用 app-local `UnitOfWork`。
- Transaction callback 接收 tx-bound repository、audit writer port 和 `afterCommit` registration port；业务代码不传递
  raw transaction client。
- Redis/cache/OIDC/SMS/fetch side effect 默认不在数据库 transaction callback 内直接执行；应在 callback 外执行，
  或注册 after-commit task。Client Traffic Gate 不再是例外：Client mutation 只在取得 canonical target 后注册
  required client-wide Runtime Snapshot invalidation，不在 transaction 内建立 Redis reserve、ownership fence、heartbeat
  或 settlement。不得借缓存协调在 transaction 内执行不可逆业务副作用。
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
