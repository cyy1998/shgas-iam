---
status: accepted
---

# 以两类会话统一关系、配置与协议生命周期

UserSession 表示根登录，ClientSession 表示固定根与 Client 的应用关系；协议独占 Code、Token 和续接状态。
本页汇总统一会话及被其修订的现行决定，替代原讨论分项与重复的旧对象设计。首次升级与旧模型只通过历史版本追溯。

## 两类关系与精确终止

UserSession 使用环境配置的固定期限，不滑动续根。授权可复用同一有效 ClientSession 并单调延长其期限，但不超过原根；
Token 在签发时裁剪到自身、根和应用关系的期限，后续不随关系延长而续期。
在线 Token 使用重新验证原根和原实例，根终止后拒绝新访问不依赖逐个子 Token 清理。

同一有效应用关系可跨协议复用，protocol 是最近授权使用的标记，不是每枚产物的不可变用途。
Code/Token 仍绑定原根、Client 和确切实例，已终止关系不能重开，未修改的旧 Code 不能按关系槽改绑后来创建的实例。
中性生命周期与协议归属分开，避免误投对象或旧请求伤及其他主体和新实例。

显式批量撤销先固定捕获集合，重试只处理该集合未完成的原实例；不宣称全局快照、不自动重扫纳入新会话，也不建立持久
撤销任务。本人全部下线和本人改密保留当前根，但处理其应用关系，不豁免整棵子树。IAM 终止不保证第三方自建会话退出。

## 配置维护与凭据

Client 只选择一种 SSO 协议，SSO 启用意图与整体状态、Internal API 凭据分离；不把协议配置塞进通用扩展字段。
启停、普通配置编辑、Secret 轮换和直接协议切换不自动永久撤销。切回后原期限内、未撤销且仍满足规则的旧访问可能恢复；
想永久终止必须显式撤销，不能依靠配置版本比较。

配置和凭据按本操作接受的观察使用，传播失败窗口由
[ADR-0021](0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) 拥有。
Secret 不主动保留新旧重叠期，但旧缓存仍可能被接受；两者不能混淆。

当前 SSO Secret 直接保存可读取原文，`iam:admin` 可经独立授权及成功提交审计后读取，普通 DTO、日志和审计正文不包含原文。
拒绝仅 hash 保存和新增恢复密文/专用加密 owner，接受数据库字段或备份读取者能取得凭据的代价。
读取响应丢失可以主动重读，不要求重新轮换；读取本身不触发 Snapshot 失效。
普通允许列表编辑不重新审核原 Code/续接已接受的授权事实，当前披露与固定 ID Token 内容由
[ADR-0032](0032-consume-published-subject-facts-for-authorization.md) 拥有。

## 一次消费与失败作用

Code 只消费一次。协议保留各自校验顺序，消费后失败或结果未知须重新授权，不恢复 Code、不重放成功结果。
Custom SSO 选择这一边界以退出 reservation、lease、heartbeat、release 和持久恢复机制，接受响应丢失、未知外部作用及
未交付对象；只对本次已知 Token 同步尽力补偿。OIDC 不增加 Token 补偿，失败时按下述规则尝试撤销原 ClientSession。
这些策略不承诺最终自动回收；ORCAS 外部幂等与回收保证也不能由 IAM 代为承诺。

OIDC 与 Custom 业务兑换在适用 Client 认证通过并可靠定位原 ClientSession 后，后续失败在本请求内有界尝试撤销原实例。
这包括明确缺失 Code、校验失败和暂态失败；普通在线访问遇 Maintenance 的可恢复拒绝不能豁免该兑换作用。
尝试失败或未知不算撤销成功，也不扩张到其他根、其他 Client 或后来创建的实例。失败可能同时影响引用原实例的其他 Token。

两协议 Code 使用无签名的三段定位，无消费墓碑。Custom 业务先通过 Secret 认证；OIDC Public 沿原 Client/根/实例归属门槛，
不以前置 PKCE 成功作为撤销资格。接受掌握合法定位并满足适用认证者用不存在的 Code 触发原实例终止尝试的代价，
不以“能定位”证明 Code 曾签发；格式、目标或归属不可信时只拒绝，不能猜测撤销范围。
OIDC 取删后再做绑定校验的顺序与 Custom 的原消费前保护不能机械统一。

Custom 托管交付保持独立策略：从 Code 绑定定位并验证原会话关系及用途，失败不撤销共享 ClientSession，已知本次 Token
才做尽力补偿。它不增加浏览器根 Cookie 匹配门槛，IAM 内部取得 Secret 也不等于外部调用者通过了业务兑换认证；回调信任见
[ADR-0038](0038-derive-managed-sso-callback-from-redirect-origin.md)。

随机高熵 Token 使用摘要直接定位状态，内部 Token ID 与 bearer 分离，避免为额外正向 lookup 增加状态和请求成本。
每次签发在写入前生成新的随机身份，不由外部指定或复用历史身份；结果未知时沿既定失败策略处理本次作用，不换身份重新签发。
接受随机唯一性，不建立永久历史去重；活跃记录仍须防覆盖。
SHA-256 适用于此类随机 bearer，不是密码哈希方案，也不承诺整个 Redis 泄露后的保密性。

## 明确接受的限制

不恢复旧模型在线双读，不引入强化的跨标签页/Cookie 响应仲裁或通用可靠清理执行器。
在线关系失效不改写已经签发的离线 ID Token。官方套件有明确适用范围与偏离，不能包装为完整认证或本次测试已通过。

对象、期限及观察见[Kernel 契约](../features/sso/unified-session-kernel.md)，固定批次和作用报告见
[会话管理](../features/admin/session-management.md)，完整失败矩阵见
[Custom SSO](../features/sso/custom-sso-contract.md)与[OIDC](../features/oidc/oidc-integration.md)。
复现入口见[命令页](../development/commands.md#oidc-协议套件与旧来源演练)，维护责任见
[统一维护手册](../releases/unified-session-maintenance.md)。

历史来源：[ADR-0007 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0007-separate-versioned-custom-sso-client-configuration.md)、[ADR-0010 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0010-narrow-client-binding-to-oidc-lifecycle.md)、[ADR-0030 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0030-separate-protocol-validation-from-kernel-lifecycle.md)、[ADR-0031 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0031-consume-custom-sso-grants-before-issuance.md)、[ADR-0033 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0033-trust-issued-credentials-without-principal-session-revalidation.md)、[ADR-0034 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0034-locate-token-state-records-directly.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。
