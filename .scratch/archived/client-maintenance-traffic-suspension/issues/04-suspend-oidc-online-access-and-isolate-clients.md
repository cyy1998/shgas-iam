# 04 — OIDC 暂停既有在线访问并隔离 Client 生命周期

**What to build:** 让 OIDC UserInfo 与其他 IAM 控制的在线 bearer 使用在 Maintenance 中暂时不可用，但不破坏 Token、Binding、Credential 或共享 Provider Session，并确保一个 Client 的维护不会影响同一 Principal Session 下的其他 Client。

**Blocked by:** 03 — OIDC 使用 Traffic Gate 暂停授权与 Token 签发

**Status:** resolved

- [x] UserInfo 与适用的在线 bearer 入口在明确 Maintenance 时返回 HTTP `503` 暂态语义，不返回 `invalid_token`。
- [x] Maintenance 阻断不撤销或删除 Access Token、Kernel Credential、OIDC Client Binding、Claims Snapshot 或 Provider Session，并且不清除仍可能恢复有效的 Cookie。
- [x] Client 恢复为 `Enable` 后，仍未过期且 OIDC config version 未变化的既有在线访问继续有效。
- [x] 一个 Client 的 Maintenance 不删除包含其他 Client 的 Provider Session，也不阻断或永久失效其他 Client 的 authorize、token 或 UserInfo 流程。
- [x] discovery、JWKS、health 和不依赖目标 Client 使用权限的公共协议元数据在 Maintenance 中继续可用。
- [x] logout 与 revocation 在 Maintenance 中继续可用，并永久终止其目标访问；恢复正常后被退出或撤销的访问不会复活。
- [x] 已签发并离开 IAM 的 ID Token 继续遵守原始离线验证与过期语义，本票不宣称可由 Traffic Gate 追溯阻断。
- [x] Component Integration 使用多 Client Provider Session 覆盖隔离与非破坏性；Redis/Composition Integration 验证真实 adapter 恢复和永久 failure 分离。
- [x] 受影响 workspace 的聚焦 Integration、lint、typecheck、Architecture Guard、test collection guard 与 `git diff --check` 通过。
