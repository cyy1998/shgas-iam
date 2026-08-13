# 05 — 切换 Client 生命周期与管理操作到可逆 Maintenance

**What to build:** 正式把 Client Maintenance 从永久协议失效切换为可逆流量暂停，并允许管理员在 Maintenance 中完成 Custom SSO 与 OIDC 生命周期准备，同时保留 Disable、软删除和各协议真实 mutation 的永久失效边界。

**Blocked by:** 02 — Custom SSO 使用 Traffic Gate 暂停在线访问；04 — OIDC 暂停既有在线访问并隔离 Client 生命周期

**Status:** resolved

- [x] 实际进入或退出 Maintenance 不推进 Custom SSO 或 OIDC 配置版本，也不触发协议永久撤销。
- [x] 只有实际进入 `Disable` 才同时推进两个协议生命周期并触发全协议永久撤销；相同状态写入与离开 `Disable` 不重复推进版本。
- [x] 软删除继续推进两个协议生命周期并触发全协议永久撤销。
- [x] Maintenance 中发生的 Custom SSO/OIDC 配置、Secret 或协议启停 mutation 继续只推进所属协议版本并使旧产物永久失效。
- [x] Custom SSO 与 OIDC 在 Client 为 `Enable` 或 `Maintenance` 时可以执行 enable，在 `Disable` 时仍被拒绝。
- [x] Maintenance 不绕过 Custom SSO 启用态只读规则；修改配置、模式切换、Secret 轮换和删除仍要求显式禁用 Custom SSO。
- [x] Client 从 Maintenance 恢复 `Enable` 时直接激活已保存的协议启用意图，不要求重新启用协议，也不执行外部 endpoint 连通性探测。
- [x] Admin UI 在 Maintenance 中允许 Custom SSO/OIDC enable 操作，并继续分别展示 Client 全局状态和协议三态；不新增第四种状态或额外维护提示文案。
- [x] 状态转换矩阵的外部行为测试覆盖 Enable、Maintenance、Disable、软删除、幂等写入与协议 mutation 的版本/撤销边界。
- [x] 本票完成后不再依赖旧的“Maintenance 推进 epoch 或永久 revoke”兜底；所有 client-scoped 在线流量由已落地 Traffic Gate fail closed。
- [x] 受影响后端与前端 workspace 的聚焦 Integration/Browser tests、lint、typecheck、Architecture Guard、test collection guard 与 `git diff --check` 通过。
