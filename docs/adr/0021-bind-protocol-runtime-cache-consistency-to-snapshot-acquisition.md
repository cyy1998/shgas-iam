---
status: accepted
---

# 将 Client Snapshot 一致性绑定到获取时刻

一次 Snapshot acquisition 固定普通 Client 状态与单协议配置，敏感凭据使用独立窄 reader。
Gate 复用普通观察，两个 reader 只保证各自的观察时点。选择在获取时固定配置，
避免每个后续协议副作用都要建立强写入 fence。代价是已接受的在途操作仍可完成，配置切换存在传播窗口。

## 失效与故障取舍

共享 Redis control 的 epoch 与 generation 区分重建代际和失效顺序，阻止晚到回填及 ABA。
Redis 读取故障或有界重试后仍冲突时失败关闭，避免绕过缓存控制直接回源放行。
PostgreSQL 只拥有配置事实。设计省去额外 cache revision、自动失效 Outbox 与外部 restore incarnation，
代价是数据库已提交而传播失败时，后续操作仍可能读到旧配置或旧凭据，须由 owner 显式修复。
旧缓存窗口与主动为两代凭据提供宽限期是不同机制。

配置、状态与凭据写入提交后统一失效两类缓存，接受额外回源，避免维护字段差异矩阵。
确认提交且 required 传播失败时报告已提交，未知 COMMIT 保留原错误并对已捕获目标保守失效。
确认回滚时无需失效，只读 Secret 审计与配置传播分开处理。

## Redis 恢复

备份可能还原格式正确但过时的 control 和 payload，在线 bootstrap 无法识别这种回退。
选择停流、排空、全量修复与独立核验，接受维护窗口成本。恢复范围按 Snapshot owner 界定，保留其他 owner 状态。
缓存 TTL、通知或一次读到新配置都不足以确认传播完成。

[Snapshot 读取与维护](../../packages/client-snapshot/README.md) · [Admin 写入结果](../engineering/backend-architecture.md#admin-写入结果与失败恢复) · [Snapshot 修复与放流](../releases/authentication-and-session.md#client-snapshot-修复)

历史来源：[ADR-0021 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md)、[ADR-0022 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0022-adopt-snapshot-consistency-for-client-traffic-gate.md)、[ADR-0023 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0023-retire-legacy-maintenance-support.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。

固定历史版本：[整理前 ADR-0021](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md)。
