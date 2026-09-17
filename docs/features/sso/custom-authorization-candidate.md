# Custom SSO 单回调授权候选

本文记录 #184 的授权能力；#185/#186 已交付业务兑换、托管消费及 ORCAS adapter，#194 已完成默认生产接线与旧图收缩。
环境尚未切换。

## 授权与续接

`@iam/custom-sso` 的 `createUnifiedCustomSsoAuthorization` 拥有完整授权和认证续接操作。
`createRootAuthenticationComposition` 显式注入 `customSso` 后，将正式四种根认证与新授权 handler 接入同一个候选 router。
只有注入的新 Kernel、Client Snapshot 和 Custom 状态 namespace 被使用，没有格式探测、旧记录转换或双读双写。

每次授权取得一份统一 Snapshot，校验 Client、通行状态、SSO 启用和所选 Custom 协议；新请求按当前允许列表校验
最终 `redirectUrl`。随后从根 bearer 取得可信观察、获取本操作 Subject Access Permission，并原子 open 目标
ClientSession。有效实例复用、protocol 更新、单调延长和根期限上限由 Kernel 保证；根和旧 Code 不续期。
已经接受 Snapshot 的在途操作不在签发前重新获取配置。授权 Gate 拒绝不套用业务兑换的实例撤销规则。

未登录的 authorize 把已接受的实际落地地址、callback、兑换方和可选 state 保存为有期限的服务端续接，返回
`ssoReturn`。HttpOnly/Lax、Path `/` 的短期 `custom_sso_continuation` Cookie 绑定浏览器，页面 guard 和恢复请求同时
携带 handle；handle 本身不能取代绑定。恢复核对原 Client/落地地址/state，并重新检查当前 Gate、协议和根许可，
但不按后来编辑的允许列表重新判定原地址；当前 callbackType 与首次接受的用途不同时拒绝续接，要求重新授权。
直接进入旧形状登录页仍支持 guard；未经过 authorize 的请求尚未形成持久化的已接受授权。

SSO 页面继续使用互斥 guard 状态、超时/手动重试、迟到响应隔离和 history replacement。密码/短信完成后透传 handle；
OA/微信现有回跳 handler 同样保留可选 handle。无效续接返回 400，暂态返回 503 并保留根 Cookie；明确无效根才清 Cookie。
OIDC 浏览器绑定和首次认证完成证明由 #187 继续迁移。

实际 `redirectUrl` 支持 fragment/hash 路由，并完整绑定到 Code；调用方须将嵌套地址作为 query 参数编码。
允许列表未指定 fragment 时只按原有协议、主机、端口和路径规则匹配；指定时对规范化后的 fragment 精确匹配，
包括空 `#`，不在 fragment 内展开通配。fragment 内的 `?` 是 hash 内容；真正的 URL query 仍只在匹配通配模式时允许。
业务兑换的 `redirect_uri` 必须带上原 fragment，托管交付保留它。`callbackEndpoint` 自身的限制不变。

## callback 和 Code 所有权

按 [ADR-0038](../../adr/0038-derive-managed-sso-callback-from-redirect-origin.md)，配置的 `callbackType` 显式选择 `managed` 或 `business`，不根据 URL 判断。
managed 首次通过完整落地校验后，从规范化 `redirectUrl` 的 origin 推导根路径 `/sso/callback`，保留协议、主机和非默认端口。
落地路径/query 与旧配置 callbackEndpoint 的路径/query 不进入基础回调；business 继续使用登记的完整 callbackEndpoint。
请求 Host、Forwarded 不参与目标选择。管理员负责为每个允许的业务 origin 部署 `/sso/callback` 代理。
API 始终跳到授权结果保存的单个 callback，不增加请求侧 mode/delivery/callback。

#203 已移除 managed 配置字段：请求、持久化、普通输出和 Snapshot 均严格禁止 `callbackEndpoint`；business 继续必填。
Admin 类型切换按实际分支提交，已有 Secret 和 ORCAS 限制保持。存量配置须在维护窗口经
`client-managed-callback:upgrade` 准备与正式 migration。在线状态定向清理、Snapshot 和放流步骤已交付于
[同代保留手册](../../releases/managed-callback-origin-preserving-upgrade.md)；固定 b648 来源使用
[跨代直升手册](../../releases/b648-managed-callback-upgrade.md)。不能混跑旧消费者，目标环境尚未执行切换。

Custom owner 使用 `namespace:custom-sso:v1:` 保存 Code 与续接，Kernel 不登记协议产物。Code 是
`Code ID.UserSession ID.ClientSession ID`；随机 Code ID 无 MAC 或签名。记录保存原根和子实例 ID/不可变 instance、Client、
Custom 用途、callback/兑换方、最终落地地址/state，以及 Redis 权威时间计算的固定期限。lookup 的摘要输入同时含
Client、原根、原子实例和 Code ID，拼接另一个目标不能读到原 Code。Code 使用绝对 Redis expiry；本票没有消费墓碑。
消费及其失败撤销由 #185/#186 在此 owner 的状态边界继续实现。

## #155 本路径核对与成本边界

| 旧步骤 | 本票结果 |
|---|---|
| authorize 的独立 traffic gate 与 Runtime client 获取 | 新授权只调用一次统一 Snapshot acquisition，复用其通行和配置结论。 |
| issuer 已解析 Principal，Kernel createProtocolArtifact 再按 ID 读取 Principal | 新授权把同操作可信根观察交给 open；Code 由 Custom 保存，不再经过旧 Artifact 父读取。 |
| 新授权 redirect 校验 | 保留，属于新请求首次接受目标的边界。 |
| 续接的 redirect/配置版本重新验证 | 原实际地址、callback 和用途来自服务器已接受续接；恢复仍取得当前 Gate/协议事实。 |
| guard 与后续 authorize 的根、许可和 Snapshot | 保留，各自是独立 HTTP 操作，不能复用前一次操作许可。 |
| Credential protocol/type/client 重复判断、Subject delivery 重复 loadAcceptedClient | 不在授权路径，本票未宣称删除；#185/#186 负责后续访问和交付。 |
| 纯赋值 try/catch、消费与 Token 同步补偿 | 本票不经过这些旧兑换步骤；后票逐项核对，真实 I/O/未知结果处理继续保留。 |
| IAM 根 UserInfo 独立 Client 交付校验 | 保留 #183 的正式根消费者和测试。 |

新授权仍有根观察、Subject Access、原子 open、Redis 生命周期时间和 Code 写入；续接另有存储读取。
这里不把 JavaScript 调用次数当网络 RTT，不声称完整端点延迟收益；#71/#72/#196 的端点预算仍独立。

## 验证与后票接口

API `root-authentication.integration.test.ts` 通过候选正式 HTTP、四认证 factory、新 Kernel 和 Custom 真实 Redis 验证
已接受续接、错误浏览器绑定、配置修改、并发授权、完整 callback 分类、原实例隔离、旧 Code 期限、其他 Client 保留及
失败时 Cookie 行为。Snapshot source/外部认证出站采用已有窄 seam，不能据此宣称真实第三方系统或部署路由已验证。
SSO `login.spec.ts` 验证 guard 与授权导航透传 handle/state，同时保留既有浏览器保护。实际执行命令和候选 SHA 见 #184。

`@iam/custom-sso/testing` 仅供真实 Redis 测试的 namespace、故障注入、Code 观察与准确清理；生产消费者不导入。
后续业务和托管兑换继续在 Custom owner 内消费此 Code 状态，不把 testing 观察当成生产授权能力。
