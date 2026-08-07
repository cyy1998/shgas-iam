---
status: accepted
---

# 将 Client Binding 收窄为 OIDC 生命周期

Client Binding 只表示 OIDC Provider Session 内一个 client 与已验证 Principal Session 之间可独立失效的生命周期，不再作为 Custom SSO artifact 层级；Custom SSO Authorization Grant 直接签发 client-scoped Credential。为在 Redis 写入已提交但结果未知时仍能精确补偿，Credential identity 必须在写入前确定，失败路径按该 identity 确认或撤销，不接受仅等待 TTL，也不把 Grant 消费与 Credential 签发耦合成跨模块大事务。OIDC 保留权威 Kernel Client Binding、最小 lookup、Principal anchor 与 generation membership，删除不参与授权、CAS 或 ownership 判定的 `ProviderSessionBinding` full Redis 派生副本，并从 lookup 经 Kernel 重建 provider-facing view。本决策只取代 ADR-0007 中 Custom SSO 必须持有 Client Binding 的要求；Grant 与 Credential 继续记录并校验 Custom SSO 配置版本，ADR-0007 的其余决定保持有效。

## Consequences

Admin 撤销响应继续保留 `revoked.bindings` 字段，审计与结构化日志也保留对应计数；该计数只表示实际撤销的 OIDC Client Binding。Custom SSO 撤销只计入 Credential，不创建或上报虚拟 binding 以维持旧数字。

本变更通过维护窗口硬切换：冻结全部 IAM 认证与会话流量，部署新版本后清空全部 IAM live authentication/session state，确认无旧会话残留再恢复流量，不在运行时同时支持新旧 artifact 形状。清理范围包括 Principal Session、Custom SSO Grant/Credential/旧 Client Binding，以及 OIDC Provider Session、OIDC Client Binding、Protocol Artifact、Credential 和 token/session 状态；所有用户在发布后必须重新登录。用户、client 配置、Secret、Subject Facts 与其他持久业务数据不在清理范围，也不得把该操作实现为不受边界约束的 Redis 数据库清空。

每个 Custom SSO Grant redemption attempt 最多拥有一个 Credential，并以 reservation `attemptId` 作为写入前已知的 Credential identity；结果不确定时按该 identity 精确撤销。Grant 释放后的下一次兑换使用新的 attempt 与 identity；Session Kernel 必须拒绝 identity 冲突和 tombstone 重用，不能覆盖既有 Credential。
