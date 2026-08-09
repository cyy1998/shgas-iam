# 03 — 收窄 Custom SSO session Interface

**What to build:** 让 Custom SSO session Module 只向生产 consumer 暴露认证、Principal Session 创建、Grant/Code、
Gateway/Independent completion 与 logout 行为；内部 context 组装和 dead revoke alias 不再成为调用方或测试必须理解的
Interface。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Principal、Independent Credential 与 Gateway Local Session context resolver 继续作为 Module 私有 implementation helpers，但不再出现在 factory result。
- [x] 原先直接调用 context helper 的测试改从 `resolvePublicAuthentication` 或对应 final-operation consumer Interface 观察 Authenticated Subject Context。
- [x] Principal、Independent、Gateway、ORCAS、Cookie/header/query token source 和稳定错误映射的既有行为覆盖被保留。
- [x] 无调用方的 lazy user-session revoke alias 被删除，账号禁用/删除继续通过 Subject Access lifecycle 与 Session Kernel revocation path 生效。
- [x] production composition 和 consumer-owned ports 只依赖实际使用的方法，compile-time contracts 不再接受被删除的测试/内部能力。
- [x] 测试只断言认证结果、context、Grant/Credential/Local Session 与 logout 行为，不新增 private helper 或 internal call-count assertions。
- [x] 运行 API 直接相关 Unit/Component collections、lint/typecheck、Architecture Guard 与 `git diff --check`；文档变化通过 Docs Guard。
