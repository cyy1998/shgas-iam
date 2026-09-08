---
status: accepted
---

# 由 Redis 统一拥有在线认证状态的生命周期时间

[Issue #94](https://github.com/cyy1998/shgas-iam/issues/94) 暴露了应用判定 Credential 已过期、Redis 却仍占用其 identity 的窗口。静态审查还发现 Session Kernel 四类对象、Custom SSO Grant 初始化与 OIDC 清理索引存在相关时间域混用。维护者于 2026-09-08 接受以下方向，完整范围和验收见 [Spec #115](https://github.com/cyy1998/shgas-iam/issues/115)；Session Kernel 部分已由 [Ticket #116](https://github.com/cyy1998/shgas-iam/issues/116) 实现：四类对象使用 Redis 观察时间计算期限、取得时校验和维护关联 lookup/索引；Custom SSO 由 [Ticket #117](https://github.com/cyy1998/shgas-iam/issues/117) 接入相同权威期限：Grant 初始化消费 Kernel Artifact deadline，Independent 响应与 Gateway Local Session Cookie 使用签发观察的剩余秒数；OIDC store 已由 [Ticket #118](https://github.com/cyy1998/shgas-iam/issues/118) 统一主对象、lookup 和 Grant/Client 索引的 Redis 期限，清理按实际对象存在性处理；OIDC mapping/staged binding 与协议期限消费已由 [Ticket #119](https://github.com/cyy1998/shgas-iam/issues/119) 接入 Redis deadline 和取得时观察；Code/AccessToken/Grant 的在线 opaque 模型沿用本次 Redis 有效观察，不改变 JWT 时间字段。维护切换仍未执行。

Redis 拥有在线认证状态创建、读取、续期、消费与到期判定的时间权威，应用实例不得使用自身时钟重新裁决这些状态是否过期。对象、token lookup 与索引按同一生命周期维护，续期同步处理关联到期时间，索引不能因短有效期对象而早于仍需追踪的对象消失。本次修复范围包含 Session Kernel、Custom SSO Grant 和 OIDC 协议对象索引，可拆分实施，但以三者的一致性作为整体目标。

到期有效性统一按本次操作取得并校验状态的时点判断：普通认证、签发、续期和一次性消费通过该次校验后，可以继续执行，不因处理途中跨过原到期时间而增加提交前或响应前的到期复查。这个决定允许继续处理，不保证后续状态操作一定成功；原有的对象缺失、已撤销、已消费、owner 与并发比较约束继续生效，不为保证完成而复活已消失的对象或延长原有效期。

协议消费方必须使用相同时间权威提供的期限信息，不能用应用时间减 Redis deadline 来重新计算有效性。范围包括 Custom SSO 响应 TTL、OIDC Provider Session mapping 与 staged binding 的期限和索引，以及由 Kernel Principal Session deadline 推导 AccessToken TTL 的路径；这些都是本次一致性改动的消费方适配。`auth_time` 继续表示原认证事件时间，JWT `exp` 继续遵循原协议时间语义。

每次新的 Credential 签发由服务端使用 `crypto.randomUUID()` 生成新的 Credential Identity，不从历史 Credential 复用，也不由外部请求指定；不提供自然过期后复用旧 identity 的业务契约。identity 在写入前确定，同一次签发结果不确定时继续用它确认或补偿该次作用，不能直接换 identity 再签发。维护者接受 UUID 的随机唯一性作为新 identity 的充分保证，不要求历史上绝不重复。

现有活跃对象、token lookup 与 tombstone 防覆盖检查继续保留；本次不新增历史 identity 去重、永久编号机制或为随机碰撞增加补偿归属校验。已有按 identity 确认与补偿的机制继续承担结果不确定时的恢复责任；上述取舍不表示当前实现具有额外的碰撞归属保护。

本决定延续 [ADR-0005](0005-keep-live-login-state-in-redis.md) 的 Redis 实时登录状态权威，以及 [ADR-0010](0010-narrow-client-binding-to-oidc-lifecycle.md) 的每个 Custom SSO attempt 最多拥有一个 Credential、失败后精确补偿和下一 attempt 使用新 identity 的约束。仅调整 Redis TTL 命令而保留应用独立判过期，不能满足本决定。

## Consequences

[Ticket #120](https://github.com/cyy1998/shgas-iam/issues/120) 的最终核对补齐当前正常授权必经的 Session/Interaction model：
Redis 取得后的有效结果不再由应用 exp 复裁；Interaction 更新和 Session.persist 保留 Redis 原 deadline，Session 常规 save 仍按
既有 rolling 策略续期。实现与 42 条故事证据见[最终契约核对](../features/oidc/online-auth-redis-time-contract.md)。
人工清理能力按当前 Kernel/Grant/OIDC owner 固定键族直接扫描，独立 verify 不信任旧 index 的完整性；
停流、排空、部署、保留集、重跑与回退见[维护手册](../releases/online-auth-redis-time-cutover.md)。
代码验证以 ticket 记录为准，实际维护切换仍未执行。

Redis 主机及故障切换节点的时间稳定仍属于基础设施责任；本决定不承诺抵抗 Redis 的任意时钟跳变。JWT 离线时间容差单独处理，不用于延长在线状态的接受窗口。已经使用 Redis 时间或相对 TTL 且不存在相关混用的模块不因本决定统一重写。

发布采用维护窗口统一切换：暂停相关认证与会话流量并排空旧实例在途工作，按相关状态 owner 清理旧会话与协议产物，统一切换相关服务并验证后恢复流量，用户重新登录。旧应用时间域的在线状态不进入新契约，不提供本次旧会话保留或新旧 reader/writer 混跑的过渡模式。清理清单、顺序、验证与回退方式已由上述维护手册固定，不使用 Redis 全库清空，也不改变用户、Client 配置或其他非目标数据。本决定记录发布设计，不代表已执行环境操作。

现有自然过期 identity 复用测试不能继续代表目标契约；替换它时必须同时验证真实签发流程的新 identity、活跃对象与 tombstone 保护、正负应用时钟偏差及关联生命周期一致性，不能只删除失败断言。测试还应覆盖不同应用实例的时钟差异和应用时钟跳变，区分通过校验后途中到期可以继续处理，与后续原子操作因对象已不存在或状态冲突而失败。具体接口、偏差测试数值、实施切片及发布操作流程属于后续交付设计，不以增加固定等待时间替代时间源一致性验证。

维护者在规格整理时确认仅采用共享生命周期与真实 Redis、Custom SSO/OIDC production adapter 两类自动化测试；维护切换由人工验收。本规格不要求新增或运行系统 E2E、自动化切换演练，既有相关测试保留；代码候选验证与实际发布记录分开。
