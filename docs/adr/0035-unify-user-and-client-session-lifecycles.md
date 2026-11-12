---
status: accepted
---

# 以两类会话统一关系、配置与协议生命周期

UserSession 表示固定期限的根登录，ClientSession 表示该根与 Client 的应用关系。
Kernel 持有关系、期限与精确撤销，协议持有 Code、Token 和续接。两类生命周期分开使同一关系可以跨协议复用，
同时保留协议产物的原用途和确切实例绑定。

## 两类关系与精确终止

根期限固定。授权可单调延长同一有效应用关系，期限受原根限制。签发时裁剪 Token 期限，后续延长应用关系时原 Token 的期限保持固定。
在线访问观察原根与原实例，根终止即可阻止后续在线访问。已终止关系无法重开或让旧产物改绑新实例。

显式批量撤销先固定原实例集合，重试只处理原批次未完成的实例。
接受有界索引观察与部分结果，避免自动重扫波及新实例，也无需持久撤销任务。
本人全部下线和改密保留当前根，该根的应用关系仍在终止范围内。
第三方本地会话与已签离线 ID Token 仍遵守各自有效期和退出规则。
[会话与可信观察](../../packages/session-kernel/README.md#会话与可信观察) · [列表与撤销](../../packages/session-kernel/README.md#列表与撤销)

## 配置维护与凭据

Client 只选择一种 SSO 协议，SSO 启用意图、Client 整体状态和 Internal 凭据分别维护。
Maintenance 暂停后续通行，保留配置、关系和原绝对期限，恢复通行时继续使用仍有效的原关系。
退出和显式撤销仍可执行，discovery、JWKS 和健康检查独立于在线通行门禁。在线门禁没有维护绕过参数。
普通配置编辑、轮换、启停或协议切换保留既有关系，永久终止使用显式撤销。
普通在线访问遇维护暂拒时保留可恢复 Cookie，已接受的在途观察可继续。接受传播窗口和期限继续流逝的代价。
[Snapshot 获取与失效](0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md)

SSO Secret 保存可读取原文，`iam:admin` 经窄授权且读取审计成功提交后可读取。
选择可审计重读，省去专用恢复密文与加密 owner，接受具有数据库字段或备份读取权限者可取得凭据的代价。
不设置主动重叠期，传播失败仍可能使旧缓存被接受。普通允许列表修改保留原 Code 与续接的授权事实，
实际披露由 [ADR-0032](0032-consume-published-subject-facts-for-authorization.md) 决定。
[应用配置与凭据](../features/application-integration.md#应用配置)

## 一次消费与失败作用

Code 只消费一次。失败或结果未知后重新授权，接受响应丢失和未交付作用，省去 reservation、lease 与持久恢复。
OIDC 与 Custom 业务兑换完成适用认证并可靠定位原 ClientSession 后，后续失败有界尝试撤销原实例，
覆盖 Code 缺失、校验或依赖失败，以及消费前遇到 Maintenance。撤销失败或未知按原结果报告，
可能影响引用该实例的其他 Token，作用范围始终限于原实例。

两协议分别维护认证、绑定和消费顺序。定位用于限定失败作用，定位成功本身无法证明 Code 曾签发。
OIDC Public 的撤销资格取决于原归属定位，PKCE 仍用于兑换校验。
Custom SSO 对本次已知 Token 尽力补偿，OIDC 的失败补偿按原 ClientSession 撤销处理。
Custom 托管回调按自身的会话与用途绑定处理，保留共享 ClientSession。
回调信任见 [ADR-0038](0038-derive-managed-sso-callback-from-redirect-origin.md)，ORCAS 外部作用见[退役历史](0040-retire-orcas-custom-sso-integration.md)。

使用随机 bearer 的摘要直接定位 Token 状态，内部 Token ID 与 bearer 分开。
这省去正向 lookup，接受随机唯一性和活跃记录防覆盖的边界。未知结果按原签发处理，避免换身份重放。
[Custom SSO](../guides/custom-sso.md) · [OIDC](../guides/oidc.md) · [协议验证入口](../engineering/commands.md#oidc-协议套件)

历史来源：[ADR-0007 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0007-separate-versioned-custom-sso-client-configuration.md)、[ADR-0010 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0010-narrow-client-binding-to-oidc-lifecycle.md)、[ADR-0030 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0030-separate-protocol-validation-from-kernel-lifecycle.md)、[ADR-0031 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0031-consume-custom-sso-grants-before-issuance.md)、[ADR-0033 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0033-trust-issued-credentials-without-principal-session-revalidation.md)、[ADR-0034 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0034-locate-token-state-records-directly.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。

通行与撤销的历史来源：[ADR-0012 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0012-model-client-maintenance-as-reversible-protocol-traffic-suspension.md)、[合并前 ADR-0012](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0012-model-client-maintenance-as-reversible-protocol-traffic-suspension.md)。

固定历史版本：[整理前 ADR-0035](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。
