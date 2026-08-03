# SHGAS IAM

本上下文定义 IAM 用户身份、档案和外部 SSO 集成中的核心领域语言，帮助区分稳定用户事实与协议会话事实。

## Language

**User Profile**:
IAM 中关于一个用户的稳定档案视图，包括用户基础身份信息、任职、角色和权限。
_Avoid_: session payload, protocol payload

**Legacy User Detail Read Model**:
`user_profile.detail` 中面向既有用户详情与搜索接口预计算的完整 `UserDetailDto` 文档；在这些接口迁移前它仍是被实际使用的读模型，而不是 Custom SSO 兼容字段。Client Subject Projection Module 的 Repository Port 不得暴露、查询或回退到该文档，只能读取 Subject Facts 所需的显式字段；待全部既有消费者迁移后再单独删除。
_Avoid_: Subject Facts, SSO projection fallback, compatibility alias

**User Profile Read Model Row**:
`user_profile` 为每个用户保存一行发布后的读模型，共包含 `user_id`、`subject_identifier`、`username`、`name`、`mobile`、`wx_id`、`status`、`is_delete`、`search_visible`、`profile_schema_version`、`source_dirty_version`、`detail`、`search_doc`、`subject_facts`、`rebuilt_at`、`create_time`、`update_time` 十七列。Subject Facts Repository 只从明确的类型化列与 `subject_facts` 组装内部事实，不读取 `detail` 或 `search_doc`。
_Avoid_: protocol session row, client projection row, untyped profile blob

**Subject Identifier**:
IAM 身份域为一个用户持有的稳定 opaque 标识；登录协议可以将它映射到各自契约，但任何协议都不拥有该标识。
_Avoid_: OIDC-owned subject, protocol session ID, username

**Principal Reference**:
Session Kernel 用 `{ principalType, subjectId }` 指向会话主体的最小引用；用户主体的 `subjectId` 是 Subject Identifier，不包含数据库主键、显示名称或档案快照。Principal Session 不再另存通用 Principal Snapshot；协议确需固化的声明快照由各协议自行拥有。
_Avoid_: user snapshot, display user, database user reference

**Authenticated Subject Context**:
共享 HTTP 认证中间件验证 Principal Session 或 Gateway Local Session 后产生的最小请求上下文，只包含 Subject Identifier、已验证的 client code，以及适用时独立保存的 ORCAS session 引用。它不包含 `UserDetailDto`、数据库用户主键、username 或 Client Subject Projection；需要内部账号字段的旧用例必须通过自己的 Account Resolver 按 Subject Identifier 获取。
_Avoid_: request user detail, shared user DTO, protocol claim payload

**Effective Role**:
对一条有效任职生效的启用角色；只有任职及其岗位、任职组织、角色分配目标和角色均启用且未删除时才生效。用户自身状态不属于该概念，由使用方单独判断。
_Avoid_: parsed role, assigned role

**ORCAS Session Identity**:
Gateway Custom SSO 显式启用 ORCAS 集成后，由 ORCAS 返回并绑定到本次 local session 的外部 user/session 引用；它只存在于 ORCAS 专用上下文、Cookie 和端点，不是 IAM 用户档案属性，也不进入 Subject Claim Catalog、Client Subject Projection 或 Gateway Subject Header。
_Avoid_: user detail field, user profile attribute, subject claim, Independent client context

**Custom SSO Authorization Grant**:
基于有效 IAM 登录身份、授予指定 client 一次性继续 Custom SSO 登录的权利。兑换使用 `issued → redeeming → consumed` 状态机：通过已验证的 client、redirect URI 与配置版本原子预占后才能构建投影并签发，预占带 attempt ID 和短租约；Subject Projection 暂时不可用时恢复为 `issued` 且不延长原始有效期，进程异常时租约到期后可重试，只有 Credential 或 Local Session 成功签发时才原子进入 `consumed`，已消费 Grant 永不再次兑换。兑现结果按 client 接入模式是 Independent Client Credential 或 Gateway Local Session，grant 本身不是任一登录会话。
_Avoid_: local session, client session, read-and-delete authorization code

**Independent Client Credential**:
IAM 向 Independent client 签发并管理的 client-scoped credential；第三方可以据此建立自己的本地会话，但该会话不属于 IAM。它只能由服务端通过 `POST /sso/token`、HTTP Basic Custom SSO client authentication 以及与 Authorization Grant 完全匹配的 redirect URI 兑换，不接受 GET 或 query secret 兼容入口。
_Avoid_: third-party local session, IAM-created third-party session

**Gateway Local Session**:
IAM 为 Gateway client 建立并管理的 client-scoped 登录会话。
_Avoid_: Independent Client Credential, third-party local session

**Custom SSO Client Configuration**:
一个 client 对 Custom SSO 接入模式、回调行为和所需 Subject Claims 的独立版本化声明；它由 `customSsoEnabled`、可空的 `customSsoConfig`、Independent 模式专用的 `customSsoSecretHash` 与单调递增的 `customSsoConfigVersion` 表达，不属于 OIDC 配置。未配置、已配置但停用、启用是三个不同状态，`mode` 只区分 Gateway 与 Independent，不使用 `None` 表示关闭；Independent 必须有 Secret Hash，Gateway 必须没有。配置是按 `mode` 区分的严格联合类型，跨模式无意义或未知字段必须被拒绝。配置、启停或 Custom SSO secret 的任何变更都原子递增版本；Authorization Code、Client Binding 和 Credential 必须记录并校验签发版本，因此旧 artifact 即使尚未被批量清理也会 fail closed。配置按 Subject Claim Catalog 版本显式列出完整 `subjectClaims`，其中必须包含 Subject Identifier；新 client 默认只包含该 claim。配置不内嵌永久的按用户维护绕过名单。
_Avoid_: client ext attributes, shared clientSecret, plaintext secret, OIDC client configuration, unversioned SSO settings, userExcluding

**Custom SSO Redirect Pattern**:
Custom SSO client 对允许的实际 redirect URI 使用的显式受限模式。无通配的 URI 只匹配精确路径；只有以 `/*` 结尾才匹配路径子树，主机 `*.` 只匹配一级子域且不匹配根域或多级子域；scheme 与 port 必须精确一致。禁止裸 `*`、公共后缀或 IP 通配、URL credentials、动态 query 与 fragment，动态往返信息改由 `state` 承载。Authorization 阶段先按模式允许实际 URI，随后 Authorization Grant 保存该规范化实际值，callback 或 token 兑换必须与 Grant 逐字匹配；配置版本变化使旧 Grant 失效。
_Avoid_: exact-only redirect registry, implicit origin/path subtree, grant-time pattern rematch

**Custom SSO State**:
Custom SSO V1 中由 client 可选提供的 opaque 流程关联值；存在时 IAM 将其绑定进 Authorization Grant 并在 callback 原样返回，不解释、不修改、不写入普通日志，client 负责校验。缺失时 V1 仍允许继续，IAM 不生成默认值；它不是 Session Token、Authorization Code 或身份声明，未来若改为必填必须通过新的契约版本完成。
_Avoid_: required V1 state, session credential, server-side return URL

**Client Subject Projection**:
IAM 向指定 client 交付的主体属性视图；它始终包含 Subject Identifier、不暴露 IAM 数据库主键，其余字段由该 client 显式声明并受 IAM 允许词汇约束。Independent Client Credential 与 Gateway Local Session 使用同一投影契约。该投影在交付响应时构建，不固化到 Custom SSO credential、session 或其私有 payload 中。Custom SSO 的 JSON Wire Contract 使用版本化嵌套结构，Catalog Claim 由协议 Adapter 映射到字段；未声明字段及其空父对象不出现。`/sso/token` 通过 `subject` 字段返回该投影，不保留 `userInfo` 别名；`/public/user-info` 的 `data` 直接返回该投影。OIDC 使用自己的 Claim 映射，不复用 Custom SSO JSON 外形。
_Avoid_: User Profile, session payload, mode-specific user info

**Subject Projection Not Ready**:
主体身份和 client 授权可能仍然有效、但当前 Subject Facts 尚未满足投影新鲜度要求时产生的暂态领域结果。Custom SSO Adapter 将其映射为 HTTP `503`、稳定 code `SUBJECT_PROJECTION_NOT_READY` 与可配置的短 `Retry-After`，不暴露 Dirty 状态、版本或失败原因；`/sso/token` 同时释放 Grant 预占。OIDC Adapter 映射为标准 `temporarily_unavailable` 并且不签发 Authorization Code。它不是未认证或无权限，不得映射为 `401` 或 `403`。
_Avoid_: unauthorized, forbidden, dirty-state response

**Gateway Subject Header**:
`/auth/authz` 成功时通过 `X-User-Info` 交付的版本化最小主体信息；编码后的 JSON 始终包含 Subject Identifier，只在 Custom SSO client 已声明相应 claim 时包含 username 或 name。它不包含数据库用户主键、phone、employments 或 `iam:authorization`，也不是完整 Client Subject Projection。
_Avoid_: authorization header payload, UserDetail header, legacy id compatibility

**Subject Claim Catalog**:
IAM 定义的版本化语义 claim 词汇，client 从中声明 Client Subject Projection 所需字段；claim 由专用投影映射产生，不直接引用 User Profile DTO 字段或 JSON path。
_Avoid_: UserDetail field list, arbitrary JSON path, protocol scope

**Subject Claim Selection**:
协议 Adapter 从服务端配置及该次已授权范围归一化出的瞬时内部值对象，由 Claim Catalog 版本和可选 claim 集合组成；Subject Identifier 始终隐式包含。它不单独持久化、不进入 session 或 credential，也不接受客户端请求直接指定。
_Avoid_: ProjectionSpec, client configuration, protocol scope, requested HTTP fields

**Subject Facts**:
以 Subject Identifier 为键、供 IAM 内部投影使用的一份协议中性主体事实读模型。用户基础字段来自 User Profile Read Model Row 的显式类型化列；`subject_facts` JSON 只保存当前有效任职，每条包含 `isPrimary`、最小组织及完整路径、最小岗位，以及按不可修改的 `clientCode` 标识的 `clientAuthorizations`，其中角色包含自身 code 与派生 privilege codes。没有任何角色的有效任职仍保留空 `clientAuthorizations`；没有 Effective Role 的 client 不建立授权项，投影时解释为空角色与空权限。它不重复保存顶层角色或权限，不含数据库标识、账号可用性、状态、描述或时间，全部数组在发布时去重并稳定排序。Redis 缓存按主体存一份，由 Client Subject Projection Module 在内存中按 client 和 Subject Claim Selection 裁剪，不持久化 user×client 投影或 `UserDetailDto`。缓存是可重建的性能 Adapter：仅请求 Subject Identifier 时无需读取；请求 Profile Claim 时优先读取 Redis，缺失、损坏或 schema 不支持时通过 single-flight 从 `user_profile` 按 Subject Identifier 读取一行并回填。数据库行缺失或不可解析时返回 Subject Projection Not Ready，不省略已声明字段，也不回退 Legacy Detail 或现场联查源表；任何投影交付前的账号可用性只由 Subject Access Barrier 判定。
_Avoid_: User Profile DTO cache, client projection cache, session payload, legacy detail document, live aggregate fallback, cached account status

**Subject Facts Publication**:
Worker 为指定 Dirty Version 构建候选事实后，在同一数据库事务内锁定并重新校验当前 Dirty 记录、写入带 `sourceDirtyVersion` 的 User Profile、再把同版本 Dirty 标记为 `processed`；版本或状态不匹配时必须丢弃候选结果，不得让旧任务覆盖新事实。数据库提交后才以 `sourceDirtyVersion` 做单调比较并更新 Redis，缓存失败不回滚数据库，旧版本缓存写入不得覆盖新版本。
_Avoid_: best-effort profile publication, separate profile/processed commits, unconditional cache set

**Subject Projection Cutover**:
在维护窗口内完成的新 Subject Projection 数据面硬切换；开放流量前必须为全部现存用户（包括禁用和已删除用户）发布 User Profile Read Model Row，保留并校验唯一非空的 Subject Identifier，使 Profile 的 `sourceDirtyVersion` 与状态为 `processed` 的 Dirty Version 一致，并为每个 Subject 预置与权威账号状态一致的 Subject Access Barrier。用户数、Subject 唯一性、Facts schema、版本一致性或 Barrier 覆盖率任一校验失败都中止发布；运行时 read-through 不是旧结构懒迁移或双读机制。
_Avoid_: login-time migration, partial active-user backfill, runtime dual read

**Subject Access Barrier**:
以 Subject Identifier 为键、由 Session Kernel 在 Redis 中 fail closed 检查的协议中性账号访问状态；它不属于允许短暂陈旧的 Profile Claim。禁用或删除用户前先进入 `blocking`，数据库提交后固化为 `disabled` 并撤销该 Subject 的全部 Principal Session，回滚时解除屏障，异常遗留由 repair worker 通过带 lease 的原子 backlog claim 对照数据库校准；worker 崩溃后 lease 到期可重试，延迟/失败项不会阻塞后续页面。`disabled` 在 API/Admin 映射为 `401 SESSION_INVALID` 并按创建路径清除对应 Cookie；OIDC 映射为协议错误 `login_required`/`invalid_token`。`blocking`、状态缺失、Redis 读取失败或数据不可解析在 API/Admin 映射为 `503 SUBJECT_ACCESS_UNAVAILABLE`，在 OIDC 映射为 `503 temporarily_unavailable`，两者都不清 Cookie。重新启用必须等数据库提交且当前 Subject Facts 发布完成后才进入 `enabled`；同 enabled 的提交恢复原稳定状态，不制造待发布屏障。已撤销 Session 不恢复，用户必须重新登录。
_Avoid_: profile cache field, eventual account disable, protocol-specific blacklist

**Client Authorization Claim**:
`iam:authorization` 表达指定 client 可见的授权主体属性。它包含全部当前有效任职；每条任职使用与 Employment Profile Claim 相同的 `isPrimary`、组织、完整路径和岗位结构，并只附加该 client 的 Effective Roles 及其派生权限，即使没有角色也保留空数组。任职按 Employment Profile Claim 的规则排序，每条及顶层聚合的 role/privilege code 均去重并稳定排序。它不包含其他 client 的授权、数据库标识或授权决策。请求该 claim 时，IAM 只交付已确认与当前授权源一致的数据；授权事实处于待重建、处理中或失败状态时，整份 Client Subject Projection 不可用，不允许省略该 claim 或回退旧值。Custom SSO 在每次生成交付响应时保证新鲜；Independent client 复制到自有会话或存储中的快照由该 client 负责刷新，不属于 IAM 的持续一致性保证。OIDC 只在创建协议拥有的 Claims Snapshot 时保证新鲜，后续 UserInfo 继续读取该不可变快照；OIDC Adapter 保留既有组织与岗位字段名并新增 `isPrimary`，不复用 Custom SSO JSON 外形或输出双字段。
_Avoid_: global roles, global privileges, authorization decision

**Authorization Freshness Barrier**:
构建 `iam:authorization` 前执行的 fail-closed 版本检查；每次严格授权交付都查询 PostgreSQL 中权威的 Dirty 状态与版本，Redis 缓存不能替代该检查。只有 Subject Facts 的 `sourceDirtyVersion` 等于当前 Dirty Version 且状态为 `processed` 时才允许构建；缓存落后但数据库已发布当前事实时先刷新缓存，事实尚未发布则返回可重试的 `503`。任何 `pending`、`processing`、`failed`、缺失或版本不匹配都使整份 Client Subject Projection 不可用，不按 Dirty Reason 例外放行；普通 Profile Claim 不受该屏障阻断。Custom SSO 每次交付时执行，OIDC 在 Authorization Code 签发前创建 Claims Snapshot 时执行；Gateway Subject Header 不选择 `iam:authorization`，因此 `/auth/authz` 的缓存命中路径不访问 PostgreSQL。
_Avoid_: cache TTL check, Redis-only freshness check, dirty-reason allowlist, stale authorization fallback

**Employment Profile Claim**:
`profile:employments` 表达用户当前有效任职的非授权事实，只包含 `isPrimary`、组织 code/name/type、按根到当前组织且包含当前组织的完整路径，以及岗位 code/name。任职、岗位和任职组织必须均启用且未删除；主任职优先，其余按组织 code、岗位 code 稳定排序，无有效任职时返回空数组。它不包含角色、权限、数据库标识、状态、层级数字、起止时间、描述或审计时间。Custom SSO 直接通过 Catalog 声明；OIDC 仅在独立的 `iam:employments` scope 获准时映射，并只进入 UserInfo 使用的 Claims Snapshot，不扩展标准 `profile` scope 或 ID Token。
_Avoid_: raw employment record, Client Authorization Claim, employment history

**Account Recovery**:
用户无法正常登录时，通过已绑定身份凭据重新取得 IAM 账号访问权的自助过程；它不包括普通登录或管理员代为重置凭据。
_Avoid_: open flow, public password helper

**User Resignation**:
管理员原子地结束用户全部有效任职并禁用其 IAM 账号，随后终止该用户全部活跃访问会话的业务流程；会话终止失败不撤销已生效的离职结果。重复执行仍视为成功并再次尝试终止全部会话；它不同于删除单条任职或删除用户。
_Avoid_: employment deletion, user deletion

**OIDC Claims Snapshot**:
OIDC 在授权完成且 Authorization Code 签发前，按 Subject Identifier、client、scope、OIDC 配置版本及当时授权状态创建并固化的协议专用声明视图；选择 `iam:authorization` 时必须先通过 Authorization Freshness Barrier，未就绪则不签发 Code。Authorization Code 持有该 Snapshot，Token Endpoint 只将它转移到 Access Token，不重新读取档案；ID Token 从同一 Snapshot 映射但排除 `iam:authorization` 与 `iam:employments`，后续 UserInfo 也只重放 Snapshot，不混入当前事实。
_Avoid_: token-endpoint live projection, current user profile, current authorization view

**Valid Principal Session**:
用户完成 IAM 身份验证后形成、尚未过期且未被撤销的根登录会话；客户端是否仍打开不影响其有效性。
_Avoid_: online session, 在线会话

**Temporary Login Restriction**:
用户在统计窗口内登录失败次数过多后受到的用户级临时登录限制；它只阻止新的认证，不撤销已有会话，也不是账号禁用或永久黑名单。
_Avoid_: blacklist, 黑名单, disabled account

**Login Restriction Trigger Method**:
使登录失败计数达到限制阈值的最后一种认证方式；它不表示该认证方式独自产生了全部失败。
_Avoid_: restriction cause, failure breakdown

**Session Origin**:
登录时观测到的客户端 IP 和由 User-Agent 推断的粗粒度设备描述；它只用于调查提示，不是可信设备身份或授权依据。
_Avoid_: trusted device, device identity, device fingerprint

**Session Revocation**:
使 IAM 管理的登录会话及其派生访问不再被 IAM 接受的终止操作；它不阻止未来登录，外围清理失败不会恢复其有效性，第三方自行建立的本地会话不在其保证范围内。
_Avoid_: guaranteed third-party logout, reversible logout
