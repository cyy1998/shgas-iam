# Client Maintenance 可逆协议流量暂停开发记录

## 当前状态

- 功能规格已发布，正式来源为 [spec.md](spec.md)。
- 稳定领域语言已写入仓库根 `CONTEXT.md`。
- 长期设计记录为 ADR-0012《将 Client Maintenance 建模为可逆的协议流量暂停》，当前状态为 `accepted`。
- Ticket 01 至 Ticket 06 均已 `resolved`；跨系统验收与当前文档同步完成。
- 功能分支为 `codex/client-maintenance-traffic-suspension`；Ticket 01 review fixed point 为基线提交 `8d44845e`，实现与评审修复均保留为独立提交。
- 当前授权已完成至 Ticket 06；尚未授权准备本地合入、归档或合并。

## 验收与验证计划

- 最高层验收 seam：真实 Admin Client 状态更新入口驱动 `Enable → Maintenance → Enable`，从公开 Custom SSO 与 OIDC 端点观察暂态阻断、恢复、永久失效与不受门禁影响的端点。
- Owner Integration：Admin 状态矩阵与 required publish；Traffic Gate Redis generation/fence；Custom SSO 暂态错误与非破坏性；OIDC artifact/session 非破坏性和多 Client 隔离；真实 composition 下 public/confidential client 一致性。
- Full-system E2E：扩展现有 Admin Custom SSO 与 OIDC journeys，不使用 route mock、直接数据库写入或 Maintenance bypass。
- Ticket 聚焦验证按受影响 workspace 运行相关 collection、lint、typecheck 与永久 Guards；准备本地合入时在最终内容上运行一次 `pnpm verify`，资源型 Integration 和 E2E 使用专用可销毁环境。

## 事件

- 2026-08-13 Decision：确认 Maintenance 是可逆的 client-scoped 在线协议流量暂停；允许 Custom SSO/OIDC 生命周期准备，不推进协议版本，不永久撤销未变更访问。
- 2026-08-13 Decision：确认只有进入 Disable 或软删除是全协议永久失效事件；离开 Disable 不重复推进版本。
- 2026-08-13 Decision：确认 fail-closed Traffic Gate、Custom SSO `503 + AUTH.MAINTENANCE`、OIDC `temporarily_unavailable`/`503`，且暂态阻断不破坏 artifact 或 Cookie。
- 2026-08-13 Decision：确认不暂停 TTL、不提供维护绕过、不新增 UI 状态或提示、不阻断离线 ID Token、不排空在途请求。
- 2026-08-13 Validation：用户确认以真实 Admin 状态更新加公开 Custom SSO/OIDC 端点作为最高层测试 seam。
- 2026-08-13 Authorization：维护者确认六票拆分与 blocking edges；`/to-tickets` 只授权发布 tracker，尚未授权实现。
- 2026-08-13 Authorization：维护者授权创建基线提交并实施 Ticket 01；基线提交为 `8d44845e`，Ticket 01 已认领。
- 2026-08-13 Validation：Ticket 01 的 api-core/Admin API Unit、Component Integration、专用临时 Redis Integration、lint、typecheck、Architecture Guard、docs index、test collection guard 与 `git diff --check` 通过；临时 Redis 资源均已清理。
- 2026-08-13 Review：Standards 首轮发现 pre-commit 例外文档与重复 fence 状态机，Spec 首轮发现 generation mismatch 自等待；共享 generation-fenced coordinator、架构边界与真实 Redis 回归测试修复后，两轴完整复审均为零 findings。
- 2026-08-13 Authorization：维护者授权实施 Ticket 02；review fixed point 固定为 `50b678a9`，按已确认的真实 Admin 状态更新与公开 Custom SSO 端点 seam 执行 TDD。
- 2026-08-13 Validation：Ticket 02 的 API/API Core/Admin API Unit、Component、专用临时 Redis、真实 PostgreSQL/Redis Composition、lint、typecheck、OpenAPI、Architecture Guard、docs index、env name、test collection 与 `git diff --check` 均通过；所有临时容器已清理。
- 2026-08-13 Review：Ticket 02 首轮 Standards 发现删除记录 identity 校验顺序、consumer-owned port 反向依赖和恢复测试假阳性；修复并补充真实 Redis 回源验证后，完整范围 `50b678a9..2c8af12e` 的 Standards 与 Spec 复审均为零 findings。
- 2026-08-13 Delivery：Ticket 02 实现提交为 `e27bc5be`，评审修复提交为 `2c8af12e`；Custom SSO Maintenance 已成为不撤销协议资产、不清 Cookie、TTL 照常流逝且恢复后可继续使用的在线流量暂停。下一安全动作是经维护者授权后认领 Ticket 03。
- 2026-08-13 Authorization：维护者授权实施 Ticket 03；review fixed point 固定为 `90aa9838`，范围严格限定为 OIDC authorize、interaction/resume 与 token，UserInfo/在线 bearer 和 Admin lifecycle 分别保留给 Ticket 04/05。
- 2026-08-13 Validation：Ticket 03 的 OIDC Provider/API Core Unit、Component、专用临时 Redis、真实 PostgreSQL/Redis Composition、lint、typecheck、Architecture Guard、docs index、env name、test collection 与 `git diff --check` 均通过；OIDC 共 44 Unit、91 Component、14 Redis、1 Composition，所有临时容器已清理。
- 2026-08-13 Review：Ticket 03 首轮评审发现 authorize 在 policy 前仍可能保存 Grant、malformed token 错误被暂态化、Redis fixture 私有 key/TTL 归属与清理失败路径等问题；修复并把协议 TTL/版本换代证据迁入真实 Redis owner profile 后，完整范围 `90aa9838..f2cea0ce` 的 Standards 与 Spec 复审均为零 findings。
- 2026-08-13 Delivery：Ticket 03 实现与评审提交为 `e0f74c67`、`1659192e`、`2a076093`、`09bae70f`、`f2cea0ce`；Maintenance 现在会在 OIDC Grant/Interaction/Code/Token 的不可逆动作前返回标准 `temporarily_unavailable`，不消费或延长既有对象，恢复后未过期且版本未变化的流程可继续，真实协议版本变化仍永久淘汰旧对象。下一安全动作是经维护者授权后认领 Ticket 04。
- 2026-08-13 Authorization：维护者授权实施 Ticket 04；review fixed point 固定为 `507c93e6`，范围严格限定为 OIDC UserInfo/在线 bearer、共享 Provider Session 的 client 隔离，以及 discovery/JWKS/health/logout/既有撤销边界，不提前切换 Admin lifecycle。
- 2026-08-13 Validation：Ticket 04 的 OIDC Provider Unit、Component、Process、专用临时 Redis、真实 PostgreSQL/Redis Composition、lint、typecheck、Architecture Guard、docs index、env name、test collection 与 `git diff --check` 通过；最终候选为 44 Unit、98 Component、5 Process、定向 Traffic Gate Redis 与 1 Composition，所有临时容器已清理。完整 Redis profile 在最终复跑时保留了一次未改动 invalidation subscriber cleanup 的 stream race 失败；本票直接相关 Redis 文件与 Composition 随后在同一资源上通过，未用无解释重跑覆盖该失败。
- 2026-08-13 Review：Ticket 04 首轮 Standards 提出 outcome 分支、纯转发 helper 和重复测试 controller 三项可维护性 finding；集中 production outcome 分类并抽取 component test controller 后，完整范围 `507c93e6..f8f7d735` 的 Standards 与 Spec 复审均为零 findings。
- 2026-08-13 Delivery：Ticket 04 实现与评审修复提交为 `3eff4a48`、`f8f7d735`；OIDC UserInfo 在 Maintenance/状态不确定时返回不清 Cookie 的 HTTP `503 temporarily_unavailable`，恢复后未过期且版本未变化的 Access Token 继续有效，一个 Client 的维护不影响共享 Provider Session 中其他 Client，公开元数据与 health 保持可用，logout 在维护中继续永久终止访问。下一安全动作是经维护者授权后认领 Ticket 05。
- 2026-08-13 Authorization：维护者授权实施 Ticket 05；review fixed point 固定为 `3fe5d602`，范围限定为 Admin Client 生命周期、Custom SSO/OIDC 管理操作与对应 Admin UI，不提前执行跨系统验收或接受 ADR。
- 2026-08-13 Validation：Ticket 05 的 Admin API 28 Unit、281 Component、1 Process、9 专用临时 Redis Integration，以及 Admin 17 Unit、35 Component、31 Browser tests 全部通过；两个 workspace 的 lint/typecheck、全仓强制 typecheck 与 Unit、Architecture Guard、docs index、test collection guard 和 `git diff --check` 均通过，专用临时 Redis 容器已清理。本票按工作流未运行仅属于最终本地合入阶段的 `pnpm verify`。
- 2026-08-13 Review：Ticket 05 首轮 Standards 发现进入 Disable 与前端 enable policy 的重复表达，Spec 发现 OIDC enable 与状态切换的并发窗口、状态矩阵证据及 Maintenance 确认文案问题；抽取共享 policy、对 OIDC enable 加 Client row lock、补齐矩阵测试并修正文案后，完整范围 `3fe5d602..60493b2e` 的 Standards 与 Spec 复审均为零 findings。
- 2026-08-13 Delivery：Ticket 05 实现提交为 `2b35a9a1`，评审修复提交为 `60493b2e`；Maintenance 进入/退出与幂等状态写入不再推进协议版本或永久撤销，只有实际进入 Disable 与软删除维持全协议永久失效，Maintenance 中可安全保存 Custom SSO/OIDC 启用意图及执行原有协议 mutation，Admin UI 保持全局状态与协议三态分离。下一安全动作是经维护者授权后认领 Ticket 06。
- 2026-08-13 Authorization：维护者授权实施 Ticket 06；review fixed point 固定为 `4c9531b1`，最高验收 seam 为真实 Admin 状态 mutation 与公开 Custom SSO/OIDC 端点。
- 2026-08-13 Validation：Ticket 06 的 E2E workspace 60 Unit、OIDC Provider 44 Unit/98 Component/5 Process、Admin API 28 Unit/281 Component/1 Process、API 347 Component、Admin 17 Unit/35 Component/31 Browser，以及相关 lint/typecheck、docs/architecture/test-collection/env Guards 与 `git diff --check` 通过。专用资源上 Admin API Redis 9/9、API Traffic Gate Redis 2/2、API Composition 1/1、OIDC Redis 14/14、OIDC Composition 1/1 通过；根 `pnpm test:e2e` 在同一 exact-project 中完成 Admin → OIDC 并清理。API Redis 全 profile 首轮发生 Traffic Gate 5 秒测试 timeout，随后进程因失败路径连接未关闭而需精确终止；全新 Redis 上直接相关文件 2/2 通过。OIDC Redis 首轮业务断言完成后发生 subscriber teardown check-then-act race，修复测试收尾后完整 14/14 通过。所有本票临时 PostgreSQL/Redis 与 E2E exact-project 资源均已清理。
- 2026-08-13 Review：Ticket 06 首轮 Spec 发现 tracker/验收证据未持久化、OIDC 公开 revocation 边界含混及 Custom SSO 接入文档缺口；补齐维护中真实 lifecycle revocation E2E 与当前文档后，第二轮 Standards 发现 tracker handoff 时序和跨 journey helper 重复；恢复 claimed、抽取类型化共享 helper 后，完整范围 `4c9531b1..8aa4261d` 的 Standards 与 Spec 第三轮复审均为零 findings。
- 2026-08-13 Validation：本票按仓库阶段边界未运行仅属于准备本地合入的 `pnpm verify`；该命令仍须在最终本地合入候选内容上执行，不把本票局部验证冒充为 merge/release gate。
- 2026-08-13 Delivery：Ticket 06 实现与评审修复提交为 `3a4a164c`、`99fb689e`、`8aa4261d`；真实 Admin 状态 mutation 已从公开 Custom SSO/OIDC 端点证明可逆 Maintenance、生命周期准备、恢复与永久终止边界，OIDC 同源 health 已公开，ADR-0012 现为 `accepted`。功能票已全部完成；下一安全动作是经维护者单独授权后准备本地合入或归档。
