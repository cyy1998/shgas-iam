# 04 — 收窄 OIDC binding 与 claims Interface

**What to build:** 让 OIDC session 与 claims Module 只暴露真实 production flow 使用的 binding/Claims Snapshot 能力，
测试通过 staged binding 生命周期准备状态，不再为了 seed 或内部读取扩大 production Interface。

**Blocked by:** 02 — 最小化 OIDC session view 与 staged payload

**Status:** resolved

- [x] OIDC session factory result 不再暴露 test-only direct `bind`，production staged publication、consume、silent ensure、anchor 与 mapping-owner flow 保持不变。
- [x] 需要 committed binding 的测试使用 test-local `stage → consumeStaged` seed helper，helper 不成为 production export 或新 port。
- [x] binding publication、response-loss confirmation、anchor rotation、rebind、client isolation、Subject Access 与 disabled/error paths 继续通过 observable tests。
- [x] claims factory result 删除无调用的 binding read wrapper，Claims Snapshot validation 继续使用 consumer-owned Provider Session binding read port。
- [x] Authorization Code、Claims Snapshot、Access Token 与 UserInfo 的 ownership/configuration validation 保持不变。
- [x] production interaction、storage、claims、middleware 与 invalidation ports 均不要求被删除的方法，typecheck 证明无残留调用方。
- [x] 运行 OIDC Provider 直接相关 Unit/Component/Redis collections、lint/typecheck、Architecture Guard 与 `git diff --check`；文档变化通过 Docs Guard。
