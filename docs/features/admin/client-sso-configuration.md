# Client 单协议配置与 Secret 管理

Client 在一个严格联合中选择 OIDC 或 Custom SSO，统一 ssoEnabled 表达启用意图；
业务身份、Role 归属和 Internal API 凭据独立。决策理由见
[ADR-0035](../../adr/0035-unify-user-and-client-session-lifecycles.md)、
[ADR-0038](../../adr/0038-derive-managed-sso-callback-from-redirect-origin.md)。

## 配置与安全输出

`ClientSsoConfigSchema` 拥有公开配置形状：OIDC 的认证方法由 clientType 派生；
Custom 使用 callbackType、允许落地和 subjectClaims。
managed 禁止 callbackEndpoint；business 必填固定完整地址。
不接受 mode、logoutEndpoint、第二份认证方法或跨协议字段。类型切换时隐藏控件的旧地址不得进入 managed 请求。

URL 与 redirect pattern 必须通过校验，集合按规范顺序保存。
没有配置时不能启用 SSO，Secret、credentialId 与 updatedAt 必须同时存在；
schema、数据库约束与公开出口见[共享契约](../../architecture/contracts-and-database.md)。

普通 list/detail、Admin/Runtime mapper 显式选择安全字段，只暴露 hasSsoSecret。
当前 SSO 原文、credentialId、updatedAt 仅专用存储与敏感 reader 可读，不与 Internal API secret 混用；
类型声明不能代替实际输出裁剪。

### 公开 Client 状态

匿名 `GET /open/client/status?clientCode=...` 返回统一 envelope，`data` 仅含
`clientCode`、`clientName`、`status`、可空的 `url`；不存在的 Client 返回成功响应且 `data:null`。
HTTP 输出与 OpenAPI 使用同一显式公开 DTO；数据库回源、缓存命中均裁剪到上述字段，
不输出 Internal/SSO 凭据、协议配置或扩展对象中的嵌套秘密。
SSO 登录页和维护页分别使用名称与状态；该公开读取不提供 Secret，也不替代 Internal API 认证。

## 配置操作与结果

| 操作           | 作用                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| save           | 仅修改 clientName、url、description、status 普通资料；页面未编辑的 status 不回填旧值。协议配置使用 selectProtocol。 |
| selectProtocol | 在同一事务选择协议及其完整配置；保留已有启用意图和当前凭据。                                                        |
| setEnabled     | 单独表达 SSO 启停；停用保留配置。                                                                                   |
| 删除配置       | 清配置并关闭 SSO，不等同于删除 Client 业务对象。                                                                    |
| rotateSecret   | 显式生成当前原文、随机凭据 ID 和更新时间。                                                                          |
| readSecret     | 主动读取观察到的当前凭据，提交独立审计后才交付。                                                                    |

首次选择需要 Secret 的接入且尚无凭据时，在同事务创建；普通保存/切换不轮换或清除既有凭据。
Public 和 managed 不增加外部提交 Secret 的要求。
配置和轮换只返回安全 Client 的 `{ changed, result }`；原文另经 readSecret 交付。

同行锁、比较、审计和 no-op 沿[Admin 写入规范](../../architecture/backend-architecture.md#admin-同对象写入规范)。
协议、启停及显式状态的合法 no-op 保留意图审计，纯资料 no-op 不写变更审计。
配置、状态与轮换等写操作（含合法 no-op）在提交后执行 required Snapshot 失效，同时清普通/敏感 payload。
readSecret 只读取并记审计，不执行 Snapshot 失效，不作为缓存修复。
确认提交后失效失败为 ADMIN_MUTATION_COMMITTED；Unknown COMMIT 保留原错误并保守失效一次，
明确回滚不传播，不自动重放写入。

配置、启停、协议选择和轮换本身不撤销会话或协议产物，也不要求先进入 Maintenance。
后续兑换失败的作用见[Custom SSO](../sso/custom-sso-contract.md)与[OIDC](../oidc/oidc-integration.md)。

## 删除 Client

首次删除 Client 在同一事务锁定 Client 后，检查是否存在任何未删除 Role，不区分 Enable、Pause 或 Disable。
存在依赖时返回 `409 CLIENT.HAS_ROLE`，不改变 Client、不写成功删除审计，也不执行 Snapshot 失效或会话终止。
管理员须先按既有规则处理 Role Assignment、删除 Role，再删除 Client；软删除的 Role 历史不阻断。
该检查保持跨对象普通预检边界，不新增锁或并发保证；已删除 Client 的显式重试仍按会话管理契约处理残余会话。

通过检查后，Client 删除与业务审计在同一事务提交，再执行必需的 Snapshot 失效和会话终止。
确认提交后会话终止未确认时返回 `ADMIN_MUTATION_COMMITTED`；显式重复删除允许返回 no-op 并重试残余 ClientSession。
Unknown COMMIT 只保守失效并保留原错误，不执行删除后的会话终止。
会话终止的作用边界与报告见[会话管理](session-management.md#精确撤销与未完成批次)，
传播与会话作用的人工恢复见[统一维护手册](../../releases/unified-session-maintenance.md#放流与人工恢复责任)。

## 管理权限与 Secret

REST 基础路径为 `/admin/clients-sso/{clientCode}`，详情及 /save、/protocol、/enabled，
Secret 的 /secret/rotate 和 /secret/read 使用 POST；tRPC 经 `/rpc/admin.clientSso.*` 暴露。
集中策略只授予完整管理员，HR 无权调用；详情返回各项 allowedActions，页面不自行解释角色字符串。
Secret 读取有审计写入，不作为可缓存 query。

readSecret 直接观察 PostgreSQL 当前行，在独立 UnitOfWork 提交 `admin.client.sso_secret_read` 后返回
`{ secret, credentialId, updatedAt }`，无凭据时为 null。并发轮换可能在观察后发生，
读取只代表该次观察，不保证稍后仍是最新。
读取或审计提交未确认时返回 ADMIN_CLIENT_SECRET_READ_AUDIT_FAILED，绝不交付原文；
原文和可能包含参数的 Drizzle 错误不进入审计、日志或异常 cause。
轮换使用 `admin.client.sso_secret_rotate`，只记录安全身份与变化。

页面逐次由管理员主动发起读取；响应丢失可重新读取当前值，不再次轮换。
原文仅在组件内存，可隐藏，刷新/离开后清除，不写 browser storage。
普通编辑和轮换不隐式调用原文读取。

## 页面恢复与维护

默认 Client 编辑页的 SSO 分区和独立详情复用正式 service，显示无配置、协议字段、启用意图及明确操作。
已提交、Unknown COMMIT、审计未确认、读取响应丢失和明确 4xx 分别表达；只刷新，不自动重放。

传播修复提示按 Client 存于当前 sessionStorage，与单次错误独立。
详情重读、页面 reload、后续成功/no-op/拒绝或 Secret 重读均不清除提示；
只有明确修复流程可确认恢复。失效失败窗口中旧 Secret 仍可能通过认证，数据库重读不修复缓存。
Snapshot 观察与传播契约见[Client Snapshot](../sso/client-snapshot-contract.md)。

当前传播修复见[统一维护手册](../../releases/unified-session-maintenance.md#新-snapshot-的定向修复与全量恢复)；旧配置迁移按[历史工具入口](../../development/commands.md#历史数据维护工具)恢复匹配版本流程。
权限、事务审计、敏感响应、并发读取/轮换及页面不自动重放的证明范围见
[架构验证归属](../../architecture/architecture-verification.md)。
