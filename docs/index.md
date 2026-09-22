# IAM 文档索引

按本次任务选择入口，再核对目标文档状态。完整登记表供按目录查找，无需顺序阅读。

## 状态约定

| Status | 含义 | 新鲜度规则 |
|---|---|---|
| Current | 当前可作为实现、排障或发布依据 | 必须有 `Last verified` 和未来的 `Next review` |
| Needs Review | 可能仍有用，但需要重新核对 | 允许通过检查，但不应作为唯一依据 |
| Historical | 已完成的发布记录、审查记录或决策快照 | 不要求周期性复查 |
| Stale | 已知不再反映当前代码或架构 | 必须在备注中说明 not current |

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

| 任务 | 入口 |
|---|---|
| 启动项目、查找代码 | [README](../README.md)、[仓库地图](architecture/repository-map.md) |
| 修改代码或开展设计 | [仓库规则路由](../AGENTS.md)、[系统架构](architecture/system-architecture.md) |
| 开发、测试与验证 | [命令入口](development/commands.md)、[测试编排](architecture/testing-architecture.md)、[验证归属](architecture/architecture-verification.md) |
| 理解业务与决策 | [领域语言](../CONTEXT.md)、[ADR 清单](#架构决策) |
| 接入协议或维护功能 | [Custom SSO 对接](features/sso/third-party-sso-integration.md)、[OIDC 对接](features/oidc/oidc-integration.md)、[功能清单](#功能契约与设计) |
| 升级、恢复或发布 | [统一会话维护](releases/unified-session-maintenance.md)、[发布手册清单](#发布与维护)；先核对来源代际与适用环境 |
| 追溯旧设计与候选验收 | [精简前的固定文档快照](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/features)；不作为当前实现或本次验证依据 |

## 维护方式

- 同一规则保留一个权威出处：领域术语在 `CONTEXT.md`，决策及理由在 ADR，工程约束在专题指南，
  操作步骤在 runbook，功能专属契约在 feature 文档。其他页面保留必要摘要并链接该出处。
- 索引只登记用途、状态和必要的替代关系；实施进度、候选 SHA、测试次数与验收结论留在对应 issue 或验收记录。
  `Current` 表示文档可用，不代表目标已经实现、合入或部署；`Last verified` 也不是部署日期。
- 仓库地图负责定位，命令页负责可执行入口，测试架构负责收集与资源生命周期，验证归属负责证据能证明什么。
  功能变更优先更新其权威文档，避免在这些入口重复追加交付流水账。
- releases 按当前代维护任务组织；一次性升级、旧代切换和执行记录通过固定 Git 提交追溯，不复制成新的常驻升级清单。
- features 按完整能力组织；切片候选、实施进度和固定验收记录留在 issue 或 Git 历史，不按 ticket 新建长期文档。
- ADR 按独立决策组织，保留当前决定、理由、拒绝方案与代价，不按实施切片新增。合并时承接独有理由，不能因功能契约
  已存在而删掉取舍；算法和操作步骤引用对应权威文档。保留原编号与路径，被删除编号不复用、不重排，新决定从 0039 继续递增。
  当前正文汇总后续已接受修订，原始决定与被取代方案通过固定 Git 历史追溯，不建跳转壳，也不将整理日期视作原接受日期。
- 新增文档前先检查能否更新现有主题。删除或移动前检查入链和锚点；保留历史材料时标为
  `Historical` 或 `Stale`，不能只因文件较旧就推定失效。
- 新增、删除或移动 `docs/**/*.md` 时同步本清单；仅修改索引摘要不刷新正文的核验日期。文档变化运行：

```bash
pnpm check:docs
git diff --check
```

文档检查覆盖登记、日期和 `docs/` 内链接目标；根文件链接与 Markdown 锚点需另行核对。

## 文档清单

按路径排序，保留原文件地址和状态；展开相关目录即可。features 仅保留接入指南与长期功能契约，旧候选和设计从上方固定快照追溯。
releases 只保留当前代发布与维护；一次性升级和旧验收见[固定发布手册快照](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases)。
其他目录阅读前仍须核对 Status 及适用限制。

### 架构决策

<details>
<summary>展开架构决策</summary>

以下 22 篇汇总当前仍有效的决定；历史原文、已被取代的决策和合并来源见
[固定 ADR 快照](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr)，各主题文末提供对应原文。

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [ADR-0002](adr/0002-centralize-role-assignment-resolution.md) | decision | Current | 2026-09-21 | 2026-10-31 | 独立角色解析与正反向有效性边界。 |
| [ADR-0004](adr/0004-adopt-upstream-first-matt-skills.md) | decision | Current | 2026-09-22 | 2026-10-31 | 上游 skills、GitHub Issues 与 Sandcastle AFK 的仓库适配。 |
| [ADR-0005](adr/0005-keep-live-login-state-in-redis.md) | decision | Current | 2026-09-21 | 2026-10-31 | Redis 实时状态与生命周期时间权威。 |
| [ADR-0006](adr/0006-elevate-user-subject-identifier.md) | decision | Current | 2026-09-21 | 2026-10-31 | 跨协议稳定 Subject Identifier 归属 IAM 身份域。 |
| [ADR-0009](adr/0009-adopt-canonical-test-collections.md) | decision | Current | 2026-09-21 | 2026-10-31 | Canonical collections、默认验证与 Guard 证明边界。 |
| [ADR-0011](adr/0011-model-employment-as-an-immutable-tenure-lifecycle.md) | decision | Current | 2026-09-21 | 2026-10-31 | 不可重开的任职期、父完整性与全库诊断。 |
| [ADR-0012](adr/0012-model-client-maintenance-as-reversible-protocol-traffic-suspension.md) | decision | Current | 2026-09-21 | 2026-10-31 | Client 通行状态与永久撤销分离。 |
| [ADR-0013](adr/0013-guard-login-page-reentry-with-authentication-continuation.md) | decision | Current | 2026-09-21 | 2026-10-31 | 认证续接、已有根复用与新鲜认证边界。 |
| [ADR-0014](adr/0014-model-organization-responsibility-as-employment-bound-fact.md) | decision | Current | 2026-09-21 | 2026-10-31 | 任职绑定的非授权责任事实与并发边界。 |
| [ADR-0015](adr/0015-adopt-schema-driven-user-profile-filter-dsl.md) | decision | Current | 2026-09-21 | 2026-10-31 | Search Document 驱动查询与固定 Base 响应。 |
| [ADR-0017](adr/0017-centralize-admin-role-policy-with-request-time-scope.md) | decision | Current | 2026-09-21 | 2026-10-31 | Admin 请求时授权与 HR 双端范围。 |
| [ADR-0020](adr/0020-provide-fail-closed-privilege-delegation-resolution.md) | decision | Current | 2026-09-21 | 2026-10-31 | 直接委托失败关闭解析与委托人写入协调。 |
| [ADR-0021](adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) | decision | Current | 2026-09-21 | 2026-10-31 | Snapshot 获取时一致性、传播失败与人工恢复。 |
| [ADR-0024](adr/0024-canonicalize-historical-audit-actions.md) | decision | Current | 2026-09-21 | 2026-10-31 | 规范审计 action 与退出运行时别名的取舍。 |
| [ADR-0025](adr/0025-align-admin-mutation-results-with-committed-facts.md) | decision | Current | 2026-09-21 | 2026-10-31 | Admin 同对象写入、no-op 与提交后恢复。 |
| [ADR-0028](adr/0028-extract-session-and-grant-state.md) | decision | Current | 2026-09-21 | 2026-10-31 | 会话核心、协议能力与应用适配的所有权。 |
| [ADR-0029](adr/0029-check-subject-access-once-per-business-operation.md) | decision | Current | 2026-09-21 | 2026-10-31 | 单次操作许可与在途账号变化边界。 |
| [ADR-0032](adr/0032-consume-published-subject-facts-for-authorization.md) | decision | Current | 2026-09-21 | 2026-10-31 | 共享投影、服务端 Catalog 与已发布旧事实。 |
| [ADR-0035](adr/0035-unify-user-and-client-session-lifecycles.md) | decision | Current | 2026-09-21 | 2026-10-31 | 两类会话、配置维护、一次消费与精确失败作用。 |
| [ADR-0036](adr/0036-bind-oidc-to-internal-and-external-issuers.md) | decision | Current | 2026-09-21 | 2026-10-31 | 双 issuer 身份、可信入口与 Cookie 隔离。 |
| [ADR-0038](adr/0038-derive-managed-sso-callback-from-redirect-origin.md) | decision | Current | 2026-09-21 | 2026-10-31 | 显式回调类型与 managed origin 信任。 |
| [ADR-0039](adr/0039-tighten-admin-reference-integrity-and-preserve-history.md) | decision | Current | 2026-09-22 | 2026-10-31 | 管理引用完整性、输入规范化与软删除历史。 |

</details>

### Agent 工作流

<details>
<summary>展开Agent 工作流</summary>

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [代码调查子代理](agents/code-investigation.md) | agent-config | Current | 2026-09-05 | 2026-10-31 | 只读调查路由、子代理返回契约与跨会话记忆。 |
| [Domain Docs](agents/domain.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | 工程 skills 的领域文档消费规则。 |
| [GitHub 议题跟踪](agents/issue-tracker.md) | agent-config | Current | 2026-09-22 | 2026-10-31 | GitHub spec、ticket 与手动/AFK 交接约定。 |
| [Triage Labels](agents/triage-labels.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | 默认 canonical labels 与 triage 映射。 |
| [AI 开发工作流](agents/workflow.md) | agent-config | Current | 2026-09-22 | 2026-10-31 | 手动实施与 Sandcastle AFK 的分支、评审、验证及收尾边界。 |

</details>

### 工程架构

<details>
<summary>展开工程架构</summary>

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [架构守卫规范](architecture/architecture-guard.md) | architecture | Current | 2026-09-15 | 2026-10-31 | 静态守卫的观察模型、准入与复杂度边界。 |
| [架构验证归属](architecture/architecture-verification.md) | architecture | Current | 2026-09-15 | 2026-10-31 | 系统约束的验证 owner、证据入口与证明限制。 |
| [后端架构](architecture/backend-architecture.md) | architecture | Current | 2026-09-21 | 2026-10-31 | 后端分层、事务、模块所有权与一致性契约。 |
| [共享契约与数据库](architecture/contracts-and-database.md) | architecture | Current | 2026-09-16 | 2026-10-31 | 共享代码选址、公开出口、DTO、数据库与事务边界。 |
| [前端架构](architecture/frontend-architecture.md) | architecture | Current | 2026-09-15 | 2026-10-31 | Admin / SSO service、页面状态、路由与权限规则。 |
| [仓库地图](architecture/repository-map.md) | architecture | Current | 2026-09-22 | 2026-10-31 | Apps、packages、基础设施、AFK、测试与生成目录定位。 |
| [系统架构视图](architecture/system-architecture.md) | architecture | Current | 2026-09-21 | 2026-10-31 | 运行时拓扑、信任边界、数据权威与恢复责任。 |
| [测试编排架构](architecture/testing-architecture.md) | architecture | Current | 2026-09-15 | 2026-10-31 | 测试层级、质量、收集、资源预算与生命周期。 |

</details>

### 开发约定

<details>
<summary>展开开发约定</summary>

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [后端实现约定](development/backend-implementation.md) | development | Current | 2026-07-26 | 2026-10-31 | 响应封装、OpenAPI、logger 与 audit 实现约定。 |
| [编码风格与命名约定](development/coding-style.md) | development | Current | 2026-08-07 | 2026-10-31 | TypeScript、formatter、文件命名与 import 风格。 |
| [构建、测试与开发命令](development/commands.md) | development | Current | 2026-09-22 | 2026-10-31 | 开发、构建、验证、AFK 与维护的命令和资源入口。 |

</details>

### 功能契约与设计

<details>
<summary>展开功能契约与设计</summary>

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [Admin 写入结果与失败恢复](features/admin/admin-mutation-contract.md) | feature | Current | 2026-09-21 | 2026-10-31 | Admin 结果、no-op、已提交/未知与页面恢复。 |
| [Client 单协议配置与 Secret 管理](features/admin/client-sso-configuration.md) | feature | Current | 2026-09-21 | 2026-10-31 | 单协议配置、Secret 授权读取与传播修复。 |
| [会话管理与本人安全](features/admin/session-management.md) | feature | Current | 2026-09-21 | 2026-10-31 | 安全列表、固定批次撤销、本人安全与临时限制。 |
| [统一审计日志](features/audit/audit-logging.md) | feature | Current | 2026-09-21 | 2026-10-31 | 审计 action、目标、安全字段与作用后失败。 |
| [OIDC 接入与协议契约](features/oidc/oidc-integration.md) | feature | Current | 2026-09-21 | 2026-10-31 | OIDC 接入、双 issuer、处理顺序与失败作用。 |
| [HR 组织责任管理契约](features/organization-responsibility/hr-admin-management-design.md) | feature | Current | 2026-09-21 | 2026-10-31 | HR 双端范围、生命周期、隐藏 blocker 与页面能力。 |
| [登录、认证续接与账号恢复](features/sso/authentication-and-recovery.md) | feature | Current | 2026-09-21 | 2026-10-31 | 根认证、登录重入、短信冷却与脱敏手机号恢复。 |
| [Client Snapshot 契约](features/sso/client-snapshot-contract.md) | feature | Current | 2026-09-21 | 2026-10-31 | 普通/敏感 Snapshot、缓存观察、提交传播与恢复。 |
| [Custom SSO 协议契约](features/sso/custom-sso-contract.md) | feature | Current | 2026-09-21 | 2026-10-31 | Custom 授权、两类交付、Code/Token 与失败矩阵。 |
| [已发布 Subject Facts 的授权交付](features/sso/published-subject-facts-contract.md) | feature | Current | 2026-09-21 | 2026-10-31 | 已发布权限、当前披露与事实不可得的交付边界。 |
| [Subject Access 操作许可](features/sso/subject-access-operation-contract.md) | feature | Current | 2026-09-21 | 2026-10-31 | 单次操作许可、严格 context 与消费方责任。 |
| [第三方 Custom SSO 接入指南](features/sso/third-party-sso-integration.md) | feature | Current | 2026-09-21 | 2026-10-31 | 业务/托管 SSO、可信登录、编码及错误处理。 |
| [两类会话的 Kernel 能力](features/sso/unified-session-kernel.md) | feature | Current | 2026-09-21 | 2026-10-31 | 两类会话模型、可信观察、原子关系与精确撤销。 |
| [User Profile Filter DSL 规则](features/user-profile-search/filter-dsl.md) | feature | Current | 2026-09-21 | 2026-10-31 | User Profile Filter DSL v3 与 Internal Base 响应。 |

</details>

### 发布与维护

<details>
<summary>展开发布与维护</summary>

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [APISIX Gateway 配置发布手册](releases/apisix-gateway-release.md) | runbook | Current | 2026-09-21 | 2026-10-31 | 限定 scope 的发布、代理信任、验收与回滚。 |
| [IAM 系统日志可观测性运行手册](releases/observability-system-logs.md) | runbook | Current | 2026-09-21 | 2026-10-31 | 日志栈、Grafana OIDC、排障与 trace 关联。 |
| [API OIDC 发布与密钥维护](releases/oidc-release-runbook.md) | runbook | Current | 2026-09-21 | 2026-10-31 | 当前双入口配置、JWK 轮换与故障恢复。 |
| [登录凭证配置与部署](releases/sm-encrypted-password-login-release.md) | runbook | Current | 2026-09-21 | 2026-10-31 | API/SSO 配对密钥、nonce 与当前登录验收。 |
| [当前会话与 Client Snapshot 维护](releases/unified-session-maintenance.md) | runbook | Current | 2026-09-21 | 2026-10-31 | 当前布局定向清理、Snapshot 恢复与人工放流。 |
| [User Profile 与 Subject Access 维护](releases/user-profile-maintenance.md) | runbook | Current | 2026-09-21 | 2026-10-31 | 当前重建、完整校验、Barrier 恢复与调度责任。 |

</details>

### 历史审查

<details>
<summary>展开历史审查</summary>

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [软件工程原则审查报告](reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md) | review | Historical | 2026-07-03 | n/a | 软件工程审查快照，不替代当前代码检查。 |
| [纯展示测试盘点（2026-09-15）](reviews/static-ui-test-cleanup-2026-09-15.md) | review | Historical | 2026-09-15 | n/a | 固定基线的纯展示测试盘点与清理范围。 |

</details>
