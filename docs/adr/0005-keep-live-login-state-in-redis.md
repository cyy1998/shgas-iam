---
status: accepted
---

# Redis 拥有实时登录状态与生命周期时间

UserSession、ClientSession 和 Temporary Login Restriction 以 Redis 为实时权威；在线认证对象的生命周期时间也由
所属 Redis 操作取得。本页汇总原状态权威决定与后续 Redis 时间决定。

## 理由与代价

不把会话当作可从 PostgreSQL 或审计恢复的普通缓存。索引可以从仍存在的对象恢复，已丢失的登录对象不能由审计重新创建；
接受 Redis 状态丢失导致原会话失效、临时限制丢失，以及不能重建完整历史会话清单的代价。

跨实例使用应用时钟会使同一对象在不同进程得到不同结论。生命周期按本操作取得的可信观察时点判断，接受后不在响应前再用
应用时钟重新裁决；这允许在途操作继续，不保证后续写入一定成功。关联索引不得早于其仍有效对象失效，不能只让对象 TTL 正确。

Redis 时间不是对任意跳时的防护。基础设施负责人仍须同步主节点与可提升副本的时间并验证切换；JWT 的签发、离线验证时间
另由协议拥有。UserSession 固定期限与 ClientSession 授权时的延长边界见
[ADR-0035](0035-unify-user-and-client-session-lifecycles.md)，不恢复旧根滑动续期。

## 当前契约与历史

对象与观察契约见[Session Kernel](../features/sso/unified-session-kernel.md)；时间同步、恢复和放流责任见
[统一维护手册](../releases/unified-session-maintenance.md)。

历史来源：[ADR-0005 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0005-keep-live-login-state-in-redis.md)、[ADR-0027 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0027-own-online-authentication-lifecycle-time-in-redis.md)。原始决定与后续修订按各版本追溯。
