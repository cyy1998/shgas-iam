# 01 — Session Kernel 支持预知 Credential identity

**What to build:** 让协议适配器能够在 Redis 写入前确定 Credential identity，并在写入结果不确定时精确确认或撤销该 Credential；现有自动生成 identity 的调用方式保持可用，避免在下游迁移前破坏 OIDC 或其他调用方。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Credential 签发接口接受调用方提供的合法 identity，同时保留现有自动生成 identity 的兼容路径。
- [x] 创建 Credential 时对 active object、tombstone 和 ownership 冲突执行原子 fail-closed 检查，绝不覆盖已有 Credential。
- [x] 调用方提供的 identity 与返回的 bearer token 保持不同职责；外部 token contract 不因本次扩展而变化。
- [x] 使用调用方 identity 创建的 Credential 具有与现有 Credential 相同的 Principal、client、protocol、expiry、renewal、Subject Access 和索引语义。
- [x] 按已知 identity 撤销一个不存在的 Credential 是幂等的安全结果，且不会影响其他 lifecycle object。
- [x] 真实 Redis 契约测试覆盖事务已经提交但适配器返回异常的场景，并证明 committed Credential 可被精确发现或撤销且不留下 active orphan。
- [x] 契约测试覆盖 active identity collision、tombstone reuse、索引一致性、Principal cascade、client/protocol invalidation、续期与自然过期。
- [x] 现有未提供 identity 的 Credential 签发路径及其直接契约测试继续通过。
