---
status: accepted
---

# 将 Client Maintenance 建模为可逆的协议流量暂停

> Client Traffic Gate 的缓存一致性边界及运行时传播失败语义已由 ADR-0022 局部修订；本 ADR 的 Maintenance 生命周期、协议 artifact 与成功传播后的门禁语义继续有效。

Client Maintenance 应只暂停 IAM 控制的 client-scoped 在线协议流量，并允许管理员在维护期间完成 Custom SSO 与 OIDC 的全部配置和生命周期准备；协议启用表达启用意图，实际可用还要求 Client 全局状态为正常。Maintenance 不得充当配置冻结或永久撤销：进入和退出 Maintenance 不推进协议配置版本，不使未变更的既有访问永久失效，也不暂停其原始 TTL；恢复正常后，仍未过期且未因真实协议变更失效的访问继续有效。

## 生命周期边界

- Maintenance 中允许配置、启用、禁用、删除和 Secret 轮换，但不绕过协议自身的状态转换规则；Custom SSO 修改已启用配置时仍必须显式执行“禁用、修改、按需重新启用”。
- Client Disablement 仍是全协议永久失效事件：只在进入 Disable 或软删除时推进两个协议生命周期并撤销旧访问；离开 Disable 不重复推进版本。Disable 中不允许把原本停用的协议新设为启用。
- Maintenance 中发生配置、协议启停或 Secret 变化时，只由所属协议推进自己的版本并永久使旧产物失效。
- Maintenance 期间仍允许 logout 和由 Admin 生命周期 mutation 触发的协议 revocation，并且由此终止的访问不会在恢复后复活；当前 OIDC 不启用公开 Token Revocation endpoint。

## 在线门禁与错误语义

实现必须以可逆、fail-closed 的 Client Traffic Gate 区分暂时维护与永久无效。只有明确确认 Client 正常时才允许 client-scoped 在线流量；明确维护时，Custom SSO 返回 HTTP `503`、`AUTH.MAINTENANCE` 和可选 `Retry-After`，OIDC 按 endpoint 返回标准 `temporarily_unavailable` 或 HTTP `503`。状态缺失、损坏、切换中或无法读取时返回通用可重试不可用，不得伪装成明确维护，也不得回退放行。暂态阻断不得消费 Authorization Grant/Code、删除协议产物、撤销仍可能恢复的访问或清除 Cookie。

门禁覆盖 authorize、interaction/resume、token exchange、UserInfo、Custom SSO callback 及受保护 user-info/authz 等 client-scoped 在线流程；不覆盖 discovery、JWKS、公共认证配置、health、logout 和 revocation。Maintenance 不提供按用户、IP、Header 或管理员令牌的流量绕过，真实登录 smoke 在恢复正常后执行。

## 有意接受的限制

- 已经离开 IAM、由 client 离线验证的 OIDC ID Token 无法被 Maintenance 临时阻止。
- Maintenance 不冻结 Authorization Grant、Authorization Code、Credential、Token 或 Session 的过期时间。
- 状态切换不等待或排空已经开始的请求，也不新增最终写入 CAS；已经越过当前门禁检查点的在途请求可以按既有协调方式完成。
- 管理端继续分别展示全局 Client 状态和协议状态，不增加第四种协议状态或额外维护提示文案。

本 ADR 已由 Admin 状态切换、Custom SSO/OIDC Owner Integration、真实 Redis/Composition 与 Full-system E2E 验收，代表当前运行时的可逆 Client Traffic Gate 行为。
