---
status: accepted
---

# 使用已签发 Credential 时不复查父 Principal Session

[讨论 #138](https://github.com/cyy1998/shgas-iam/issues/138) 希望让已签发 Credential 自身承担访问凭据职责，减少在线入口对父 Principal Session 的依赖。维护者于 2026-09-09 确认各分项及完整方案，明确以本轮讨论为准、删除此前讨论遗留内容，并要求发布正式规格。本文记录已接受的决定；#164–#167 已实现期限、尽力撤销及双协议独立访问，环境尚未切换。

[Spec #163](https://github.com/cyy1998/shgas-iam/issues/163) 保存本次 62 条用户故事、20 项实现决定与 12 项测试决定；逐项证据与复用边界见[最终契约账本](../features/sso/credential-authority-contract.md)，父规格最终聚合验收另记，本 ADR 记录长期边界。

## 已确认的方向

- 所有已有 Credential 的使用入口，包括 Custom SSO Gateway、Independent 和 OIDC，均不为判断凭据有效性回查父 Principal Session。凭根会话发起登录续接或新授权时仍校验根会话；直接使用根 Session token 的 Admin 与 IAM 自身入口仍验证该根会话。
- 根会话撤销成功不要求全部派生访问已经失效。继续尽力级联撤销子对象，漏撤不影响根撤销成功，残留按自身期限失效；本方向不额外承诺后台最终撤销，也不以 #121 的异步执行器为前提。根本身未成功撤销不能据此报告成功。
- 接受已通过有效根检查的在途签发、仍适用的续期操作，在根撤销后继续完成；不增加提交时父状态复查。新操作仍须通过其适用的有效根检查，不复活已撤销对象。
- Custom SSO Grant 与 OIDC Authorization Code 兑换仍校验父 Principal Session，把兑换归入签发流程。Credential 独立使用从签发完成开始；Grant/Code 的一次消费、用途、Client 认证、请求归属、协议版本和 Subject Access 等约束继续适用。
- OIDC AccessToken 使用时继续校验 Binding 自身生命周期及 Token/Snapshot 归属，但 Binding 读取不得隐含父 Principal Session 有效性检查。
- Custom SSO Credential 不再续期，覆盖 Independent 与 Gateway；Custom SSO 发起新授权也不再续期 Principal Session。OIDC 自身的根续期规则不在此取消范围，且不能借根续期延长 Custom SSO Credential。
- Credential 初次期限继续按既有规则取配置 TTL、签发时父 Principal Session 当前期限及绝对期限的最早值；Custom SSO 签发后固定该期限，普通使用或同根其他 Client/OIDC 活跃均不延长。父只剩五分钟时，新 Credential 最多五分钟。OIDC Binding 自身生命周期及其对 AccessToken 使用的约束仍保留，不要求为本次变更延长 Binding 或关联对象期限。
- 根撤销成功提示只表达根会话已撤销，各项计数仍只表示实际完成数量，不宣称全部派生访问已经终止。日志与审计区分已完成的目标撤销、子对象尽力处理及外围清理失败，不能把未执行或失败的子撤销算作完成。
- 发布复用现有 `online-auth:state` 全体在线认证状态维护命令，在停流排空后一次性下线并统一切换，用户重新登录；不保留旧 Credential，也不新增 Credential 续期策略迁移能力。

信任 Credential 不取消其自身存在、期限、撤销、结构和用途检查，也不取消一次 Subject Access Permission、Client 配置或业务授权约束。协议所需主体、访问代际和归属必须来自可信凭据及协议状态，不能以父读取退役为由接受客户端任意补入的身份。

各入口的现有目标范围保持：Admin 单次下线保护当前管理根；本人全部下线及重置本人密码只保留当前根本身，子对象仍在尽力处理范围。保留当前根、根原已不存在或只有子对象实际变化的结果不能一律提示“根已撤销”；会话命令的 `changed` 仍来自实际撤销，密码 mutation 的 `changed` 仍来自密码提交，作用后审计失败继续单独表达。Custom SSO logout 保留所属根退出范围和 HTTP 行为，账号失效代际撤销不扩大到新代。

## 原决策基线与取舍

以下三段仅记录形成决定时的旧基线 `b05e5cb47186a0f1625d06a0746a09968ae5c0ec`，当时未运行行为测试，不是当前实现。Kernel `resolveCredential` 已只解析凭据自身；Custom SSO 的 `resolveValidatedCustomSsoCredential` 和 OIDC 的 `validateSnapshotBinding`、Provider Session adapter 追加父读取。OIDC 读取还承担身份、Binding 与 Snapshot 归属检查，需要分别保留适用职责。

当前 `issueCredential` 先观察父会话，再单独写入 Credential，创建 Lua 不原子比较父状态。`revokePrincipalSession` 先一次枚举并撤销子对象，再撤销根。在途签发可能晚于枚举甚至根撤销完成才写入；索引遗漏和子对象并发续期造成的撤销比较冲突也可能留下有效凭据。普通解析不会自行续期。现有 cleanup-pending 不能证明漏撤 Credential 已有可靠的最终撤销执行器。

当前 Custom SSO 两模式使用 `extend_with_principal`，由成功的根续期触发；普通 Gateway authz/Public UserInfo 不续期。Credential 初次期限裁剪到根当前及绝对期限，后续子续期直接更新到根的新期限。OIDC AccessToken 使用 `fixed_at_issue`。仓库 Compose 的根 idle/absolute 和 Custom SSO 请求 TTL 默认均为 86400 秒，OIDC AccessToken 默认为 3600 秒；实际部署覆盖值未知。

本次保留签发时根期限裁剪；取消的是已有 Credential 使用时的父有效性复查，不把 Credential 改为可在签发时取得超过根期限的独立 TTL。OIDC Binding 的显式撤销、期限和归属校验继续保留。

存量 Custom SSO Credential 的 `extend_with_principal` 仍可能被 OIDC 根续期更新，因此只修改新签发逻辑而保留旧对象不足以统一行为。本次以现有全体在线状态清理命令移除旧对象，所有新 Custom SSO Credential 使用固定签发期限；不再维护定向 policy 迁移方案。Gateway Cookie 继续使用签发响应的剩余 TTL。

上述续期选择也覆盖 [#144](https://github.com/cyy1998/shgas-iam/issues/144) 的两模式固定期限、跨 Client/OIDC 活跃和 Cookie 对齐问题；正式规格统一包含这些验收要求，避免继续沿用未交付 Credential 可随根续期的旧断言。来源议题的 open 状态不表示本目标已经实现。

本方向局部取代 [ADR-0029](0029-check-subject-access-once-per-business-operation.md) 中已有 Credential 使用时的父生命周期依赖，以及原 Session Revocation 对派生访问终止的统一表述；Custom SSO 不再续期局部取代 [ADR-0031](0031-consume-custom-sso-grants-before-issuance.md) 中未交付 Credential 可随根续期的描述，仍保留签发时根期限裁剪、兑换前父会话校验和签发前一次消费。登录重入守卫继续验证根身份，实际 Custom SSO 授权取消续根；功能与发布契约已同步；实际行为证据见最终账本，不能据代码验收推断环境已迁移。

## 发布与验证

复用[在线认证状态维护手册](../releases/online-auth-redis-time-cutover.md)中的目标环境固定、停流、排空、当前 owner 清理、独立核验、统一版本与重新登录流程。已核对 `online-auth-state-command.ts` 和 `maintainOnlineAuthState`：命令按 Kernel、Custom SSO Grant、OIDC store、Provider Session state 四类 owner 的固定键族直接扫描，不依赖子索引完整性，覆盖 Principal、Credential、Binding、Code 及关联状态。

在维护窗口内、确认旧 writer 已停止且在途已排空后，分别执行：

```bash
pnpm --filter @iam/oidc-provider online-auth:state -- dry-run --writers-stopped
pnpm --filter @iam/oidc-provider online-auth:state -- apply --writers-stopped
pnpm --filter @iam/oidc-provider online-auth:state -- verify --writers-stopped
```

这是一轮全体下线，`dry-run` 和独立进程 `verify` 是现有命令流程的一部分。`apply` 并非跨 owner 事务，失败保持停流，按原手册重跑；verify 成功后统一启用新版本并验证重新登录。不写 PostgreSQL、不推进协议 epoch、不清理其他 Redis owner，也不承诺退出第三方自建会话或撤销离线 ID Token。回退同样停止 writer、清理当前在线状态并统一版本，不恢复旧登录态。

维护手册已按本 ADR 更新本次 smoke：Custom SSO 不续根或 Credential，正常级联退出仍应拒绝已撤销对象，但漏撤 Credential 的访问按本次已接受边界验证，不能继续使用“根撤销必然使所有派生访问立即失败”的旧断言。这里只确定未来发布方式，尚未运行上述维护命令或执行环境切换。

已交付行为验证使用真实 Redis 及现有 API/OIDC HTTP 入口，覆盖父提前缺失或撤销但漏撤 Credential 仍有效、兑换前根无效拒绝、在途签发晚到、签发期限裁剪、Custom SSO 授权不续根、同根跨 Client/OIDC 活跃不延长 Custom SSO Credential、Cookie/响应期限一致，以及 Binding 自身失效和 Subject Access/协议拒绝。索引遗漏、部分撤销失败及非目标对象保留需要直接状态断言。固定期限不因父失效延长，正常到期仍拒绝；不能为证明父独立使用而构造违反签发期限裁剪的正常流程。复用既有维护命令及其测试，不为本次增加存量策略迁移或完整系统 E2E；实际环境停流、清理和放流人工验收，代码验证与发布证据分别记录。

## 确认状态

维护者已确认各项设计、发布选择和完整方案，并授权生成与发布正式规格；代码已由 #164–#167 实现并逐票评审，#168 汇总 62/20/12 项证据与发布手册；父 #163 的最终聚合验收由协调者记录，未执行下线或部署。

[#137](https://github.com/cyy1998/shgas-iam/issues/137) 的 token 存储定位与 [#121](https://github.com/cyy1998/shgas-iam/issues/121) 的可靠异步清理仍是独立议题。保留父保护并合并 Redis Lua 可以减少 RTT，但不能实现已确认的独立使用语义；局部性能收益已有真实请求观测，口径和限制见最终账本，不等于这些独立议题完成。
