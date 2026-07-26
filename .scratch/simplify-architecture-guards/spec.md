# 简化并集中架构守卫

## Problem Statement

IAM 需要长期保护 backend 的 module seam、依赖方向、owner 路径和 Docker build closure，但旧守卫分散在多个
workspace，重复扫描跨 workspace source，也混入了 exact factory shape、方法列表、旧 identifier 和迁移墓碑等
implementation 细节。

根 Architecture Guard 已建立后，Ticket 03 的候选实现又沿着 symbol 名称、barrel provenance、namespace member 和
property access 继续深化。这个方向会让维护性依赖图检查演变为不完整的 TypeScript 程序分析器，并持续触发新的语法矩阵与
评审要求。

本 feature 以长期的 [架构守卫规范](../../docs/architecture/architecture-guard.md) 为上位约束：复杂度必须通过
package exports、专用 subpath 和 module interface 暴露，不能通过扩张 scanner 隐藏。

## Solution

保留根级、只读的 Architecture Guard 深模块，以 `analyzeRepositoryArchitecture(repoRoot)` 作为唯一外部 interface，
以 `pnpm check:architecture` 作为唯一开发者命令。它一次加载受保护的 production sources，在同一 snapshot 上执行封闭的
永久规则目录，并返回包含稳定 rule ID、仓库相对文件、1-based 行号和消息的结构化 violations。

该命令只在 `pnpm verify` 的 static 阶段执行一次，不进入可缓存的 package `test` task。当前规模的 warm 小于 1 秒只作
观察性目标，不形成计时 gate。

永久规则只能使用长期规范定义的观察模型：production source path、规范化静态 import/re-export module edge 及其
type/value、production port 中直接 `Pick<T, ...>` 的既有文本名例外、workspace manifest dependency closure 和
Dockerfile 字面 `COPY` source。无法由这些事实表达的要求必须转交 package exports、typecheck、module interface
behavior/contract test、process smoke 或专用外部资源通道。

## 交付切片

- Tickets 01–02 已交付：根 interface、structured violations、one-pass source snapshot、`consumer-owned-port`、
  `dependency-direction`、根命令和 verify static 编排已经建立。
- Ticket 03 通过 package/interface shaping 让 Role Assignment 与 User Profile ownership 成为 module path 事实，再只按
  owner path、规范化静态 edge、type/value 和 Docker manifest closure 检查。
- Ticket 04 只迁移 Custom SSO、Admin Session Revocation、OIDC 与 Worker 的 runtime import-edge owner。
- Ticket 05 不新增静态规则；transaction-bound invalidation 继续由既有 User Profile 与 UnitOfWork 公开
  interface 的 behavior/contract tests 验证，composition wiring 继续由 typecheck 与 process smoke 覆盖。
- Ticket 06 执行 contraction：删除 legacy suites 与 testing analyzer，移除候选实现中过深的索引和 fixtures，把 Current
  文档切换到唯一根入口与正确验证层。

## Implementation Decisions

### 根 module 与命令

- `analyzeRepositoryArchitecture(repoRoot)` 返回只读的 `ArchitectureViolation` 集合；CLI 只负责稳定排序、打印、成功摘要和
  退出码。
- Source snapshot 覆盖 API、Admin API、OIDC Provider、Worker、Role Assignment Resolution 和 User Profile Read
  Model 的 production TypeScript source；tests、testing helpers、generated directories 和 build output 不进入扫描。
- 每个 production TypeScript 文件只读取并创建一次 AST。内部只索引长期规范允许的事实，不维护允许观察模型之外的
  symbol、member、property、literal、callback、binding、control/data flow 或 provenance 索引。
- `pnpm check:architecture` 由 `pnpm verify` 的 static 阶段执行一次；Architecture Guard 不成为 Turbo package task，也不
  使用 package-local cache。
- 规则目录在本 feature 内封闭为 `consumer-owned-port`、`dependency-direction`、`role-resolution-owner`、
  `user-profile-owner`、`session-runtime-owner`、`worker-ownership` 和 `docker-build-closure`。

### Ticket 03 的 interface shaping

- `@iam/db` 增加职责单一的 Role Assignment schema public subpath，例如
  `@iam/db/schema/role-assignments`。`roleAssignments` table 不再由 broad `@iam/db/schema` barrel re-export；合法
  resolver 与 Admin Role Management owner 从专用 subpath 导入。Symbol 是否公开由 package exports 和 consumer
  typecheck 负责，guard 只判断该 subpath 的 module edge owner。
- `@iam/user-profile-read-model` root 与 `/query` 只公开 query-safe service、schema、read port 与 pure helpers，不公开
  repository implementation。Producer 与 worker 能力只从显式 `/producer`、`/worker` subpath 暴露；
  query repository/infrastructure 从独立 `/query/repository` subpath 暴露，且只允许 API composition 依赖。
- `@iam/role-assignment-resolution` 的 value dependency 只允许少量 composition/module owner；type-only dependency 可作为
  consumer contract 使用。规则不识别具体 resolver factory symbol。
- `@iam/user-profile-read-model/producer` 与 `/worker` 的所有静态 dependency（type 和 value import/re-export）都只允许
  对应 owner，避免 provider type 泄漏给普通业务 module。
- Docker build closure 从全部 workspace manifests 构建 dependency graph，从 backend app 穿过任意中间 workspace
  计算 closure，并只对到达的 Role Assignment Resolution/User Profile workspace 核对 Dockerfile 字面 `COPY`
  是否包含需要的 package manifest 与 source directory。
- 为建立可见 seam 允许最小 package export/subpath/import path refactor；不允许借此重构业务行为、repository 查询、
  transaction 或 composition 语义。
- Ticket 03 候选中的 property access、symbol name、barrel provenance/export graph、namespace member 分析及其
  named/default/namespace/star/alias/property 语法矩阵必须在 handoff 前删除。

### Ticket 04 的 runtime owners

- Custom SSO、Admin Session Revocation 与 OIDC owner 只根据 production source path、规范化静态 module edge 和
  type/value 判断。
- Worker 只检查 production source 到 `@api`、`~api/src` 等 API 私有 alias 的静态 module edge；正常 workspace package
  edge 继续允许。
- 不扫描 authority-key literal、legacy identifier、具体 symbol、composition text、member 或 provenance。
- 若同一 module edge 无法区分合法与非法能力，先收缩 export、增加专用 subpath 或加深 module interface；仍不适合时留给
  type/behavior/smoke 层，不能扩 scanner。

### Ticket 05 的 transaction 行为契约

- 审计既有 `UserProfileInvalidation` 与 UnitOfWork public interface tests；只有 transaction-bound 行为能从现有
  interface 观察且存在缺口时，才补充 behavior/contract case。
- `UserProfileInvalidation` 的 source change 映射、dirty persistence、after-commit wake-up，以及 UnitOfWork lifecycle、
  rollback 和 observability 继续通过公开 interface 测试。
- Typecheck 与 API/Admin process smoke 继续覆盖 production composition 的类型连接和真实 runtime wiring/readiness。
- 当前 composition 使用当前 `db: tx` 与 lifecycle 的具体 source expression 是 code review 和 Current architecture fact，
  不新增 `transaction-bound-invalidation` AST 规则，不解析 callback、binding 或 call arguments。
- 不为测试暴露 production-only seam。若事实无法通过现有 interface 观察，不创建 scanner，也不创建映射 implementation
  细节的浅 interface。

### Ticket 06 的 contraction

- 在根规则按本 spec 收口后，删除 API、Admin API、OIDC Provider 和 Role Assignment Resolution 的 legacy
  architecture suites，避免 package tests 继续跨 workspace 扫描。
- 删除 User Profile testing-only business-boundary analyzer、对应 tests 与 package export，并确认无剩余 consumer。
- 确认 Ticket 03 已删除候选引入的过深索引、helpers 和语法 fixtures，并清理任何残留；同时删除历史拼写、旧文件、旧
  identifier、exact factory shape、method allowlist 等永久检查。
- 更新 Current docs，使 `pnpm check:architecture` 成为唯一静态入口，并把 type、behavior、smoke 与外部资源事实指向各自
  验证层。本阶段不新增规则。

## Testing Decisions

- Architecture Guard 只通过 `analyzeRepositoryArchitecture(repoRoot)` 测试，不测试内部 visitor、index、helper 或扫描顺序。
- 每条语义事实至少提供一个允许和一个违规的 canonical fixture；只有不同 owner path 或 module edge 才增加 fixture，不为
  named/default/namespace/star/alias/property 等语法变体建立矩阵。
- 共享 dependency extraction/normalization 可以用少量外部 fixtures 覆盖静态 import、side-effect import、re-export、
  type/value 与受支持 alias class；业务规则不重复该矩阵。
- Ticket 03 fixtures 明确证明 Role Assignment Resolver type-only consumer 合法、value dependency 只允许 owner；User
  Profile `/producer` 与 `/worker` 的 type/value dependency 均只允许各自 owner，root/`/query` 的 query-safe
  consumer 合法，而 `/query/repository` 只允许 API composition。
- Root acceptance 运行 focused guard tests 与 `pnpm check:architecture`，必须得到当前仓库零 violations。
- Package export/subpath 改动运行直接 consumer 的 typecheck；既有业务与 type contract tests 保持原职责。
- Runtime composition 改动按风险运行相关 backend typecheck、tests 与 process smoke；Docker closure 使用完整、缺失及
  任意中间 workspace dependency fixture。
- 文档变化运行 `pnpm check:docs`，所有 tickets 提交前运行 `git diff --check`。准备 merge 时只在最终实现内容上运行一次
  `pnpm verify`。
- 可以记录一次 warm wall-clock，目标小于 1 秒，但不得添加自动 wall-clock assertion、retry 或 timeout 放宽。

## Out of Scope

- 不修改 IAM 业务规则、database schema、HTTP/OpenAPI、queue payload、Redis/session wire contract 或 runtime/domain
  semantics。
- 除 Ticket 03 为可见 seam 所需的最小 package export/subpath/import path refactor 外，不重构 production
  composition、repository、service、use case、route 或业务 module。
- 不新增 `transaction-bound-invalidation`、authority-key literal 或迁移墓碑规则。
- 除长期规范明确列出的文本事实外，不建立 import/export symbol、namespace/member/property、literal/comment、barrel
  graph、module/type resolution、call/factory/callback/binding、control/data flow 或动态/计算 import 分析。
- 不创建自定义 ESLint plugin，不改变普通、process smoke、PostgreSQL、browser E2E 或 Gateway 通道的资源分类与预算。
