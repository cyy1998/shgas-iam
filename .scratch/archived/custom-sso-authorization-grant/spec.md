# 深化 Custom SSO Authorization Grant 模块

## Problem Statement

IAM 的 Custom SSO 同时支持 Gateway 与 Independent 两种接入模式。两者都先验证全局登录态并签发一次性授权码，但授权码兑现后的职责不同：Independent 向目标 client 返回由 IAM 验证、撤销并关联单点退出的 credential，第三方系统再自行建立本地会话；Gateway 则由 IAM 继续建立 Gateway Local Session，并可按 client 配置绑定 ORCAS Session Identity。

当前实现没有把这一区别清楚地表达在模块 interface 中。Gateway 回调与 Independent 换码两个 use case 都先调用 `consumeAuthCode`，接收 `ProtocolArtifact`、`PrincipalSession` 和用户详情，再调用 `createLocalSession`。Gateway use case 还直接编排 ORCAS。调用方因此必须知道授权码消费必须先于 credential 创建、不同模式对应何种错误、哪些 Session Kernel 模型需要继续传递，以及 payload、审计和失败补偿发生在什么顺序。

这一形状既泄漏了 Session Kernel 的实现模型，也把 Independent credential 错称为第三方本地会话。删除当前 adapter 后，授权码重放防护、PrincipalSession 解析、client binding、credential 签发、Redis payload、ORCAS、审计和补偿规则会散落回多个调用方，说明这些行为应由一个更深的 Custom SSO 模块拥有。

修复需要保留现有 HTTP contract、Cookie、错误码、Redis 数据兼容、Independent `sid` 生命周期和单点退出能力，同时让 Gateway 作为 Authorization Grant 流程的扩展被准确表达。共同的 grant resolution 必须成为模块内部 seam，不能通过新的公共中间对象重新泄漏给 use case。

## Solution

深化现有 Custom SSO Session Kernel adapter，使其通过 consumer-owned ports 暴露三个调用方目标：签发 Authorization Code、兑现 Independent Authorization Grant、完成 Gateway Login。三个操作分别服务 `/sso/authorize`、`/sso/token` 和 `/sso/callback`，调用方只获得其所需的最终结果。

模块内部以私有 `resolveAuthorizationGrant` 统一消费一次性 code、验证协议与 client 元数据、解析有效 PrincipalSession、检查实时用户状态并加载用户详情。该私有结果可以包含 Session Kernel 模型，但不得越过模块 interface。

Independent 分支基于 resolved grant 签发 IAM 管理的 Independent Client Credential，保留现有 `sid`、TTL、user-info、验证、撤销和 logout notification 语义。该 credential 只是第三方建立本地会话时使用的 IAM 授予结果，不代表 IAM 已替第三方建立本地会话。

Gateway 分支复用相同的私有 grant resolution，随后按 client 配置完成 ORCAS 登录，并建立 IAM 托管的 Gateway Local Session。ORCAS identity、binding、credential、payload、审计和失败补偿全部留在模块 implementation 内。Gateway 不调用公开的 Independent 操作，避免产生 Independent 特有的 side effect 或重新暴露中间 grant。

Endpoint use case 继续拥有入口级 client 查询、client secret 校验和 redirect allowlist 校验。Route handler 继续负责 HTTP 参数、Cookie、redirect 和 response envelope。Composition 直接把现有 production adapter 注入三个 consumer-owned ports，不增加空转 wrapper。

## User Stories

1. 作为 IAM 用户，我希望 Gateway 与 Independent 登录都从同一套一次性授权码规则开始，以便两种接入模式具有一致的重放保护。
2. 作为 IAM 用户，我希望授权码只能被兑现一次，以便截获或重复提交的 code 不能创建额外 credential。
3. 作为 IAM 用户，我希望已失效的 PrincipalSession 不能继续兑现授权码，以便退出或禁用后的身份不会重新获得 client 访问权。
4. 作为 IAM 用户，我希望账号失效后已有授权码也不能被兑现，以便实时账号状态优先于旧的授权快照。
5. 作为 Independent client，我希望通过 code 获得 IAM 可验证的 `sid`、剩余有效期和用户信息，以便我的后端能够安全建立自己的本地会话。
6. 作为 Independent client，我希望 `sid` 保持可撤销，以便 IAM 全局退出能够终止与该授予关联的访问。
7. 作为 Independent client，我希望 `sid` 能继续用于 IAM 的 user-info 能力，以便现有集成无需改变。
8. 作为 Independent client，我希望 IAM 在全局退出时继续向已配置的 logout endpoint 发送关联通知，以便我能删除自己的本地会话。
9. 作为 Independent client，我希望 IAM 不声称已经替我建立第三方本地会话，以便双方的会话所有权清晰。
10. 作为 Independent client 开发者，我希望 `sid`、`ttl` 和 `userInfo` 的外部响应保持不变，以便本次架构修复不要求联调改造。
11. 作为 Independent client 开发者，我希望错误的 client secret 在 code 被消费前被拒绝，以便未认证调用者不能烧毁合法授权码。
12. 作为 Independent client 开发者，我希望非法、过期或重放的 code 继续得到既有错误，以便现有错误处理逻辑保持兼容。
13. 作为 Gateway client，我希望 IAM 在兑现 code 后建立可验证的 Gateway Local Session，以便网关能够继续使用现有 token 和 Cookie。
14. 作为 Gateway client，我希望 local session 只属于签发 code 时指定的 client，以便 credential 不能跨 client 使用。
15. 作为 Gateway client，我希望 callback 中的 redirect 必须与授权时的 redirect 一致，以便 code 不能被转移到其他回跳地址。
16. 作为 Gateway client，我希望 redirect allowlist 在 code 被消费前完成校验，以便非法回跳请求不会烧毁合法授权码。
17. 作为需要 ORCAS 的 Gateway client，我希望 IAM 在 local session 中绑定本次 ORCAS Session Identity，以便后续读取能够获得正确的 ORCAS user ID。
18. 作为不需要 ORCAS 的 Gateway client，我希望登录流程不调用 ORCAS，以便普通 client 不承担外部集成延迟和故障。
19. 作为 Gateway client，我希望 ORCAS 登录失败时不返回 Gateway token，以便不存在半成功的可见登录结果。
20. 作为 Gateway client，我希望 private payload 写入失败时不返回 token，并撤销已创建的 binding，以便不可恢复的 session 不会继续存活。
21. 作为 Gateway client 开发者，我希望 callback 返回的 token、ORCAS Cookie 和 redirect query 保持不变，以便现有网关配置无需调整。
22. 作为安全维护者，我希望授权码消费、PrincipalSession 解析和 credential 签发规则只存在于一个模块，以便修复一次即可覆盖两种模式。
23. 作为安全维护者，我希望 Gateway 是共同 Authorization Grant 流程的扩展，而不是对 Independent endpoint 的公共方法复用，以便模式特有 side effect 不会串线。
24. 作为安全维护者，我希望 Session Kernel 的 `ProtocolArtifact` 和 `PrincipalSession` 不出现在 use case interface 中，以便协议内核模型不能成为应用层契约。
25. 作为安全维护者，我希望 mode 和错误映射由模块操作本身决定，以便调用方不能组合出不受支持的流程。
26. 作为审计维护者，我希望 Independent credential 与 Gateway Local Session 的成功事件继续携带 client、management level 和 request context，以便现有审计查询保持完整。
27. 作为运维人员，我希望现有 Redis key、credential discriminator 和 payload 兼容性保持不变，以便部署不需要清理或迁移活跃会话。
28. 作为运维人员，我希望授权码兑换开始后的下游失败仍要求重新发起授权，以便一次性 code 语义不因重构改变。
29. 作为运维人员，我希望现有日志和错误码保持可识别，以便告警、排障和调用方重试策略不被意外改变。
30. 作为后端维护者，我希望 authorize、token exchange 和 callback use case 各依赖一个语义操作，以便调用方只需理解自己的目标。
31. 作为后端维护者，我希望 client 查询、secret 校验和 redirect 校验继续留在 endpoint use case，以便入口认证在任何状态变更前完成。
32. 作为后端维护者，我希望 ORCAS adapter 在 Custom SSO 模块 composition 中注入，以便 Gateway use case 不再拥有外部会话编排。
33. 作为后端维护者，我希望 production adapter 通过 structural typing 满足 consumer-owned ports，以便不引入无行为 wrapper。
34. 作为测试维护者，我希望通过深化后的模块 interface 测试 credential 与 session 的最终行为，以便内部 helper 或 Session Kernel 调用顺序调整时测试仍然有效。
35. 作为测试维护者，我希望 Independent 测试只断言 IAM credential 生命周期，而不伪造第三方本地会话，以便测试准确表达系统所有权。
36. 作为测试维护者，我希望 Gateway 测试覆盖 grant resolution 后的 ORCAS 与 local session 扩展，以便超集行为得到独立验证。
37. 作为测试维护者，我希望 use-case 测试只覆盖入口验证、一次委托和结果映射，以便不重复模块内部行为矩阵。
38. 作为架构维护者，我希望自动化守卫阻止 use case 重新导入 Session Kernel 模型或恢复两阶段接口，以便候选问题 03 不会回归。
39. 作为领域模型维护者，我希望 Authorization Grant、Independent Client Credential 与 Gateway Local Session 有稳定定义，以便文档、代码和测试使用相同语言。
40. 作为第三方集成维护者，我希望对接文档明确第三方本地会话不属于 IAM，以便新的 Independent 集成不会误解 `sid` 的所有权。

## Implementation Decisions

- 根领域词汇表新增 `Custom SSO Authorization Grant`、`Independent Client Credential` 和 `Gateway Local Session`。Independent credential 是 IAM 管理的授予凭证，不是第三方系统本地会话。
- Gateway 是整个 Authorization Grant 协议路径的超集，但不是 Independent endpoint implementation 的直接超集。Gateway 与 Independent 共享私有 grant resolution，不通过公开 Independent 操作相互调用。
- 现有 Custom SSO Session Kernel adapter 继续作为 production implementation，不新增第二个顶层业务模块，也不拆出会泄漏 resolved grant 的公共模块 seam。
- Authorize use case 的 consumer-owned port 暴露 `issueAuthorizationCode`。该操作接收已验证的 client code、redirect、PrincipalSession bearer 与来源，返回 code 或未登录结果。
- Independent exchange use case 的 consumer-owned port 暴露 `redeemIndependentGrant`。该操作接收已验证 client、code 和可选 request context，返回 IAM credential、剩余秒数和用户详情。
- Gateway callback use case 的 consumer-owned port 暴露 `completeGatewayLogin`。该操作接收已验证 client、code、redirect 和可选 request context，返回 Gateway local session token 与可选 ORCAS session ID。
- 不提供通用的 `completeSession(mode, ...)`、`invalidCodeError` 参数或公开 `completeIndependentSession`。稳定的模式差异由操作名称、输入和结果表达。
- `resolveAuthorizationGrant` 是 implementation 内部 seam，负责一次性消费 code、校验 Custom SSO protocol 与 artifact type、校验 client/redirect metadata、解析 PrincipalSession、检查实时用户并取得用户详情。
- `ResolvedAuthorizationGrant`、`ProtocolArtifact`、`PrincipalSession` 和 ORCAS context 都是私有 implementation 类型，不得进入 use case、route 或 consumer-owned port。
- Independent finalization 继续创建 IAM 可验证和可撤销的 client credential，持久化 logout 关联所需 payload，并返回 credential、TTL 与用户详情。Use case 将其映射为现有 `sid`、`ttl` 和 `userInfo`。
- Gateway finalization 在 resolved grant 之后按 client 的 `requireOrcas` 配置调用 ORCAS，再创建 Gateway client binding、credential 和 payload。Use case 将 local session token 映射为现有 `token`。
- 两个分支可以在 implementation 内共享 credential 签发与 payload 持久化逻辑，但 management level、logout endpoint、ORCAS context 和错误策略不得暴露给调用方。
- Client 不存在、client secret 错误和 redirect allowlist 不匹配必须在调用模块前被 use case 拒绝。Module 仍验证授权码绑定的 client 和 Gateway redirect metadata。
- 授权码在 grant resolution 开始时消费。ORCAS、credential、payload 或审计随后失败时，原 code 仍不可重试，调用方必须重新发起授权。
- 保留 credential 或 payload 创建失败时现有的 binding 撤销补偿。ORCAS 失败发生在 Gateway credential 创建前，不返回 Gateway token。
- 审计仍是同步最后一步，本次不改变 audit action、审计失败传播或新增审计失败回滚。
- ORCAS production adapter 改由 Custom SSO 模块 composition 注入，Gateway use case 不再拥有 ORCAS port。
- Route handler 继续负责 query/headers、response envelope、Gateway Cookie、ORCAS Cookie、redirect query 与 302；这些 HTTP 细节不进入 Custom SSO 模块。
- Production adapter 通过 TypeScript structural typing 直接满足三个 consumer-owned ports。Port contract test 固定兼容性，不增加空转 adapter、unchecked assertion 或 provider-owned port import。
- Architecture guard 阻止相关 use case 和 route 导入 Session Kernel 模型，并阻止 Gateway/Independent completion use case 重新出现公开的 `consumeAuthCode` 与 `createLocalSession` 两阶段接口。
- Replace-don't-layer：新操作覆盖行为后删除旧的公开两阶段方法、重复 consumed-code 类型和仅断言内部调用顺序的测试，不保留 compatibility wrapper。
- 保留现有 HTTP 路径、请求参数、响应字段、Cookie 名称、错误码、Redis key、credential discriminator、payload version 和 active session 数据兼容。
- 现有持久化名称中包含 `local_session` 的兼容标识本次不迁移；领域文档和新 interface 使用准确术语，持久化命名迁移如有需要另立 feature。
- 当前 SSO 对接文档更新 Independent credential 与第三方本地会话的区别，并保留 `sid` 的 user-info、logout 和 notification 用法。
- 后端架构文档记录 Custom SSO seam 的职责分配：use case 拥有入口验证，深模块拥有 grant/session 生命周期，route 拥有 HTTP 适配。
- 本次决策可通过内部 interface 演进安全回退，不满足新增 ADR 的必要条件；领域语言进入词汇表，feature 约束由本 spec 维护。

## Testing Decisions

- 好的测试穿过调用方可见的最高 module interface，只断言 Authorization Code、Independent Client Credential 或 Gateway Local Session 的可观察结果，不断言私有 helper、Session Kernel 调用次数、`ProtocolArtifact` 内容或内部步骤数组。
- Custom SSO adapter 的三个 consumer-owned 操作是核心测试 seams。真实 Session Kernel 与进程内 Redis fake 组成 hermetic 普通测试；ORCAS、审计、时钟和用户查询通过注入的确定性 adapter 控制。
- `issueAuthorizationCode` 测试覆盖无 PrincipalSession 时返回未登录、有效 PrincipalSession 时生成 code、code 绑定 client 与 redirect，以及 legacy bearer 来源日志不泄漏 bearer 值。
- `redeemIndependentGrant` 测试覆盖成功返回 IAM credential、正 TTL 和用户详情；返回 credential 可由现有 IAM credential 解析路径验证。
- Independent 测试覆盖 code 只能兑现一次、PrincipalSession 已撤销、用户已失效、payload 写失败、client metadata 不匹配和审计 request context。
- Independent 测试覆盖 credential 撤销与全局 logout 关联，并保留 logout endpoint notification 行为；测试不模拟或断言第三方内部 Cookie、数据库或本地 session。
- `completeGatewayLogin` 测试覆盖不需要 ORCAS 的成功路径、需要 ORCAS 的成功路径、ORCAS identity 能从 Gateway local session context 读取，以及用户 DTO 不混入 ORCAS 属性。
- Gateway 测试覆盖 ORCAS 失败不返回 token、payload 写失败不返回 token、失败后 code 不能重放，以及既有 binding 撤销补偿。
- 两个分支测试都通过最终 credential/session 或公开解析操作观察结果；仅在验证既有兼容 key 未重新出现等架构约束时检查存储命名。
- Authorize use-case 测试只覆盖 client 存在性、redirect allowlist、调用 `issueAuthorizationCode` 的输入和结果透传。
- Independent use-case 测试只覆盖 client secret 在 code 消费前校验、对 `redeemIndependentGrant` 的一次委托，以及 credential/TTL/user 到 `sid`/`ttl`/`userInfo` 的映射。
- Gateway use-case 测试只覆盖 client 与 redirect 在 code 消费前校验、对 `completeGatewayLogin` 的一次委托，以及 local session token/ORCAS ID 的结果映射。
- 删除 use-case 层 `consume → ORCAS → createLocalSession` 顺序测试；该顺序成为模块 implementation，可通过最终结果和失败行为覆盖。
- Route handler 测试继续覆盖 Gateway local session Cookie、ORCAS Cookie、redirect query、Independent response envelope 和错误传播，不复制 grant/session 生命周期矩阵。
- Port contract 测试在类型检查阶段证明 production adapter 同时满足三个 consumer-owned ports。
- Architecture 测试扫描 production use-case/route import 与源码模式，拒绝 Session Kernel 模型泄漏和公开两阶段 completion 接口回归。
- 普通测试不得连接开发 Redis、真实 ORCAS 或其他外部服务；所有相关场景属于进程内、可缓存的 `test` 通道。
- 由于本 feature 会改变 production composition，先为 `@iam/api` 建立独立的 `test:smoke` 通道：通过真实 API 入口解析测试环境、构造 production composition，并以 HTTP readiness probe 验证进程可启动。Smoke 使用隔离端口、不可达的占位外部端点和有界进程清理，不连接真实数据库、Redis 或 ORCAS；普通测试与 smoke 收集保持互斥。
- 聚焦实现验证包括受影响的 Custom SSO module、use-case、route、audit 和 architecture tests，以及 `@iam/api` 的 lint 与 typecheck。
- 文档变化运行文档检查；每个 ticket 提交前运行 whitespace check。准备 merge 时在最终实现上按仓库工作流运行一次完整验证。

## Out of Scope

- 删除 Independent `sid`、把 `/sso/token` 改为只返回一次性用户数据，或取消 IAM 对 Independent credential 的验证和撤销。
- 由 IAM 建立、存储或管理第三方系统自己的本地会话、Cookie 或业务系统 session database。
- 修改 `/sso/authorize`、`/sso/token`、`/sso/callback`、`/public/user-info`、`/sso/logout` 或 `/auth/authz` 的外部路径与 HTTP schema。
- 修改现有 `sid`、`ttl`、`userInfo`、`token`、ORCAS query/Cookie 或 response envelope。
- 修改 Session Kernel 的 token 格式、artifact tombstone、binding、credential、revoke 或 cleanup 核心语义。
- 允许 ORCAS、Redis 或审计失败后重用已消费的授权码，或引入 code reservation/commit 两阶段协议。
- 新增 ORCAS logout、ORCAS session 回滚或其他当前 ORCAS integration 不支持的补偿能力。
- 改变 audit action、日志事件 taxonomy、审计失败回滚或历史审计查询契约。
- 修改现有 Redis key、payload version、credential discriminator，或迁移、清理和 backfill 活跃会话数据。
- 修改 client 数据库 schema、management level 枚举、ORCAS 配置或 logout endpoint contract。
- 对 OA、WeChat、密码、手机号登录的 PrincipalSession 创建流程做一般性重构。
- 重命名整个 production adapter、composition services 聚合或与本 feature 无关的 session resolution 方法。
- 处理架构评审报告中的其他候选问题。
- 引入 production 双写、shadow flow、compatibility wrapper 或旧新实现遥测比对。
- 建立依赖真实数据库、Redis、ORCAS 或其他外部服务的 Custom SSO 端到端测试；本次新增的 API smoke 只验证真实入口与 production composition 能启动并响应 readiness probe。
- 新建 ADR；若后续决定改变 Independent 外部协议或持久化模型，应单独评估 ADR 与迁移方案。

## Further Notes

- Gateway 是 Authorization Grant 协议路径的超集，不表示 `completeGatewayLogin` 应调用 `redeemIndependentGrant`。公共操作代表不同调用方目标，复用发生在私有 grant resolution 和 credential implementation 中。
- Independent `sid` 的 IAM 生命周期是已确认的兼容要求。第三方可以把它映射为自己的 session，也可以按现有契约直接使用，但第三方本地会话始终由第三方拥有。
- 设计阶段已验证当前实现确实由两个 use case 分别公开 `consumeAuthCode` 与 `createLocalSession`，并直接携带 Session Kernel 模型；ORCAS 仍由 Gateway use case 编排。
- 设计阶段相关基线测试共 21 项通过，覆盖现有 use-case、handler 和 Session Kernel consistency 行为。实现应替换浅层测试而不是在其上重复叠加。
- Current testing architecture 要求 substantive production composition 变更具备真实进程 smoke；因此 smoke prefactor 是后续 Gateway composition 改造的前置交付，而不是 Custom SSO 行为测试的替代品。
- 本 feature 来源于架构审查候选问题 03“隐藏自定义 SSO 会话编排”，但本 spec 与当前代码、Current 文档及已确认领域语言共同构成实现事实来源。
