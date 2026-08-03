# Custom SSO Client Subject Projection 安全修复

## Problem Statement

当前 Custom SSO 会把完整 `UserDetailDto` 固化到 Gateway Local Session、Independent Client Credential 或相关私有
payload 中，共享认证中间件又把这份全局用户详情放进请求上下文。业务 client 因而可能从 `/sso/token`、
`/public/user-info` 或后续扩展中取得数据库用户主键、全部任职，以及其他 client 的角色和权限。业务 client 没有一个
明确、可审核、默认最小的用户信息声明边界；`UserDetailDto` 后续新增字段时还会继续扩大泄漏面。

当前 Custom SSO 配置散落在通用 `extAttributes` 和通用明文 `clientSecret` 中，接入模式、Redirect、ORCAS、
回调、登出、维护例外与用户信息范围没有独立、严格、可版本化的配置生命周期。OIDC 已有独立配置，但 Subject
Identifier 仍以 OIDC 专属字段命名，两套协议又分别拼装用户信息，容易在共享身份事实与协议配置之间形成错误耦合。

用户档案读模型也没有为 client-scoped 投影建立清晰的新鲜度和可用性边界。普通档案可以接受最后发布值，但授权事实
不能脏读；账号禁用或删除则必须立即 fail closed。当前 `/auth/authz` 为少量 header 字段读取完整用户详情，会让每个
受保护请求产生不必要的数据库查询。Admin 前端同时把基础应用字段、旧 Custom SSO 字段和 OIDC 操作混在列表弹窗中，
无法安全地管理新的协议配置和一次性 Secret。

## Solution

将现有 OIDC UUID 原值提升为协议中性的 Subject Identifier，并让 Principal Reference 只保存
`principalType + subjectIdentifier`。新增深层的 Client Subject Projection Module：Custom SSO 与 OIDC 分别把自身
可信配置或 scope 映射为 Subject Claim Selection，再共享 Subject Facts、Subject Access Barrier、Authorization
Freshness Barrier 和按 `clientCode` 裁剪逻辑；两套协议继续拥有独立配置、Adapter、Wire Contract、Claims Snapshot
与 session 生命周期。

建立 Subject Claim Catalog V1。Subject Identifier 永远必选，新 client 默认只交付该字段；可选项只包括用户名、姓名、
手机号、当前有效任职和当前 client 的授权。Custom SSO 使用版本化嵌套 Wire Contract，session、credential、grant 和
请求上下文不再保存完整用户详情或投影。`/auth/authz` 只生成最小 Gateway Subject Header，Redis cache hit 路径不查询
PostgreSQL。

扩展 User Profile Read Model，在一行中同时发布类型化 Profile 字段、Legacy User Detail、搜索文档和最小 Subject
Facts。Profile 与 Dirty Version 在同一 PostgreSQL 事务内原子提交；Redis 使用按 Subject 的 read-through cache 和
版本 compare-and-set。普通 Profile Claim 可以读取最后发布事实，`iam:authorization` 每次交付前必须校验 PostgreSQL
权威 Dirty 状态。账号可用性由独立 Redis Subject Access Barrier 管理，任何缺失或不确定状态都拒绝访问。

Custom SSO 获得独立的启用状态、严格 Gateway/Independent 配置、Independent 专用 Secret Hash 和单调配置版本。
Independent token exchange 改为 POST、HTTP Basic client authentication 和 form body；Authorization Grant 使用可恢复
预占状态机，避免并发重放且允许投影暂时未就绪时重试。OIDC 在 Authorization Code 签发前生成 Claims Snapshot，随后
Token 和 UserInfo 只重放该快照。

Admin 管理端使用统一 Client 编辑页，分别提供基础信息、Custom SSO 和 OIDC 设置模块。Custom SSO 通过专用 Admin
operations 管理配置、启停、删除和 Secret 轮换；OIDC 只迁移 UI 容器，不改变现有协议语义。最终通过维护窗口全量
预发布、严格门禁和旧 artifact 清理完成无双读硬切换。

## User Stories

1. 作为业务 client 负责人，我希望 IAM 只返回该 client 明确选择的主体字段，从而避免接收到无业务必要的个人信息。
2. 作为安全负责人，我希望业务 client 永远拿不到 IAM 数据库用户主键，从而避免内部持久化标识成为跨系统身份契约。
3. 作为安全负责人，我希望一个 client 永远拿不到其他 client 的角色和权限，从而消除横向授权信息泄漏。
4. 作为现有 OIDC relying party，我希望用户 `sub` 的 UUID 原值保持不变，从而无需迁移既有账号绑定。
5. 作为 Custom SSO client，我希望使用与 OIDC 同源但协议中性的 Subject Identifier，从而获得稳定且不依赖 OIDC 配置的用户标识。
6. 作为新建 client 的管理员，我希望默认只能选择 Subject Identifier，从而让新接入遵循最小披露原则。
7. 作为管理员，我希望只能从受控 Subject Claim Catalog 中选择字段，从而不能用自由 JSON path 绕过数据治理。
8. 作为管理员，我希望未知 Catalog version、未知 claim、重复 claim 或缺少 Subject Identifier 的配置不能启用，从而避免不确定输出。
9. 作为业务 client，我希望只在选择 `profile:username` 时收到用户名，从而让字段交付与配置一致。
10. 作为业务 client，我希望只在选择 `profile:name` 时收到姓名，从而让字段交付与配置一致。
11. 作为业务 client，我希望只在选择 `profile:phone` 且用户确有手机号时收到手机号，从而避免返回无意义的空值字段。
12. 作为业务 client，我希望 `profile:employments` 只包含当前有效任职，从而不会收到历史、禁用或已删除关系。
13. 作为业务 client，我希望任职包含主任职标识、组织代码/名称/类型/路径和岗位代码/名称，从而获得足够但受控的任职上下文。
14. 作为业务 client，我希望任职按稳定规则排序，从而使缓存、签名、测试和差异比较保持确定性。
15. 作为业务 client，我希望 `iam:authorization` 覆盖全部当前有效任职，从而能解释没有角色的任职与有授权的任职。
16. 作为业务 client，我希望每条任职的角色和权限只来源于当前 client，从而不能推断用户在其他系统的能力。
17. 作为业务 client，我希望授权中的角色、权限及顶层聚合值去重并稳定排序，从而得到确定的 client-scoped 授权事实。
18. 作为安全负责人，我希望 `iam:authorization` 表达主体授权属性而不是某次 API 请求的允许/拒绝结论，从而避免把投影误作接口级鉴权。
19. 作为业务 client，我希望未选择字段和空父对象不出现在 Custom SSO JSON 中，从而能按显式契约判断数据范围。
20. 作为业务 client，我希望已选择的数组在无数据时仍返回空数组，从而无需区分“未授权该 claim”和“该 claim 当前为空”。
21. 作为 Gateway client，我希望 `/auth/authz` 只提供 Subject Identifier 及已选择的用户名/姓名，从而不把手机号、任职或授权放入转发 header。
22. 作为平台运维人员，我希望 `/auth/authz` 的 Redis cache hit 路径不查询 PostgreSQL，从而不会为每个受保护接口增加数据库负载。
23. 作为 Independent client，我希望通过服务端 POST 和 HTTP Basic 兑换 authorization code，从而不在 URL 中暴露 Secret。
24. 作为 Independent client，我希望 token exchange 使用 form body 并校验与 grant 完全一致的 redirect URI，从而符合明确的后端协议。
25. 作为安全负责人，我希望 `/sso/token` 不再支持 GET、query secret 或浏览器 CORS，从而收窄凭据泄漏与跨站调用面。
26. 作为 Independent client，我希望 token response 使用 `subject` 返回投影而不是旧 `userInfo`，从而只有一个明确的新契约。
27. 作为 Independent client，我希望 IAM 只签发 client-scoped credential，而不声称管理第三方业务系统的本地 session，从而职责清晰。
28. 作为 Gateway client，我希望 IAM 继续管理 Gateway Local Session，从而保留网关模式的集中会话语义。
29. 作为业务 client，我希望 Redirect Pattern 仍支持受限的一级子域与显式路径子树通配，从而兼顾多环境部署与安全边界。
30. 作为安全负责人，我希望通配符不能覆盖裸域、公共后缀、IP、多级子域、任意 query 或 fragment，从而阻止宽泛重定向。
31. 作为业务 client，我希望 Authorization Grant 固化已验证的实际 redirect URI，从而 callback 和 token exchange 不会再次放宽匹配。
32. 作为业务 client，我希望 V1 `state` 可选且提供时原样往返，从而可以关联请求而不让 IAM 解释业务状态。
33. 作为安全负责人，我希望 `state` 不写普通日志且 IAM 不自动生成默认值，从而避免错误的可信关联或敏感信息暴露。
34. 作为 Independent client，我希望并发兑换同一个 grant 时最多一次成功，从而防止 authorization code 重放。
35. 作为 Independent client，我希望投影暂时未就绪时 grant 可以在原有效期内重试，从而不会因后台发布延迟永久丢失登录。
36. 作为安全负责人，我希望进程在 grant 预占后崩溃时只能在短租约到期后重试，从而兼顾可恢复性与并发排他。
37. 作为安全负责人，我希望 consumed grant 永远不能再次兑换，从而维持一次性授权语义。
38. 作为安全负责人，我希望 Principal Session、grant、credential、local session 和私有 payload 都不含 `UserDetailDto` 或 Client Subject Projection，从而阻止陈旧信息和超范围数据长期驻留。
39. 作为平台开发者，我希望 Principal Reference 只包含 `principalType` 和 Subject Identifier，从而 Session Kernel 不依赖用户数据库主键或显示信息。
40. 作为平台开发者，我希望删除通用 Principal Snapshot 且不保留兼容空壳，从而协议快照只能由各协议模块显式拥有。
41. 作为管理员，我希望每次 Custom SSO 配置、启停、删除或 Secret 轮换都推进配置版本，从而旧 artifact 即使清理失败也会 fail closed。
42. 作为管理员，我希望 Custom SSO 与 OIDC 拥有完全独立的配置和 Secret，从而一个协议的变更不会隐式改变另一个协议。
43. 作为管理员，我希望 Custom SSO 只有未配置、已禁用、已启用三种状态，从而不再用接入模式模拟开关。
44. 作为管理员，我希望 Gateway 与 Independent 使用严格的差异化配置，从而无意义的跨模式字段会被拒绝。
45. 作为管理员，我希望 Gateway 配置只能声明 ORCAS capability 而不能保存 Independent Secret，从而模式边界清晰。
46. 作为管理员，我希望 Independent 配置必须具备 Secret Hash、callback 和 logout endpoint，从而启用前配置完整。
47. 作为管理员，我希望 Custom SSO Secret 只生成并展示一次，从而 IAM 不保存可再次读取的明文。
48. 作为管理员，我希望已启用的 Custom SSO 配置处于只读运行态，从而高风险变更必须进入显式维护窗口。
49. 作为管理员，我希望只有禁用后才能修改 Claims、Redirect、模式、ORCAS、回调、登出、Secret 或删除配置，从而避免无意中改变线上行为。
50. 作为管理员，我希望禁用状态可以直接切换 Gateway 与 Independent，从而不需要先删除再重建配置。
51. 作为管理员，我希望切换到 Independent 时生成一次性 Secret，切换到 Gateway 时清除 Secret Hash，从而存储状态始终符合模式。
52. 作为管理员，我希望启用动作只做严格本地校验而不探测业务 URL，从而 Admin API 不会形成 SSRF 能力。
53. 作为管理员，我希望配置操作沿用现有页面的最后成功写入语义，从而无需额外处理乐观锁冲突。
54. 作为账号持有人，我希望账号被禁用或删除后现有会话立即失效，从而不能继续访问任何 client。
55. 作为账号持有人，我希望账号状态处于变更中或无法确认时系统暂时拒绝访问而不是误判为启用，从而安全优先。
56. 作为账号持有人，我希望暂态 Access Barrier 错误不清除仍可能有效的 Cookie，从而恢复后无需因基础设施故障重新登录。
57. 作为账号持有人，我希望明确 disabled 状态返回无效 session 并清除 Cookie，从而浏览器不会持续发送失效凭据。
58. 作为管理员，我希望账号重新启用前必须完成数据库提交与最新 Subject Facts 发布，从而旧缓存不会提前开放账号。
59. 作为平台运维人员，我希望 Access Barrier finalize 失败时保持 blocking 并由 repair 收敛，从而不会因部分失败误开放账号。
60. 作为业务 client，我希望普通 Profile Claim 可以读取最后成功发布的档案，从而在可接受范围内提高可用性和性能。
61. 作为安全负责人，我希望 `iam:authorization` 每次交付都校验 PostgreSQL Dirty 状态与事实版本，从而授权信息绝不脏读。
62. 作为业务 client，我希望授权事实未就绪时收到稳定的暂态错误和 `Retry-After`，从而可以安全重试而不会获得部分投影。
63. 作为安全负责人，我希望暂态错误不暴露 Dirty 状态、版本或内部失败原因，从而避免泄漏实现细节。
64. 作为平台运维人员，我希望一个 Subject 只缓存一份 Subject Facts 而不是每个 user×client 一份，从而控制缓存规模与失效复杂度。
65. 作为平台运维人员，我希望缓存缺失或损坏时只读取一行 `user_profile` 并 single-flight 回填，从而避免源表联查和缓存击穿。
66. 作为安全负责人，我希望 Subject Facts Reader 永远不回退到 Legacy `detail`，从而旧的宽 DTO 不会重新进入认证链路。
67. 作为现有后台用户详情消费者，我希望 Legacy User Detail Read Model 暂时保留，从而本次安全修复不会强制迁移无关查询。
68. 作为数据平台开发者，我希望 Profile upsert 与 Dirty `processed` 在同一 PostgreSQL 事务提交，从而不会出现状态宣称已完成但事实未发布。
69. 作为数据平台开发者，我希望旧 Worker 结果不能覆盖更新的 Dirty Version，从而并发 rebuild 保持单调。
70. 作为数据平台开发者，我希望 Redis 只接受不旧于当前版本的 Subject Facts，从而异步回填不会倒退缓存。
71. 作为 OIDC relying party，我希望标准 `profile` scope 不包含任职，从而保持标准 claim 语义。
72. 作为 OIDC relying party，我希望通过独立 `iam:employments` scope 在 UserInfo 获取任职，从而扩展字段是显式授权的。
73. 作为 OIDC relying party，我希望 `iam:authorization` 只在 UserInfo 返回且保持现有字段命名，从而避免 ID Token 膨胀和破坏兼容性。
74. 作为 OIDC relying party，我希望 OIDC Claims Snapshot 在 Authorization Code 签发前固定，从而 Token 和 UserInfo 不混入授权后变化。
75. 作为 OIDC relying party，我希望授权事实未就绪时 OIDC 返回标准 `temporarily_unavailable` 且不签发 Code，从而不会发出不完整授权快照。
76. 作为管理员，我希望 Client 列表只有一个“编辑”入口，从而基础信息和协议设置集中在同一 Client 上下文。
77. 作为管理员，我希望独立编辑页提供基础信息、Custom SSO 和 OIDC 三个可直接链接的 section，从而能快速定位配置项目。
78. 作为管理员，我希望 Client 列表仍显示 Custom SSO 与 OIDC 的只读状态摘要，从而不进入详情也能掌握接入状态。
79. 作为管理员，我希望列表可以按 Custom SSO 状态与模式筛选，从而能查找待配置或特定模式的 client。
80. 作为管理员，我希望新建 Client 只填写基础信息并随后进入编辑页，从而不会在创建流程中隐式启用协议。
81. 作为管理员，我希望 Claims 选择器固定选中 Subject Identifier 并分组展示可选 claim，从而不易误配。
82. 作为管理员，我希望 Claims 旁展示仅含占位值的 Wire JSON 预览，从而可以评估输出结构而不会读取真实用户信息。
83. 作为管理员，我希望离开有未保存修改的 section 前收到丢弃确认，从而不会无意丢失配置。
84. 作为管理员，我希望一次性 Secret 弹窗必须确认已安全保存后才能关闭，从而降低明文不可恢复造成的运维事故。
85. 作为安全审计人员，我希望所有 Custom SSO 管理动作都有独立审计 action 且不包含 Secret 明文或 Hash，从而能追踪变更而不扩大凭据暴露。
86. 作为 OIDC 管理员，我希望 OIDC 只是迁入新的 Client 编辑页而不改变既有配置和轮换行为，从而本次 Custom SSO 修复不会扩大协议迁移风险。
87. 作为管理员，我希望全局禁用 Client 时保留两个协议的启用标志和配置但撤销全部 artifact，从而重新启用后可以恢复原接入意图。
88. 作为管理员，我希望全局删除 Client 时直接软删除并撤销全部协议 artifact，从而不需要先逐个禁用协议。
89. 作为管理员，我希望 Maintenance 不再支持 `userExcluding` 或其他按用户绕过名单，从而维护状态没有永久例外。
90. 作为发布负责人，我希望维护窗口开始前冻结相关写入并确认每个启用 client 的配置与 Secret 接收，从而不带未知状态切换。
91. 作为发布负责人，我希望所有现存用户包括禁用和已删除用户都完成 Profile、Dirty、Facts 与 Barrier 全量预发布，从而运行期不需要懒迁移。
92. 作为发布负责人，我希望任一数量、唯一性、版本、schema 或覆盖校验失败都会取消切换，从而不会带着部分数据上线。
93. 作为发布负责人，我希望当前运行时移除全部旧认证 owner 并 fail closed，同时在切换时精确清理旧 Custom SSO artifact 和旧 Principal Session，从而认证失效不依赖 cleanup 成功而遗留 inventory 仍可安全收敛。
94. 作为 OIDC 用户，我希望切换不主动删除 OIDC 配置或 Provider artifact，从而只按既有 Principal Session 绑定自然失效。
95. 作为平台运维人员，我希望上线后观测 cache hit、Redis/DB 延迟、single-flight 等待和暂态错误率，从而验证性能目标和发布健康。
96. 作为维护者，我希望运行时没有旧配置双读、旧字段 fallback 或兼容响应，从而修复边界简单且不会永久背负两套行为。

## Implementation Decisions

### 身份与 Session Kernel

- 将现有用户 `oidc_subject` 列直接重命名为 `subject_identifier`，保留全部 UUID 原值、唯一性和非空约束；不为
  Custom SSO 创建第二套 Subject Identifier。
- Subject Identifier 归 IAM 身份域所有。OIDC 仅把它映射为 `sub`，Custom SSO 仅把它映射为
  `subjectIdentifier`，两者不通过对方配置或运行时对象间接取得。
- Principal Reference 收敛为 `principalType + subjectId`，其中 `subjectId` 是 Subject Identifier UUID；不保存
  numeric user ID、用户名、显示名或 Profile Snapshot。
- 删除通用 Principal Snapshot 及其 legacy normalization，不保留空兼容字段。OIDC Claims Snapshot 等协议快照继续
  由对应协议模块拥有。
- Principal Session 创建 Interface 只接受 Subject Identifier 与认证上下文。共享认证中间件只产生
  `subjectIdentifier`、`authenticatedClientCode` 和可选 `orcasId`；旧 handler 如需数据库主键或其他账号字段，必须
  通过自己的 Account Resolver 显式解析。

### Client Subject Projection Module

- 新增独立 workspace deep Module `@iam/client-subject-projection`，公开的主要 Interface 是
  `ClientSubjectProjectionService.resolve`。输入只包含 Subject Identifier、`clientCode` 和
  `SubjectClaimSelection`，输出是协议中性的 Client Subject Projection。
- Custom SSO Adapter 只从 Custom SSO config 构造 Selection；OIDC Adapter 只从实际授权 scope 构造 Selection。
  Adapter 负责 Wire mapping，Projection Module 不知道 Gateway、Independent、OIDC、HTTP、Cookie、Session payload
  或协议配置对象。
- `resolve` 的固定次序为：检查 Subject Access Barrier；只有需要可选 claim 时读取 Subject Facts；选择
  `iam:authorization` 时检查 Authorization Freshness Barrier；最后按当前 `clientCode` 裁剪并组装。
- 调用方不能传入 `allowStaleAuthorization` 或类似开关。是否允许最后发布值完全由 Selection 中的 claim 语义决定。
- Subject Identifier 是每个结果的隐式必选字段；client config 仍必须显式声明它，Adapter 验证后从 optional claim
  集合中排除。

### Subject Claim Catalog V1

- Catalog V1 的唯一必选 claim 是 `subjectIdentifier`。
- 可选 claim 仅为 `profile:username`、`profile:name`、`profile:phone`、`profile:employments` 和
  `iam:authorization`。
- Catalog 不接受 DTO 字段名、JSON path、自定义字符串、未知版本、未知 claim、重复 claim 或缺少必选 claim 的配置。
- Catalog 明确排除数据库 ID、`wxId`、用户类型、各种状态、排序号、描述、软删除字段、审计时间和 ORCAS 数据。
- `profile:employments` 只包含有效且未删除的任职、岗位和组织。输出包含 `isPrimary`，组织的 code、name、type、
  从根到当前组织的 path，以及岗位 code、name。
- Employment Profile 主任职优先，其余按组织 code、岗位 code 稳定排序；无有效任职时返回空数组。
- `iam:authorization` 包含全部有效任职。每条任职只读取当前 `clientCode` 的 Effective Roles 及由这些角色派生的
  privileges；没有角色的任职仍保留空数组。
- 每条任职和顶层的 roles/privileges 都去重并按 code 稳定排序。该 claim 不是 API 级授权判定结果。
- `profile:employments` 与 `iam:authorization` 是自包含 claim；同时选择时允许重复组织与岗位信息。

### Custom SSO Wire Contract

- Custom SSO 使用版本为 1 的嵌套 JSON，顶层固定含 `version` 和 `subjectIdentifier`，可选含 `profile` 和
  `authorization`。
- `profile` 可含 username、name、phone 和 employments；`authorization` 可含 employments、roles 和 privileges。
- 未选择字段不出现；手机号为 null 时不出现；没有任何已选子字段时父对象不出现；已选择数组即使为空也返回空数组。
- 不返回 `id`、`userInfo` 或其他兼容别名。`/sso/token` 和 `/public/user-info` 使用同一 Wire Contract。
- Gateway `/auth/authz` 不直接返回完整投影，而是把版本 1 的最小 JSON 做 Base64；Subject Identifier 必有，
  username/name 仅在 client 选择对应 claim 时出现，phone、employments、authorization 和数据库 ID 永远禁止。

### User Profile 与 Subject Facts

- `user_profile` 固定为十七列：`user_id`、`subject_identifier`、`username`、`name`、`mobile`、`wx_id`、`status`、
  `is_delete`、`search_visible`、`profile_schema_version`、`source_dirty_version`、`detail`、`search_doc`、
  `subject_facts`、`rebuilt_at`、`create_time`、`update_time`。
- `subject_identifier` 为 UUID、非空且唯一；`source_dirty_version` 非空且大于零；`subject_facts` 是通过版本化 schema
  校验的非空 JSONB。
- 保留 `detail` 作为现有用户详情与搜索消费者使用的 active Legacy User Detail Read Model，不把它定义成 SSO
  兼容字段，也不在本功能删除。
- 保留现有搜索索引，新增 Subject Identifier 唯一索引；Subject Facts 只整行读取，不建立 GIN 或 JSON path 索引。
- PostgreSQL Subject Facts 只保存当前有效任职、组织/岗位语义字段，以及按不可变 `clientCode` 分组的角色及权限。
  它不保存顶层聚合、数据库 ID、状态、时间、描述、`accountAvailable` 或未授权的用户详情。
- 没有角色的有效任职仍存在，`clientAuthorizations` 为空；只有具有 Effective Role 的 client 才形成授权项。
- Redis 每个 Subject 只保存一份 record，包含 schema version、source Dirty Version、published time、Subject
  Identifier、username/name/phone 以及 Subject Facts；不保存 user×client 投影。
- Subject Facts Reader 的 select list 不含 `detail` 或 `search_doc`，也不在 cache miss 时联查 user、employment、
  organization、position、role 或 privilege 源表。

### 原子发布与 Read-through

- Worker 可以在事务外构建带目标 Dirty Version 的候选 Profile，但发布事务必须锁定 Dirty row 并重新确认用户、版本
  和 `processing` 状态。
- 完整 Profile upsert、`source_dirty_version` 写入和同版本 Dirty `processed` 必须在同一 PostgreSQL 事务提交或回滚。
- 状态或版本不匹配时丢弃 stale candidate；Profile upsert 还必须拒绝小于现有来源版本的写入。
- PostgreSQL 提交后，Redis 使用 `sourceDirtyVersion` compare-and-set；旧 Worker 或旧 read-through 不能覆盖新缓存。
- Redis 写失败不回滚 PostgreSQL，由 read-through 和 repair 恢复。
- 只请求 Subject Identifier 时完全不读 Subject Facts。Redis 命中且 schema 有效时直接使用；缺失、损坏或未知 schema
  时以 single-flight 读取一行 `user_profile` 并回填。
- 数据库行缺失、版本无效或 JSON 解析失败时返回 Subject Projection Not Ready；不回退 Legacy `detail`。

### Authorization Freshness Barrier

- 普通 Profile Claim 可以使用最后成功发布的 Subject Facts。
- 选择 `iam:authorization` 时，每次投影都查询 PostgreSQL 权威 Dirty row，只有 `processed` 且 Dirty Version 与
  Facts source version 完全一致才放行。
- `pending`、`processing`、`failed`、Dirty row 缺失或版本不匹配全部 fail closed，不按 Dirty Reason 绕过。
- 如果 Redis facts 落后但 PostgreSQL 已发布当前版本，只允许从 `user_profile` 重载一次；事实尚未发布则整份投影
  失败，不返回部分结果。
- Custom SSO 映射为 HTTP 503、稳定 code `SUBJECT_PROJECTION_NOT_READY` 和可配置短 `Retry-After`，不暴露内部状态。
  OIDC 映射为 `temporarily_unavailable` 且不签发 Authorization Code。
- `/auth/authz` 不选择 `iam:authorization`，因此正常 cache hit 路径不进行 Dirty 查询。

### Subject Access Barrier

- Subject Access Barrier 是独立 Redis 实时安全记录，状态只有 `enabled`、`blocking`、`disabled`，并带版本、
  Subject Identifier、可选 transition ID 和更新时间。
- Barrier 是账号运行时可用性的唯一事实来源；Subject Facts 不保存也不推导 `accountAvailable`。
- 解析有效 Session/Credential 后先检查 Barrier。`enabled` 继续；`disabled` 返回 `401 SESSION_INVALID` 并清 Cookie；
  `blocking`、缺失、读取失败或解析失败返回 `503 SUBJECT_ACCESS_UNAVAILABLE` 且不清 Cookie。
- 禁用或删除账号前，必须以 transition ID 原子进入 `blocking`；失败则不执行数据库 mutation。
- 数据库提交后切换 `disabled` 并撤销全部 Principal Session；回滚时只有相同 transition ID 可以恢复之前状态。
- 提交后 finalize 失败时保持 `blocking`，由有索引的 repair 任务对照数据库收敛。
- 重新启用时保持不可访问，直到数据库提交且当前 Subject Facts 发布完成，再切换 `enabled`；已撤销 Session 不恢复。
- 新用户在 Profile 发布前不能进入 `enabled`，Barrier 缺失也不能从缓存档案推断为启用。

### Custom SSO Client Configuration

- Client 新增 `custom_sso_enabled`、nullable `custom_sso_config`、nullable `custom_sso_secret_hash` 和
  `custom_sso_config_version` 四个独立列。
- 未配置要求 config/hash 为 null 且 enabled 为 false；Gateway 要求 config 非空且 hash 为 null；Independent 要求
  config/hash 都非空；enabled 为 true 时 config 必须存在。
- 配置是 strict discriminated union。共同字段为 Redirect Pattern、Catalog version 和完整 Subject Claim Selection；
  Gateway 只增加 ORCAS enabled capability；Independent 只增加 callback/logout endpoint。
- 删除 `managementLevel`、`requireOrcas`、`validRedirectUrls`、`userExcluding`、`callbackEndpoint` 和
  `logoutEndpoint` 的通用 `extAttributes` 配置，不提供运行时双读或兼容字段。
- Custom SSO 不读取 OIDC config、OIDC Secret 或通用明文 `clientSecret`。通用 `clientSecret` 的其他用途本次不改。
- 配置、启用、禁用、删除和 Secret 轮换都原子推进 Custom SSO config version，并触发协议 cache/artifact
  invalidation；artifact 每次使用时也校验签发版本。
- Secret 只保存强 Hash，明文只在创建 Independent、切换到 Independent 或轮换成功的响应中出现一次。
- 已启用 Custom SSO 只允许查看或禁用。所有配置修改、模式切换、删除和轮换必须先禁用；保存配置不会隐式启用。
- 已禁用时允许直接切换模式。Gateway 转 Independent 生成新 Secret；Independent 转 Gateway 清除 Secret Hash。
- 启用只校验本地 strict schema、Redirect、Claims、模式字段、全局 Client 状态和 Secret 状态，不访问任何外部 URL。
- Admin mutation 不增加 `expectedConfigVersion` 乐观锁；事务内读取并校验最新状态，多个成功写入采用最后写入生效。

### Redirect、ORCAS 与 Grant

- 无通配 Redirect 只做精确路径匹配；只有显式 `/*` 才匹配路径子树；主机 `*.` 只匹配一级子域，不匹配根域或多级子域。
- Scheme 和 port 必须精确一致；禁止裸 `*`、公共后缀/IP 通配、URL credentials、动态 query 和 fragment。
- Authorization 阶段按配置模式验证实际 URI，Grant 保存规范化后的实际值；callback/token exchange 必须逐字匹配
  Grant，不再次应用模式。
- V1 `state` 可选。存在时绑定 Grant 并原样返回；IAM 不解释、不修改、不写普通日志，缺失时不生成默认值。
- ORCAS 只允许 Gateway 显式启用，且只存在于 ORCAS 专用上下文、Cookie 和 endpoint。它不进入 Catalog、Subject
  Facts、Client Subject Projection、UserInfo 或 Gateway Subject Header。
- Authorization Grant 只保存 Subject Identifier、clientCode、mode、实际 redirect URI、可选 state、配置版本、
  状态/租约和过期时间，不保存 User Detail 或 Projection。
- Grant 状态采用 `issued → redeeming → consumed`。进入 redeeming 时记录随机 attempt ID 和短租约；只有成功签发
  Credential 或 Local Session 才进入 consumed。
- Subject Projection Not Ready 时，同一 attempt 恢复 issued 且不延长原 expiry；进程异常后只允许租约到期重试。

### Custom SSO HTTP 与认证上下文

- `/sso/token` 只保留 POST；使用 HTTP Basic 的 `clientCode:customSsoSecret` 和
  `application/x-www-form-urlencoded` 的 `code + redirect_uri`。
- `/sso/token` 不开放浏览器 CORS，不接受 GET、query Secret 或旧 `userInfo`。成功数据只含 opaque `sid`、TTL 和
  `subject` 投影。
- `/public/user-info` 从最小认证上下文和当前 Custom SSO config 生成 Selection，实时调用 Projection Module；成功
  `data` 直接是 Custom SSO Wire Projection。
- `/auth/authz` 从 Gateway Local Session、Subject Access Barrier 和必要的 Subject Facts 生成相同 Base64 值到
  response body 与 `X-User-Info`。
- 其他旧 `/public/*` handler 的契约本次不改；如果需要 legacy account 字段，必须显式调用自己的 resolver，不能让
  共享认证中间件恢复宽上下文。
- Query Session Token 的现有接收、传递、日志及响应头行为本次原样保留，后续统一治理。

### OIDC Adapter 与 Claims Snapshot

- OIDC 与 Custom SSO 共享 Subject Identifier、Subject Claim Selection 和 Projection Module，但不共享配置、
  Secret、Wire Contract、Claims Snapshot 或 session 生命周期。
- `openid` 只映射 subject；`profile` 映射 username/name；`phone` 映射手机号；新增 `iam:employments` 映射任职；
  `iam:authorization` 映射 client-scoped 授权。
- 标准 `profile` 不隐含任职。`iam:employments` 和 `iam:authorization` 只进入 UserInfo，不进入 ID Token。
- OIDC Claims Snapshot 在授权完成且 Authorization Code 签发前创建，绑定 Subject Identifier、client、实际 scope、
  OIDC config version、Provider Session 和 Principal Session。
- 如果 scope 选择 `iam:authorization`，Freshness Barrier 在签发 Authorization Code 前执行；失败时不签发 Code。
- Token Endpoint 只把 Code Snapshot 转移到 Access Token，不重新读取 Profile；UserInfo 只重放 Access Token
  Snapshot。
- OIDC `iam:authorization` 保留既有 wire 字段名，只增加 `isPrimary`，不并行输出 Custom SSO 字段或兼容双字段。
- OIDC Admin API、Secret 轮换和 enabled-state mutation 语义保持不变。

### Admin API

- 通用 Client create/update/input contract 全部排除四个 Custom SSO managed fields，并拒绝已删除的 legacy Custom
  SSO `extAttributes`。
- Admin list DTO 只返回 Custom SSO state 和 nullable mode 摘要；Admin detail DTO 返回 strict config、state、
  nullable mode、`hasCustomSsoSecret` 和 config version，但不返回 Secret Hash 或明文。
- Custom SSO 使用五个独立 operations：configure、enable、disable、remove、rotate secret。REST 分别位于 Client
  的 `/custom-sso/configure`、`/enable`、`/disable`、`/remove` 和 `/rotate-secret` 子资源。
- Configure/rotate 只有生成新 Secret 时才返回一次性 `customSsoSecret`；其他结果返回最新 Admin Client Detail。
- Runtime Secret Reader 使用独立内部 record/interface，不复用 Admin DTO。
- Client 搜索以结构化 `customSsoStates` 和 `customSsoModes` 替换旧 `managementLevels`，不按 Claims、Redirect 或
  callback JSON 内容筛选。
- V1 不为少量 Admin Client 查询建立 JSONB GIN 或表达式索引；只有真实规模与 query plan 证明需要时再添加。
- 新增 configure、enable、disable、remove、rotate secret 五个 Custom SSO audit action。审计可记录模式、Claims、
  URL、ORCAS 开关、状态和版本，但在构造 audit object 前排除 Secret 明文与 Hash。

### Admin 前端

- Client 列表只保留一个“编辑”入口，同时显示只读 Custom SSO 和 OIDC 状态；Custom SSO 已配置时额外显示 Gateway
  或 Independent。
- 新增 `/clients/:clientCode/edit` 单一路由，使用 `section=basic|custom-sso|oidc` query 保存当前标签；未知值回到
  basic，不建立三套嵌套路由。
- 页面头显示返回入口、应用名称、不可变 clientCode 和全局状态。基础信息 section 管理应用元数据、现有通用配置、
  全局启停和软删除。
- Custom SSO 与 OIDC 是互不读取配置类型的独立 Settings component，只通过 Admin client service wrapper 调用专用
  API；页面拥有详情加载、section、dirty guard、mutation 后刷新和删除后返回列表。
- OIDC 只从 modal 重构成页面内 Settings，不采用 Custom SSO 的 enabled-readonly 规则。
- 新建 Client 继续使用只含基础信息的轻量 modal；成功后导航到编码后的 Client 编辑 route，两个协议默认未配置。
- Claims selector 由共享 Catalog metadata 驱动，Subject Identifier 固定选中，Profile 与 Authorization 分组，
  不允许自由输入。
- Wire preview 使用共享 Catalog metadata 和固定占位符实时生成，不查询真实用户；它表现字段省略和空数组规则。
- 每个 section 独立拥有 form state。切换 section、返回列表或离开 route 时如有 dirty 修改，必须确认丢弃；不自动
  保存或持久化草稿。
- 一次性 Secret 使用共享安全展示 primitive，但 OIDC 与 Custom SSO 各自持有 mutation 结果。弹窗禁止遮罩/Esc
  关闭，管理员确认已安全保存后才能关闭，关闭即清空组件状态，无法重新读取。
- 全局 Client disable 阻止协议使用并撤销两种协议 artifact，但保留各自 enabled flag 和 config；重新启用后恢复
  原协议意图。
- 全局 Client delete 继续软删除并撤销全部协议 artifact，不要求分别禁用协议。Maintenance 不支持
  `userExcluding` 或其他按用户绕过。
- Admin route 继续使用现有 `isAdmin` 边界，不在本功能增加细粒度权限或二次认证。

### 数据库迁移与维护窗口

- 不修改已执行 migration 或 snapshot。新 migration 分步完成列重命名、新列、可空 backfill、约束收紧和索引。
- 直接重命名用户 Subject 列；先给 User Profile 增加 nullable Subject Identifier、name、source Dirty Version 和
  Subject Facts，给 Client 增加四个 Custom SSO 列与基础 check constraint。
- 使用版本化批量 backfill command，不循环单行写入；命令可重复执行并提供独立 verify 模式。
- 全量验证后再把 User Profile 新列设为非空并建立 Subject Identifier 唯一索引。大表是否使用 concurrent unique
  index 由测试环境锁等待证据决定，且不能把 concurrent DDL 放进普通事务。
- 只有新代码和离线迁移都不再读取旧配置后才删除 legacy `extAttributes` 字段；运行时无双读、默认宽权限 fallback
  或懒迁移。
- 维护窗口先冻结 client 及用户/任职/授权写入，备份 PostgreSQL 和需保留的 Redis operational data，再逐个确认启用
  client 的模式、Redirect、Claims、callback/logout/ORCAS 以及 Independent Secret 接收。
- 全量预发布覆盖包括禁用和已删除账号在内的所有 Subject。数量、非空、唯一性、Dirty processed、版本一致、
  Facts schema 和 Access Barrier 任一门禁失败都取消切换。
- 切换时停止旧 Worker，预热 Facts/Barrier，清理全部旧 Custom SSO grant、binding、credential、local-session
  payload 和旧 Principal Session，再执行 Gateway、Independent、OIDC 和账号禁用 smoke。
- 不主动删除 OIDC config、Provider Session、Authorization Code 或 Token；依赖已清理 Principal Session 的旧 OIDC
  artifact 按既有绑定自然失效并要求重新登录。
- 切换后不回退旧字段或 payload。应用回滚必须重新停止认证流量并显式回滚数据库；已清理 Session 不可恢复。

### 性能与可观测性

- `/auth/authz` cache hit 的验收目标是零 PostgreSQL 查询。
- 只选择 Subject Identifier 时零 Subject Facts 读取。
- 普通 claim cache miss 最多一次 `user_profile` 单行查询且不做源表 join。
- 严格 authorization cache hit 允许一次小型 Dirty 新鲜度查询；facts 落后但 Profile 已发布时额外最多一次单行刷新。
- 记录 cache hit ratio、Redis/DB p95、single-flight wait、Projection Not Ready rate、Access Barrier unavailable rate
  和 repair backlog，并与切换前基线比较。
- 日志、指标和错误不得包含 Secret、Subject Facts 全文、Dirty 内部状态或 query Session Token。

## Testing Decisions

- 好测试只断言调用方可观察行为、公开 Interface、持久化事务结果或协议输出，不断言私有 helper、内部函数名称、SQL
  拼接细节、Redis 命令排列或 React component 实现细节。
- 本功能跨数据库发布、Redis 安全状态、两种协议和浏览器管理流程，单一测试 seam 无法证明全部风险。采用六个最高层
  公开 seam，并让底层资源 contract 只补充上层 fake 无法证明的原子性。
- 第一条也是主要共享 seam 是 Client Subject Projection Module 的 contract suite。它以 Subject Facts、Subject
  Access 和 Authorization Freshness port fake 驱动公开 `resolve`，覆盖 Catalog、Selection、client 裁剪、字段省略、
  空数组、稳定排序、Profile stale allowance、authorization fail closed 和无跨 client 泄漏。
- Projection contract suite 必须包含“未来给 `UserDetailDto` 新增任意字段也不会改变输出”的回归，以及两个 client
  交叉角色/权限 fixture。测试不构造或依赖 Legacy User Detail。
- 第二条 seam 是 User Profile 发布与读取。现有 User Profile builder、rebuild processor、dirty repository、
  query service 和 worker maintenance suites 作为 prior art，扩展到 Subject Facts 构建、版本化发布、read-through
  和 repair。
- 真实 PostgreSQL `test:postgres` 证明 Profile upsert 与 Dirty processed 同事务提交/回滚、row lock 重验、stale
  candidate 拒绝、版本单调、全量 backfill 幂等和 verify 失败报告。普通 fake 测试不能替代这些事务结论。
- Redis contract seam 使用随机 namespace 的显式 `test:redis`，证明 Facts compare-and-set、single-flight 所需原子
  primitive、Access Barrier transition/finalize/rollback 和 grant redeeming lease 的并发线性化；不清空共享 Redis。
- 第三条 seam 是 Custom SSO 的 authorization、callback、exchange 与 public/auth handlers。沿用现有
  authorize-sso、complete-sso-callback、exchange-sso-code 和 Custom SSO Session Kernel Adapter use-case suites，
  只 fake Projection、Client Config、Session Kernel 与系统边界。
- Custom SSO use-case/handler tests 覆盖 POST/Basic/form contract、无 GET/query/CORS、redirect 精确绑定、可选 state、
  Gateway/Independent 分支、503 恢复 grant、一次性消费、最小认证上下文、UserInfo wire 和 Gateway header。
- API contract/OpenAPI tests 锁定新的 request/response schema、稳定错误 code、`Retry-After`、Cookie 清理差异和
  Secret 脱敏；不通过调用 private mapper 来证明协议。
- 第四条 seam 是 Session Kernel 公开 Interface。沿用现有 create/resolve/revoke/client-protocol suite，替换
  Principal Snapshot fixture，证明 Principal Reference 只含 Subject Identifier、artifact 序列化不含 User Detail 或
  Projection、config version fail closed、并发 revoke 和 cleanup 行为。
- 第五条 seam 是 OIDC authorization/claims composition。沿用现有 authorization-claim、claims、interaction、
  client-runtime、repository availability、provider wiring 和 token-flow smoke prior art。
- OIDC tests 证明现有 `sub` 不变、scope 到 Selection 映射、标准 profile 不含任职、专用 claim 只进 UserInfo、
  Authorization Code 前的 Snapshot、temporarily_unavailable 不发 Code、Token/UserInfo 重放且不重新读取 Profile，
  以及 Custom SSO 配置变更不影响 OIDC。
- 第六条 seam 是 Admin service/adapter 与浏览器。Admin service integration tests 通过现有 UnitOfWork、audit、
  cache 和 session revocation ports 覆盖五个 Custom SSO intent 的完整状态矩阵、version 递增、Secret Hash 边界、
  after-commit invalidation 和全局状态交互。
- Admin REST/tRPC adapter、OpenAPI 和 schema tests 证明两种 transport 共享同一 service、generic DTO 拒绝 managed
  fields/legacy attributes、list/detail 不泄漏 Secret、筛选条件正确且 audit action 脱敏。
- Admin Playwright 沿用现有 mock Admin API fixture，覆盖列表唯一编辑入口、只读协议摘要、状态/模式筛选、创建后
  跳转、URL section、未知 section、loading/404/error、dirty guard、Claims selector、Wire preview 和一次性 Secret
  销毁。
- OIDC Settings 的 Playwright 回归必须证明 UI 迁移后仍允许原有配置与轮换状态，不套用 Custom SSO enabled-readonly
  规则。
- Subject Access Barrier 在账号禁用、删除、启用的最高层 account mutation/service seam 测试，覆盖 pre-block 失败
  不写数据库、rollback 恢复、commit 后 disabled、finalize failure 保持 blocking、repair 收敛和已撤销 Session 不恢复。
- `/auth/authz` 性能测试使用可计数的 PostgreSQL/Redis adapters 断言 cache hit 零 PostgreSQL；只请求 Subject
  Identifier 断言零 Facts read。真实性能压测另记录 p95 和 hit ratio，不把普通测试 timeout 当性能门槛。
- Migration rehearsal 在与生产规模相近的专用 PostgreSQL 环境运行 migration、批量 backfill、verify、约束收紧、
  index 锁观察和显式回滚演练；不得以 schema push 替代 migration。
- 维护者或 agent 在临时近似规模环境按发布 runbook，组合现有公开接口、package 命令与 process smoke 完成人工联合验收；
  至少覆盖 Gateway、Independent、OIDC、账号禁用、Projection Not Ready、当前 production entry 对 legacy-shaped
  artifact 的 fail-closed 拒绝和新 Secret 兑换。不得启动历史版本证明 cleanup 前可认证，也不得以手写 parser 代替
  production entry。
- Ticket 12 不提交或要求根级一键 orchestrator、JSONL receipt、机器 evidence manifest/transcript 或自动 phase 状态机。
  验收只记录候选 commit、实际命令、聚合计数/延迟、通过/失败和资源清理结果的简洁人类可读摘要。
- Ticket 12 的完整 cutover runbook 联合演练与 10,002 行近规模性能验收可以分别在两个专门执行中完成；两项仍都是
  Ticket 12 的必需证据，但不要求共享同一数据集、临时环境或执行批次。该拆分只适用于本 ticket 验收，不构成生产
  切换、容量阈值或发布审批。
- Production composition 发生变化时更新 API、Admin API、Worker 和 OIDC Provider 的现有 process smoke，证明真实
  entry、env parsing 和 wiring 可启动；smoke 不代替领域行为测试。
- 稳定 module edge 由架构守卫证明：协议 Adapter 只能通过 Projection Interface，Subject Facts Reader 不能暴露
  Legacy detail，Admin component 只能通过 service wrapper，Custom SSO 与 OIDC config 不能互相导入。
- 开发内循环运行最高层相关单测和受影响 workspace 的 lint/typecheck；数据库、Redis、浏览器改动分别显式运行
  `test:postgres`、`test:redis` 和 Playwright E2E。
- 文档变更运行 `pnpm check:docs`，所有 ticket 提交前运行 `git diff --check`；准备 merge 时在最终内容上运行一次
  `pnpm verify`，再按仓库流程完成 Standards / Spec 双轴评审。

### Legacy artifact 的失效与清理边界

- Ticket 11 后的当前 production runtime 已删除六类 Legacy Custom SSO artifact 的认证 owner；legacy-shaped token、code
  或 Local Session 必须在 cleanup 前后都 fail closed，且当前 entry 不读取对应 legacy key。
- Cleanup 是范围受控的 inventory hygiene，不是认证失效机制。它通过内建 allowlist 对六类 key 执行
  `dry-run -> blocking verify -> apply -> clean verify`，重复 apply/verify 必须保持零残留，并保留 OIDC 与当前 Session。
- Ticket 12 不要求、也不得启动历史版本来证明旧 artifact 曾经可认证；不接受历史 adapter、手写 parser 或
  “owner pre-success -> cleanup 后失败”作为验收证据。纯 cleanup inventory/shape contract 可以保留，但不得宣称为认证
  owner flow。

## Out of Scope

- 为 `/auth/authz` 增加接口级角色、权限或 policy 判定；本功能只验证 Session 并生成最小 Gateway Subject Header。
- 修改 `/public/user-info` 之外的 `/public/*` 外部契约，包括用户/组织搜索、密码、手机号和其他 legacy 操作。
- 删除 Legacy User Detail Read Model、`user_profile.detail`、`search_doc` 或迁移其现有消费者。
- 修改通用明文 `clientSecret`、internal API key 或它们在 Custom SSO 之外的既有用途。
- 修复 Custom SSO query Session Token 的接收、传递、日志或响应头；该安全治理另行统一设计。
- 修改 ORCAS 专用 Cookie、query、endpoint、外部 session 语义或当前 transport；本功能只阻止 ORCAS 进入主体投影。
- 管理或刷新第三方 Independent client 在 IAM 之外创建的本地 session，或保证 IAM logout 能终止该 session。
- 把 Custom SSO 与 OIDC 合并为同一套配置、Secret、Wire Contract、Claims Snapshot、artifact 或 session 生命周期。
- 改变现有 OIDC Admin API、client type、启停、删除或 Secret 轮换语义；本次只迁移 Admin UI 容器。
- 把 OIDC 标准 `profile` scope 扩展为任职，或把专用任职/授权 claim 放入 ID Token。
- 在 Custom SSO V1 强制 `state` 必填；若未来需要，必须提升契约版本。
- 为 Admin Custom SSO mutation 增加 optimistic concurrency、`expectedConfigVersion`、自动冲突重试或草稿恢复。
- 让 Admin API 主动访问 callback、logout 或 Redirect URL 做连通性测试。
- 按 Claims、Redirect URL、callback 或其他 JSON 配置内容搜索 Client，或预先增加 JSONB GIN/表达式索引。
- 为 Admin Client 管理增加细粒度 RBAC、二次认证、近期认证要求或审批流。
- 在运行期保留 legacy Custom SSO config、旧 `userInfo`、数据库 ID、Principal Snapshot 或 User Detail payload 的
  双读、双写与兼容字段。
- 在运行期通过源表 join 或 Legacy detail 补救缺失 Subject Facts。
- 主动批量删除 OIDC config、Provider Session、Authorization Code 或 Token；只依赖 Principal Session 绑定自然失效。
- 修改冻结的 OpenSpec 历史。
- Push、PR、部署、生产数据迁移或执行维护窗口；本 spec 只定义交付目标。

## Further Notes

- 本 spec 使用 `CONTEXT.md` 中的 Subject Identifier、Client Subject Projection、Subject Facts、Subject Access
  Barrier、Subject Projection Not Ready、Custom SSO Authorization Grant、Independent Client Credential 和 Gateway
  Local Session 术语。
- 长期决策由 ADR-0006“将用户 Subject Identifier 提升为协议中性身份事实”、ADR-0007“将 Custom SSO Client 配置与
  其他协议配置分离”和 ADR-0008“采用协议中性的 Client Subject Projection”承载。
- 当前 Custom SSO 外部行为在维护窗口切换前仍以现有第三方对接说明为准；本 spec 描述目标状态，不描述尚未实施的
  当前行为。
- 这是维护窗口硬切换。旧 Principal Session 和 Custom SSO artifact 清理不可逆；回滚应用前必须恢复兼容数据库
  schema，但已清理会话不能恢复。
- `detail` 的保留是对现有内部消费者的范围隔离，不是允许 SSO 继续读取宽 DTO。
- Query Session Token 与 ORCAS transport 的已知风险仍存在，只是已被明确留给后续统一治理；实现者不得借本功能
  顺手改变其外部行为。
- 该 feature 明显需要跨会话拆分与交付；下一步应使用 `/to-tickets` 按依赖切成小型端到端 tickets。
- 本地 tracker 约定 spec 不写生命周期字段；`ready-for-agent` 将由后续 implementation tickets 的 `Status` 表达。
- 本次发布 spec 不构成实现、创建功能分支、提交、合并、推送、迁移或部署授权。
