# Subject Access 操作许可

Subject Access 判断一次业务操作中的账号可访问性，独立于会话存在性、协议配置和主体资料披露。
许可成功或失败均固定在本操作内；后续请求重新检查。决策理由见
[ADR-0029](../../adr/0029-check-subject-access-once-per-business-operation.md)。

## 操作与许可

`@iam/api-core/subject-access` 的 `createSubjectAccessOperations({ barrier, revocation })`
提供 `run(callback)` 和 `createOperation()`。run 在成功/失败后关闭；手动创建者在 finally 关闭，
不把操作或许可保存为跨请求单例，也不交后台任务使用。

可信认证结果用 `acquireForAuthentication`，可信会话解析结果用 `acquireForSession`。
同一主体的并发调用共享 pending Promise，第一次成功、明确拒绝和暂态失败均固定；途中换主体或代际拒绝，
不换身份重新检查。尚未解析可信主体的无效凭据及无主体操作可零读取结束，请求体中的用户标识不构成身份依据。

`requireSubjectAccessOperation` 拒绝缺失、伪造或已关闭容器；`requirePermission` 只接受同主体的既有许可，
`getSubjectContext` 只接受该容器创建的许可。操作关闭后 acquire、require 和 context 访问均拒绝。
协议中的授权、guard、resume、兑换、callback、UserInfo/authz 是各自独立操作，不能把整个浏览器旅程合为一次许可。

## Context 与会话边界

`encodeSubjectAccessContext` / `parseSubjectAccessContext` 编解码严格 JSON string：
`{ version: 1, subjectIdentifier, transitionId }`。缺失、坏 JSON、额外字段、非法 UUID 或不支持版本失败关闭，
不从当前 Barrier 猜测补齐；持久化 context 不是操作许可。

Kernel 的 `createUnifiedSessionKernel` 只托管不透明 context，并提供两类会话的生命周期和原实例观察。
`createUnifiedSubjectAccessSessionRevocation` 在 API Core 适配账号代际与中性会话撤销；
Kernel 不解释账号状态，不重新取得许可。具体操作与原实例保护见[Kernel 契约](unified-session-kernel.md)。

许可取得后账号进入 blocking、disabled 或重新启用，不推翻本次判断；迟到签发沿原 context。
下一调用检查新状态，重新启用不恢复旧代。会话到期、原根/实例终止、Code 消费和 Client 配置仍按各自 owner 校验，
许可不代替这些条件。Code 消费前后的检查和失败撤销由[Custom](custom-sso-contract.md)、
[OIDC](../oidc/oidc-integration.md)分别规定，不从旧 Provider 流程推导。

## 消费方责任

| 消费方 | 责任 |
|---|---|
| 统一认证 | 凭据验证成功后、创建 UserSession 前取得认证许可。 |
| Custom / OIDC | 首次可信主体解析后取得本次裁决；复用到该操作的投影与交付，不在末尾再次查询账号状态。 |
| Projection | `createPermittedClientSubjectProjectionService` 要求当前操作许可与主体一致；Facts 格式和主体匹配继续检查。 |
| Admin API | 管理员可信根解析后、资料及 REST/tRPC 处理前取得许可；角色、HR 范围和目标业务规则仍独立授权。 |
| 管理列表与显式撤销 | 记录查询不对目标账号授予许可，不因读取触发账号拒绝清理；管理员自身仍须认证授权。 |

已许可的 ORCAS 资料读取、管理员资料读取和 OIDC 账号查询不再通过 enabled/deleted 追加账号拒绝，
缺资料和真实查询错误仍失败。其他业务查询的状态过滤不因此全局取消。
操作许可不要求已发布权限与源表即时一致，授权交付另见[已发布 Facts](published-subject-facts-contract.md)。

## 拒绝、恢复与证据

明确账号拒绝、暂态错误的 HTTP/Cookie 映射，以及 pre-block、源事务、transition intent、publication 和 repair，
统一遵守[后端 Subject Access Barrier](../../architecture/backend-architecture.md#subject-access-barrier)。
撤销或清理失败不能把账号拒绝变成放行；不确定状态不能当普通缓存 miss 默认启用。

公开操作、真实资源和生产装配的证明范围见[架构验证归属](../../architecture/architecture-verification.md)。
当前恢复步骤见[Profile 与 Subject Access 维护](../../releases/user-profile-maintenance.md)；
历史故事与测试迁移记录不作为当前协议顺序。
