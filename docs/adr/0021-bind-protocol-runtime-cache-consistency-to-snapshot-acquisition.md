---
status: accepted
---

# 将 Client Snapshot 一致性绑定到获取时刻

普通 Client 状态和单协议配置在同次 Snapshot acquisition 中接受；敏感凭据由独立窄 reader 取得，Gate 复用普通观察，
不另建 payload。两 reader 不承诺同一 PostgreSQL 时点。本页合并缓存一致性、Gate 与当前恢复范围的后续修订。

## 理由与代价

共享 Redis control 以随机 epoch 和 generation 区分重建代际与失效顺序，发布比较原观察，防止晚到回填和 ABA。
缺失或损坏 control 必须原子重建并清除旧双 payload；可信 control 下坏 payload 可回源重建。
有界冲突重试后失败关闭，不持续等待配置稳定；无法读取 Redis 也不直接回源放行。

选择在 acquisition 固定事实，拒绝在每个后续协议副作用前设置强 mutation fence。已接受的在途操作可以完成，
失效不追溯撤销其观察，也不排空请求。收益是配置缓存不侵入所有协议写路径，代价是没有线性化配置切换。

PostgreSQL 只拥有配置事实，不额外引入 cache revision、事务 outbox 或外部 restore incarnation。提交后失效失败时，
后续独立调用仍可能取得旧配置或旧 Secret；缓存 TTL、Pub/Sub 通知和页面刷新都不证明传播成功。
该窗口不同于主动保留新旧 Secret 的宽限期，也不能靠重放业务 mutation 恢复。

## 提交与恢复责任

配置、状态与凭据写操作的失效范围由管理契约统一拥有，成功失效同时清除普通/敏感 payload，接受额外回源而不维护复杂
字段差异矩阵。授权读取 Secret 只读取并记审计，不属于这类写入，不锁 Client 或触发失效。

确认提交后 required 传播失败明确表达业务已生效；COMMIT 未知保留原错误，并对已捕获目标尝试一次保守失效，不假装
运行正常 after-commit。确认回滚无需失效。失效失败须显式 repair，不增加自动 outbox 恢复。

Redis 备份可能同时恢复格式正确却过时的 control 和 payload，在线 bootstrap 无法识别这种回退。恢复须停流、排空、
全量 repair 后独立 verify；不能依靠 TTL 或逐 Client 访问。当前 repair 只拥有当前 Snapshot namespace，
保留未知及其他 owner 的状态，不证明旧 namespace 清净，也不撤销会话或轮换 Secret。
命令成功不能代替人工停流、排空、smoke 与放流确认，失败保持关闭并按原范围恢复。

## 当前契约与历史

模块隐藏键、Lua、CAS、正负缓存和 single-flight 等实现。完整读取与错误契约见
[Client Snapshot](../features/sso/client-snapshot-contract.md)，写入边界见
[Client 配置](../features/admin/client-sso-configuration.md)，修复见[统一维护](../releases/unified-session-maintenance.md)。

历史来源：[ADR-0021 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md)、[ADR-0022 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0022-adopt-snapshot-consistency-for-client-traffic-gate.md)、[ADR-0023 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0023-retire-legacy-maintenance-support.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。
