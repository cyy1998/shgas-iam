# Custom SSO / OIDC Interface 收缩开发记录

## 当前状态

Spec 已发布，正式需求见 [spec.md](spec.md)。稳定领域语言见 [CONTEXT.md](../../CONTEXT.md)，长期决策见
[ADR-0008](../../docs/adr/0008-adopt-client-subject-projection.md) 与
[ADR-0010](../../docs/adr/0010-narrow-client-binding-to-oidc-lifecycle.md)。当前分支为
`codex/simplify-custom-sso-oidc-interfaces`。Ticket 01–06 均已完成实现、聚焦验证与 Standards/Spec 双轴评审，feature
implementation 已完成但尚未本地合入。部署环境 Redis inventory/cleanup、merge、push、deployment 与 tracker archive 均未授权。
下一安全动作是由维护者按仓库 workflow 决定是否授权一次性本地收尾。

## 验收与验证计划

业务测试以 Custom SSO authentication/final-operation Interface 和 OIDC interaction/authorization lifecycle Interface 为最高
seam；provider-session Redis state 与 legacy cleanup 是两个必要的窄 contract seam。每张后续 ticket 运行直接相关的
Unit/Integration collection、受影响 workspace 的 lint/typecheck 和 `git diff --check`；Current 文档改动运行
`pnpm check:docs`。准备本地合入时才在最终实现内容上运行一次完整 `pnpm verify`。真实环境的旧实例 drain、Redis
inventory/cleanup、client owner smoke 和 rollback rehearsal 由 Release Operations 单独授权与验收。

## 事件

- 2026-08-09 — Decision：完整退役 legacy Global Session resolver、旧 account lookup 与 shared legacy envelope/version；接受 internal shared-contract breaking cleanup，不保留兼容 alias。
- 2026-08-09 — Decision：OIDC resolved/binding view 删除未读 external token、数据库 `userId` 与重复 session identifier；staged binding payload 同步删除仅传递的 `userId`。
- 2026-08-09 — Decision：staged payload 变化通过统一切换或停止新授权后等待最长 60 秒 TTL 处理，不实现永久双读。
- 2026-08-09 — Decision：Custom SSO context resolver 留在 Module implementation 内部，测试通过 `resolvePublicAuthentication` 等 production Interface；删除 dead revoke alias。
- 2026-08-09 — Decision：OIDC adapter 不再暴露 test-only `bind`，测试使用 `stage → consumeStaged` test-local seed；claims adapter 删除 dead binding wrapper。
- 2026-08-09 — Decision：删除旧 user/client/global-session token-index runtime 能力和 worker dependency，保留单 token provider-payload 删除与完整 legacy cleanup 运维链路。
- 2026-08-09 — Decision：仓内 runtime cleanup 不代表生产 Redis 已清理；旧实例 drain、inventory、maintenance cleanup、回滚与 smoke 仍是发布前置条件。
- 2026-08-09 — Decision：顶层 OIDC composition 返回 Interface 收缩为 `{ server, logger, shutdown }`，完整 object graph 留在 implementation 内部。
- 2026-08-09 — Decision：不新增领域术语或 ADR；实现仅同步受影响的 Current 架构文档。
- 2026-08-09 — Validation：维护者已确认 Custom SSO 与 OIDC 的最高层测试 seam，以及 provider-session Redis state/legacy cleanup 的必要窄 contract seam。
- 2026-08-09 — Authorization：维护者仅授权 `/to-spec`；spec 发布不构成 `/to-tickets`、`/implement`、cleanup、merge、push 或 deployment 授权。
- 2026-08-09 — Authorization：维护者确认 6-ticket 拆分与 blocking edges，并授权 `/to-tickets` 发布；未授权 implementation 或任何环境操作。
- 2026-08-09 — Publication：发布 6 张 `ready-for-agent` tickets；当前依赖前沿为 01、03、05，02 受 01 阻塞，04 受 02 阻塞，06 受 05 阻塞。
- 2026-08-09 — Authorization：维护者授权单独实施 Ticket 01；未授权其他 ticket、真实 Redis 操作、merge、push 或 deployment。
- 2026-08-09 — Implementation：Ticket 01 删除无生产消费者的 legacy Global Session resolver/private types、shared envelope/version、数据库 ID account lookup 与测试 doubles；保留当前 Cookie、Principal Session、Subject Identifier 与 reauthentication 路径。
- 2026-08-09 — Validation：OIDC Provider Unit 43、Component Integration 74、Process Integration 5 和 contracts Unit 31 全部通过；两 workspace 的 lint/typecheck、Architecture Guard、Docs Guard、legacy import 搜索与 `git diff --check` 通过。环境未提供专用 OIDC PostgreSQL/Redis URL，因此未运行 composition/Redis profiles。
- 2026-08-09 — Review：固定点 `c929171e` 到候选实现的 Standards 与 Spec 双轴评审均为 0 findings；Ticket 01 标记为 `resolved`，Ticket 02 解阻。
- 2026-08-09 — Authorization：维护者授权单独实施 Ticket 02；未授权其他 ticket、真实 Redis 操作、merge、push 或 deployment。
- 2026-08-09 — Implementation：Ticket 02 从 resolved session、Provider Session binding 与 staged binding wire 删除未读 bearer、数据库 `userId` 和重复 session identifier；保留 Principal Session、anchor、generation、mapping owner、CAS 与 Claims Snapshot 生命周期，并补充 staged payload 的 60 秒 rollout 约束。
- 2026-08-09 — Validation：OIDC Provider Unit 43、Component Integration 76、lint/typecheck、Architecture Guard、Docs Guard、legacy reference 搜索与 `git diff --check` 通过。环境未提供专用 `IAM_OIDC_PROVIDER_TEST_REDIS_URL`，因此 Redis profile 未运行；新 wire 与旧 payload extra-field 兼容 contract 已落入该 profile。
- 2026-08-09 — Review：固定点 `d10ff1fa` 到候选实现的 Standards 与 Spec 双轴评审均为 0 findings；Ticket 02 标记为 `resolved`，Ticket 04 解阻。
- 2026-08-09 — Authorization：维护者授权单独实施 Ticket 03；未授权其他 ticket、真实 Redis 操作、merge、push 或 deployment。
- 2026-08-09 — Implementation：Custom SSO session adapter factory 只保留七个生产 consumer 操作；Principal、Independent Credential 与 Gateway Local Session context resolver 留在 Module 内部，dead lazy user-session revoke alias 已删除，component 测试统一从 `resolvePublicAuthentication` 或 final-operation seam 观察行为。
- 2026-08-09 — Validation：API Unit 58、Component Integration 338、lint/typecheck、Architecture Guard、factory surface type contract 与 `git diff --check` 通过；本 ticket 未修改 Current 文档或连接任何真实 Redis。
- 2026-08-09 — Review：固定点 `1952859f` 到候选实现的 Standards 与 Spec 初审 findings 均已修复，完整范围复审均为 0 findings；Ticket 03 标记为 `resolved`。
- 2026-08-09 — Authorization：维护者授权单独实施 Ticket 04；未授权其他 ticket、真实 Redis 操作、merge、push 或 deployment。
- 2026-08-09 — Implementation：OIDC Session adapter 删除 test-only direct `bind`，Claims adapter 删除无调用的 `readBinding` wrapper；binding tests 改用 test-local `stage → consumeStaged` helper，并清理残留 direct-bind test doubles。
- 2026-08-09 — Validation：OIDC Provider Unit 43、Component Integration 76、lint/typecheck、Architecture Guard、public surface type contract 与 `git diff --check` 通过。环境未提供专用 `IAM_OIDC_PROVIDER_TEST_REDIS_URL`，因此 Redis profile 未运行；本 ticket 未修改 Current 文档或连接任何真实 Redis。
- 2026-08-09 — Review：固定点 `e9ac2dc3` 到候选实现 `9c124e4e` 的 Standards 与 Spec 双轴评审均为 0 findings；Ticket 04 标记为 `resolved`，当前依赖前沿为 Ticket 05。
- 2026-08-09 — Authorization：维护者授权单独实施 Ticket 05；未授权 Ticket 06、真实 Redis 操作、merge、push、deployment 或 tracker archive。
- 2026-08-09 — Implementation：删除 API Core legacy OIDC user/client/global-session token-index key builders、metadata、注册与按 index revoke runtime；OIDC token store 收缩为单 token provider-payload cleanup，client invalidation worker 只协调 Session Kernel 与 provider protocol-object owner；真实 Redis contract 测试覆盖 normal Access Token 不创建旧 index、destroy/grant/client cleanup 与 Pub/Sub，Current 架构和发布文档同步区分 runtime authority 与 cleanup-only old keys。
- 2026-08-09 — Validation：OIDC Provider Unit 43、Component Integration 76，API Core Unit 57、Component Integration 188、Process Integration 10 全部通过；两个 workspace 的 lint/typecheck、Architecture Guard、Docs Guard、Collection Guard、retired symbol 搜索与 `git diff --check` 通过。环境未提供 `IAM_OIDC_PROVIDER_TEST_REDIS_URL` 或 `IAM_API_CORE_TEST_REDIS_URL`，因此 Redis profile 未运行；未连接、inventory 或修改任何真实 Redis。
- 2026-08-09 — Authorization：维护者授权启动临时容器执行真实 Redis 测试；授权不包含连接部署环境 Redis、执行 inventory/cleanup、Ticket 06、merge、push、deployment 或 tracker archive。
- 2026-08-09 — Diagnosis：OIDC Redis profile 发现 invalidation subscriber 在 `lazyConnect` duplicate client 上直接 `SUBSCRIBE` 会产生未处理拒绝；实验性 candidate repair 曾使 profile 达到 11/11，但双轴复审确认本轮测试授权不包含 production repair，且首次连接失败后的 error/retry lifecycle 仍需单独设计与测试，因此 candidate 已由 `b2e540c2` 完整撤回。
- 2026-08-09 — Validation：三个 loopback-only Redis 8.8.0 临时容器分别承载 OIDC、API Core 与 destructive-cleanup profile；当前代码的 OIDC Provider Redis Integration 为 10/11，唯一失败是上述 lazy subscriber 启动缺陷。API Core Redis Integration 30/31，cleanup ACL guard 通过；唯一失败由 Docker Desktop Redis 时钟比 Bun/宿主时钟慢约 2.35 秒导致 100ms `PXAT` fixture 在固定等待 1.5 秒后仍有效，探针确认返回 `active_identity_conflict`，延长等待至 4 秒后相同 credential identity 可重新签发，不属于 Ticket 05 runtime 退役回归。
- 2026-08-09 — Review：固定点 `b02fd97d` 到候选实现 `6e592bb4` 的 Standards 与 Spec 初审 findings 已通过两个 focused fix commits 修复；完整范围第三轮复审均为 0 findings。Ticket 05 标记为 `resolved`，Ticket 06 解阻但尚未授权。
- 2026-08-09 — Authorization：维护者随后明确授权修复真实 Redis profile 暴露的 invalidation subscriber 缺陷；授权仍不包含 Ticket 06、部署环境 Redis、merge、push、deployment 或 tracker archive。
- 2026-08-09 — Repair：client invalidation subscriber 在任何连接动作前安装结构化 `error` handler；lazy duplicate 显式连接，并在每次 `ready` 后确保订阅。连接暂不可用时 Provider 继续提供 discovery，Redis 恢复或 subscriber 重连后会重新订阅，不再产生未处理拒绝或静默永久失订。
- 2026-08-09 — Validation：OIDC Provider Redis Integration 12/12（含 initial connection failure observability 与 disconnect/reconnect re-subscription）、Process Integration 5、Unit 43、Component Integration 76 全部通过；API Core Unit 57、两个 workspace 的 lint/typecheck、Architecture Guard、Docs Guard、Collection Guard 与 `git diff --check` 通过。API Core Redis profile 保留上述 30/31 环境时钟偏差证据，cleanup ACL guard 通过。
- 2026-08-09 — Review：固定点 `b2e540c2` 到 repair `fc20e809` 的 Standards 与 Spec 双轴复审均为 0 findings；上一轮 subscription lifecycle 与授权 findings 已清零。
- 2026-08-09 — Cleanup：三个 `--rm` 临时 Redis 容器已停止并移除，exact-name Docker inventory 为空；未连接或修改任何部署环境 Redis。
- 2026-08-09 — Authorization：维护者授权单独实施 Ticket 06；未授权真实 Redis/PostgreSQL 操作、merge、push、deployment 或 tracker archive。
- 2026-08-09 — Implementation：顶层 OIDC composition result 收缩为 `{ server, logger, shutdown }`；application entry 只消费该 Interface，Node HTTP server error 与 process signal 统一转交 production shutdown，repositories、stores、session、security、provider runtime、interactions 与 workers 保持 composition-local。
- 2026-08-09 — Validation：OIDC Provider Unit 43、Component Integration 81、Process Integration 5 全部通过；workspace lint/typecheck、Architecture Guard、Docs Guard、Test Collection Guard 与 `git diff --check` 通过。当前环境未提供专用 `IAM_OIDC_PROVIDER_TEST_DATABASE_URL` 和 `IAM_OIDC_PROVIDER_TEST_REDIS_URL`，因此未运行 Composition profile，也未连接或修改任何外部 PostgreSQL/Redis。
- 2026-08-09 — Review：固定点 `f8dae826` 到候选 `9b2f81a4` 的 Standards/Spec findings 已通过两个 focused fix commits 修复；第三轮完整范围复审均为 0 findings，Ticket 06 标记为 `resolved`，feature implementation 完成。
- 2026-08-09 — Authorization：维护者授权为 Ticket 06 启动临时本机 PostgreSQL/Redis 并执行真实 Composition profile；授权不包含连接部署环境、legacy inventory/cleanup、merge、push、deployment 或 tracker archive。
- 2026-08-09 — Validation：使用 loopback-only PostgreSQL 18.4 与 Redis 8.8.0 临时容器，应用当前 Drizzle migrations 后，OIDC Provider Composition Integration 1/1 通过；测试经过 production entry/composition，并使用专用 `IAM_OIDC_PROVIDER_TEST_DATABASE_URL` 与 `IAM_OIDC_PROVIDER_TEST_REDIS_URL`。
- 2026-08-09 — Cleanup：exact-name 临时容器 `iam-ticket06-pg` 与 `iam-ticket06-redis` 已停止并通过 `--rm` 移除，最终 inventory 为空；未连接或修改现有 `shgas-iam-*` 或任何部署环境 PostgreSQL/Redis。
