# Custom SSO 托管交付候选

本文记录 #186 的单代候选，继续使用 #184 的 Code 和 #185 的协议 Token owner。生产默认装配与过渡出口收缩由 #194
完成，代码验证不表示环境已经切换。#145 的 ORCAS 真实外部保证保持独立责任。

## 完整操作与交付

`createUnifiedCustomSsoOperations().forOperation().completeCallback` 接收 code、clientCode、redirectUrl 和可选审计上下文。
API `createRootAuthenticationComposition` 的 `customSsoAccess.managed` 注入现有 ORCAS adapter、许可内专用用户 reader、
审计和 logger；完整托管 URL 集合直接取同一个 `customSso.managedCallbackUrls`，由授权 factory 校验受信 origin。
候选正式 GET `/sso/callback` 保留 code/client/redirectUrl。请求 Host、根 Cookie 和内部读取 Secret 不成为托管认证依据。

操作取得一次当前 Client Snapshot，校验启停、所选协议及 callback 属于服务端完整托管 URL 集合，再读取原范围 Code。
原 Code 必须保持 managed 兑换方、原 callback 与当前 callback 一致、实际落地地址一致；业务 Code 不能因为配置后来改为
托管而绕过 Secret。不同 Client/原根/实例/Code ID 的状态定位隔离。已接受的实际落地地址不按后来编辑的允许列表重审。
原根、确切 ClientSession、不可变 instance 及本操作账号许可通过后，才原子消费完整已观察 Code。

只有明确 consumed 才继续专用用户读取、适用 ORCAS、Token 签发及响应构造。与旧托管路径一致，这里没有完整 Subject
消费者，不额外读取通用 Projection。ORCAS 启用时先断言已有许可，再使用 API 现有
`findOrcasUserBySubjectIdentifier`；其身份映射和 Profile reader 不重复执行 active-user 过滤。专用 ORCAS 引用不进入
通用 Projection、Token 记录或 Gateway Header。

托管和业务使用同一 Token 准备、保存、在线检查、同步 compare-delete 补偿及维护能力，purpose 分别为 managed/business，
没有额外 Gateway 凭据模型。成功审计沿用 `auth.login.local`，写入失败只记录带 request/trace 的 warning，不反转登录结果。

HTTP 在完整操作的 delivery callback 内构造独立 Response，全部 Cookie 和 Location 准备成功后才返回，避免部分 Cookie
污染失败响应。`customSsoLocalSessionCookieName(client)` 与 ORCAS Cookie 都使用 Token 返回的固定剩余秒数，保持
HttpOnly、SameSite=Lax、Path=/，沿用当前没有 Secure 属性的实际行为。最终 URL 保留 token、适用 orcasToken 和原 state；
浏览器发起关联及 URL bearer 的退役不属于本票。

## 失败、残留与重新授权

`CustomSsoManagedFailure` 分别携带原错误、Code consumption 和 tokenCompensation。HTTP 使用
`X-IAM-Code-Consumption` / `X-IAM-Token-Compensation` 返回安全状态，不返回业务兑换的实例撤销 header。
根/许可暂态仍保留 Cookie，明确无效时沿既有 Subject Access HTTP adapter 清理行为。

消费失败或未知不调用 ORCAS、不签发 Token。明确消费后，专用用户资料、ORCAS、Token 保存或响应构造失败都要求重新授权；
Code 不恢复、不重放外部成功。已知本次 Token 同步有界尽力补偿，复用 #185 的默认 1000ms 等待预算、原值与反向 ID CAS。
unknown 表示结果不确定，不能宣称 Token 已删除，也不承诺后台补齐。补偿失败的 Token 可能仍存在并可用直到其固定期限或
原会话终止；该残留被直接测试。补偿不删除共享 ClientSession，因此同根重新授权可复用原有效关系并取得新 Code。

Q38 不引入根 Cookie 匹配门槛，也不套用业务兑换失败撤销共享 ClientSession 的策略。账号许可失效自身原有 owner 的撤销
仍保留，这与托管失败策略不同。外部 ORCAS 已成功但响应丢失时，本请求不重试；只有用户重新授权形成新 Code 后才发起新
外部登录。仓库 adapter 不提供真实幂等、查询或退出能力，本票不宣称这些外部责任已完成。

## Gateway 与验证证据

`/auth/authz` 通过同一个 Token owner 接受业务或托管用途，继续以原根、原确切实例、账号许可和当前 Client 控制访问。
完整 Subject 的公开业务入口保留业务用途校验。最小 Base64 `X-User-Info` 只包含 version、subjectIdentifier 及当前允许的
username/name；稳定主体不读 Facts，权限及任职字段不进入 Header。动态配置裁剪、已发布旧资料和暂态故障行为分别验证。

API `root-authentication.integration.test.ts` 使用正式候选 HTTP router、真实 loopback HTTP/Redis 和现有 ORCAS adapter：

- 完整 callback/兑换方/地址绑定、业务配置改托管绕过尝试、缺失/坏记录、消费前后丢响应及并发唯一赢家；失败不撤共享实例。
- 可控 loopback ORCAS 服务验证真实 JSON/Set-Cookie 适配、拒绝、成功后丢响应；没有把替身结果当作真实 ORCAS 契约。
- 已知 Token 保存未知、响应构造失败、补偿成功和补偿失败残留；同根新授权、旧码拒绝及不重放外部成功。
- Cookie 实际属性、Token TTL、原 state、URL bearer、无根 Cookie及错误根 Cookie的托管成功，禁用 ORCAS 不读取专用用户。
- 当前最小 Header、只取主体时零 Facts、真实已发布旧 Facts warm 命中零 SQL、Facts/Snapshot/许可暂态、协议启停恢复、
  账号旧代拒绝、漏子索引根终止及原实例终态拒绝。

当前 Custom/API Unit、Component、Redis、API PostgreSQL 与 production composition 验证统一默认图；旧行为保护迁入正式新代测试。
其中 PG 专用用户映射证明由既有 `permitted-orcas-user.integration.test.ts` 承担；#194 默认 production composition 证明新图装配，
完整业务操作由正式 HTTP factory 测试证明。实际命令、候选 SHA、资源清理和双轴评审结果保存在 #186 评论。
完整 Gateway 部署路由、真实外部系统、最终新 OIDC 组合及父级聚合验证分别由后续 owner 交付。
