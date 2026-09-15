# Client 配置提交后的版本限定撤销

> Historical：本页保留旧候选的契约与证据；Spec #178 最终在线模型已由 ADR-0035 取代，当前发布以统一会话维护手册为准。

本文记录 [Spec #146](https://github.com/cyy1998/shgas-iam/issues/146) 的
[#150](https://github.com/cyy1998/shgas-iam/issues/150) 实现边界；长期决定见
[ADR-0030](../../adr/0030-separate-protocol-validation-from-kernel-lifecycle.md)。实际执行的候选与验证结果由 ticket 保存，本文不代表环境已升级。

## 提交版本与执行范围

Admin `ClientService` 使用同一事务中 repository 的 `UPDATE ... RETURNING` 新行，固定 canonical Client code 和
本次提交后的协议版本 `V`，沿既有 bestEffort afterCommit 传入 Session revocation adapter。配置、启停、移除与
Secret 轮换使用对应协议边界；Client 真停用与软删除各自携带 `oidcConfigVersion`、`customSsoConfigVersion`，不假设两个版本相同。

adapter 只选择版本 `< V` 的对象；边界及更高版本保留。任务迟到或以原 input 重试仍使用这两个固定标量，不在执行时查询
最新版本，也不使用 `!= V`。合法 no-op 不推进 epoch、不注册版本撤销，仍保留原有意图审计和 required Snapshot invalidation。
普通资料与通用 Client Secret 沿现有规则，不被重新解释为专项协议变更。

Redis 撤销不进入 PostgreSQL transaction。确认提交后仍按注册顺序执行 required invalidation 与 bestEffort 撤销；
required 失败后继续尝试任务，并最终报告 `ADMIN_MUTATION_COMMITTED`。unknown COMMIT 只走既有保守 Snapshot invalidation，
不执行 afterCommit 撤销、不伪造确认提交版本。传播失败窗口、事务与外围清理恢复责任没有提升。

## Kernel 与协议 owner

Kernel 的 `revokeSelectedClientProtocolObjects` 只提供显式批量能力，限定 Client/protocol 后枚举活跃对象。
选择器声明必要 metadata 字段，接收独立副本中的 `kind` 和这些字段；生产选择器各只请求一个版本字段。
不提供完整 metadata、token/lookup、主体资料、对象身份或 cleanup payload。选择函数同步返回 `select`、`retain` 或
`unconfirmed`，不进入 resolve、consume 或任何全局校验 hook。

OIDC 版本解释由 `@iam/domain/client/oidc-revocation-selector` 公开纯规则拥有，Custom SSO 由
`@iam/custom-sso/maintenance` 拥有；Admin 不导入 OIDC app 私有实现。Kernel 不解释两协议的版本字段。

Kernel 在选择阶段保存原对象及其序列化观察值，执行阶段复用已有原子比较与撤销。相同 identity 在选择后被替换时，
比较失败，替换对象和新 lookup owner 保留。Binding、Credential、Artifact 各自独立选择；旧 Binding 被选中不触发
无条件子对象级联，更高版本子对象保留。它们在线是否仍满足父 Binding 等生命周期要求，继续由原公开读取契约裁决。

缺失、负数、非整数或损坏版本得到 `unconfirmed`，此次批量跳过。Kernel 每次命令最多发出一条聚合诊断，只有
Client、协议和计数，不包含 metadata 原文、对象 ID、token、主体或清理引用。跳过不授予在线访问；协议校验继续拒绝
无法通过 metadata 契约的对象，精确维护由对应 owner 负责。

## 清理与枚举边界

选中对象的权威撤销复用现有 `revokeObject(expected)` 及 lookup owner 保护的 cleanup。Admin 当前 Kernel composition
未装配协议 cleanup adapters：存在 cleanup refs 时仍报告失败并登记 pending，不能把权威对象已撤销解释为外围 payload 已清空。
本能力不按无法确认版本的既有 tombstone 扩大重试范围；已登记 pending 继续由独立精确维护或显式全范围维护处理。

`revokeClient`、`revokeClientProtocol` 等显式全范围能力保留，供明确要求终止全部当前访问的独立管理或维护命令使用，
不供普通配置失败或 Admin 配置变更调用。本次没有新增 endpoint。

一次枚举不是全局快照，也不排空所有在途旧写入。枚举之后才创建的旧代对象可能保留；后续操作取得新配置后按协议规则
拒绝并精确处理，显式维护可回收残留。本次不增加队列、历史版本集合、强 fencing 或在途排空屏障。

## 验证归属

- Admin `composition/client-protocol-revocation` 同时使用真实 PostgreSQL、Redis、生产 ClientService、UoW、repository、
  audit、Snapshot Module、公开协议 Reader、实际 revocation adapter 和 Kernel。撤销前 Promise latch 只控制 afterCommit 到达时间；
  原 generic cache、logger、password/random 以窄替代提供。双协议晚到与乱序重试、分别推进版本、no-op、停用及删除以 PG epoch
  和 Redis 目标/对照对象、Principal roots 的直接回读证明。Kernel 签发使用真实存储工厂，不声称该 seam 是完整协议 HTTP 登录。
- Kernel `redis/session-kernel-selected-revocation` 证明独立选择、旧 Binding 与新代子对象、未知版本有界诊断、三类同 identity
  替换、生产 Artifact 重新签发的 token/owner 保留，以及缺失 cleanup adapter 的 pending 状态。受控 Redis 观察点只暂停真实 I/O，
  没有新增 Redis 或 Lua 模拟实现。
- Admin 既有 PostgreSQL command/mutation suites 继续拥有同行锁、审计回滚、no-op、Secret/配置版本推进和 unknown COMMIT。
  两协议 owner 的 selector Unit tests 验证各自字段和坏版本判断。在线拒绝未知/旧代对象由 #147–149 的真实协议回归拥有。

这些测试不替代停流、冻结相关修改、旧实例排空、统一升级和放流 smoke 的环境证据。
