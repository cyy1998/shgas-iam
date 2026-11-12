# IAM 文档索引

按本次任务选择入口，再核对目标文档状态。完整登记表供按目录查找，无需顺序阅读。

## 状态约定

| Status       | 含义                                 | 维护要求                                        |
| ------------ | ------------------------------------ | ----------------------------------------------- |
| Current      | 当前可作为实现、排障或发布依据       | 记录 `Last verified` 和 `Next review`，逾期提醒 |
| Needs Review | 可能仍有用，但需要重新核对           | 允许通过检查，但不应作为唯一依据                |
| Historical   | 已完成的发布记录、审查记录或决策快照 | 不要求周期性复查                                |
| Stale        | 已知不再反映当前代码或架构           | 备注说明失效原因，有替代文档时提供入口          |

## 当前事实与修改目标

判断当前行为时，证据优先级为：

1. 实现、生效配置与可执行测试结果；
2. 本索引标记为 `Current` 的维护文档；
3. 其他历史线索。

这些证据不一致时，应记录并调查差异，不得用 spec、ADR 或其他文档声明覆盖已观察到的行为。`openspec/`、`Historical` 和
`Stale` 文档不能单独证明当前行为。

判断本次修改目标时，以用户当前授权的目标和适用 spec/ticket 的验收要求界定范围，以 `CONTEXT.md`、已接受 ADR 和当前
工程文档约束实现。现有代码只是修改基线，不会自动否定目标；目标依据彼此冲突或范围不清时，必须先澄清再实施。

仓库级指令从 `AGENTS.md` 进入，运行和环境入口见 `README.md`。

## 按任务阅读

| 任务                         | 入口                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 启动项目、查找代码           | [README](../README.md)、[仓库地图](engineering/repository-map.md)                                                                                      |
| 修改代码或开展设计           | [仓库规则路由](../AGENTS.md)、[系统架构](engineering/system-architecture.md)                                                                           |
| 修改 Admin 写入              | [事务与锁序](engineering/backend-architecture.md#admin-同对象写入规范)、[响应与失败恢复](engineering/backend-architecture.md#admin-写入结果与失败恢复) |
| 运行开发命令、编写或排查测试 | [命令入口](engineering/commands.md)、[测试与验证](engineering/testing.md)                                                                              |
| 理解功能或修改业务规则       | [功能与业务规则](features/README.md)、[领域语言](../CONTEXT.md)、[ADR 清单](#架构决策)                                                                 |
| 管理 IAM                     | [管理员操作](guides/README.md#管理员操作)                                                                                                              |
| 接入第三方应用               | [第三方接入](guides/README.md#第三方接入)，接口字段与响应沿指南查代码                                                                                  |
| 升级、恢复或发布             | [运维操作入口](releases/README.md)、[数据维护](releases/data-maintenance.md)、[发布手册清单](#发布与维护)                                              |
| 追溯旧设计与候选验收         | [精简前的固定文档快照](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/features)；不作为当前实现或本次验证依据 |

## 维护方式

- 同一规则保留一个权威出处：领域术语在 `CONTEXT.md`，决策及理由在 ADR，工程约束在专题指南，
  环境运维步骤在 runbook，功能与业务规则在 features，管理员操作和应用接入步骤在 guides。字段与接口定义以代码为准，其他页面链接出处。
- 索引只登记用途、状态和必要的替代关系；实施进度、候选 SHA、测试次数与验收结论留在对应 issue 或验收记录。
  `Current` 表示文档可用，不代表目标已经实现、合入或部署；`Last verified` 也不是部署日期。
- 仓库地图负责定位，命令页负责可执行入口，测试与验证负责测试规则、收集编排和资源生命周期。
  功能变更优先更新其权威文档，避免在这些入口重复追加交付流水账。
- releases 按运维任务组织为入口和五个专题；操作保留适用情况、前提、步骤、完成标准与失败处理。验收按影响选择，不要求额外留证；机制说明归对应契约。一次性升级和旧代切换通过入口中的固定 Git 版本追溯。
- features 供开发者和 AI 在改动前按功能了解用途、参与角色、权限与范围、生命周期、跨功能影响和失败语义。
  每个主要功能维护一篇，相关子功能用章节组织。优先写会影响实现与测试的事实，并按需链接领域术语、决策和实现。
  guides 按管理员与接入方的任务组织，保存界面操作、配置、调用示例、结果判断与操作后的处理步骤。
  字段、类型、错误码由 schema 与接口定义维护；边界行为由实现和测试表达，不另建 reference 副本。
  内部模块、缓存、锁和装配归架构文档。功能页只摘要必要限制并链接技术出处，不复制接口清单。
  不强制固定模板或额外留证，也不按页面、实体或实施 ticket 新建长期文档。
  实施进度、候选和固定验收记录留在 issue 或 Git 历史。
- engineering 面向开发者与代码 agent，维护仓库地图、系统和模块边界、开发约定以及验证入口。
  系统页提供概要，跨模块工程约定按主题维护，单个包或 app 的实现机制就近记录在其 README。
  函数、字段、错误码、参数和算法细节链接代码，测试场景由测试维护；只保留必要的关键验证入口。
  实施流水账与退役过程从 issue 和 Git 历史追溯，当前兼容与恢复限制仍须保留。
- ADR 按独立决策组织，保留当前决定、理由、拒绝方案与代价，不按实施切片新增。合并时承接独有理由，不能因功能契约
  已存在而删掉取舍；算法和操作步骤引用对应权威文档。保留原编号与路径，被删除编号不复用、不重排，新决定在现有最大编号后递增。
  当前正文汇总后续已接受修订，原始决定与被取代方案通过固定 Git 历史追溯，不建跳转壳，也不将整理日期视作原接受日期。
- 新增文档前先检查能否更新现有主题。删除或移动前检查入链和锚点；保留历史材料时标为
  `Historical` 或 `Stale`，不能只因文件较旧就推定失效。
- 新增、删除或移动 `docs/**/*.md` 时同步本清单；仅修改索引摘要不刷新正文的核验日期。文档变化运行：

```bash
pnpm check:docs
git diff --check
```

文档检查覆盖登记、元数据和 `docs/` 内链接目标，复核日期逾期会提示。内容准确性由相关变更的评审确认；
根文件链接与 Markdown 锚点需另行核对。

## 文档清单

按主题展开相关目录即可。features 保存功能与业务规则，guides 保存管理员操作与应用接入，字段与协议细节沿指南查代码；旧候选和设计从上方固定快照追溯。
releases 维护当前代操作；一次性迁移与更早版本从[运维入口](releases/README.md#一次性迁移与旧版本)按来源查找。
其他目录阅读前仍须核对 Status 及适用限制。

### 架构决策

<details>
<summary>展开架构决策</summary>

以下登记现行决定、提案与保留的历史记录。运行行为按实现与验证确认。历史原文、已被取代的决策和合并来源见
[固定 ADR 快照](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr)，各主题文末提供对应原文。

| Document                                                                                | Type     | Status     | Last verified | Next review | Notes                                                                                                      |
| --------------------------------------------------------------------------------------- | -------- | ---------- | ------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| [ADR-0002](adr/0002-centralize-role-assignment-resolution.md)                           | decision | Current    | 2026-09-21    | 2026-10-31  | 独立角色解析与正反向有效性边界。                                                                           |
| [ADR-0004](adr/0004-adopt-upstream-first-matt-skills.md)                                | decision | Current    | 2026-10-25    | 2026-11-25  | 上游优先与手动薄适配；AFK 按 Spec 动态实施、集中评审及本地 squash 交付。                                   |
| [ADR-0005](adr/0005-keep-live-login-state-in-redis.md)                                  | decision | Current    | 2026-09-21    | 2026-10-31  | Redis 实时状态与生命周期时间权威。                                                                         |
| [ADR-0006](adr/0006-elevate-user-subject-identifier.md)                                 | decision | Current    | 2026-09-21    | 2026-10-31  | 跨协议稳定 Subject Identifier 归属 IAM 身份域。                                                            |
| [ADR-0009](adr/0009-adopt-canonical-test-collections.md)                                | decision | Current    | 2026-10-29    | 2026-11-29  | 按真实资源归类、workspace 声明与临时环境；root 工具链改用一次性验证。                                      |
| [ADR-0011](adr/0011-model-employment-as-an-immutable-tenure-lifecycle.md)               | decision | Current    | 2026-09-21    | 2026-10-31  | 不可重开的任职期、父完整性与全库诊断。                                                                     |
| [ADR-0013](adr/0013-guard-login-page-reentry-with-authentication-continuation.md)       | decision | Current    | 2026-09-21    | 2026-10-31  | 认证续接、已有根复用与新鲜认证边界。                                                                       |
| [ADR-0014](adr/0014-model-organization-responsibility-as-employment-bound-fact.md)      | decision | Current    | 2026-10-21    | 2026-11-21  | 任职绑定的非授权责任事实与并发边界。                                                                       |
| [ADR-0017](adr/0017-centralize-admin-role-policy-with-request-time-scope.md)            | decision | Current    | 2026-09-21    | 2026-10-31  | Admin 请求时授权与 HR 双端范围。                                                                           |
| [ADR-0020](adr/0020-provide-fail-closed-privilege-delegation-resolution.md)             | decision | Current    | 2026-10-21    | 2026-10-31  | 单 Client 委托、调用方隔离、管理分工、写入协调与旧记录清理决定。                                           |
| [ADR-0021](adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) | decision | Current    | 2026-09-21    | 2026-10-31  | Snapshot 获取时一致性、传播失败与人工恢复。                                                                |
| [ADR-0024](adr/0024-canonicalize-historical-audit-actions.md)                           | decision | Current    | 2026-09-21    | 2026-10-31  | 规范审计 action 与退出运行时别名的取舍。                                                                   |
| [ADR-0025](adr/0025-align-admin-mutation-results-with-committed-facts.md)               | decision | Current    | 2026-09-21    | 2026-10-31  | Admin 同对象写入、no-op 与提交后恢复。                                                                     |
| [ADR-0028](adr/0028-extract-session-and-grant-state.md)                                 | decision | Current    | 2026-09-28    | 2026-10-31  | 会话核心、协议能力与应用适配的所有权。                                                                     |
| [ADR-0029](adr/0029-check-subject-access-once-per-business-operation.md)                | decision | Current    | 2026-09-21    | 2026-10-31  | 单次操作许可与在途账号变化边界。                                                                           |
| [ADR-0032](adr/0032-consume-published-subject-facts-for-authorization.md)               | decision | Current    | 2026-10-26    | 2026-11-26  | 共享投影、服务端 Catalog 与已发布旧事实。                                                                  |
| [ADR-0035](adr/0035-unify-user-and-client-session-lifecycles.md)                        | decision | Current    | 2026-09-28    | 2026-10-31  | 两类会话、可恢复通行与永久撤销、一次消费与精确失败作用。                                                   |
| [ADR-0036](adr/0036-bind-oidc-to-internal-and-external-issuers.md)                      | decision | Current    | 2026-09-21    | 2026-10-31  | 双 issuer 身份、可信入口与 Cookie 隔离。                                                                   |
| [ADR-0038](adr/0038-derive-managed-sso-callback-from-redirect-origin.md)                | decision | Current    | 2026-09-28    | 2026-10-31  | 显式回调类型与 managed origin 信任。                                                                       |
| [ADR-0039](adr/0039-tighten-admin-reference-integrity-and-preserve-history.md)          | decision | Current    | 2026-10-21    | 2026-11-21  | 管理引用完整性、输入规范化与软删除历史；详情按 ADR-0045 收缩。                                             |
| [ADR-0040](adr/0040-retire-orcas-custom-sso-integration.md)                             | decision | Historical | 2026-10-10    | n/a         | ORCAS 退役历史。保留全量清理、维护窗口与外部会话责任的决策依据。                                           |
| [ADR-0041](adr/0041-unify-format-and-lint-with-biome.md)                                | decision | Current    | 2026-10-16    | 2026-10-31  | 已接受：Biome 与提交时修复；YAML 仅排版并保留专属验证，最终只读检查；实施与验收见 Spec #217。              |
| [ADR-0043](adr/0043-retire-public-and-legacy-internal-directory-search.md)              | decision | Historical | 2026-10-26    | n/a         | 旧目录搜索入口退役历史。现行搜索决定由 ADR-0046 维护。                                                     |
| [ADR-0044](adr/0044-publish-gateway-configurations-through-a-stateless-api.md)          | decision | Current    | 2026-10-16    | 2026-10-31  | 无状态 Gateway API、Client 凭据校验、补偿恢复与实例内串行的已接受取舍。                                    |
| [ADR-0045](adr/0045-retire-privilege-permission-points.md)                              | decision | Current    | 2026-10-21    | 2026-11-21  | IAM 交付角色事实，应用解释业务权限；保留权限点退役与有效登录态的取舍。                                     |
| [ADR-0046](adr/0046-unify-user-and-organization-read-documents.md)                      | decision | Current    | 2026-11-03    | 2026-12-03  | 统一目录文档、Internal DSL、Client 可见性、可靠发布与恢复。                                                |
| [ADR-0047](adr/0047-separate-operations-cli-from-worker.md)                             | decision | Current    | 2026-11-02    | 2026-12-02  | 人工维护命令直接切换至 Ops CLI、独立配置、同版本镜像及维护 Compose；共享 owner 能力，Worker 保留自动恢复。 |
| [ADR-0048](adr/0048-model-global-roles-without-client-ownership.md)                     | decision | Current    | 2026-11-10    | 2026-12-10  | 已确认的全局角色归属、编码命名空间与应用披露边界。                                                         |
| [ADR-0049](adr/0049-compose-roles-across-clients.md)                                    | decision | Current    | 2026-11-10    | 2026-12-10  | 组合角色授予、应用披露、管理生命周期与发布边界。                                                           |
| [ADR-0050](adr/0050-bind-image-captcha-to-the-required-operation.md)                    | decision | Current    | 2026-11-11    | 2026-12-11  | Cap 求解失败时使用图片验证码，并将证明绑定原操作。                                                         |

</details>

### Agent 工作流

<details>
<summary>展开Agent 工作流</summary>

| Document                                          | Type         | Status  | Last verified | Next review | Notes                                                       |
| ------------------------------------------------- | ------------ | ------- | ------------- | ----------- | ----------------------------------------------------------- |
| [代码调查子代理](agents/code-investigation.md)    | agent-config | Current | 2026-09-05    | 2026-10-31  | 只读调查路由、子代理返回契约与跨会话记忆。                  |
| [Domain Docs](agents/domain.md)                   | agent-config | Current | 2026-07-16    | 2026-10-31  | 工程 skills 的领域文档消费规则。                            |
| [GitHub 议题跟踪](agents/issue-tracker.md)        | agent-config | Current | 2026-10-25    | 2026-11-25  | GitHub spec、ticket 类型、原生任务图与手动/AFK 交接。       |
| [Sandcastle AFK 工作流](agents/sandcastle-afk.md) | agent-config | Current | 2026-10-26    | 2026-11-25  | 原生 Spec 图选票，以及无人值守实施、评审、合入与验证。      |
| [Triage Labels](agents/triage-labels.md)          | agent-config | Current | 2026-10-25    | 2026-11-25  | 默认 canonical triage labels 与 Spec/ticket 互斥类型。      |
| [工作流补充](agents/workflow.md)                  | agent-config | Current | 2026-10-14    | 2026-10-31  | implement-spec 与直接小任务的仓库分支、验证和本地收尾补充。 |

</details>

### 工程文档

<details>
<summary>展开工程文档</summary>

#### 定位代码与理解系统

| Document                                           | Type         | Status  | Last verified | Next review | Notes                                |
| -------------------------------------------------- | ------------ | ------- | ------------- | ----------- | ------------------------------------ |
| [仓库地图](engineering/repository-map.md)          | architecture | Current | 2026-11-02    | 2026-12-02  | 代码、基础设施、工具与生成目录定位。 |
| [系统架构视图](engineering/system-architecture.md) | architecture | Current | 2026-11-02    | 2026-12-02  | 拓扑、信任边界、数据权威与恢复分工。 |

#### 修改应用或共享契约

| Document                                                  | Type         | Status  | Last verified | Next review | Notes                                              |
| --------------------------------------------------------- | ------------ | ------- | ------------- | ----------- | -------------------------------------------------- |
| [后端架构与实现约定](engineering/backend-architecture.md) | architecture | Current | 2026-11-03    | 2026-12-03  | 依赖与装配、接口响应、事务与恢复、审计与后台协作。 |
| [前端架构](engineering/frontend-architecture.md)          | architecture | Current | 2026-10-25    | 2026-11-25  | 页面、请求、权限、状态与失败恢复的职责。           |
| [共享契约与数据库](engineering/contracts-and-database.md) | architecture | Current | 2026-10-26    | 2026-11-26  | 代码选址、包出口、运行环境、DTO 演进与持久化边界。 |

#### 编写、运行或排查测试

| Document                                        | Type        | Status  | Last verified | Next review | Notes                                                  |
| ----------------------------------------------- | ----------- | ------- | ------------- | ----------- | ------------------------------------------------------ |
| [测试与验证](engineering/testing.md)            | development | Current | 2026-10-29    | 2026-11-29  | 验证选择、编写规则、测试编排、资源生命周期与架构守卫。 |
| [构建、测试与开发命令](engineering/commands.md) | development | Current | 2026-11-02    | 2026-12-02  | 本地开发、构建、测试、检查与临时资源清理。             |

#### 查编码规范

| Document                                          | Type        | Status  | Last verified | Next review | Notes                                           |
| ------------------------------------------------- | ----------- | ------- | ------------- | ----------- | ----------------------------------------------- |
| [编码风格与命名约定](engineering/coding-style.md) | development | Current | 2026-10-25    | 2026-11-25  | TypeScript、formatter、文件命名与 import 风格。 |

</details>

### 功能说明

<details>
<summary>展开功能说明</summary>

面向开发者与 AI，按功能快速查找权限、生命周期、跨功能影响和失败语义。

| Document                                                    | Type    | Status  | Last verified | Next review | Notes                                          |
| ----------------------------------------------------------- | ------- | ------- | ------------- | ----------- | ---------------------------------------------- |
| [功能与业务规则入口](features/README.md)                    | feature | Current | 2026-10-26    | 2026-11-26  | 按业务功能定位规则与操作指南。                 |
| [用户、组织与任职](features/directory-management.md)        | feature | Current | 2026-10-25    | 2026-11-25  | 用户档案、任职、离职、组织责任与目录搜索。     |
| [角色、管理授权与审计](features/roles-and-authorization.md) | feature | Current | 2026-10-25    | 2026-11-25  | 角色授予与披露、Admin 授权、HR 范围和审计。    |
| [登录与会话](features/login-and-session.md)                 | feature | Current | 2026-10-25    | 2026-11-25  | 身份验证、找回密码、改密、登录限制与会话撤销。 |
| [应用接入](features/application-integration.md)             | feature | Current | 2026-10-25    | 2026-11-25  | 应用配置与凭据、单点登录、资料披露与网关发布。 |
| [应用委托](features/client-delegation.md)                   | feature | Current | 2026-10-25    | 2026-11-25  | 委托范围、期间冲突、生命周期与直接代办人解析。 |

</details>

### 接入指南

<details>
<summary>展开接入指南</summary>

面向管理员与第三方应用，提供操作步骤、接入配置与调用示例。

#### 指南入口

| Document                               | Type  | Status  | Last verified | Next review | Notes                            |
| -------------------------------------- | ----- | ------- | ------------- | ----------- | -------------------------------- |
| [使用与接入指南入口](guides/README.md) | guide | Current | 2026-10-25    | 2026-11-25  | 按角色选择管理员操作与应用接入。 |

#### 管理员操作

| Document                        | Type  | Status  | Last verified | Next review | Notes                                  |
| ------------------------------- | ----- | ------- | ------------- | ----------- | -------------------------------------- |
| [管理后台操作](guides/admin.md) | guide | Current | 2026-11-12    | 2026-12-12  | 管理账号、应用、委托、会话及查询审计。 |

#### 第三方接入

| Document                                    | Type  | Status  | Last verified | Next review | Notes                                      |
| ------------------------------------------- | ----- | ------- | ------------- | ----------- | ------------------------------------------ |
| [OIDC 接入指南](guides/oidc.md)             | guide | Current | 2026-10-26    | 2026-11-26  | 端点、参数、示例、Scope、CORS 和退出。     |
| [Custom SSO 接入指南](guides/custom-sso.md) | guide | Current | 2026-10-26    | 2026-11-26  | 业务与托管接入、可信登录、示例和错误处理。 |
| [搜索接入](guides/search.md)                | guide | Current | 2026-11-03    | 2026-12-03  | 用户与组织查询示例、过滤条件及结果限制。   |
| [委托接入](guides/delegation.md)            | guide | Current | 2026-10-25    | 2026-11-25  | Client 范围、代办人解析和失败处理。        |
| [网关配置接入](guides/gateway.md)           | guide | Current | 2026-10-25    | 2026-11-25  | 凭据、YAML、调用步骤及未知结果处理。       |

</details>

### 发布与维护

<details>
<summary>展开发布与维护</summary>

从操作入口选择任务，核对必要前提、完成标准和失败处理；接口定义见代码，实现边界见架构文档。

| Document                                             | Type    | Status  | Last verified | Next review | Notes                                                               |
| ---------------------------------------------------- | ------- | ------- | ------------- | ----------- | ------------------------------------------------------------------- |
| [运维操作入口](releases/README.md)                   | runbook | Current | 2026-10-26    | 2026-11-26  | 任务导航、简短通用约定、独立迁移与历史版本入口。                    |
| [网关管理](releases/apisix-gateway-release.md)       | runbook | Current | 2026-10-25    | 2026-11-25  | 首次配置、HTTP 发布、数据面检查和失败恢复。                         |
| [登录与会话](releases/authentication-and-session.md) | runbook | Current | 2026-11-02    | 2026-12-02  | 密码配置、OIDC 双入口与密钥、会话清理和 Snapshot 恢复。             |
| [数据维护](releases/data-maintenance.md)             | runbook | Current | 2026-11-03    | 2026-12-03  | Document、Subject Access 的两阶段修复、全量重建及完整核验。         |
| [部署与发布](releases/deployment.md)                 | runbook | Current | 2026-11-06    | 2026-12-06  | 首次部署、常规更新、正式迁移、一次性 Ops 制品、兼容回退与定向停止。 |
| [日志与排障](releases/observability-system-logs.md)  | runbook | Current | 2026-10-25    | 2026-11-25  | 日志栈、Grafana、Trace 关联、告警与采集恢复。                       |

</details>
