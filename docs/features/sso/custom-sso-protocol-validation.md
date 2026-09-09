# Custom SSO 操作配置与精确失败处理

Status: Current

Last verified: 2026-09-09

Next review: 2026-10-31

本文记录 [Spec #146](https://github.com/cyy1998/shgas-iam/issues/146) 的
[#148](https://github.com/cyy1998/shgas-iam/issues/148) 实现契约。OIDC 全回调复用与 Admin 版本限定撤销已由 #149/#150 接入，组合证据与发布边界见[最终核对](protocol-validation-contract.md)；本页不表示环境已升级。

## 操作范围与获取规则

`createCustomSsoOperations` 以调用方的 `SubjectAccessOperation` 作为业务操作身份。同一操作多次取得 facade，或并行调用其方法时，对每个 Client 分别保存协议配置与 Traffic Gate 的首次 Promise，包括进行中的获取、成功、明确拒绝和暂态失败。配置结果复制后保存，后续校验、签发与延后交付复用它；新操作重新获取。关闭后的 facade 和交付 capability 不得继续访问。

API 的 authorize、续接、Independent token exchange、Gateway callback 与 authz 各自建立一个操作。Public authentication 将同一操作保持到 UserInfo handler 与 capability 交付结束，finally 清除请求 capability。退出每次使用独立应用实例，不继承已关闭请求的配置或访问许可，也不以账号可访问为终止前提。

协议配置与 Gate 是独立的首次结果，不能当作同一个原子 Snapshot。共享 Snapshot Module 仍拥有原先的内部 single-flight、control 校验和有界 acquisition 重试。配置传播失败窗口保持不变：数据库已提交不意味着后续 reader 已取得新配置。

## 拒绝与状态权限

| 观察结果 | 当前行为 |
|---|---|
| protocol/type/已知 Client 不符 | Kernel 先拒绝；不取得 Subject Access Permission，不消费或撤销。 |
| Code 的 Client/mode/redirect 归属不符 | 先于完整 metadata 与版本永久处理拒绝，保留 Code 和 Grant。 |
| Credential 提交到错误 mode/Client 入口 | 拒绝并保留对象；API Public/authz 不清除来源 Cookie 或 ORCAS Cookie。 |
| 已确认归属，版本低于本操作配置，或 metadata 不能通过协议校验 | 仅精确撤销观察到的 Artifact/Credential；旧 Artifact 的 redemption 清理由既有 cleanup owner 执行，新 Artifact 无该附属记录。 |
| 对象版本高于本操作已接受的配置 | 仅拒绝并保留较新对象；不能由 `!=` 推断其永久失效，也不重新读取配置推翻首次结果。新操作取得较新配置后可正常使用。 |
| Client/协议永久停用、删除或配置缺失 | 确认请求归属后精确处理目标；已知版本时同样保护高于本操作配置的对象。 |
| Maintenance、配置/Gate 或生命周期读取故障 | 拒绝本次操作，保留对象、Grant 与可恢复 Cookie；既有 HTTP 暂态映射保持，读取故障不冒充 Maintenance。 |
| 权威撤销或外围 cleanup 失败 | 仍拒绝访问。权威对象是否已撤销与 cleanup pending 分别可观察；恢复继续由现有显式维护能力承担。 |

Credential 的协议归属与配置检查先于 Subject Access；Code 的全部上述检查和访问许可先于 Grant 消费、投影、Credential 签发及 ORCAS 调用。精确撤销使用 Kernel 的已观察对象能力，相同 identity 被替换时不删除替换对象。Grant 消费原子移除同一已观察 Artifact 的 active/lookup/索引并保留 tombstone；不新增通用持久化身份格式。

[#166](https://github.com/cyy1998/shgas-iam/issues/166) 按 ADR-0033 移除 Gateway authz 和两模式 Public UserInfo 的父会话读取。
可信主体与访问代际只取自 Credential；缺失、坏 JSON、非法代际和主体矛盾失败关闭，不查父对象或当前账号代际补齐。
每次操作仍只取得一次 Subject Access Permission，保留用途、模式、配置/Gate、较新版本和暂态失败规则。
根撤销成功而凭据漏撤时，凭据可以继续访问；其自身撤销或到期后拒绝。新授权、登录续接、兑换消费前、Kernel 开始签发以及 IAM 根 token 认证仍校验根。
签发后的父检查也已退役：核对签发观察的可信主体/context/归属并复用许可，不重新裁决期限。根观察后的晚到签发允许完成，
自身已撤销或消失不会复活，但已取得的在途响应不保证被拦截。期限固定，后续访问重新验证凭据自身。

已接受旧配置的在途操作可继续，甚至晚于配置切换创建旧代 Credential；后续独立操作根据新配置拒绝并精确撤销它。对象已消失、撤销、被消费或发生并发冲突仍可使操作失败；首次许可不复活对象，也不追加配置或期限强 fencing。Subject Access、退出、重放、两模式消费后失败不恢复 Code、不确定写入仅同步尽力补偿，遵守 ADR-0031。

## 验证归属

`logout` 保持根范围：根 token 撤销该根；合法 Custom SSO Local Session token 通过用途和协议配置校验后撤销其所属根，仍尝试同根其他对象。子枚举、单子撤销或 CAS 冲突不阻止根撤销成功；根自身失败或读取结果不确定不能返回退出成功。成功仍清除 global Cookie 并按原契约 redirect，重复退出保持幂等；这不等同于单 Credential logout，也不承诺全部派生访问已失效。根与子实际作用、cleanup 失败分别记录，漏撤不新增后台恢复机制。#165 的真实操作及 API HTTP 覆盖撤销边界；#166 的同一 HTTP/Redis seam 进一步覆盖漏撤访问、受控晚到签发、自身撤销/消失/到期和非目标保留。

- [Custom SSO Redis 操作矩阵](../../../packages/custom-sso/test-integration/redis/custom-sso-operation.integration.test.ts) 使用真实工厂、Kernel/Grant 与独立观察连接，覆盖首次成功/拒绝/暂态、两种 pending 获取并行复用、下一操作重取、关闭后失效、旧代晚到、较新 Code/Credential 保留、同 identity 替换、永久与暂态失败的状态回读、权威撤销故障；新 Artifact 无旧 redemption cleanup 依赖。
- [API Public/authz HTTP](../../../apps/api/test-integration/redis/custom-sso-operation-http.integration.test.ts) 覆盖反向 OIDC Credential 误投、Cookie 保留和读取故障 503；[兑换 HTTP](../../../apps/api/test-integration/redis/custom-sso-redemption-operation-http.integration.test.ts) 覆盖合法 OIDC Code 误投、错误 redirect、同 Client 其他用户、其他 Client 与根对象保留，以及无 Grant 消费和 ORCAS 作用。
- 原 API Component 中“版本不符后仍能兑换”的两条断言按永久精确失效修订，错误 redirect 后合法兑换的保护继续保留。持久化隔离由上述 Redis owner 证明，不以 Component 状态模拟替代。

各候选实际执行的命令、结果和未运行项由 #148 交接及验收评论保存；测试存在不代表最终父规格验收、部署或第三方自有会话退出已完成。
