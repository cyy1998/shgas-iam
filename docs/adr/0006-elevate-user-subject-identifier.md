---
status: accepted
---

# 将用户 Subject Identifier 提升为协议中性身份事实

现有 `user.oidc_subject` 的 UUID 原值保持不变，但字段命名与所有权提升到 IAM 身份域，作为协议中性的 Subject Identifier；OIDC 与 Custom SSO 各自把它映射到自己的公开契约，不相互依赖。相比为 Custom SSO 新建另一套标识，这一选择保持现有 OIDC `sub` 稳定，并避免同一用户的多个 opaque 标识发生漂移。

Session Kernel 的用户 Principal Reference 同样使用 Subject Identifier，不再保存或要求调用方解析数据库用户主键，也不携带显示名称或档案快照。通用 Principal Session 删除独立的 Principal Snapshot，不保留兼容空壳；OIDC Claims Snapshot 等协议快照继续由协议模块自行拥有。数据库主键只属于持久化实现；OIDC 与 Custom SSO 的适配器分别通过 Subject Identifier 解析主体，不引入双字段兼容契约。创建 Principal Session 的 Interface 只接收 Subject Identifier 与认证上下文，不得再通过 `UserDetailDto` 等档案对象传递主体引用。
