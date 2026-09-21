---
status: accepted
---

# 以固定双 issuer 表达 OIDC 入口信任

OIDC 按配置声明内部与外部 issuer，由可信 Gateway 入口信息选择，不能从任意 Host 推导身份。
两入口共享 Client、Secret、签名密钥和稳定 Subject Identifier，但不同 issuer 的 `(iss, sub)` 仍是不同身份；
配置为同一 origin 时收敛为同一 issuer，不制造虚假的双身份。

## 理由与代价

网络可达性与协议身份不能靠请求头临时推断。接受显式维护两套受信入口、RP 配置与验收的成本，
换取可确定的 issuer、回调与退出归属。共享密钥不取消 issuer 检查，可信代理标签也须由实际网络和 Gateway 配置保证来源。

UserSession/ClientSession 保持协议中性，不按 issuer 拆分或绑定。协议产物保存自身 issuer，入口不匹配沿各自协议顺序拒绝；
Code 兑换在适用认证与原实例定位后才发现错误 issuer 时，仍承担
[ADR-0035](0035-unify-user-and-client-session-lifecycles.md#一次消费与失败作用) 的原实例撤销尝试。
不能把错入口处理泛化为任何阶段都无作用的拒绝。

SSO 内部导航保留相对路径以跟随入口；Cookie 按 hostname 隔离，不承诺只换端口就隔离，也不自动同步两个域的登录和退出。
浏览器状态与服务端中性关系的边界必须分开验收。

Custom managed callback 不再固定属于某个 SSO origin，其显式类型与落地 origin 推导由
[ADR-0038](0038-derive-managed-sso-callback-from-redirect-origin.md) 拥有，本页不保留已被其取代的回调结论。

## 当前契约与历史

入口与产物规则见[OIDC 契约](../features/oidc/oidc-integration.md#双-issuer)，
配置与 JWK 维护见[OIDC 手册](../releases/oidc-release-runbook.md)，
真实代理边界见[Gateway 手册](../releases/apisix-gateway-release.md)。
首次双入口切换与旧无 issuer 清场留在历史版本，不据此推定真实环境已经切换。

历史来源：[ADR-0036 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0036-bind-oidc-to-internal-and-external-issuers.md)。原始决定与后续修订按各版本追溯。
