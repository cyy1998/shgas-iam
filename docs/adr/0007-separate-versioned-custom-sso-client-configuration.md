---
status: accepted
---

# 将 Custom SSO Client 配置与其他协议配置分离

> Custom SSO 必须持有 Client Binding 的局部决定已由 [ADR-0010](0010-narrow-client-binding-to-oidc-lifecycle.md) 取代；本 ADR 的其余配置、版本屏障和迁移决定保持有效。

Custom SSO 使用独立的 `customSsoEnabled`、严格按 Gateway/Independent 区分的 `customSsoConfig`、Independent 专用 `customSsoSecretHash` 和单调递增的 `customSsoConfigVersion`；它不再读取通用 `extAttributes`、复用明文 `clientSecret` 或依赖 OIDC 配置。任何配置、启停或 Secret 变更都递增版本，Authorization Code、Client Binding 和 Credential 必须校验签发版本，使批量撤销失败时旧 artifact 仍然 fail closed。

配置必须显式声明版本化 Subject Claims 并包含 Subject Identifier；新 client 默认只获得该标识。配置不包含 `userExcluding` 或替代绕过名单。Redirect URI 保留显式受限的一级主机和 `/*` 路径通配，但 Authorization Grant 必须绑定通过模式校验后的实际 URI，callback/token 只能精确匹配该实际值；V1 `state` 可选。

Admin 管理前端使用统一 Client 编辑页承载基础信息、Custom SSO 与 OIDC 三个独立设置模块，但统一导航不合并协议配置。通用 Client create/update contract 不接受 Custom SSO managed fields；Custom SSO 配置、启停、删除与 Secret 轮换只通过专用 Admin operations 完成。OIDC 的管理 contract 与生命周期语义不因页面迁移而改变。

迁移采用维护窗口硬切换：上线前逐个确认启用 client 的 Claim 与配置、向 Independent client 分发新 Secret，预检不完整则取消发布；运行时不提供旧字段双读或默认宽权限 fallback，并清理全部旧 Custom SSO artifact。旧 artifact 的认证失效由当前运行时删除旧 owner 并 fail closed 保证，cleanup 只负责范围受控的 inventory hygiene，不是认证失效机制，也不要求启动历史版本证明 cleanup 前可认证。OIDC 配置与协议 artifact 不直接迁移或批量清理；其有效性只由当前 OIDC/Principal Session 绑定规则决定。
