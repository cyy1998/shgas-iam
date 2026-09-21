---
status: accepted
---

# 将 Client 通行状态与永久撤销分开

Client Maintenance、行政 Disable 和 SSO 启用意图控制后续在线操作的通行；暂停保留配置、已有关系与原绝对期限，
恢复不续期。永久终止由显式会话撤销表达，普通配置维护也不自动撤销。本页按统一会话决定整理原暂停语义。

## 理由与代价

维护需要可恢复地关闭流量，而不是销毁关系或冻结全部配置。退出和显式撤销仍可执行，discovery、JWKS、健康检查不属于
Client 在线门禁；没有维护绕过参数。离线 ID Token 与第三方自建会话不受这道在线门禁控制。

单次操作接受 Snapshot 后允许在途继续，不为进入维护排空或追溯否定已经接受的观察。接受传播窗口和过期时间继续流逝的
代价，具体一致性由 [ADR-0021](0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) 拥有。

“暂停可恢复”不表示所有遇到 Maintenance 的请求都没有终止作用。普通在线访问因维护暂拒时保留可能恢复的 Cookie；
Code 兑换完成适用认证并可靠定位原实例后，后续失败仍按兑换决定有界尝试撤销该实例，包括消费前遇到 Maintenance。
Custom 托管交付保持自己的失败补偿边界，不机械套用业务兑换规则。

## 当前契约与历史

状态和维护操作见[Client 配置](../features/admin/client-sso-configuration.md)，失败顺序分别见
[Custom SSO](../features/sso/custom-sso-contract.md)、[OIDC](../features/oidc/oidc-integration.md)；
永久终止的理由见 [ADR-0035](0035-unify-user-and-client-session-lifecycles.md)。

历史来源：[ADR-0012 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0012-model-client-maintenance-as-reversible-protocol-traffic-suspension.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。
