# 02 — Custom SSO 使用 Traffic Gate 暂停在线访问

**What to build:** 让 Custom SSO 的 client-scoped 在线入口使用可逆 Traffic Gate，使 Maintenance 成为 `503 + AUTH.MAINTENANCE` 的暂态阻断，同时保留 Authorization Grant、Credential、Local Session 与 Cookie，以便 Client 恢复正常后仍可在原 TTL 和版本约束内继续。

**Blocked by:** 01 — 建立可逆 Client Traffic Gate 扩展路径

**Status:** resolved

- [x] Custom SSO authorize 在明确 Maintenance 时返回 HTTP `503`、`AUTH.MAINTENANCE` 和契约允许的 `Retry-After`，不创建新的可用 Authorization Grant。
- [x] Independent token exchange 在明确 Maintenance 时返回同一暂态错误，并且不消费 Authorization Grant、不签发可用 Credential、不返回主体投影。
- [x] Gateway callback 在明确 Maintenance 时返回同一暂态错误，并且不消费 Authorization Grant、不建立可用 Gateway Local Session。
- [x] 受保护 user-info 与 authz 在明确 Maintenance 时返回暂态错误，不撤销 Credential/Local Session，也不清除仍可能恢复有效的 Cookie。
- [x] 状态无法确认时返回通用 retryable unavailable，不映射为 `AUTH.MAINTENANCE`、`SSO.INVALID_CLIENT` 或 `SESSION_INVALID`。
- [x] `AUTH.MAINTENANCE` 复用现有稳定错误码并采用 `503` 暂态语义，不新增重复错误码；禁用、删除、协议禁用和版本失配仍保持永久无效语义。
- [x] Custom SSO 公共认证配置和 logout 不受使用门禁阻断；维护期间的 logout 继续永久终止对应访问。
- [x] Maintenance 不暂停或延长 Authorization Grant、Credential、Local Session 的原始 TTL。
- [x] Component/Redis/Composition Integration 从协议可观察行为验证暂态阻断、非破坏性、恢复与真实协议变更后的永久失效，不断言内部私有实现。
- [x] 受影响 workspace 的聚焦 Integration、lint、typecheck、OpenAPI 契约、Architecture Guard、test collection guard 与 `git diff --check` 通过。
