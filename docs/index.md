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
| [docs/adr/0008-adopt-client-subject-projection.md](adr/0008-adopt-client-subject-projection.md) | decision | Current | 2026-09-09 | 2026-10-31 | 两协议共享主体事实与 client 裁剪；请求时授权新鲜度要求由 ADR-0032 的已接受目标局部取代，代码已迁移、环境未切换。 |
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
| [docs/adr/0029-check-subject-access-once-per-business-operation.md](adr/0029-check-subject-access-once-per-business-operation.md) | decision | Current | 2026-09-10 | 2026-10-31 | 已实现：全部生产入口统一操作许可与中性 Kernel，旧保护退役；62故事与人工维护边界见最终契约；父依赖由已实现 ADR-0033 局部取代，环境切换未执行。 |
| [docs/adr/0030-separate-protocol-validation-from-kernel-lifecycle.md](adr/0030-separate-protocol-validation-from-kernel-lifecycle.md) | decision | Current | 2026-09-10 | 2026-10-31 | 已实现用途匹配、协议精确失败、操作配置/Gate 及 Admin 固定版本撤销；#151 最终组合逐项核对，保留对象升级手册已交付，环境未执行。 |
| [docs/adr/0031-consume-custom-sso-grants-before-issuance.md](adr/0031-consume-custom-sso-grants-before-issuance.md) | decision | Current | 2026-09-10 | 2026-10-31 | Accepted：由 #152 形成 Spec #157，采用一次消费、同步尽力补偿、失败重新授权、Gateway 原响应与保留会话切换；Independent/Gateway #158/#159 已实现 Kernel 一次消费与失败重新授权，定向维护由 #160 交付，#161 已提供最终账本和统一升级手册，父级验收另记、环境未切换。 |
| [docs/adr/0032-consume-published-subject-facts-for-authorization.md](adr/0032-consume-published-subject-facts-for-authorization.md) | decision | Current | 2026-09-10 | 2026-10-31 | Accepted：#156 双协议采用 Redis 优先、缓存失效回源的已发布事实；接受旧权限，保留登录及协议版本，以行为验证验收；代码已实现、环境未切换。 |
| [docs/adr/0033-trust-issued-credentials-without-principal-session-revalidation.md](adr/0033-trust-issued-credentials-without-principal-session-revalidation.md) | decision | Current | 2026-09-10 | 2026-10-31 | Accepted：Spec #163 由 #138 形成，采用 Credential 使用不查父、兑换仍查父、根撤销尽力级联；Custom SSO 不续根或凭据、签发裁剪到根期限；复用现有全体下线命令切换；#164–#167 已实现，#168 交付最终账本，环境未切换。 |
| [docs/adr/0034-locate-token-state-records-directly.md](adr/0034-locate-token-state-records-directly.md) | decision | Current | 2026-09-10 | 2026-10-31 | Accepted：#137 三类对象以 SHA-256 直接定位、独立 ID 反向管理、同记录终态、pending 保留及全体下线切换；三类状态及 Kernel HMAC runtime 配置退役已落地；#175 维护已交付，#176 最终逐项账本与原始基线成本已记录；候选 gate/评审另记，环境未切换。 |
| [docs/adr/0035-unify-user-and-client-session-lifecycles.md](adr/0035-unify-user-and-client-session-lifecycles.md) | decision | Current | 2026-09-15 | 2026-10-31 | Accepted：Q40 整体确认 Q34–Q39 的三段 Custom 业务 Code、认证/定位门槛及请求内有界失败撤销；交接记录见 #177，尚未实施或部署。 |
| [docs/adr/0036-bind-oidc-to-internal-and-external-issuers.md](adr/0036-bind-oidc-to-internal-and-external-issuers.md) | decision | Current | 2026-09-16 | 2026-10-31 | Spec #197 已实现相对导航、双 issuer、共享密钥与跨 issuer 失败处理；托管固定回调已由 ADR-0038 的实现取代，环境未切换。 |
| [docs/adr/0037-classify-managed-sso-callbacks-by-path.md](adr/0037-classify-managed-sso-callbacks-by-path.md) | decision | Current | 2026-09-16 | 2026-10-31 | Accepted：显式托管/业务类型取代 URL 分类，Q9–Q19 已确认并实现；一次性配置迁移、业务 ORCAS 禁止与保留状态切换，环境未迁移。 |
| [docs/adr/0038-derive-managed-sso-callback-from-redirect-origin.md](adr/0038-derive-managed-sso-callback-from-redirect-origin.md) | decision | Current | 2026-09-16 | 2026-10-31 | Accepted：#202–#205 已交付托管 origin、同代保留与 b648 离线直升；#206 整链与最终验证见独立账本，环境未迁移。 |
| [docs/agents/code-investigation.md](agents/code-investigation.md) | agent-config | Current | 2026-09-05 | 2026-10-31 | 项目级 `code_researcher`/`deep_researcher` 的分层路由、只读调查、证据返回和 GitHub issue 外置记忆规则；运行配置以对应 TOML 为准。 |
| [docs/agents/domain.md](agents/domain.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Engineering skills 的 single-context domain documentation 消费规则。 |
| [docs/agents/issue-tracker.md](agents/issue-tracker.md) | agent-config | Current | 2026-09-10 | 2026-10-31 | `cyy1998/shgas-iam` GitHub Issues 的 spec、ticket、跨会话状态与 wayfinding 约定；设计提交、分支交接和 Spec 关闭沿用工作流。 |
| [docs/agents/triage-labels.md](agents/triage-labels.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Engineering skills 使用的默认 triage 标签映射。 |
| [docs/agents/workflow.md](agents/workflow.md) | agent-config | Current | 2026-09-10 | 2026-10-31 | Matt skills 的仓库薄适配：首次落盘建分支并全程复用、Spec 发布前独立设计提交、批量实施与验证；人工授权且本地合入核对成功后关闭 Spec，再清理本地分支。 |
| [docs/architecture/architecture-guard.md](architecture/architecture-guard.md) | architecture | Current | 2026-09-15 | 2026-10-31 | 架构守卫规范的验证层选择、允许观察模型、永久规则准入、封闭目录与复杂度边界；覆盖说明链接验证归属。 |
| [docs/architecture/architecture-verification.md](architecture/architecture-verification.md) | architecture | Current | 2026-09-15 | 2026-10-31 | 系统约束的行为/资源/静态与人工证明边界；包含协议最终 56 故事、版本清理与协议签发组合、独立 Admin PG/Redis 及保留升级验收。 |
| [docs/architecture/backend-architecture.md](architecture/backend-architecture.md) | architecture | Current | 2026-09-15 | 2026-10-31 | 后端 ownership、UoW、Profile/Runtime 与分层验证；Admin 版本限定撤销及两协议操作快照已接入，保留跨表乐观及部署边界。 |
| [docs/architecture/contracts-and-database.md](architecture/contracts-and-database.md) | architecture | Current | 2026-09-16 | 2026-10-31 | #203 在线 managed 严格移除地址及当前库准备；#202 冻结离线 Client 中间契约；共享代码选址、纯规则与后端 DTO 分层、公开接口、建包条件、DTO 字段演进与渐进收敛；保留专用能力包、事务与 Drizzle 契约。 |
| [docs/architecture/frontend-architecture.md](architecture/frontend-architecture.md) | architecture | Current | 2026-09-15 | 2026-10-31 | Admin/SSO 通用 service、页面状态、路由/capability、登录守卫与渐进收敛规则；Admin 统一结果及已提交失败恢复已迁移，消费者协调切换另行核验；禁止纯展示测试，保留功能行为证明。 |
| [docs/architecture/repository-map.md](architecture/repository-map.md) | architecture | Current | 2026-09-15 | 2026-10-31 | monorepo apps/packages、共享 contracts/domain 职责、User Profile v3 read-model、root-owned E2E workspace、基础设施与生成目录边界。 |
| [docs/architecture/system-architecture.md](architecture/system-architecture.md) | architecture | Current | 2026-09-15 | 2026-10-31 | 运行时拓扑、信任边界与权威来源；两协议操作快照、精确失败、固定版本撤销及恢复责任，代码与部署证据分离。 |
| [docs/architecture/testing-architecture.md](architecture/testing-architecture.md) | architecture | Current | 2026-09-15 | 2026-10-31 | Unit/Integration/E2E canonical collections、资源预算与验证契约；含行为优先、场景隔离、受控异步、替身与类型证明原则，以及当前契约分类、删除证据、mapper owner、消费方能力及禁止纯展示测试规则；每票与最终聚合入口包含 Collection Guard。 |
| [docs/development/backend-implementation.md](development/backend-implementation.md) | development | Current | 2026-07-26 | 2026-10-31 | backend response envelope、OpenAPI status、logger、audit event 和 Architecture Guard 验证分层。 |
| [docs/development/coding-style.md](development/coding-style.md) | development | Current | 2026-08-07 | 2026-10-31 | TypeScript、formatter 边界、文件命名、React 命名和 import alias 风格约定。 |
| [docs/development/commands.md](development/commands.md) | development | Current | 2026-09-16 | 2026-10-31 | #203 当前 managed 配置准备与正式迁移；聚焦实现、canonical Unit/Integration commands、每票 verify:static 与完整 verify、显式资源 profiles、Architecture Guard、性能与 commit guard 的可执行入口；Employment 全库诊断统一为 employment:verify；Subject Access repair 包含 PostgreSQL intent 回收。 |
| [docs/features/admin/admin-mutation-contract.md](features/admin/admin-mutation-contract.md) | feature | Current | 2026-09-15 | 2026-10-31 | Admin 最终命令/协议/页面 census、42 条故事与实现/测试决策逐项核对、公共模块与锁序证据；实际候选验收由议题记录。 |
| [docs/features/admin/client-protocol-revocation.md](features/admin/client-protocol-revocation.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/admin/client-sso-configuration.md](features/admin/client-sso-configuration.md) | feature | Current | 2026-09-15 | 2026-10-31 | #180/#182 单协议配置、独立 Secret 轮换/审计重读、缓存认证和 PG/Redis/浏览器验证边界；#194 已接入正式默认图，环境未切换。 |
| [docs/features/admin/session-management.md](features/admin/session-management.md) | feature | Current | 2026-09-15 | 2026-10-31 | #191 两类记录、固定批次重试、账号/Client 终止、真实计数与 #121 责任；#194 已默认接线。 |
| [docs/features/audit/audit-logging.md](features/audit/audit-logging.md) | feature | Current | 2026-09-14 | 2026-09-30 | 统一审计日志、安全字段、#191 固定集合分类计数、历史 action 规范化与已完成 `login_log` 退役后的当前边界。 |
| [docs/features/oidc/authorization-candidate.md](features/oidc/authorization-candidate.md) | feature | Current | 2026-09-15 | 2026-10-31 | #187/#188/#189/#190 OIDC 授权/续接、Token/JWKS、当前 UserInfo、退出确认与取消修订、维护和 HTTP/Redis/浏览器候选；#194 已接入正式默认图，环境未切换。 |
| [docs/features/oidc/oidc-credential-authority-evidence.md](features/oidc/oidc-credential-authority-evidence.md) | feature | Historical | 2026-09-15 | n/a | 固定旧候选的契约/证据；当前统一会话接线与操作见 ADR-0035 和统一维护手册。 |
| [docs/features/oidc/oidc-integration.md](features/oidc/oidc-integration.md) | feature | Current | 2026-09-15 | 2026-09-30 | 内部 OIDC client 的端点、client 类型、scope/claim、CORS 和退出契约。 |
| [docs/features/oidc/oidc-operation-snapshots.md](features/oidc/oidc-operation-snapshots.md) | feature | Historical | 2026-09-15 | n/a | 固定旧候选的契约/证据；当前统一会话接线与操作见 ADR-0035 和统一维护手册。 |
| [docs/features/oidc/oidc-session-migration.md](features/oidc/oidc-session-migration.md) | feature | Current | 2026-09-10 | 2026-09-30 | 三类 SHA-256 单状态/反向 ID、HMAC 配置退役与维护边界；#170 统一全体下线，旧保留流程仅适用固定旧候选。 |
| [docs/features/oidc/online-auth-redis-time-contract.md](features/oidc/online-auth-redis-time-contract.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/oidc/protocol-conformance.md](features/oidc/protocol-conformance.md) | release-record | Historical | 2026-09-15 | n/a | #195 固定官方套件59项历史矩阵；2026-09-16默认Browser输出清理使本地原日志/截图丢失，原结论不重写，不代表官方认证或部署。 |
| [docs/features/organization-responsibility/hr-admin-management-design.md](features/organization-responsibility/hr-admin-management-design.md) | design | Current | 2026-09-07 | 2026-10-31 | 已实现：HR 双端 scoped 责任管理及直接命令统一结果、行锁与 no-op 意图审计；保留原 Full-system 验证及协调发布边界。 |
| [docs/features/sso/artifact-direct-state-evidence.md](features/sso/artifact-direct-state-evidence.md) | feature | Current | 2026-09-10 | 2026-10-31 | #173 Artifact 单状态、唯一消费、协议及定向维护与成本证据；切片历史成本与当前行为分别记录，环境未切换。 |
| [docs/features/sso/authentication-state-extraction.md](features/sso/authentication-state-extraction.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/sso/client-snapshot-contract.md](features/sso/client-snapshot-contract.md) | feature | Current | 2026-09-15 | 2026-10-31 | #181 统一普通/敏感 Snapshot 候选、Admin 提交传播与局部 socket 成本；#193 接入 Worker CLI，生产切换由 #194 交付。 |
| [docs/features/sso/credential-authority-contract.md](features/sso/credential-authority-contract.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/sso/credential-direct-state-evidence.md](features/sso/credential-direct-state-evidence.md) | feature | Current | 2026-09-10 | 2026-10-31 | #172 Credential 单状态、ID 撤销与补偿、pending 清理和双协议实际前后成本；切片历史成本与当前行为分别记录，环境未切换。 |
| [docs/features/sso/custom-authorization-candidate.md](features/sso/custom-authorization-candidate.md) | feature | Current | 2026-09-16 | 2026-10-31 | #203 最终严格配置；#202 托管按落地 origin 推导并固定首次事实、类型切换拒绝；#184 Custom 单回调授权、续接与 Code；#185/#186 兑换和托管消费已交付，#194 已默认接线。 |
| [docs/features/sso/custom-business-token-candidate.md](features/sso/custom-business-token-candidate.md) | feature | Current | 2026-09-14 | 2026-10-31 | #185 业务兑换门槛、请求内有界失败撤销、协议 Token 在线访问、维护与实际网络样本；候选未部署。 |
| [docs/features/sso/custom-managed-candidate.md](features/sso/custom-managed-candidate.md) | feature | Current | 2026-09-16 | 2026-10-31 | #202 原事实派生关系校验；#186 托管 callback、同 owner Token、ORCAS 交付、Cookie 与最小 Header；Q38 失败边界及真实 HTTP/Redis 替身证明，环境未切换。 |
| [docs/features/sso/custom-sso-credential-authority-evidence.md](features/sso/custom-sso-credential-authority-evidence.md) | feature | Current | 2026-09-10 | 2026-10-31 | #166 Custom SSO 凭据独立访问、根撤销漏项及受控晚到签发的 HTTP/Redis 证明；保存三路径前后实际命令、RTT 区间与串行波次，明确局部替身和未部署边界。 |
| [docs/features/sso/custom-sso-one-shot-grant-contract.md](features/sso/custom-sso-one-shot-grant-contract.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/sso/custom-sso-protocol-validation.md](features/sso/custom-sso-protocol-validation.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/sso/custom-sso-subject-projection-design.md](features/sso/custom-sso-subject-projection-design.md) | design | Historical | 2026-08-12 | n/a | 初代 Catalog V1 与 per-Client Catalog version 目标设计快照；相关决定已由 ADR-0016 取代，不代表当前实现。 |
| [docs/features/sso/dual-entry-acceptance.md](features/sso/dual-entry-acceptance.md) | feature | Current | 2026-09-16 | 2026-10-31 | #200 的 S1–S64 逐项账本、真实双hostname APISIX/browser、两issuer固定suite/RP和固定旧writer全owner演练；候选验收与人工发布分开。 |
| [docs/features/sso/dual-entry-login-design.md](features/sso/dual-entry-login-design.md) | design | Current | 2026-09-16 | 2026-10-31 | 已接受的双入口完整设计与测试边界；#198 导航已交付，#199 协议与配置已交付；#200 联合验收记录另列，升级清除全部 IAM 会话，环境未部署。 |
| [docs/features/sso/login-page-reentry-guard.md](features/sso/login-page-reentry-guard.md) | design | Current | 2026-08-14 | 2026-09-30 | 已接受的登录页重入守卫设计；定义协议所有权、页面状态、OIDC 重新认证边界、验收与协调切换。 |
| [docs/features/sso/managed-callback-origin-acceptance.md](features/sso/managed-callback-origin-acceptance.md) | feature | Current | 2026-09-16 | 2026-10-31 | Spec #201 的70故事逐项账本；区分切片、同代保留、b648 全清、最终候选和环境操作。 |
| [docs/features/sso/managed-callback-origin-upgrade-design.md](features/sso/managed-callback-origin-upgrade-design.md) | design | Current | 2026-09-16 | 2026-10-31 | ADR-0038 同代保留与 b648 直升设计；实施入口转到两条操作手册，真实 writer 的来源差异及最终验证见账本。 |
| [docs/features/sso/principal-direct-state-evidence.md](features/sso/principal-direct-state-evidence.md) | feature | Current | 2026-09-10 | 2026-10-31 | #171 Principal 单状态、ID 管理与生命周期证据、根入口实际前后成本；切片历史成本与当前行为分别记录，环境未切换。 |
| [docs/features/sso/protocol-validation-contract.md](features/sso/protocol-validation-contract.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/sso/public-thirdparty-unified-login.md](features/sso/public-thirdparty-unified-login.md) | feature | Current | 2026-09-07 | 2026-09-30 | 第三方统一登录入口、目标系统会话所有权与 Custom SSO 职责边界说明。 |
| [docs/features/sso/published-subject-facts-contract.md](features/sso/published-subject-facts-contract.md) | feature | Current | 2026-09-15 | 2026-10-31 | #156 已发布权限、Reader 与协议行为证据、旧断言迁移及环境证明边界。 |
| [docs/features/sso/root-authentication-candidate.md](features/sso/root-authentication-candidate.md) | feature | Current | 2026-09-14 | 2026-10-31 | #183 根认证、许可、本人安全及候选装配；#194 已接入正式默认图，环境未切换。 |
| [docs/features/sso/subject-access-operation-contract.md](features/sso/subject-access-operation-contract.md) | feature | Current | 2026-09-15 | 2026-10-31 | Spec #128 全部62故事、最终owner、直接行为证据与测试迁移；最终聚合验收由父规格记录。 |
| [docs/features/sso/third-party-sso-integration.md](features/sso/third-party-sso-integration.md) | feature | Current | 2026-09-16 | 2026-09-30 | Independent/Gateway 失败重新授权、既有 wire 和普通访问重试分离；定向维护已由 #160 交付，候选不可部署。 |
| [docs/features/sso/token-state-contract.md](features/sso/token-state-contract.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/sso/token-state-cost-evidence.md](features/sso/token-state-cost-evidence.md) | feature | Historical | 2026-09-15 | n/a | 固定旧候选的契约/证据；当前统一会话接线与操作见 ADR-0035 和统一维护手册。 |
| [docs/features/sso/token-state-runtime-evidence.md](features/sso/token-state-runtime-evidence.md) | feature | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/features/sso/unified-session-acceptance.md](features/sso/unified-session-acceptance.md) | feature | Current | 2026-09-15 | 2026-10-31 | #196 的144项契约/来源账本、联合行为及最终候选验证；维护者取消本次前后成本对比，人工发布未执行。 |
| [docs/features/sso/unified-session-kernel.md](features/sso/unified-session-kernel.md) | feature | Current | 2026-09-15 | 2026-10-31 | #179 独立新代 Kernel 公开操作、可信观察、原子关系、精确撤销与固定批次；#194 已迁移全部消费者并移除旧在线图，环境未切换。 |
| [docs/features/sso/unified-session-lifecycle-design.md](features/sso/unified-session-lifecycle-design.md) | design | Current | 2026-09-14 | 2026-10-31 | Q40 已整体确认 Q34–Q39 的模型、失败矩阵、配置联动及验收；托管失败策略不在本轮范围。交接记录见 #177，尚未实施或部署。 |
| [docs/features/user-profile-search/filter-dsl.md](features/user-profile-search/filter-dsl.md) | design | Current | 2026-08-25 | 2026-10-31 | 已激活的 User Profile Filter DSL v3 规则；Internal Filter DSL 固定返回 User Profile Base，旧责任限定 DSL 已撤销。 |
| [docs/releases/admin-mutation-contract-cutover.md](releases/admin-mutation-contract-cutover.md) | runbook | Current | 2026-09-08 | 2026-10-31 | Admin 后端/页面/REST legacy 与外部消费者核验、协调切换、已提交失败和回退清单；尚未执行环境部署，不要求生产数据迁移。 |
| [docs/releases/apisix-gateway-release.md](releases/apisix-gateway-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | APISIX manifest validate/diff/apply/prune、限流、观测和回滚手册。 |
| [docs/releases/audit-action-canonicalization.md](releases/audit-action-canonicalization.md) | runbook | Current | 2026-09-07 | 2026-10-31 | 历史 action 盘点、事务 apply、独立 verify、无别名候选部署与旧备份恢复门禁。 |
| [docs/releases/audit-login-log-retirement-release.md](releases/audit-login-log-retirement-release.md) | runbook | Historical | 2026-07-16 | n/a | 已完成的 `login_log` 一次性退役记录；其迁移实现已不在当前仓库，不可作为当前 runbook。 |
| [docs/releases/b648-client-database-upgrade.md](releases/b648-client-database-upgrade.md) | runbook | Current | 2026-09-16 | 2026-10-31 | #205：固定 b648 Client 数据库正式分阶段直升、独立核验收缩与最终无地址门禁；在线状态和上线另由 #206 验收。 |
| [docs/releases/b648-managed-callback-upgrade.md](releases/b648-managed-callback-upgrade.md) | runbook | Current | 2026-09-16 | 2026-10-31 | #206：精确旧 writer、数据库及 source/target/Snapshot 链、最新运行图、新 Secret、恢复与人工放流；环境未操作。 |
| [docs/releases/client-protocol-v2-artifact-cutover.md](releases/client-protocol-v2-artifact-cutover.md) | runbook | Current | 2026-09-08 | 2026-10-31 | 服务端 Catalog V2 硬切换的 owner checklist、无 Catalog target 的 epoch 不可逆边界与精确 artifact cleanup；OIDC 新写入保持 Redis 索引期限，不自动覆盖历史孤立对象。 |
| [docs/releases/client-runtime-snapshot-hard-cutover.md](releases/client-runtime-snapshot-hard-cutover.md) | runbook | Historical | 2026-09-07 | n/a | 首次旧代切换历史参考，旧 inventory 操作不适用于当前候选；日常恢复见 Current restore runbook。 |
| [docs/releases/client-runtime-snapshot-restore.md](releases/client-runtime-snapshot-restore.md) | runbook | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/releases/custom-sso-grant-maintenance.md](releases/custom-sso-grant-maintenance.md) | runbook | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/releases/custom-sso-one-shot-grant-upgrade.md](releases/custom-sso-one-shot-grant-upgrade.md) | runbook | Current | 2026-09-10 | 2026-10-31 | #161 固定旧候选保留会话升级；当前 #170 候选改走全体下线，旧 HMAC 要求仅属历史候选；环境未执行。 |
| [docs/releases/custom-sso-subject-projection-rehearsal-2026-08-02.md](releases/custom-sso-subject-projection-rehearsal-2026-08-02.md) | release-record | Historical | 2026-08-02 | n/a | Ticket 12 的临时近似规模手动联合演练简洁记录；不包含机器 receipt/manifest/transcript。 |
| [docs/releases/custom-sso-subject-projection-release.md](releases/custom-sso-subject-projection-release.md) | runbook | Historical | 2026-08-21 | n/a | 已由 strict V2 activation 取代；保留初代 Subject Projection 切换历史，不得执行其中已撤销命令。 |
| [docs/releases/managed-callback-origin-preserving-upgrade.md](releases/managed-callback-origin-preserving-upgrade.md) | runbook | Current | 2026-09-16 | 2026-10-31 | #204 固定迁移前 managed Client 范围，仅清 Code/续接并保留同 Client Token/索引/会话；正式 CLI、独立比较和旧 writer 演练，环境未迁移。 |
| [docs/releases/observability-system-logs.md](releases/observability-system-logs.md) | runbook | Current | 2026-09-15 | 2026-10-31 | Loki/Grafana/Alloy 系统日志观测运行手册；补充 APISIX trace、Alloy OTLP 和证据留存。 |
| [docs/releases/oidc-release-runbook.md](releases/oidc-release-runbook.md) | runbook | Current | 2026-09-16 | 2026-10-31 | OIDC 双 issuer 入口、共享 JWK 与固定旧无 issuer 工具的全体下线切换；当前 schema 严格读取，环境未发布。 |
| [docs/releases/online-auth-redis-time-cutover.md](releases/online-auth-redis-time-cutover.md) | runbook | Historical | 2026-09-15 | n/a | 旧候选契约与来源证据；当前由统一会话模型和维护手册替代。 |
| [docs/releases/organization-responsibility-v2-hard-cutover.md](releases/organization-responsibility-v2-hard-cutover.md) | runbook | Current | 2026-08-22 | 2026-10-31 | Organization Responsibility V2、User Profile v3 与 Client Protocol V2 的完整 freeze、双 data gate、epoch/cleanup、Full-system/release smoke、一次性放流与 forward-only 回滚边界。 |
| [docs/releases/protocol-validation-preserving-upgrade.md](releases/protocol-validation-preserving-upgrade.md) | runbook | Current | 2026-09-10 | 2026-10-31 | Spec #146 固定旧候选保留升级边界；当前 #170 候选全体下线，旧 HMAC 要求仅属历史候选；环境未执行。 |
| [docs/releases/published-subject-facts-upgrade.md](releases/published-subject-facts-upgrade.md) | runbook | Current | 2026-09-10 | 2026-10-31 | #156 固定旧候选保留会话/快照；包含 #163/#170 的当前候选全体下线，受控 smoke 与回退边界分开，目标环境未执行。 |
| [docs/releases/role-assignment-role-management-release.md](releases/role-assignment-role-management-release.md) | runbook | Current | 2026-09-09 | 2026-10-31 | 角色分配 resolver、admin `/roles`、OIDC/read-model 一致性验收和回滚手册。 |
| [docs/releases/session-kernel-release-smoke.md](releases/session-kernel-release-smoke.md) | release-record | Historical | 2026-07-03 | n/a | 2026-06-24 Session Kernel 发布 smoke 证据快照，并提供后续可复用 smoke 模板。 |
| [docs/releases/sm-encrypted-password-login-release.md](releases/sm-encrypted-password-login-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | SM2/SM4 加密密码登录、API/SSO 同步发布、Cap 重试、错误码和 rollback matrix。 |
| [docs/releases/subject-access-operation-cutover.md](releases/subject-access-operation-cutover.md) | runbook | Current | 2026-09-10 | 2026-10-31 | 操作许可统一切换：停流drain、当前owner清理/保留、独立verify、统一版本、重新登录及回退；目标环境未执行。 |
| [docs/releases/unified-session-maintenance.md](releases/unified-session-maintenance.md) | runbook | Current | 2026-09-16 | 2026-10-31 | #193 Worker source/unified owner 维护、新 Snapshot repair/verify、真实 CLI 故障与保留证据；#162 命令去向及 #121/#145 剩余责任，环境未执行。 |
| [docs/releases/user-profile-dirty-queue-release.md](releases/user-profile-dirty-queue-release.md) | runbook | Current | 2026-07-25 | 2026-10-31 | scope producer 停止、旧 job 五类排空、worker-last 发布门禁，以及现有 Bull Board/repair/backfill 操作语义。 |
| [docs/releases/user-profile-v3-hard-cutover.md](releases/user-profile-v3-hard-cutover.md) | runbook | Current | 2026-08-22 | 2026-10-31 | User Profile v2→v3 单代原地重建的 freeze、固定 candidate、backfill/收敛、双 gate、smoke、失败关闭与一次性放流手册；不推进 Client Protocol epoch 或清理 artifact。 |
| [docs/reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md](reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md) | review | Historical | 2026-07-03 | n/a | 2026-07-03 的软件工程原则审查快照；用于追溯风险，不替代当前代码检查。 |
| [docs/reviews/static-ui-test-cleanup-2026-09-15.md](reviews/static-ui-test-cleanup-2026-09-15.md) | review | Historical | 2026-09-15 | n/a | 固定基线的纯展示测试盘点及 Q1–Q3 清理边界；列出 5 条用例与混合断言，不表示已删除或已通过行为验证。 |

## 维护方式

新增、删除或移动 `docs/**/*.md` 时，同步更新本索引并运行：

```bash
pnpm check:docs
```

若某篇文档包含已知旧架构或旧技术引用，但仍需保留，请在索引中标为 `Historical` 或 `Stale`。
