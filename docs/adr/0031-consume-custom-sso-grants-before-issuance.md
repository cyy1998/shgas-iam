---
status: accepted
---

# 在签发前一次性消费 Custom SSO Grant

> [ADR-0033](0033-trust-issued-credentials-without-principal-session-revalidation.md) 已接受的新目标取消 Custom SSO 授权续根及 Credential 随根续期，局部取代本文关于未交付凭据可随根延长的描述；签发时根期限裁剪、兑换前根校验、一次消费和失败重新授权保持。该后续目标已由 #164 实现，独立访问由 #166/#167 实现；下文随根续期仅为原决策语境，环境尚未切换。

[Issue #152](https://github.com/cyy1998/shgas-iam/issues/152) 重新评估原 Code 可恢复兑换的价值。维护者于 2026-09-09 逐项确认兑换、补偿、接入与发布边界，并要求形成正式规格，以失败后重新授权换取更简单的兑换流程；有效根登录会话通常允许续接授权，无需再次输入凭据。本文记录已接受的修改目标；Independent 与 Gateway 已分别由 #158/#159 迁移为签发前消费；在线预占、租约与失败释放已退役，定向维护已由 #160 交付，#161 已交付最终组合证据账本和升级手册；父规格聚合验收另由协调者记录，环境尚未切换。

完整用户故事、实现与测试决定由 [Spec #157](https://github.com/cyy1998/shgas-iam/issues/157) 拥有；后续实施沿该规格拆票和验收。

> 后续 #156 已按 [ADR-0032](0032-consume-published-subject-facts-for-authorization.md) 取消请求时授权新鲜度要求。
> 本文原验收语境中的 freshness 保证由已发布 Facts 语义取代，操作许可、一次消费与资料失败恢复规则不变；环境未切换。

## 已确认的决定

Independent 与 Gateway 使用相同的一次性消费语义。Client 认证（适用时）、用途、请求归属、redirect、协议版本、根会话、Traffic Gate 与 Subject Access 前置校验通过后，原子地消费同一已验证 Grant；同一 Code 只能有一个消费成功者，失败请求不能以普通读后删除代替并发消费约束。消费前 Maintenance 等暂态拒绝保留 Code 且不延长原有效期；错用途、错归属及永久失效对象继续按原精确处理边界执行，不能把所有校验失败一律视为可恢复。

主体投影、适用的 ORCAS 登录与 Credential 签发均在消费之后执行。投影未就绪、外部失败、签发失败、消费结果未知或成功响应丢失，都不恢复原 Code，也不提供成功结果重放；消费结果未知时不继续签发，调用方通过新的授权流程恢复。已取得的 Client Snapshot 和 Subject Access Permission 仍只对当前操作有效，后续对象存在、撤销、用途匹配与并发约束继续生效。

保留写入前确定的 Credential Identity 和调用仍可处理失败时的同步精确补偿；不为崩溃、未知结果或补偿失败建立持久恢复机制，也不承诺最终精确补偿。接受未交付 Credential 由现有过期与撤销机制收敛；它可能随 Principal Session 续期，受根会话绝对期限限制，不能把初始 Credential TTL 当作固定清除期限。未交付对象存在不等于凭据已泄漏，也不表示同一 Code 能成功交付两次。

## 契约关系与代价

- 局部取代 [ADR-0010](0010-narrow-client-binding-to-oidc-lifecycle.md) 中恢复原 Grant、attempt/lease 协调及“不接受仅等待 TTL”的 Custom SSO 补偿要求，以及 [ADR-0027](0027-own-online-authentication-lifecycle-time-in-redis.md) 延续的对应恢复承诺；Redis 时间、全新签发 identity、防覆盖及精确撤销继续保留。
- Custom SSO 仍由自己的协议模块拥有，OIDC Client Binding 和 OIDC 消费语义不因此改变。实现采用 Kernel Artifact 的原子消费作为新流程唯一权威，不再为两种模式的新 Grant 初始化独立 redemption；旧在线 store 已由 #159 删除，维护 decoder/prefix/cleanup 独立保留，不建立跨模块事务。
- `Subject Projection Not Ready` 继续表示暂态不可用，不能改成未认证或无权限；兑换阶段的恢复方式变为重新授权，UserInfo 仍可用现有有效 Credential 稍后重试。接入与错误提示采用下述统一恢复约定。
- ORCAS 已成功但响应丢失、或后续 IAM 失败的问题仍存在；新授权也可能再次调用 ORCAS。该外部系统的幂等、期限与撤销能力尚未确认，本决定不替它承诺有界残留或成功补偿。
- 取消原 Code 恢复可以移除 reservation、lease、heartbeat、release 与接管；它不取消一次消费的唯一赢家、错用途保护、Client 归属、配置版本或对象生命周期约束。

## 接入与失败响应

Independent 接入方在兑换暂态失败或结果未知时统一放弃本次 Code，等待后重新发起授权，不判断请求是否已越过消费点，也不新增恢复状态字段。消费前暂态拒绝保留 Code 是服务端行为，不要求接入方利用这一区别重试原 Code。已有 `503` 与领域错误继续表达原失败原因，`Retry-After` 表示等待后开始新授权；参数、Client 认证或配置错误仍须先修正，不能把所有错误都当作自动重试条件。

Gateway 本次保持现有 callback 失败响应，由用户返回业务应用重新发起访问；不新增恢复页面或“重新授权”按钮，也不自动循环授权。消费失败不要求清除仍然有效的根会话；失败恢复应复用现有授权入口，而不是刷新携带旧 Code 的 callback。

接入说明、OpenAPI 的重试描述及相关错误提示在实现时同步修改，原先“所有 503 都保留 Code 并可重试”的说明失效。UserInfo/authz 的暂态重试与有效 Credential/Cookie 保留语义继续存在；本次不把登录兑换规则扩大到已有凭据的普通访问。

## 发布边界

本文的保留会话步骤只适用于原 Spec #157 单独升级。包含 Spec #163 的候选必须执行[全体下线手册](../releases/online-auth-redis-time-cutover.md)，不保留旧 Credential；定向 Grant 维护能力仍存在，但不能作为本次全清证据。

采用维护窗口切换：暂停受影响的 Custom SSO 授权与兑换流量，排空旧请求，只失效旧 Custom SSO Grant 及对应 Authorization Artifact，保留有效 Principal Session、已签发 Credential 和其他协议在线对象；全部兑换实例统一升级后恢复流量，不支持新旧兑换实现混跑。切换前取得的 Code 需要重新授权，有效根登录会话继续用于续接。

Grant redemption 记录与对应 Artifact 在 owner 能力上可独立清理，但当前统一 Kernel namespace 不能整体清空后声称保留会话。限定 Custom SSO Grant 的清理与独立核验能力已由 #160 交付；[统一升级手册](../releases/custom-sso-one-shot-grant-upgrade.md)定义失败保持停流、重跑和回退边界。CLI 目标核验不能证明环境保留集，必须独立对照基线；不授权执行环境操作。

## 后续验证要求

维护者已确认复用两类现有测试入口：Custom SSO 完整操作及维护公开能力配真实 Redis，API 实际 HTTP 入口验证响应、Cookie、授权续接和出站顺序。ORCAS 使用可控替身，环境切换人工验收；本规格不新增或要求运行完整系统 E2E、真实 ORCAS 试验或自动切换演练，既有相关 E2E 保留。以下证明已由 #158–#161 的代码和本地测试覆盖，候选复用、实际执行与未执行边界见[最终账本](../features/sso/custom-sso-one-shot-grant-contract.md)；不表示生产故障演练：

- 真实并发兑换只允许一个消费成功者进入后续投影、ORCAS 与签发；重放、错用途、错归属、过期和撤销仍被精确拒绝。
- Maintenance、Snapshot 或 Subject Access 暂态拒绝发生在消费前，Code 保留且有效期不延长；确认的永久失效继续遵守已有精确处理规则。
- 消费结果未知时不进入签发；消费后的投影失败、ORCAS 失败、Credential 写入前失败及写入成功后报错均不恢复原 Code。同步补偿使用本次写入前确定的 identity，失败不能撤销其他对象。
- 消费或签发后的进程中断、补偿失败与响应丢失不恢复原 Code，也不重放成功结果；真实写入故障与可控中断验证应明确区分已生效、未交付及未补偿对象，不要求新建恢复 executor。
- 用同一有效根会话的新授权可得到新 Code；兑换错误原因和 `Retry-After` 的新解释保持明确，Gateway 仍使用现有失败响应。ORCAS 替身只证明调用顺序，不能证明外部会话的幂等或回收。
- 仅清理旧 Custom SSO Grant 及其 Artifact，并独立验证有效根会话、已签发 Credential 和其他协议对象保留；环境停流、排空与放流由发布负责人另行验收。

## 关联议题核对

本表依据 2026-09-09 调查时全部 16 个开放议题正文及评论、当前代码只读核对；未运行故障注入或生产测量。处理结论不等于相关议题已被修改或关闭，实际状态以 tracker 为准。

| 议题 | 处理结论 |
|---|---|
| [#140](https://github.com/cyy1998/shgas-iam/issues/140) | 租约接管及其最终精确补偿要求被上述目标取代，可按契约取代关闭，不能记作旧实现缺口已修复。 |
| [#152](https://github.com/cyy1998/shgas-iam/issues/152) | 保存本次契约收缩结论及后续实施入口；讨论完成不等于实现完成。 |
| [#145](https://github.com/cyy1998/shgas-iam/issues/145) | 保留 ORCAS 外部副作用讨论，调整重复调用场景为重新授权；无法据 IAM 的决定推断 ORCAS 行为。 |
| [#156](https://github.com/cyy1998/shgas-iam/issues/156) | 保留权限新鲜度与登录耦合讨论，修订兑换恢复步骤；UserInfo 重试和权限披露边界仍有效。 |
| [#144](https://github.com/cyy1998/shgas-iam/issues/144) | 续期问题独立有效，并约束未交付 Credential 的残留期限。 |
| [#121](https://github.com/cyy1998/shgas-iam/issues/121)、[#141](https://github.com/cyy1998/shgas-iam/issues/141) | 撤销后的附属清理、OIDC 双状态协调继续有效，不能因本次放弃 Custom SSO 恢复而取消。 |
| [#71](https://github.com/cyy1998/shgas-iam/issues/71)、[#155](https://github.com/cyy1998/shgas-iam/issues/155) | 热路径预算和重复校验清理继续有效，实施后重新核对路径、剩余分支与实测成本。 |
| [#72](https://github.com/cyy1998/shgas-iam/issues/72)、[#137](https://github.com/cyy1998/shgas-iam/issues/137)、[#138](https://github.com/cyy1998/shgas-iam/issues/138)、[#142](https://github.com/cyy1998/shgas-iam/issues/142)、[#143](https://github.com/cyy1998/shgas-iam/issues/143)、[#153](https://github.com/cyy1998/shgas-iam/issues/153)、[#154](https://github.com/cyy1998/shgas-iam/issues/154) | 查询、存储、父会话检查、OIDC 隔离、Kernel 接口和配置问题各自独立，不因本决定失效；其中是否因其他已完成工作局部过时不属于本次判断。 |

## #158 的消费与维护交接

新流程复用 Kernel `consumeProtocolArtifact(code, purpose, observed)`，以完整已观察对象、lookup 与 tombstone CAS 保证唯一成功消费者。
同一原子操作移除该 Artifact 的 active/lookup 和精确索引成员，保留重放 tombstone；消费成功不依赖另一份 redemption 记录。
消费报错或结果未知即停止；两种模式的新 Artifact 均不带旧 redemption cleanup ref。#159 已删除 Gateway 过渡路径和在线旧机制，
ORCAS 仅在消费成功后调用，写前新 identity 与同步尽力补偿保持；#160 已交付定向维护，父规格最终验收尚未完成，环境未切换。

旧库存仍有 `authorization-grant:redemption:v1:` 下严格 v1 issued/redeeming/consumed 记录，包括可能没有 Artifact 的孤立记录。
Custom SSO `/maintenance` 已提供 prefix、`decodeCustomSsoLegacyGrant` 和 `isCustomSsoAuthorizationArtifact`，旧精确 removal 与
cleanup adapter 保留。Kernel 中性维护 owner 负责 active/tombstone 的读取、精确撤销与 lookup/索引处理；完整 namespace prefix
只用于发现，不能直接据其清空以冒充保留会话。#160 已交付正式定向操作与独立验证，在停旧 writer、排空后、启新 writer 前处理
所有目标 custom-sso/auth_code 及旧 redemption，因此不需要新增永久版本字段或双版本开关。有效 Principal、Credential 和 OIDC 是保留集。
可执行命令、限定范围 CAS、失败重跑、目标核验与保留集独立对照见[定向维护手册](../releases/custom-sso-grant-maintenance.md)。

## 确认状态

维护者已确认六项设计与发布边界、两类测试入口，正式 Spec #157 已发布并标为 `ready-for-agent`。Independent/Gateway、定向维护与最终组合已分别交付，父 Spec 最终聚合验收以 issue 记录为准；不代替部署或状态清理授权，关联讨论按上表保留各自的独立问题。
