# Client Binding 收窄开发记录

## 当前状态

Spec 已发布，正式需求见 [spec.md](spec.md)。稳定领域语言见 [CONTEXT.md](../../CONTEXT.md)，长期决策见 [ADR-0010](../../docs/adr/0010-narrow-client-binding-to-oidc-lifecycle.md)。当前分支为 `codex/client-binding-design`；4 张 implementation tickets 均已完成并通过 Standards/Spec 双轴评审，Client Binding 收窄的功能分支实现已完成。尚未获得全仓 `pnpm verify`、tracker 归档、会话清理、本地 squash merge、push 或部署授权；下一安全动作是由维护者决定是否进入既定本地收尾事务。

## 验收与验证计划

测试以 Custom SSO 最终操作 Interface 和 OIDC authorization lifecycle Interface 为两个最高层业务 seam，并以 Session Kernel Redis、OIDC provider-session state Redis 和 Admin 撤销响应作为必要的窄契约 seam。每张 ticket 运行直接相关的 Unit/Integration collection、受影响 workspace 的 lint/typecheck 和 `git diff --check`；文档改动运行 `pnpm check:docs`。准备本地合入时才在最终实现内容上运行一次完整 `pnpm verify`。发布后的全量会话失效与真实环境 smoke 由 Release Operations 负责，不属于 implementation tickets。

## 事件

- 2026-08-07 — Decision：Client Binding 收窄为 OIDC Client Binding；Custom SSO 改为 credential-only lifecycle。
- 2026-08-07 — Decision：Custom SSO Grant redemption attempt 以 reservation `attemptId` 拥有写入前已知的 Credential identity；不确定写入必须精确撤销，不能只等待 TTL。
- 2026-08-07 — Decision：OIDC 保留 Kernel binding、lookup、Principal anchor、generation membership 与 mapping owner，删除 full Redis 派生副本。
- 2026-08-07 — Decision：Admin、审计和日志保留 binding 计数，但只统计实际 OIDC Client Binding；Custom SSO 不产生虚拟计数。
- 2026-08-07 — Decision：采用维护窗口硬切换，不保留运行时双模型；部署后清空全部 IAM live authentication/session state，强制所有用户重新登录，但保留用户、client 配置与其他持久业务数据。
- 2026-08-07 — Reopen：原“保留 Principal Session 与 OIDC 状态”的选择已被维护者撤回，spec 与 ADR-0010 改为全量会话重置。
- 2026-08-07 — Decision：全量会话重置是发布运维步骤，本 feature 不开发 reset command、Redis cleanup library 或 deployment automation。
- 2026-08-07 — Validation：已确认两个最高层业务 seam 与三个必要窄契约 seam；spec 发布前的领域文档通过 `pnpm check:docs` 与 `git diff --check`。
- 2026-08-07 — Authorization：维护者仅授权 `/to-spec`；spec 发布不构成 `/to-tickets`、`/implement`、cleanup、merge、push 或 deployment 授权。
- 2026-08-07 — Authorization：维护者确认 4-ticket 拆分并授权 `/to-tickets` 发布；未授权实现或任何环境操作。
- 2026-08-07 — Publication：发布 4 张 `ready-for-agent` tickets；当前前沿为 `01` 与 `03`。
- 2026-08-07 — Authorization：维护者授权 `/implement` 执行 Ticket 01；未扩大到 Ticket 02、OIDC 改动、发布清理、合并、push 或 deployment。
- 2026-08-07 — Validation：Ticket 01 通过 API Core Unit、Component 与真实 Redis collections、API Core lint/typecheck、API/Admin API/OIDC Provider typecheck、Architecture Guard、Docs Guard 与 whitespace 检查；真实 Redis contract 覆盖原子 identity/lookup 冲突、tombstone、自然过期和 commit-then-error 精确补偿。
- 2026-08-07 — Review：以 `5bf10803ccf1784a0895ec6c01843ab3cf91f379` 为 fixed point 的 Standards 与 Spec 双轴复审均为 0 finding。
- 2026-08-07 — Resolution：Ticket 01 已标记 `resolved`；Ticket 02 解阻，当前依赖前沿为 02 与 03。
- 2026-08-07 — Authorization：维护者授权 `/implement` 执行 Ticket 02；未扩大到 Ticket 03、OIDC 改动、发布清理、合并、push 或 deployment。
- 2026-08-07 — Implementation：Independent Grant redemption 与 Gateway login completion 改为使用 reservation `attemptId` 直接签发 Credential；Custom SSO 生产路径不再创建、解析或撤销 Client Binding，旧 binding-backed Credential 统一 fail closed 并撤销。
- 2026-08-07 — Validation：Ticket 02 通过 API、Admin API 与 API Core Unit/Component collections、三包 lint/typecheck、Architecture Guard、Docs Guard 与 whitespace 检查；覆盖精确补偿、response loss、identity 冲突、direct renewal、protocol/client/user cascade、Admin/audit/log 真实计数与外部协议不变。API composition external lane 因未配置专用 `IAM_API_TEST_DATABASE_URL` 在资源前置检查退出，未发生代码断言失败。
- 2026-08-07 — Review：以 `8475531c32285531b3b83fcf2100161817d4deb7` 为 fixed point 的 Standards 与 Spec 双轴复审最终均为 0 finding；中间发现的补偿链重复、签发状态 primitive obsession、response-loss 测试重复及 direct renewal/protocol invalidation 证据缺口均已修复并复审。
- 2026-08-07 — Resolution：Ticket 02 已标记 `resolved`；当前依赖前沿仅剩 03，Ticket 04 继续受 03 阻塞。
- 2026-08-07 — Authorization：维护者授权 `/implement` 执行 Ticket 03；未扩大到 Ticket 04、发布清理、合并、push 或 deployment。
- 2026-08-07 — Implementation：OIDC 普通 binding read 与 silent ensure 统一通过 lookup 解析权威 Kernel OIDC Client Binding 与 Principal Session，并校验 protocol、mapping owner 与当前 anchor generation；consumer-owned provider-session state port 不再暴露 full-value read，业务测试也不再构造 full Redis value。
- 2026-08-07 — Validation：Ticket 03 通过 OIDC Provider Unit 43 项、Component 74 项、lint/typecheck、Architecture Guard、Docs Guard 与 whitespace 检查；happy-path tracer 证明 lookup → Kernel 重建只执行一次既有 account read。Redis contract lane 因未配置专用 `IAM_OIDC_PROVIDER_TEST_REDIS_URL` 在资源前置检查退出，未发生代码断言失败。
- 2026-08-07 — Review：以 `95bdaf65ba168db9802745ffa44c9d1e2e49d3b8` 为 fixed point 的 Standards 与 Spec 双轴评审均为 0 finding。
- 2026-08-07 — Resolution：Ticket 03 已标记 `resolved`；Ticket 04 解阻并成为唯一依赖前沿。
- 2026-08-07 — Authorization：维护者授权 `/implement` 执行 Ticket 04；未扩大到发布清理、归档、合并、push 或 deployment。
- 2026-08-07 — Implementation：OIDC Provider Session state publication、refresh 与 owned delete 的原子集合收窄为 lookup、Principal anchor 和 generation membership；删除 full `ProviderSessionBinding` key、死读 API 与 component fake 派生副本，同时保留 provider-facing 权威重建、mapping-owner CAS、response-loss confirmation 和 cleanup fence。
- 2026-08-07 — Validation：Ticket 04 通过 OIDC Provider Unit 43 项、Component 74 项、lint/typecheck、Architecture Guard、Docs Guard 与 whitespace 检查；窄 Redis contract 增加 full key 缺席、TTL refresh、owner comparison、generation cleanup、destroy fence 与 response-loss 覆盖。真实 Redis lane 因未配置专用 `IAM_OIDC_PROVIDER_TEST_REDIS_URL` 在资源前置检查退出，未发生代码断言失败。
- 2026-08-07 — Review：以 `ebc524baf285123d16c777f50df6d31f5571da3a` 为 fixed point 的首轮评审发现 refresh key count 参数错位与 destroy-fence full-key 缺席证据缺口；修复后 Standards 与 Spec 完整范围复审均为 0 finding。
- 2026-08-07 — Resolution：Ticket 04 已标记 `resolved`；全部 implementation tickets 完成，功能分支等待维护者决定是否进入本地收尾事务。
