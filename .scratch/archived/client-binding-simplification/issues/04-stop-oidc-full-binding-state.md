# 04 — 停止 OIDC 维护重复 binding 状态

**What to build:** 停止在 OIDC 运行时写入、刷新和删除重复的 full `ProviderSessionBinding` Redis value，只维护 lookup、Principal anchor、generation membership 与 mapping owner，同时保持完整的授权、并发和清理行为。

**Blocked by:** 03 — OIDC 改用 lookup → Kernel 权威读取.

**Status:** resolved

- [x] Provider Session binding 的 publish、confirm、refresh、owned delete 和 destroy 不再创建、读取、续期或删除 full Redis value。
- [x] provider-facing `ProviderSessionBinding` view 仍可由 lookup、Kernel OIDC Client Binding 和 Principal Session 重建；删除的是重复持久化表示，不是 OIDC Client Binding 概念。
- [x] lookup、Principal anchor 和 generation membership 在 publication 与 refresh 中继续获得一致且受约束的 TTL。
- [x] mapping owner、anchor generation 和 expected lookup 的 CAS 仍能阻止旧请求覆盖新 Principal Session 或新 client mapping。
- [x] publication 已提交但响应丢失时仍可安全确认 ownership，不会错误撤销已发布 binding，也不会留下未拥有的 Kernel binding。
- [x] 删除一个 client mapping 不影响同一 Provider Session 的其他 client；最后一个 generation member 移除后才清理对应 anchor。
- [x] Authorization Code、Claims Snapshot、Access Token Credential、UserInfo、ID Token 与 client/configuration-version fail-closed 行为保持不变。
- [x] 窄 Redis 状态契约明确断言 full value 不再存在，并覆盖 publication、confirmation、TTL refresh、owner comparison、generation cleanup 和 destroy fence。
- [x] OIDC 高层 authorization lifecycle 测试不依赖 Redis 内部 key shape，并在新表示下继续通过。
- [x] 变更不增加数据库 schema、对外协议兼容层或发布后旧状态迁移代码；旧 live session state 由既定发布运维流程统一失效。
