# 06 — 完成跨系统验收并接受维护态决策

**What to build:** 通过真实 Admin Client 状态更新入口和公开 Custom SSO/OIDC 协议端点完成可逆 Maintenance 的跨系统验收，更新当前功能文档，并在所有行为与故障边界具备可执行证据后接受 ADR-0012。

**Blocked by:** 05 — 切换 Client 生命周期与管理操作到可逆 Maintenance

**Status:** resolved

- [x] Full-system E2E 从真实 Admin UI/API 驱动 `Enable → Maintenance → Enable`，不使用 route mock、直接数据库写入或 Maintenance bypass。
- [x] E2E 证明 Maintenance 中可以完成 Custom SSO 与 OIDC 生命周期准备，协议启用意图被保留，恢复 `Enable` 后自动生效。
- [x] E2E 证明 Custom SSO client-scoped 在线端点返回 `503 + AUTH.MAINTENANCE`，OIDC 在线端点返回标准暂态错误，恢复后未过期且未变更的访问继续有效。
- [x] E2E/Integration 证明 Maintenance 不延长 TTL，真实协议 mutation 仍永久失效旧产物，进入 Disable 与软删除仍造成全协议永久失效。
- [x] E2E 证明 discovery、JWKS、公共认证配置、health、logout/revocation 的既定 Maintenance 边界。
- [x] 验收不要求排空在途请求、阻断离线 ID Token、提供维护绕过或增加 UI 派生状态/提示。
- [x] 当前 Custom SSO、OIDC、Client 生命周期与运维文档更新为已实现行为，且不把历史或冻结 OpenSpec 产物当作当前事实来源。
- [x] ADR-0012 仅在实现、Owner Integration、真实资源 Composition Integration 与 Full-system E2E 全部通过后从 `proposed` 更新为 `accepted`，文档索引同步为 Current。
- [x] `pnpm check:docs`、相关永久 Guards、受影响 workspace lint/typecheck/tests、资源型 Integration、Full-system E2E 与 `git diff --check` 通过；准备本地合入时按仓库流程在最终内容上运行一次 `pnpm verify`。
