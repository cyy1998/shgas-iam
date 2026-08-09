# 收缩 Custom SSO / OIDC Interface 并退役迁移残留

## Problem Statement

Custom SSO 与 OIDC 的核心生命周期已经完成收窄，但代码中仍保留了一批不再承载生产行为的迁移残留和过宽
Interface。OIDC 仍存在无生产调用的 legacy Global Session resolver、数据库 `userId` 驱动的旧 account lookup、重复或
未读的 session view 字段，以及仅为测试暴露的 binding 写入口。Custom SSO session adapter 也把内部 context resolver 和
dead revoke alias 暴露给 composition 与测试，导致测试绕过真实生产 Interface。

旧 OIDC Access Token user/client/global-session index 已不再由当前 runtime 写入或作为撤销事实来源，但其注册、按旧 index
撤销和 worker wiring 仍留在 runtime Module 中。与此同时，顶层 OIDC composition 把完整内部 object graph 返回给唯一入口，
尽管入口只需要启动 server、记录日志和关闭资源。这些残留没有扩展用户能力，却增加了维护者必须理解的 Interface、过时状态
模型和错误的测试 seam，并给未来实现制造“这些字段和方法是否仍有语义”的歧义。

清理不能破坏仍然有效的 OIDC Provider Session、OIDC Client Binding、Claims Snapshot、Session Kernel credential/token、
Custom SSO Grant/Credential 或 legacy Redis cleanup 运维能力。特别是，删除短期 staged payload 的 `userId` 会改变滚动部署
兼容性；删除旧 token-index runtime 能力也不能被误解为生产 Redis 已经完成 inventory 或 cleanup。

## Solution

完整退役 legacy Global Session resolver 与 shared legacy envelope/version contract，同时保留当前 `global_session` Cookie、
Principal Session 解析和 reauthentication 行为。OIDC session-facing view 只保留授权、Claims Snapshot、anchor 与 CAS 真正读取的
字段；删除未读的 external token、数据库 `userId` 和重复 session identifier，并从短期 staged binding payload 中同步删除仅被
机械传递的 `userId`。

收窄 Custom SSO 与 OIDC adapter 的生产 Interface。Custom SSO context resolver 留在 Module 实现内部，测试改从
`resolvePublicAuthentication` 等真实 consumer-owned Interface 观察结果；dead revoke alias 直接删除。OIDC 不再为测试返回
直接 `bind` 能力，测试通过真实 `stage → consumeStaged` 流程准备 committed binding；claims adapter 删除无调用的 binding
read wrapper。

删除旧 OIDC user/client/global-session token-index 的 runtime 注册、按 index 撤销、metadata 和 worker dependency。继续保留当前
仍需的单 token provider-payload 删除能力，以及 legacy cleanup 命令、受控 allowlist、测试和 runbook。实际环境的旧实例 drain、
Redis inventory、维护窗口 cleanup、回滚策略和发布授权仍由 Release Operations 单独完成。

顶层 OIDC composition 的返回 Interface 收缩为 `{ server, logger, shutdown }`。repositories、stores、session、security、provider
runtime、interactions 与 workers 均留在 composition 实现内部，不再成为调用方可见 object graph。

## User Stories

1. 作为 IAM 用户，我希望 Custom SSO 与 OIDC 登录行为保持不变，以便内部简化不会中断业务系统访问。
2. 作为 OIDC relying party，我希望 Authorization Code、Token、UserInfo 与 logout contract 保持不变，以便 client 无需适配本次清理。
3. 作为 Custom SSO client，我希望 Grant、Credential、Gateway Local Session 与主体交付语义保持不变，以便既有集成继续工作。
4. 作为 IAM 用户，我希望账号禁用、删除和 Session Revocation 继续使派生访问失效，以便清理旧代码不会削弱安全边界。
5. 作为安全维护者，我希望 OIDC Claims Snapshot 继续绑定正确的 Subject Identifier、client、Provider Session 和配置版本，以便声明不能被跨主体或跨 client 重放。
6. 作为安全维护者，我希望 OIDC Client Binding 的 anchor、generation、mapping owner 与 CAS 规则保持不变，以便并发授权仍然 fail closed。
7. 作为 IAM 维护者，我希望 legacy Global Session resolver 被删除，以便代码不再暗示生产仍读取旧 envelope。
8. 作为 IAM 维护者，我希望 shared legacy Global Session envelope/version contract 被明确退役，以便 workspace 不再传播已失效的状态模型。
9. 作为 IAM 维护者，我希望旧数据库 `userId` account lookup 被删除，以便 OIDC 当前路径只按 Subject Identifier 解析账号。
10. 作为 IAM 维护者，我希望当前 `global_session` Cookie 与 Principal Session 解析保留，以便“删除 legacy resolver”不会误删真实认证入口。
11. 作为 IAM 维护者，我希望 resolved session view 不再暴露调用方不读取的 external token，以便 bearer 值不会无意义地穿过内部 Interface。
12. 作为 IAM 维护者，我希望 OIDC view 不再携带数据库 `userId`，以便协议生命周期不泄漏 IAM 数据库主键。
13. 作为 IAM 维护者，我希望 Provider Session binding 不再重复携带等同于 Principal Session reference 的 global session identifier，以便 session identity 只有一个清晰来源。
14. 作为 IAM 维护者，我希望 staged binding payload 不再机械传递 `userId`，以便短期 Redis wire 与最终 Interface 保持最小一致。
15. 作为发布工程师，我希望 staged payload 变化有明确的 rollout 约束，以便新旧 OIDC 实例不会因 schema 不兼容而混读失败。
16. 作为发布工程师，我希望可以停止新授权并等待最长 staged TTL，或统一切换所有实例，以便 rollout 不需要永久双读兼容层。
17. 作为 Custom SSO 维护者，我希望 session adapter 只暴露真实生产 consumer 使用的方法，以便 Interface 与运行时能力一致。
18. 作为 Custom SSO 维护者，我希望 context resolver 留在 Module 内部，以便调用方不需要理解认证上下文的组装细节。
19. 作为 Custom SSO 测试维护者，我希望通过 `resolvePublicAuthentication` 观察 Authenticated Subject Context，以便测试不会绕过生产认证流程。
20. 作为 IAM 维护者，我希望 dead session revoke alias 被删除，以便禁用账号时只有当前 Session Kernel revoke path。
21. 作为 OIDC 维护者，我希望 production adapter 不再暴露仅用于测试 seed 的直接 binding 写入口，以便测试需求不会扩大生产 Interface。
22. 作为 OIDC 测试维护者，我希望用真实 staged binding 生命周期准备测试状态，以便测试覆盖与生产相同的 publish path。
23. 作为 OIDC 维护者，我希望 claims adapter 不再返回无调用的 binding read wrapper，以便 Claims Snapshot 校验只使用其 consumer-owned port。
24. 作为 IAM 维护者，我希望旧 token index 不再被误认为当前撤销事实来源，以便 runtime 状态模型与 Session Kernel 实际行为一致。
25. 作为安全维护者，我希望 Access Token 继续由当前 Session Kernel credential/index 生命周期管理，以便删除旧 index 不会留下不可撤销 token。
26. 作为 OIDC 维护者，我希望单 token provider-payload 删除能力保留，以便 adapter destroy、grant cleanup 和 client protocol cleanup 仍能删除 provider object。
27. 作为 OIDC 维护者，我希望 client invalidation 不再注入旧 token-index store，以便 worker 只协调当前 binding/credential 与 protocol-object owner。
28. 作为 on-call 工程师，我希望 legacy cleanup 命令与 allowlist 保留，以便仍可安全 inventory 和删除实际 Redis 残留。
29. 作为 on-call 工程师，我希望 cleanup 工具继续拒绝超出 allowlist 的 key，以便 runtime 简化不会扩大运维删除范围。
30. 作为发布工程师，我希望代码清理与生产 Redis cleanup 被明确区分，以便合并代码不会被误报为环境迁移完成。
31. 作为发布工程师，我希望旧实例、scheduler、sidecar 和旧镜像在 cleanup 前完成 drain，以便它们不会重新写入或依赖旧 index。
32. 作为发布工程师，我希望回滚策略在 cleanup 前确定，以便需要恢复旧镜像时不会依赖已删除的 legacy index。
33. 作为 OIDC 维护者，我希望顶层 composition 只返回启动、日志和关闭所需能力，以便内部 object graph 不成为隐式 contract。
34. 作为 OIDC 维护者，我希望 repositories、stores、session、security、provider runtime、interactions 和 workers 留在 composition 实现内部，以便内部重构具有更好的 locality。
35. 作为测试维护者，我希望下层 Module 通过自己的 Interface 测试，以便无需顶层 composition 暴露内部对象来获得覆盖。
36. 作为测试维护者，我希望删除 internal helper 直调测试，而保留可观察认证、binding、token 和 cleanup 行为，以便测试能够承受内部重构。
37. 作为安全审查者，我希望现有 Subject Access、client 配置版本、Claims Snapshot 与 token ownership 失败路径继续有自动化覆盖，以便 Interface 收缩不会产生授权回归。
38. 作为架构维护者，我希望 Current 架构文档反映收缩后的 composition 与 invalidation dependency，以便文档不再描述已删除 wiring。
39. 作为未来实现 agent，我希望 breaking contract、rollout 约束、测试 seam 和运维排除项写入同一份 spec，以便无需重新打开已解决决策。
40. 作为维护者，我希望这次清理不引入数据库 schema、协议 contract 或新领域概念，以便变更保持为聚焦的 Interface 简化。

## Implementation Decisions

- 完整删除 legacy Global Session resolver、其私有 envelope/user/store/reader 类型和旧数据库 ID account lookup。
- 同时删除 shared contracts 中无仓内消费者的 legacy Global Session envelope 与 version export。这是一次明确接受的 internal shared-contract breaking cleanup；不提供 deprecated alias 或兼容 re-export。
- 保留当前 `global_session` Cookie 读取、Principal Session lookup、reauthentication policy 和 active resolved-session abstraction；不得把“Global Session legacy cleanup”扩大为删除现行登录入口。
- 当前 OIDC account resolution 继续使用 Subject Identifier。数据库 `userId` 不进入协议 session view、Provider Session binding 或 staged binding payload。
- Resolved session view 删除未读的 external token 与数据库 `userId`；Provider Session binding view 删除未读的数据库 `userId` 和重复 global session identifier。
- Staged Provider Session binding 同步删除 `userId`。`accountId`、Principal Session reference、authorization attempt、client、Provider Session UID、配置版本、有效期和 CAS ownership 字段保持不变。
- Staged payload 的 Redis TTL 不超过 60 秒。发布不得长期混跑要求旧字段的旧 reader 与不再写该字段的新 writer；采用统一实例切换，或先停止新授权并等待所有旧 pending payload 过期。
- Custom SSO session Module 的外部 Interface 只保留生产 consumer-owned ports 实际使用的认证、Principal Session 创建、Authorization Grant/Code、Gateway/Independent completion 与 logout 能力。
- Custom SSO 的 Principal、Independent Credential 与 Gateway Local Session context resolver 继续作为私有 implementation helpers，不再通过 factory result 暴露。
- 删除无任何调用方的 lazy user-session revoke alias；账号禁用/删除继续走当前 Subject Access lifecycle 与 Session Kernel session revocation path。
- OIDC session Module 不再返回直接 `bind` 方法。生产继续使用 staged publication、consume、silent ensure、anchor 与 mapping-owner flow。
- 需要 committed binding 的测试使用 test-local `stage → consumeStaged` seed helper；该 helper 不是 production Interface，也不新增可导出的 test port。
- OIDC claims Module 删除无调用的 binding read wrapper。Claims Snapshot validation 继续直接依赖 consumer-owned Provider Session binding read port。
- 删除旧 OIDC user/client/global-session token-index 的 key builders、metadata、注册脚本、按 index revoke helpers 和 barrel exports。
- Token store 收缩为当前仍需的单 token provider-payload 删除能力；不得删除 Session Kernel credential/token lifecycle 使用的 external token、lookup hash 或 current indexes。
- Client invalidation worker 删除旧 token-index store dependency。它继续执行 OIDC client protocol revocation和 protocol-object cleanup，不弱化 client-specific invalidation。
- Legacy cleanup Module、命令、受控 allowlist、hermetic 测试、真实 Redis 测试和 Current runbook 保留。旧 index membership 的 inventory/hygiene 只由该运维链路处理。
- 仓内代码删除不证明任何环境的 Redis inventory 为零。生产旧实例 drain、Redis dry-run/review/apply/verify、全量 session/token 影响、client owner smoke 和回滚策略仍是 Release Operations 前置条件。
- 顶层 OIDC composition 返回 Interface 固定收缩为 `{ server, logger, shutdown }`。其他构造结果仅作为 composition implementation 局部值传递。
- OIDC runtime 入口继续只负责 server listen、启动日志、signal/error shutdown。不得为测试或未来假设调用方保留完整 object graph。
- 本 feature 不修改数据库 schema、外部 HTTP contract、Custom SSO Wire Contract、OIDC discovery/claims/token contract 或领域术语。
- ADR-0008 与 ADR-0010 的 Client Subject Projection、OIDC Claims Snapshot、OIDC Client Binding 与 lifecycle 决策保持权威；本次只删除不再支撑这些决策的迁移残留和 Interface 泄漏。
- 本次决定不满足新增 ADR 的三个条件；实现时同步更新受影响的 Current backend architecture 与 OIDC migration/runtime 描述即可。

## Testing Decisions

- 好测试只通过已确认的 Module Interface 观察外部行为：认证结果、Authenticated Subject Context、binding 生命周期、Claims Snapshot、token 解析/撤销、client invalidation、server startup/shutdown 和 cleanup summary。测试不直接调用 private helper，也不因实现函数移动而失败。
- Custom SSO 的最高测试 seam 是生产 `resolvePublicAuthentication` 与既有 final-operation consumer ports。原先直接调用 context resolver 的断言迁移为从认证结果读取最小 Authenticated Subject Context；Grant、Credential 和 logout 行为继续通过各自公开 use-case Interface 测试。
- 既有 Custom SSO session adapter component integration tests 是 prior art。迁移时保留 Principal、Independent、Gateway、ORCAS 与错误映射覆盖，删除仅证明 internal helper 可调用的测试。
- OIDC binding 的最高业务 seam 是 interaction/authorization lifecycle。需要预置 binding 时，测试 setup 使用 `stage → consumeStaged` test-local helper；行为断言仍通过 read、ensure、Claims Snapshot、token 或 invalidation Interface 完成。
- 既有 provider-session binding、authorization lifecycle、subject-access session adapter 与 token-flow component integration tests 是 prior art。测试 fixture 删除冗余字段，但不以“字段不存在”替代真实行为断言。
- OIDC provider-session state Redis contract 是 staged wire、anchor、lookup、generation membership 与 CAS 的必要窄 seam。它应证明删除 staged `userId` 后 stage/claim/consume、TTL、owner comparison、publish confirmation 与 cleanup fence 保持正确。
- Rollout compatibility 通过 schema/fixture contract 与明确发布约束验证，不开发永久双读。若测试 mixed-version payload，重点证明新 reader 可忽略旧 payload 的额外 `userId`，并记录旧 reader 不能接受新 payload，因此必须 drain/等待 TTL。
- Shared legacy contract 删除以全仓 import 搜索、affected workspace typecheck/build 和 contract barrel coverage验证；不为已删除的 envelope 保留 tautological shape snapshot。
- OIDC Redis adapter/token lifecycle tests 必须继续证明 Access Token 由当前 Session Kernel 路径注册和解析，且正常 upsert 不创建旧 `oidc:*‑tokens:*` sorted sets。
- Client invalidation tests必须证明删除 token-index dependency 后，OIDC Client Binding、current credential/token 与 provider protocol objects 仍按 client 被撤销，并且其他 client 生命周期不受影响。
- 单 token provider-payload 删除通过现有 Redis adapter destroy、grant cleanup 和 revoke-client-protocol-object 行为测试，而不是重新暴露旧 index Interface。
- Legacy cleanup 的 component/process/Redis tests继续证明 inventory、dry-run、apply、verify、allowlist、日志脱敏、资源 identity 与 ACL guard。不得因为 runtime 删除旧 index 能力而删除这些运维测试。
- 顶层 composition 通过 application entry/process seam 验证 server startup、logger 与 shutdown。下层 repositories/stores/session/security/provider/workers 继续在各自 Module Interface 测试，不通过顶层 result 获取内部对象。
- 编译期测试和 typecheck 应证明 composition 调用方只依赖 `{ server, logger, shutdown }`，Custom SSO/OIDC 调用方只满足 consumer-owned ports，测试代码不再依赖被删除方法。
- 实现内循环运行受影响 workspace 的最高相关 Unit/Integration collections、lint、typecheck 与 `git diff --check`；Current 文档变化运行 `pnpm check:docs`。完整 `pnpm verify` 只在准备本地合入时运行一次。
- 真实 Redis inventory、旧实例 drain、maintenance cleanup、client owner smoke 和 rollback rehearsal 是 Release Operations 验收，不由 repository Unit/Integration tests 伪造通过。

## Out of Scope

- 重新实现已经在先前提交中完成的 Custom SSO Subject Projection subject 一致性与 strict wire 校验。
- 合并 `/sso/token` 与 `/public/user-info` 的完整 endpoint lifecycle。
- 删除或替换当前 `global_session` Cookie、Principal Session、Subject Access Barrier 或 Authenticated Subject Context。
- 删除 OIDC Client Binding、Provider Session、Claims Snapshot、anchor、generation、mapping owner 或 CAS lifecycle。
- 删除 Session Kernel 当前 credential/token external token、lookup hash、principal/client/protocol indexes 或 tombstone。
- 删除单 token provider-payload cleanup，或改变 oidc-provider model/consumed payload 的 ownership。
- 删除 legacy cleanup 命令、allowlist、测试或 runbook。
- 在本 feature 中连接、inventory、清理或修改任何真实部署环境的 Redis。
- drain 旧实例、停止流量、执行维护窗口、强制用户重新登录、发布、回滚或运行仓外 smoke。
- 为不可见的仓外私有 package import 提供 compatibility shim；维护者已接受 shared legacy contract 的 breaking cleanup。
- 修改 Custom SSO endpoint、redirect、Cookie、Credential、Grant、Client Subject Projection 或错误响应 contract。
- 修改 OIDC discovery、scope、claim、Authorization Code、Access Token、UserInfo、logout 或 client authentication contract。
- 修改数据库 schema、Drizzle migration、Subject Facts、Authorization Freshness Barrier 或 User Profile Read Model。
- 新增领域术语或 ADR。
- 合并、push、部署、归档 tracker，或在未获得后续授权时实施本 spec。

## Further Notes

- 当前领域术语以 `CONTEXT.md` 为准；OIDC Client Binding 与 Client Subject Projection 的长期决策分别由 ADR-0010 与 ADR-0008 约束。
- 仓库证据表明 legacy resolver、shared envelope、旧 account lookup、过宽 adapter methods 和完整 composition result 均无当前仓内生产消费者；app 与相关 workspace packages 均为 private，但本 spec 仍把 shared contract 删除明确记录为 breaking cleanup。
- 旧 token index 是 Session Kernel 接入前的迁移残留。当前 runtime 不再注册该 index，但实际环境可能仍有旧 key、旧实例或仓外脚本；repository 状态不能替代环境 inventory。
- 本 spec 使用两个最高层业务 seam（Custom SSO authentication/final operations 与 OIDC interaction/authorization lifecycle），加上两个无法由业务 seam 完整证明的窄 contract seam（provider-session Redis state 与 legacy cleanup）。这是已在 grilling 中确认的测试边界。
- 本 spec 已具备 `ready-for-agent` 条件；拆票与实施进度以 feature journal 为准。发布 spec 不授权 implementation、cleanup、merge、push、deployment 或任何环境副作用。
