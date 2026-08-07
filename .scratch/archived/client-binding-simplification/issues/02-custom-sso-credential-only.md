# 02 — Custom SSO 改为 credential-only 生命周期

**What to build:** 让 Independent Client Credential 与 Gateway Local Session 都由 Custom SSO Authorization Grant 直接签发，不再创建、解析或依赖 Client Binding，同时保持现有登录、授权和对外协议行为。

**Blocked by:** 01 — Session Kernel 支持预知 Credential identity.

**Status:** resolved

- [x] 每个已 reservation 的 Grant attempt 使用其 `attemptId` 作为写入前已知的 Credential identity，并且一次 attempt 最多拥有一个 Credential。
- [x] Independent token exchange 与 Gateway callback/login completion 都直接创建 Credential，不再创建 Custom SSO Client Binding。
- [x] Custom SSO Credential 自身完整承载并校验 Principal、Principal Session、Subject Access transition、client、mode、configuration version、expiry 和 renewal policy。
- [x] Credential 解析不再要求 `bindingId`，也不再读取或交叉校验 Custom SSO binding metadata；Gateway-only ORCAS context 仍只存在于 Gateway 路径。
- [x] Credential 写入异常、Grant lease 丢失、consume 冲突或后置校验失败时，先按 attempt identity 精确撤销，再安全释放 Grant；重试使用新的 attempt identity。
- [x] Active identity 冲突、tombstone 重用、client/mode/configuration mismatch、Subject Access 拒绝和 Principal Session 失效都保持 fail closed。
- [x] Principal renewal、logout、用户禁用或删除、client 禁用或删除、配置版本变化和 protocol invalidation 能直接续期或撤销 Credential，无需 binding cascade。
- [x] Independent 的 `sid`/`ttl`/`subject`、Gateway redirect/Cookie/local-session contract、错误分类和 Client Subject Projection 行为保持不变。
- [x] Admin 撤销响应继续包含 `revoked.bindings`，Custom SSO 只增加 Credential 计数；审计和结构化日志使用相同语义，不产生虚拟 binding 计数。
- [x] Custom SSO 生产路径不再调用 Client Binding 创建、解析或撤销能力，旧 binding-backed Credential 不作为运行时兼容形状继续接受。
- [x] 最高层测试通过 Independent 与 Gateway 最终操作 Interface 验证行为，并移除仅断言重复 Redis object shape 的旧测试依赖。
