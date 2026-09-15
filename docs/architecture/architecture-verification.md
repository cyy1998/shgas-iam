# 架构验证归属

本文把[系统架构](system-architecture.md)中的关键约束连接到验证 owner、现有入口和证明范围。
它是代表性证据索引，不是逐文件强制测试矩阵、完整覆盖率报告或本次测试通过记录。
测试层级、资源预算与执行时机由[测试编排架构](testing-architecture.md)拥有，静态规则准入由
[架构守卫规范](architecture-guard.md)拥有，命令参数与资源 URL 见[命令入口](../development/commands.md)。

## 谁负责什么

| 责任 | Owner 与完成条件 |
|---|---|
| 定义和维护不变量 | 能力所属 app/package 的实现者维护公开接口契约，并为本次行为变化选择直接观察该事实的测试。跨 runtime 变化同时检查各消费方的契约。 |
| 核对证据是否适用 | 评审者确认测试触及本次变化、使用了正确的真实或替代资源，且结论没有超出断言范围。存在测试文件不等于已经执行，也不等于覆盖全部场景。 |
| 候选交付验证 | 合入或发布负责人按测试编排契约执行最终候选检查，记录候选、命令、结果和未执行项；有 issue 时记录在对应 issue，否则在交付摘要中说明。 |
| 真实环境与放流 | 发布负责人取得目标环境配置、readiness、smoke 和适用 runbook 要求的停流、drain、恢复证据。测试命令不代替这些操作，也不提供部署授权。 |

这里的 owner 是维护职责，不表示每个 app 必须有独立团队，也不建立新的审批或 tracker 流程。

## 静态、类型与收集验证

| 要证明的事实 | 入口与 owner | 范围限制 |
|---|---|---|
| 稳定依赖方向、owner 路径与 Docker build closure | 根 `pnpm check:architecture`；[analyzer](../../scripts/architecture-guard.ts) 与[公开接口 fixtures](../../scripts/__tests__/architecture-guard.test.ts)。 | 仅检查允许观察模型和受保护 source roots，不能证明业务授权、事务原子性或 runtime wiring。 |
| Package 公开出口与结构兼容 | 所属 package exports、消费方 `typecheck`，例如 [Admin ports type contract](../../apps/admin-api/src/__tests__/port-contracts.test.ts)。 | Type-only 兼容不证明浏览器运行时可加载，也不证明 DTO 字段裁剪；对应边界见[共享契约](contracts-and-database.md#现存差距与验证)。 |
| 每个测试候选唯一收集且 root task 可达 | 根 `pnpm check:test-collection`；[collection 入口](../../scripts/check-test-collection.ts)。 | 不读取断言、不推断资源使用；已纳入静态与完整验证入口，成功只证明收集正确，不证明测试断言通过。 |
| 文档登记、状态日期与本地目标存在 | 根 `pnpm check:docs`；[文档检查实现](../../scripts/check-docs-index.ts)。 | 当前检查 `docs/**/*.md`，不验证语义一致性、根 AGENTS.md 链接或 Markdown 锚点；这些变更须另行核对。 |

Architecture Guard 当前 production source roots 为三个后端 app（API、Admin API、Worker）及
Session Kernel、Custom SSO、OIDC、Client Subject Projection、Organization Responsibility Resolution、Role Assignment Resolution、User Profile Read Model 七个包。
Admin/SSO 前端、`api-core`、`domain`、`contracts`、`db`、`jobs`、Gateway 等源码内部不在该扫描范围；被某条规则识别为
依赖目标不等于其内部也被扫描。Docker closure 另按 workspace manifests 与 Dockerfile `COPY` 检查。
改变该覆盖范围时同步维护本说明，不扩张扫描器去推断业务语义。

## 行为、资源与系统验证

| 能力 | 当前最高相关入口 | 证明范围与限制 |
|---|---|---|
| 两类会话 | [Kernel Redis](../../packages/session-kernel/test-integration/redis/unified-session-lifecycle.integration.test.ts) | 并发 open、根/应用关系期限、损坏/观察身份、精确撤销、索引及旧实例替换保护；不证明协议交付。 |
| Subject Access | [Core Redis](../../packages/api-core/test-integration/redis/subject-access-operation-kernel.integration.test.ts) | 操作固定、重启用后旧代拒绝、prepared 原上下文、损坏上下文失败、迟到撤销保留新代；数据库原子性由 Admin PG 另证。 |
| Snapshot | [Core Snapshot Redis](../../packages/api-core/test-integration/redis/client-snapshot.integration.test.ts) | 统一普通/敏感 acquisition、缓存损坏、晚到回填、required invalidation、失败和 repair；专用 DB0 清空库存与 scan-only verify。 |
| Client 管理与传播 | [Admin composition](../../apps/admin-api/test-integration/composition/client-sso-snapshot.integration.test.ts)、[PG](../../apps/admin-api/test-integration/postgres/client-sso-management.integration.test.ts) | 单协议状态、竞争/锁、审计回滚、no-op、COMMIT 不确定和实际传播；Secret 与 Internal credential 隔离。 |
| 管理会话与账号 | [Root security](../../apps/admin-api/test-integration/composition/root-security.integration.test.ts) | 根与应用关系固定目标、失败/未知/重试、新实例保护；Admin user PG/HR scope 保持独立验证。 |
| 完整认证和协议 | [API HTTP Redis](../../apps/api/test-integration/redis/root-authentication.integration.test.ts) | 默认操作 factory 下 Custom/OIDC、认证、回调、一次消费、替换与失败作用、ORCAS 替身、当前披露、取消/确认退出；第三方真实作用仍由接入方证明。 |
| OIDC 模块 | [OIDC Redis](../../packages/oidc/test-integration/redis) 与 API HTTP | 协议 Code/Token/索引/续接/退出确认/密钥；正式进程/env/JWK/故障由 API process/composition 补足。 |
| 进程生命周期 | [API process](../../apps/api/test-integration/process/entry.integration.test.ts)、[composition](../../apps/api/test-integration/composition/entry.integration.test.ts) | 默认接线、issuer/path、真实 PG/Redis、健康与关闭；不能据启动成功替代协议行为。 |
| 最终 DB 收缩 | [DB gate](../../packages/db/test-integration/postgres/client-sso-contraction.integration.test.ts)、[Worker CLI](../../apps/worker/test-integration/postgres/client-sso-contraction-command.integration.test.ts) | 拒绝未迁移旧记录、真实旧 CLI apply/verify 后允许 DDL、安全投影、非目标业务保留及最终 schema 拒绝旧升级命令。 |
| 离线维护 | [Worker Redis CLI](../../apps/worker/test-integration/redis/online-state-command.integration.test.ts) | 新进程 inventory/apply/verify、全部来源模型/索引、特殊 Client、非目标、ACL、部分失败重跑；历史真实 Provider writer 证据在统一维护手册固定 SHA。 |
| 代表系统旅程 | 根 `pnpm test:e2e`：[Admin](../../e2e/system/admin-custom-sso.spec.ts)、[HR](../../e2e/system/hr-admin-user-management.spec.ts)、[OIDC](../../e2e/system/oidc-pkce.spec.ts) | 同一临时 PG/Redis/APISIX 与全部正式 runtime；不证明真实外部集成或目标环境切换。 |

旧 Kernel 四对象、Provider、配置版本和旧 Snapshot/Gate 测试随被替代模型删除；其仍成立的行为分别由上表
会话/协议/配置/账号/维护最高入口承接。历史 schema/旧 writer 证明不能冒称在最终候选重跑。

## 聚合 Gate 与人工证据

每票交接执行 `pnpm verify:static`、完整受影响 typecheck 和行为通道，固定最终候选记录实际结果。
`pnpm verify` 最终聚合由 #196 执行；#195 官方固定 OIDC 套件独立，当前组合/E2E 不能替代其验收。
发布负责人仍须按[统一维护](../releases/unified-session-maintenance.md)、[Gateway](../releases/apisix-gateway-release.md)、
[OIDC 发布](../releases/oidc-release-runbook.md)、[观测](../releases/observability-system-logs.md)核验停流、drain、数据、
新登录、真实代理信任和放流。代码接线及临时测试均不表示已执行目标环境切换。

## 变更时如何维护

新增或改变跨 runtime 能力时，实现者先指认现有权威契约和 owner，明确观察时点、失败路径与恢复责任，再选择最高相关
公开接口的行为验证及必要资源通道。若现有测试没有观察新不变量，应补验证或明确未证明项，不能以相邻绿色测试代替。
只有 owner、公开 seam、验证层或关键证明范围变化时才更新本索引；普通内部测试增删不需要扩展成逐文件清单。
