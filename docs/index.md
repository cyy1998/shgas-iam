# IAM 文档索引

本索引用作 Codex 和维护者进入 `docs/` 的稳定入口。判断“仓库现在怎样”与判断“本次应改成怎样”使用不同依据；不要用目标规格覆盖已观察到的当前行为，也不要让现有实现自动否定已授权的修改目标。需要理解历史决策时再进入 `Historical` 文档。`Stale` 文档和冻结的 OpenSpec 产物只能作为历史线索。

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

## 文档清单

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [docs/adr/0001-replace-openspec-workflow.md](adr/0001-replace-openspec-workflow.md) | decision | Current | 2026-08-14 | 2026-10-31 | 采用 Matt skills 与 GitHub Issues 工作流，并冻结 OpenSpec。 |
| [docs/adr/0002-centralize-role-assignment-resolution.md](adr/0002-centralize-role-assignment-resolution.md) | decision | Current | 2026-07-18 | 2026-10-31 | 以独立 workspace package 统一有效角色与受影响用户解析。 |
| [docs/adr/0003-adopt-layered-test-lanes-and-resource-budgets.md](adr/0003-adopt-layered-test-lanes-and-resource-budgets.md) | decision | Historical | 2026-08-05 | n/a | 旧普通/smoke/external 通道决策；已由 ADR-0009 取代。 |
| [docs/adr/0004-adopt-upstream-first-matt-skills.md](adr/0004-adopt-upstream-first-matt-skills.md) | decision | Current | 2026-08-14 | 2026-10-31 | 确立上游 Matt skills 的流程所有权，仓库以 GitHub Issues 提供薄适配。 |
| [docs/adr/0005-keep-live-login-state-in-redis.md](adr/0005-keep-live-login-state-in-redis.md) | decision | Current | 2026-07-28 | 2026-10-31 | 有效会话与临时登录限制只以 Redis 实时状态为事实来源，不建立 PostgreSQL 会话影子或历史快照。 |
| [docs/adr/0006-elevate-user-subject-identifier.md](adr/0006-elevate-user-subject-identifier.md) | decision | Current | 2026-07-30 | 2026-10-31 | 保留现有 UUID，并将 Subject Identifier 的命名与所有权从 OIDC 提升到 IAM 身份域。 |
| [docs/adr/0007-separate-versioned-custom-sso-client-configuration.md](adr/0007-separate-versioned-custom-sso-client-configuration.md) | decision | Current | 2026-08-23 | 2026-10-31 | Custom SSO 使用独立的严格配置、Secret Hash 和版本屏障；Client Binding 与 per-Client Catalog version 分别由 ADR-0010、ADR-0016 局部取代。 |
| [docs/adr/0008-adopt-client-subject-projection.md](adr/0008-adopt-client-subject-projection.md) | decision | Current | 2026-07-30 | 2026-10-31 | 两个协议共享主体事实与 client 裁剪模块，但保持配置、Wire Contract 和生命周期独立。 |
| [docs/adr/0009-adopt-canonical-test-collections.md](adr/0009-adopt-canonical-test-collections.md) | decision | Current | 2026-08-06 | 2026-10-31 | 采用 Unit/Integration/E2E canonical collections、永久 Guard，并原子切换默认 `test` 与 `verify`。 |
| [docs/adr/0010-narrow-client-binding-to-oidc-lifecycle.md](adr/0010-narrow-client-binding-to-oidc-lifecycle.md) | decision | Current | 2026-09-09 | 2026-10-31 | Client Binding 只属于 OIDC，删除 full binding 派生副本；Custom SSO 可恢复签发与最终精确补偿要求由 ADR-0031 局部取代，Independent/Gateway #158/#159 已实现，定向维护已由 #160 交付。 |
| [docs/adr/0011-model-employment-as-an-immutable-tenure-lifecycle.md](adr/0011-model-employment-as-an-immutable-tenure-lifecycle.md) | decision | Current | 2026-08-11 | 2026-10-31 | Employment 表示不可重开的任职期；写入端保证父对象完整性，Subject Facts 发布前 fail closed。 |
| [docs/adr/0012-model-client-maintenance-as-reversible-protocol-traffic-suspension.md](adr/0012-model-client-maintenance-as-reversible-protocol-traffic-suspension.md) | decision | Current | 2026-09-03 | 2026-10-31 | Accepted：Client Maintenance 是可逆在线协议流量暂停；Client Traffic Gate 已按 ADR-0022 迁移到 Snapshot acquisition，并移除强 fencing。 |
| [docs/adr/0013-guard-login-page-reentry-with-authentication-continuation.md](adr/0013-guard-login-page-reentry-with-authentication-continuation.md) | decision | Current | 2026-08-14 | 2026-10-31 | Accepted：统一登录页以认证续接守卫阻止已有有效会话重复认证，并明确 OIDC 新鲜认证要求的拒绝边界。 |
| [docs/adr/0014-model-organization-responsibility-as-employment-bound-fact.md](adr/0014-model-organization-responsibility-as-employment-bound-fact.md) | decision | Current | 2026-08-20 | 2026-10-31 | Accepted：Organization Responsibility 是 Employment 持有、可跨组织树目标的非授权事实；cardinality 强保证，跨表 predicate 接受低并发乐观边界。 |
| [docs/adr/0015-adopt-schema-driven-user-profile-filter-dsl.md](adr/0015-adopt-schema-driven-user-profile-filter-dsl.md) | decision | Current | 2026-08-25 | 2026-10-31 | Accepted：User Profile Search 采用 Search Document 公开结构驱动的通用 Filter DSL；Internal Filter DSL 的响应形状已由 ADR-0019 修订。 |
| [docs/adr/0016-own-subject-claim-catalog-version-server-side.md](adr/0016-own-subject-claim-catalog-version-server-side.md) | decision | Current | 2026-08-23 | 2026-10-31 | Accepted：Catalog 代际由服务端全局拥有，不按 Client 持久化；切换时仍推进全部协议 epoch 并清理旧 artifact。 |
| [docs/adr/0017-centralize-admin-role-policy-with-request-time-scope.md](adr/0017-centralize-admin-role-policy-with-request-time-scope.md) | decision | Current | 2026-08-23 | 2026-10-31 | Accepted：Admin 授权由服务端集中角色策略拥有，HR 组织范围使用 PostgreSQL 请求时事实，并明确接受低并发下的非线性撤权窗口。 |
| [docs/adr/0018-authorize-hr-organization-responsibility-by-both-endpoints.md](adr/0018-authorize-hr-organization-responsibility-by-both-endpoints.md) | decision | Current | 2026-08-25 | 2026-10-31 | Accepted：HR 复用现有管理入口，仅在 holder Employment 与 target Organization 双端均属于请求时 scope 时管理责任任命；跨 scope roots 允许。 |
| [docs/adr/0019-return-user-profile-base-from-internal-filter-dsl.md](adr/0019-return-user-profile-base-from-internal-filter-dsl.md) | decision | Current | 2026-08-25 | 2026-10-31 | Accepted：Internal Filter DSL 从 `user_profile` 类型化列返回固定 `UserProfileBase`，不再读取或校验完整 Detail。 |
| [docs/adr/0020-provide-fail-closed-privilege-delegation-resolution.md](adr/0020-provide-fail-closed-privilege-delegation-resolution.md) | decision | Current | 2026-09-08 | 2026-10-31 | Accepted：Internal 批量解析当前直接 Delegatee，区分 null、未知输入与完整性异常，并保持旧 Delegation 搜索不变。 |
| [docs/adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md](adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) | decision | Current | 2026-09-03 | 2026-10-31 | #27 已实现：deep Runtime Snapshot Module、target-bound Admin mutation wrapper、三类 Runtime acquisition、legacy 在线协议退役、targeted/full Worker repair 与独立 verify；恢复范围已由 ADR-0023 收窄，首次旧代切换为历史参考。 |
| [docs/adr/0022-adopt-snapshot-consistency-for-client-traffic-gate.md](adr/0022-adopt-snapshot-consistency-for-client-traffic-gate.md) | decision | Current | 2026-09-03 | 2026-10-31 | 已实现 Client Traffic Gate Snapshot acquisition、强 fencing 移除、传播失败窗口、targeted/full Worker repair 与独立 verify；恢复范围由 ADR-0023 局部修订。 |
| [docs/adr/0023-retire-legacy-maintenance-support.md](adr/0023-retire-legacy-maintenance-support.md) | decision | Current | 2026-09-07 | 2026-10-31 | Profile/Employment 迁移、Runtime 当前 namespace 恢复与 Session cleanup 退役已实现，不代表环境已完成切换。 |
| [docs/adr/0024-canonicalize-historical-audit-actions.md](adr/0024-canonicalize-historical-audit-actions.md) | decision | Current | 2026-09-07 | 2026-10-31 | 独立历史 action 工具与无别名代码候选已实现，迁移后查询和展示已验证；目标环境迁移尚未执行。 |
| [docs/adr/0025-align-admin-mutation-results-with-committed-facts.md](adr/0025-align-admin-mutation-results-with-committed-facts.md) | decision | Current | 2026-09-08 | 2026-10-31 | 全部现存 Admin mutation 已迁移统一结果和同行锁，过渡 CAS 收缩；代码核对与协调切换分开，环境部署仍由发布 owner 核验。 |
| [docs/adr/0026-serialize-privilege-delegation-writes-by-delegator.md](adr/0026-serialize-privilege-delegation-writes-by-delegator.md) | decision | Current | 2026-09-08 | 2026-10-31 | 已实现：Internal 委托按委托人行锁串行化、完整候选校验并原子记审计；仅权限、时间与组织覆盖均相交时冲突，不相交范围允许并存。 |
| [docs/adr/0027-own-online-authentication-lifecycle-time-in-redis.md](adr/0027-own-online-authentication-lifecycle-time-in-redis.md) | decision | Current | 2026-09-09 | 2026-10-31 | Spec #115 已实现 Redis 生命周期时间并交付 owner 清理与维护手册，环境切换未执行；Custom SSO 恢复承诺由 ADR-0031 局部取代，Independent/Gateway #158/#159 已实现，定向维护已由 #160 交付。 |
| [docs/adr/0028-extract-session-and-grant-state.md](adr/0028-extract-session-and-grant-state.md) | decision | Current | 2026-09-08 | 2026-10-31 | Accepted：Spec #122 分别迁出 session-kernel/custom-sso，包含协议 wire、外部依赖注入、按能力分出口与旧出口一次性删除；#123 已归回统一认证；#124 已收敛 API 内完整 Custom SSO 模块与出站边界；#125 已迁 Kernel 及消费者，#126 已迁 wire 及前后端消费者，#127 已迁完整 Custom SSO/Grant 与独立 cleanup；全部 50 条故事核对已登记，最终聚合验收由父 Spec 记录。 |
| [docs/adr/0029-check-subject-access-once-per-business-operation.md](adr/0029-check-subject-access-once-per-business-operation.md) | decision | Current | 2026-09-08 | 2026-10-31 | 已实现：全部生产入口统一操作许可与中性 Kernel，旧保护退役；62故事与人工维护边界见最终契约，环境切换未执行。 |
| [docs/adr/0030-separate-protocol-validation-from-kernel-lifecycle.md](adr/0030-separate-protocol-validation-from-kernel-lifecycle.md) | decision | Current | 2026-09-09 | 2026-10-31 | 已实现用途匹配、协议精确失败、操作配置/Gate 及 Admin 固定版本撤销；#151 最终组合逐项核对，保留对象升级手册已交付，环境未执行。 |
| [docs/adr/0031-consume-custom-sso-grants-before-issuance.md](adr/0031-consume-custom-sso-grants-before-issuance.md) | decision | Current | 2026-09-09 | 2026-10-31 | Accepted：由 #152 形成 Spec #157，采用一次消费、同步尽力补偿、失败重新授权、Gateway 原响应与保留会话切换；Independent/Gateway #158/#159 已实现 Kernel 一次消费与失败重新授权，定向维护由 #160 交付，#161 已提供最终账本和统一升级手册，父级验收另记、环境未切换。 |
| [docs/agents/code-investigation.md](agents/code-investigation.md) | agent-config | Current | 2026-09-05 | 2026-10-31 | 项目级 `code_researcher`/`deep_researcher` 的分层路由、只读调查、证据返回和 GitHub issue 外置记忆规则；运行配置以对应 TOML 为准。 |
| [docs/agents/domain.md](agents/domain.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Engineering skills 的 single-context domain documentation 消费规则。 |
| [docs/agents/issue-tracker.md](agents/issue-tracker.md) | agent-config | Current | 2026-08-14 | 2026-10-31 | `cyy1998/shgas-iam` GitHub Issues 的 spec、ticket、跨会话状态与 wayfinding 约定。 |
| [docs/agents/triage-labels.md](agents/triage-labels.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Engineering skills 使用的默认 triage 标签映射。 |
| [docs/agents/workflow.md](agents/workflow.md) | agent-config | Current | 2026-09-07 | 2026-10-31 | Matt skills 的仓库薄适配：GitHub tracker、批量实施子代理、分支、验证、授权和本地合入；每票统一静态验证含 Collection Guard，最终验证先于收尾授权。 |
| [docs/architecture/architecture-guard.md](architecture/architecture-guard.md) | architecture | Current | 2026-09-08 | 2026-10-31 | 架构守卫规范的验证层选择、允许观察模型、永久规则准入、封闭目录与复杂度边界；覆盖说明链接验证归属。 |
| [docs/architecture/architecture-verification.md](architecture/architecture-verification.md) | architecture | Current | 2026-09-09 | 2026-10-31 | 系统约束的行为/资源/静态与人工证明边界；包含协议最终 56 故事、版本清理与协议签发组合、独立 Admin PG/Redis 及保留升级验收。 |
| [docs/architecture/backend-architecture.md](architecture/backend-architecture.md) | architecture | Current | 2026-09-09 | 2026-10-31 | 后端 ownership、UoW、Profile/Runtime 与分层验证；Admin 版本限定撤销及两协议操作快照已接入，保留跨表乐观及部署边界。 |
| [docs/architecture/contracts-and-database.md](architecture/contracts-and-database.md) | architecture | Current | 2026-09-08 | 2026-10-31 | 共享代码选址、纯规则与后端 DTO 分层、公开接口、建包条件、DTO 字段演进与渐进收敛；保留专用能力包、事务与 Drizzle 契约。 |
| [docs/architecture/frontend-architecture.md](architecture/frontend-architecture.md) | architecture | Current | 2026-09-08 | 2026-10-31 | Admin/SSO 通用 service、页面状态、路由/capability、登录守卫与渐进收敛规则；Admin 统一结果及已提交失败恢复已迁移，消费者协调切换另行核验。 |
| [docs/architecture/repository-map.md](architecture/repository-map.md) | architecture | Current | 2026-09-09 | 2026-10-31 | monorepo apps/packages、共享 contracts/domain 职责、User Profile v3 read-model、root-owned E2E workspace、基础设施与生成目录边界。 |
| [docs/architecture/system-architecture.md](architecture/system-architecture.md) | architecture | Current | 2026-09-09 | 2026-10-31 | 运行时拓扑、信任边界与权威来源；两协议操作快照、精确失败、固定版本撤销及恢复责任，代码与部署证据分离。 |
| [docs/architecture/testing-architecture.md](architecture/testing-architecture.md) | architecture | Current | 2026-09-09 | 2026-10-31 | Unit/Integration/E2E canonical collections、资源预算与验证契约；含当前契约分类、删除证据、mapper owner 与消费方能力规则；每票与最终聚合入口包含 Collection Guard。 |
| [docs/development/backend-implementation.md](development/backend-implementation.md) | development | Current | 2026-07-26 | 2026-10-31 | backend response envelope、OpenAPI status、logger、audit event 和 Architecture Guard 验证分层。 |
| [docs/development/coding-style.md](development/coding-style.md) | development | Current | 2026-08-07 | 2026-10-31 | TypeScript、formatter 边界、文件命名、React 命名和 import alias 风格约定。 |
| [docs/development/commands.md](development/commands.md) | development | Current | 2026-09-08 | 2026-10-31 | 聚焦实现、canonical Unit/Integration commands、每票 verify:static 与完整 verify、显式资源 profiles、Architecture Guard、性能与 commit guard 的可执行入口；Employment 全库诊断统一为 employment:verify；Subject Access repair 包含 PostgreSQL intent 回收。 |
| [docs/features/admin/admin-mutation-contract.md](features/admin/admin-mutation-contract.md) | feature | Current | 2026-09-08 | 2026-10-31 | Admin 最终命令/协议/页面 census、42 条故事与实现/测试决策逐项核对、公共模块与锁序证据；实际候选验收由议题记录。 |
| [docs/features/admin/client-protocol-revocation.md](features/admin/client-protocol-revocation.md) | feature | Current | 2026-09-09 | 2026-10-31 | #150 的提交版本边界、协议 selector owner、同观察对象撤销、pending cleanup 与真实 PG/Redis 证明范围。 |
| [docs/features/admin/session-management.md](features/admin/session-management.md) | feature | Current | 2026-09-08 | 2026-10-31 | Sessions 页面统一命令结果、安全数量、刷新和持续作用后审计修复提示。 |
| [docs/features/audit/audit-logging.md](features/audit/audit-logging.md) | feature | Current | 2026-09-07 | 2026-09-30 | 统一审计日志、安全字段、历史 action 规范化与已完成 `login_log` 退役后的当前边界。 |
| [docs/features/oidc/oidc-integration.md](features/oidc/oidc-integration.md) | feature | Current | 2026-08-01 | 2026-09-30 | 内部 OIDC client 的端点、client 类型、scope/claim、CORS 和退出契约。 |
| [docs/features/oidc/oidc-operation-snapshots.md](features/oidc/oidc-operation-snapshots.md) | feature | Current | 2026-09-09 | 2026-10-31 | #149 的 Provider 全回调与三个原生入口操作配置/Gate 复用、关闭边界、新代保留和真实验证归属。 |
| [docs/features/oidc/oidc-session-migration.md](features/oidc/oidc-session-migration.md) | feature | Current | 2026-09-09 | 2026-09-30 | 当前维护、staged payload 与回滚边界；Spec #146 保留对象升级不执行旧全清或 epoch 命令，更早环境迁移另行安排。 |
| [docs/features/oidc/online-auth-redis-time-contract.md](features/oidc/online-auth-redis-time-contract.md) | feature | Current | 2026-09-09 | 2026-10-31 | Spec #115 的 42 条故事、实现与两类自动化 seam 逐项核对；代码验证和人工切换证据分开。 |
| [docs/features/organization-responsibility/hr-admin-management-design.md](features/organization-responsibility/hr-admin-management-design.md) | design | Current | 2026-09-07 | 2026-10-31 | 已实现：HR 双端 scoped 责任管理及直接命令统一结果、行锁与 no-op 意图审计；保留原 Full-system 验证及协调发布边界。 |
| [docs/features/sso/authentication-state-extraction.md](features/sso/authentication-state-extraction.md) | feature | Current | 2026-09-09 | 2026-10-31 | Spec #122 全部 50 条故事、最终 owner 与前票证据复用边界；代码候选验证与环境操作分开。 |
| [docs/features/sso/custom-sso-one-shot-grant-contract.md](features/sso/custom-sso-one-shot-grant-contract.md) | feature | Current | 2026-09-09 | 2026-10-31 | #161 全部 56 故事/20 实现/10 测试决定、候选复用、生产消费退役及最终 HTTP/Redis 组合；父级聚合与环境验收分开。 |
| [docs/features/sso/custom-sso-protocol-validation.md](features/sso/custom-sso-protocol-validation.md) | feature | Current | 2026-09-09 | 2026-10-31 | #148 的操作级配置/Gate 独立首次结果、精确失败、较新对象保护、API Cookie 与真实验证归属。 |
| [docs/features/sso/custom-sso-subject-projection-design.md](features/sso/custom-sso-subject-projection-design.md) | design | Historical | 2026-08-12 | n/a | 初代 Catalog V1 与 per-Client Catalog version 目标设计快照；相关决定已由 ADR-0016 取代，不代表当前实现。 |
| [docs/features/sso/login-page-reentry-guard.md](features/sso/login-page-reentry-guard.md) | design | Current | 2026-08-14 | 2026-09-30 | 已接受的登录页重入守卫设计；定义协议所有权、页面状态、OIDC 重新认证边界、验收与协调切换。 |
| [docs/features/sso/protocol-validation-contract.md](features/sso/protocol-validation-contract.md) | feature | Current | 2026-09-09 | 2026-10-31 | Spec #146 全部 56 故事、18 实现决定及测试决定的最终证据账本，候选复用边界和组合缺口验证；人工升级未执行。 |
| [docs/features/sso/public-thirdparty-unified-login.md](features/sso/public-thirdparty-unified-login.md) | feature | Current | 2026-09-07 | 2026-09-30 | 第三方统一登录入口、目标系统会话所有权与 Custom SSO 职责边界说明。 |
| [docs/features/sso/subject-access-operation-contract.md](features/sso/subject-access-operation-contract.md) | feature | Current | 2026-09-09 | 2026-10-31 | Spec #128 全部62故事、最终owner、直接行为证据与测试迁移；最终聚合验收由父规格记录。 |
| [docs/features/sso/third-party-sso-integration.md](features/sso/third-party-sso-integration.md) | feature | Current | 2026-09-09 | 2026-09-30 | Independent/Gateway 失败重新授权、既有 wire 和普通访问重试分离；定向维护已由 #160 交付，候选不可部署。 |
| [docs/features/user-profile-search/filter-dsl.md](features/user-profile-search/filter-dsl.md) | design | Current | 2026-08-25 | 2026-10-31 | 已激活的 User Profile Filter DSL v3 规则；Internal Filter DSL 固定返回 User Profile Base，旧责任限定 DSL 已撤销。 |
| [docs/releases/admin-mutation-contract-cutover.md](releases/admin-mutation-contract-cutover.md) | runbook | Current | 2026-09-08 | 2026-10-31 | Admin 后端/页面/REST legacy 与外部消费者核验、协调切换、已提交失败和回退清单；尚未执行环境部署，不要求生产数据迁移。 |
| [docs/releases/apisix-gateway-release.md](releases/apisix-gateway-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | APISIX manifest validate/diff/apply/prune、限流、观测和回滚手册。 |
| [docs/releases/audit-action-canonicalization.md](releases/audit-action-canonicalization.md) | runbook | Current | 2026-09-07 | 2026-10-31 | 历史 action 盘点、事务 apply、独立 verify、无别名候选部署与旧备份恢复门禁。 |
| [docs/releases/audit-login-log-retirement-release.md](releases/audit-login-log-retirement-release.md) | runbook | Historical | 2026-07-16 | n/a | 已完成的 `login_log` 一次性退役记录；其迁移实现已不在当前仓库，不可作为当前 runbook。 |
| [docs/releases/client-protocol-v2-artifact-cutover.md](releases/client-protocol-v2-artifact-cutover.md) | runbook | Current | 2026-09-08 | 2026-10-31 | 服务端 Catalog V2 硬切换的 owner checklist、无 Catalog target 的 epoch 不可逆边界与精确 artifact cleanup；OIDC 新写入保持 Redis 索引期限，不自动覆盖历史孤立对象。 |
| [docs/releases/client-runtime-snapshot-hard-cutover.md](releases/client-runtime-snapshot-hard-cutover.md) | runbook | Historical | 2026-09-07 | n/a | 首次旧代切换历史参考，旧 inventory 操作不适用于当前候选；日常恢复见 Current restore runbook。 |
| [docs/releases/client-runtime-snapshot-restore.md](releases/client-runtime-snapshot-restore.md) | runbook | Current | 2026-09-07 | 2026-10-31 | 当前 Snapshot targeted/full repair、独立 verify、停流恢复与失败重跑；旧环境和旧备份升级须另行迁移。 |
| [docs/releases/custom-sso-grant-maintenance.md](releases/custom-sso-grant-maintenance.md) | runbook | Current | 2026-09-09 | 2026-10-31 | #160 定向 inventory/apply/只读 verify、旧 writer 排空且新 writer 未启用窗口、CAS/未知失败重跑与保留集独立对照；环境未执行。 |
| [docs/releases/custom-sso-one-shot-grant-upgrade.md](releases/custom-sso-one-shot-grant-upgrade.md) | runbook | Current | 2026-09-09 | 2026-10-31 | #161 保留会话统一升级：基线、writer/consumer、停流排空、定向清理/独立保留、统一版本、smoke、一次放流及回退；环境未执行。 |
| [docs/releases/custom-sso-subject-projection-rehearsal-2026-08-02.md](releases/custom-sso-subject-projection-rehearsal-2026-08-02.md) | release-record | Historical | 2026-08-02 | n/a | Ticket 12 的临时近似规模手动联合演练简洁记录；不包含机器 receipt/manifest/transcript。 |
| [docs/releases/custom-sso-subject-projection-release.md](releases/custom-sso-subject-projection-release.md) | runbook | Historical | 2026-08-21 | n/a | 已由 strict V2 activation 取代；保留初代 Subject Projection 切换历史，不得执行其中已撤销命令。 |
| [docs/releases/observability-system-logs.md](releases/observability-system-logs.md) | runbook | Current | 2026-07-03 | 2026-10-31 | Loki/Grafana/Alloy 系统日志观测运行手册；补充 APISIX trace、Alloy OTLP 和证据留存。 |
| [docs/releases/oidc-release-runbook.md](releases/oidc-release-runbook.md) | runbook | Current | 2026-09-09 | 2026-10-31 | OIDC 当前架构发布、JWK/HMAC rotation 与回滚；Spec #146 优先保留对象升级流程，旧 Session 迁移另行安排。 |
| [docs/releases/online-auth-redis-time-cutover.md](releases/online-auth-redis-time-cutover.md) | runbook | Current | 2026-09-08 | 2026-10-31 | 当前 Kernel/Grant/OIDC 直接 owner 扫描清理、独立 verify、停流排空与统一版本、失败重跑/回退、保留集及 Redis 主机责任；环境未执行。 |
| [docs/releases/organization-responsibility-v2-hard-cutover.md](releases/organization-responsibility-v2-hard-cutover.md) | runbook | Current | 2026-08-22 | 2026-10-31 | Organization Responsibility V2、User Profile v3 与 Client Protocol V2 的完整 freeze、双 data gate、epoch/cleanup、Full-system/release smoke、一次性放流与 forward-only 回滚边界。 |
| [docs/releases/protocol-validation-preserving-upgrade.md](releases/protocol-validation-preserving-upgrade.md) | runbook | Current | 2026-09-09 | 2026-10-31 | Spec #146 当前格式停流、冻结、drain、统一版本与保留有效对象升级；明确旧全清不适用、双向误投/合法 smoke 与失败处置，环境未执行。 |
| [docs/releases/role-assignment-role-management-release.md](releases/role-assignment-role-management-release.md) | runbook | Current | 2026-07-25 | 2026-10-31 | 角色分配 resolver、admin `/roles`、OIDC/read-model 一致性验收和回滚手册。 |
| [docs/releases/session-kernel-release-smoke.md](releases/session-kernel-release-smoke.md) | release-record | Historical | 2026-07-03 | n/a | 2026-06-24 Session Kernel 发布 smoke 证据快照，并提供后续可复用 smoke 模板。 |
| [docs/releases/sm-encrypted-password-login-release.md](releases/sm-encrypted-password-login-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | SM2/SM4 加密密码登录、API/SSO 同步发布、Cap 重试、错误码和 rollback matrix。 |
| [docs/releases/subject-access-operation-cutover.md](releases/subject-access-operation-cutover.md) | runbook | Current | 2026-09-08 | 2026-10-31 | 操作许可统一切换：停流drain、当前owner清理/保留、独立verify、统一版本、重新登录及回退；目标环境未执行。 |
| [docs/releases/user-profile-dirty-queue-release.md](releases/user-profile-dirty-queue-release.md) | runbook | Current | 2026-07-25 | 2026-10-31 | scope producer 停止、旧 job 五类排空、worker-last 发布门禁，以及现有 Bull Board/repair/backfill 操作语义。 |
| [docs/releases/user-profile-v3-hard-cutover.md](releases/user-profile-v3-hard-cutover.md) | runbook | Current | 2026-08-22 | 2026-10-31 | User Profile v2→v3 单代原地重建的 freeze、固定 candidate、backfill/收敛、双 gate、smoke、失败关闭与一次性放流手册；不推进 Client Protocol epoch 或清理 artifact。 |
| [docs/reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md](reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md) | review | Historical | 2026-07-03 | n/a | 2026-07-03 的软件工程原则审查快照；用于追溯风险，不替代当前代码检查。 |

## 维护方式

新增、删除或移动 `docs/**/*.md` 时，同步更新本索引并运行：

```bash
pnpm check:docs
```

若某篇文档包含已知旧架构或旧技术引用，但仍需保留，请在索引中标为 `Historical` 或 `Stale`。
