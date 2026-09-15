# 单协议 Client 配置候选

本文记录 [#180](https://github.com/cyy1998/shgas-iam/issues/180) 的候选实现；目标来自
[ADR-0035](../../adr/0035-unify-user-and-client-session-lifecycles.md) 和
[Spec #178](https://github.com/cyy1998/shgas-iam/issues/178)。API/Admin 默认装配已在 #194 统一接线，目标环境尚未切换。

## 存储与普通输出

`client` 新增 `sso_enabled`、`sso_config`、`sso_secret`、`sso_credential_id` 和 `sso_secret_updated_at`。
初始 migration 添加列和约束；最终收缩 migration 在旧工具 apply/verify 后删除旧双协议列，不读取旧 hash 生成原文，不猜测协议、不双写旧列。
Client ID、业务信息、Role 归属和 Internal API 凭据继续独立存在。

Contracts 拥有严格 `ClientSsoConfigSchema`：OIDC 的认证方法由 clientType 派生，Custom 只有单 callback、落地允许列表、
主体披露字段和可选 ORCAS；不接受 mode、logoutEndpoint、第二份认证方法或跨协议字段。
Domain 在写入前复用既有 redirect pattern 验证并规范化集合顺序；省略 ORCAS 与显式关闭规范化为同一值。
PostgreSQL CHECK 保护协议 shape、无配置不能启用和凭据三列同时存在；完整 URL、枚举及集合规则在正式 parser 生效。

旧普通 Admin record/list/detail 已改为显式字段集合。普通 Runtime 和 Admin mapper 也显式选字段，只有专用
内部存储 record 读取新原文和身份，普通结果只暴露 `hasSsoSecret`。实际 mapper 测试传入额外敏感字段，HTTP 测试从真实
数据库读取后验证序列化结果，类型声明不代替运行时裁剪。

## 明确操作与事务结果

默认 `createClientSsoManagement` 装配 repository、service、事务审计和共同 REST/tRPC adapter。
普通保存、选择协议与完整配置、设置 SSO 启用意图分别是 `save`、`selectProtocol`、`setEnabled`。
删除配置同时关闭启用意图；停用保留配置；直接切换保留既有启用意图和当前凭据。

所有命令在同一 PostgreSQL UnitOfWork 内锁定同一 Client 行，持锁检查、比较、写入和记审计。协议/启停及显式提交 Client
状态的 no-op 保留意图审计，纯资料 no-op 不改业务行或写变更审计。页面仅在用户明确编辑状态后提交 status，普通名称保存
不会回填页面加载时的旧状态；服务端依锁定后的当前状态处理。成功返回 `{ changed, result }`，REST 保持 envelope，tRPC 返回业务结果。
当前 service 不拥有 Session 或协议产物撤销能力，保存/状态/启停/选择不调用旧生产版本推进和会话撤销。

首次选择需要 Secret 的接入且当前原文不存在时，同事务创建一份新凭据；已有凭据从不因保存或协议切换被轮换、清除。
Public 和托管接入不新增外部 Secret 要求。托管判断由协议 owner 的 `isManagedCallback` 窄 port 注入，本票不另造 URL 分类器；
测试替身只用于配置管理验证，不能证明部署回调路由已存在。#182 已添加显式轮换和授权重读，配置及轮换结果不交付原文。

命令复用 `createAdminClientMutation`，只接入 `invalidateClient(clientCode)`：提交后 required 失效失败保留
`ADMIN_MUTATION_COMMITTED`；Unknown COMMIT 保留原错误并尝试一次保守失效；明确回滚不传播。合法 no-op 仍执行失效，
不自动重放 mutation。#181 的 `createClientSsoSnapshotManagement` 现已连接真实共同 Snapshot；
[公开能力及 PG/Redis 证据](../sso/client-snapshot-contract.md)单独记录，此处原有失效 port 替身不能证明 Redis 传播。

## 管理入口与验证边界

正式 REST 为 `/admin/clients-sso/{clientCode}` 详情及 `/save`、`/protocol`、`/enabled` POST；同一 adapter 的 tRPC
router 通过正式 `/rpc/admin.clientSso.*` 暴露。集中 policy 注册四个操作，只有既有完整管理员可访问，HR 拒绝；详情从 policy
派生 `allowedActions`，前端不解释角色字符串。

### 当前 Secret 轮换与审计重读

#182 在同一管理模块中增加 `rotateSecret` 和 `readSecret`。REST 使用 POST
`/{clientCode}/secret/rotate` 与 `/{clientCode}/secret/read`，tRPC 使用同名 mutation；读取有审计写入，不作为可缓存 query。
两项独立集中 operation 仍只授予 `iam:admin`，`iam:hr-admin` 无权调用；详情分别返回两项 `allowedActions`。
轮换始终生成当前原文、随机凭据 ID 和更新时间，复用同行锁、事务审计与共同 Snapshot 失效；不修改 Internal API 凭据。
轮换返回安全 Client 的 `{ changed, result }`，管理员主动执行独立读取才能取得原文，不自动串联重放。

读取直接观察 PostgreSQL 当前行，并在独立 UnitOfWork 中提交 `admin.client.sso_secret_read` 审计后返回
`{ secret, credentialId, updatedAt }`（无凭据时为 null）。观察后另一次并发轮换不会让读取交付历史保证；结果只代表该次观察。
读取或审计提交未确认时返回 `ADMIN_CLIENT_SECRET_READ_AUDIT_FAILED`，不交付凭据，不把驱动错误携带的参数放入异常 cause。
原文不进入审计；轮换审计 action 为 `admin.client.sso_secret_rotate`，只记录安全身份与变化。存储更新失败也不向日志转交
可能含原文参数的 Drizzle 错误。Unknown COMMIT 仍由既有 mutation wrapper 保留原结果并尝试一次保守失效。

页面明确区分轮换提交故障、Unknown、审计未确认和读取响应丢失。每次读取由管理员主动发起，响应丢失可重读当次当前值，
不再轮换。原文只保存在组件内存，可隐藏，刷新及离开页面后清除，不写入 browser storage。重读、刷新、轮换成功均不清除
已有传播修复提示；旧 Secret 在传播失败窗口内仍可能通过认证。部署切换与修复 CLI 继续归后续 owner。

真实 PostgreSQL 的正式 REST/tRPC 证明完整管理员交付、HR 拒绝、实际审计 SQL 失败无敏感响应/日志、丢弃成功响应后再读，
以及并发轮换/保存和审计回滚。真实 PG/Redis 组合证明认证缓存、成功轮换后拒绝旧值、传播失败继续认可旧值、重读不修缓存，
及 UserSession/ClientSession 身份和期限保留。新协议 Code/Token owner 尚未交付，本票不装配协议；管理服务没有撤销能力，
后续完整协议组合仍须证明其既有产物保留。Browser Integration 使用替代后端证明上述页面反馈、敏感显示和不自动重放，
不能代替后端授权或真实资源证明。

#182 的完整浏览器回归另发现两处既有组织详情测试支持失效。固定 `15c8f720` 隔离工作区复现同样失败后，
仅修正两处组织查询 mock，使每个 tRPC batch procedure 取得各自的响应；全局 fixture 与产品未改变。
组织场景同时改用可用状态按钮确认详情加载，移除对已删除顶部说明的等待，继续断言实际状态确认 Modal 警告、
409 业务拒绝和没有成功提示；HR 权限、后续管理行为、原 timeout 与零 retry 保留。

Admin 单协议页面接入默认 `/clients/:clientCode/edit` 的 SSO 分区，独立详情路由同样使用正式 service。
Browser Integration 与默认 Umi 路由使用同一正式页面；独立候选配置已删除，service 通过 `/rpc/admin.clientSso.*`。
页面展示无配置、已配置/启用、协议完整字段及明确操作。已提交/未知结果只刷新，不自动重放；传播提示按 Client 保存在
当前浏览器 sessionStorage，独立于本次操作的错误提示；后续明确拒绝、未知结果、成功、no-op、详情重读及页面 reload 均不清除。
只有后续显式修复流程可确认恢复；明确 4xx 拒绝与 Unknown COMMIT 在页面分别表达。

直接证据由 domain schema/mapper Unit、Admin API `client-sso-management.integration.test.ts` 的真实 PG/REST/tRPC、
既有 `client-mutation.integration.test.ts` 及 Admin `client-sso.spec.ts` Browser Integration 提供。PG 验证迁移、
行锁并发、事务审计回滚、no-op、实际提交后丢失确认和敏感输出；浏览器使用替代后端，不能证明真实权限或环境切换。
#180 历史结果保留；#194 的当前类型、完整 Component 与受影响 Browser 另行执行，旧页面行为保护按新单协议界面迁移。
