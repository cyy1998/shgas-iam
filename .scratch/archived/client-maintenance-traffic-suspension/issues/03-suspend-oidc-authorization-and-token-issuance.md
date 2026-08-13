# 03 — OIDC 使用 Traffic Gate 暂停授权与 Token 签发

**What to build:** 让 OIDC authorize、interaction/resume 与 token exchange 使用可逆 Traffic Gate，使 Maintenance 返回标准暂态协议错误且不消费或删除仍可能恢复有效的协议对象，同时保持 public 与 confidential client 的行为一致。

**Blocked by:** 01 — 建立可逆 Client Traffic Gate 扩展路径

**Status:** resolved

- [x] OIDC runtime 明确区分配置有效性、永久 lifecycle/version failure 与暂态 Client Traffic Gate，不再把 Maintenance 折叠为 client 不存在或 permanently disabled。
- [x] authorize 与 interaction/resume 在明确 Maintenance 时返回适合 endpoint 的标准 `temporarily_unavailable`，不创建或删除 Authorization Code、Interaction、Grant 或 Provider Session。
- [x] token exchange 在消费 Authorization Code 或签发 Token 前应用 Traffic Gate；明确 Maintenance 时返回标准暂态错误，不消费 Code、不签发新的 Access Token/ID Token。
- [x] 状态无法确认时 fail closed 并返回通用暂态不可用，不映射为 `invalid_client`、`invalid_grant` 或其他永久错误。
- [x] Confidential client 的数据库 Secret 验证与 public client 的 runtime metadata 路径对 Maintenance 产生一致的暂态语义，不受旧 runtime cache 窗口影响。
- [x] Maintenance 不触发 OIDC config version mismatch、artifact 删除、Kernel tombstone 或 protocol revocation；真实配置、Secret 或协议启停变化仍保持永久换代语义。
- [x] Maintenance 不暂停或延长 Authorization Code、Interaction、Grant、Access Token 或 Session 的原始 TTL。
- [x] Component/Redis/Composition Integration 覆盖 authorize、resume、token、public/confidential client、恢复和真实协议变更后的永久失效。
- [x] 受影响 workspace 的聚焦 Integration、lint、typecheck、Architecture Guard、test collection guard 与 `git diff --check` 通过。
