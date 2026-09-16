# SHGAS IAM

本上下文定义 IAM 用户身份、档案和外部 SSO 集成中的核心领域语言，帮助区分稳定用户事实与协议会话事实。

当前词汇采用 [ADR-0035](docs/adr/0035-unify-user-and-client-session-lifecycles.md) 已接受的统一会话模型。
两类会话表达根登录和应用关系；配置、启停与凭据维护不等于永久撤销。代码和环境的交付状态见发布手册。

## Language

**User Profile**:
IAM 中关于一个用户的稳定档案视图，包括用户基础身份信息、任职、角色和权限。
_Avoid_: session payload, protocol payload

**User Profile Base**:
User Profile 面向搜索结果公开的最小稳定身份与联系方式视图，只包含 Subject Identifier、username、name、mobile 和 wxId；它不包含内部 numeric ID、账号分类与状态、排序与审计字段、任职、角色、权限或组织责任。
_Avoid_: UserDto, User Profile Detail, Basic User

**User Profile Search**:
IAM 以未删除的当前 User Profile 为唯一结果根，按照用户自身及明确纳入搜索词汇的当前关联事实筛选用户；Internal Filter DSL 按内部 user ID 稳定排序返回 User Profile Base，既有 Internal 与 Public 适配器保留各自响应形状。Internal 与 Public 搜索观察相同的用户集合，不隐式排除 Pause 或 Disable 状态，调用方可以通过公开的 status 路径显式筛选。任职、组织责任、角色等只作为筛选作用域，不进入 User Profile Base。任职条件只观察 Effective Employment，Privilege Delegation 不进入搜索档案或过滤作用域；本能力不承担历史任职、历史任命或其他实体的通用查询。
_Avoid_: generic entity query, historical profile search, arbitrary data graph query

**User Profile Search Document**:
随 User Profile 一起发布并带版本的当前搜索事实快照；公开结构包含 User 的 subjectIdentifier、username、name、mobile、wxId、userType、status，以及 Effective Employment 的 isPrimary、Organization、Position、Role code、Privilege code 和 Organization Responsibility。Organization 公开 code、name、type 与 Organization Path，Position 公开 code 与 name；内部 numeric ID、任职时间字段和派生索引结构不进入该文档的公开搜索结构。
_Avoid_: source-table view, historical employment document, internal index document

**User Profile Search Path**:
从 User Profile 根沿 User Profile Search Document 的公开结构到达可比较字段的类型化条件路径；Search Document 的公开类型结构是合法路径与通用操作符的唯一机器事实来源，普通标量产生 `eq`/`in`、标量数组产生 `containsAny`/`containsAll`、对象集合通过 `exists` 进入，标记为 Organization 的对象额外产生 `withinSubtreeOf`，不维护独立硬编码字段白名单。每个新增的公开可比较字段都会自动成为所有有效 Internal Client 共享的搜索条件。同一集合元素作用域内的条件必须由同一元素满足，独立作用域可以由不同元素满足；Subject Identifier 属于公开业务身份路径，内部 numeric ID、派生索引字段、未知路径、容器路径、源业务表路径和调用方任意指定的 JSON path 都不属于合法条件路径。
_Avoid_: arbitrary JSON path, source-table path, client-specific search path

**Legacy User Search Adapter**:
既有 Internal 与 Public User Search 请求格式到 User Profile Filter DSL 的契约转换层；它保留原参数名称、参数组合规则和响应形状，但采用 User Profile Search 的统一事实、用户集合与执行边界。Internal `/search` 是待调用方迁移后通过独立变更删除的 deprecated 接口；Public `/search` 因不直接开放 Filter DSL 而继续作为正式 Public 契约，其内部转换不是对外弃用信号。
_Avoid_: second search semantics, public Filter DSL endpoint, permanent internal compatibility endpoint

**User Profile Search Cutover**:
在维护窗口内把全局 User Profile schema 从 v2 单代原地替换为 v3 的协调发布边界；业务读取和源事实写入保持关闭，旧 v2 publisher 停止，唯一固定的 v3 publisher 通过既有 User Profile backfill 工作流重建全部 Profile，完整门禁通过后所有入口统一恢复并只接受 v3。调用方不能选择文档或 DSL 版本，运行时不保存并行代际、不双读或回退，硬切换后不保留旧 DSL 名称或兼容解释。
_Avoid_: online shadow cutover, mixed-version search, caller-selected schema version, per-request version fallback

**Organization Path**:
从根 Organization 到目标 Organization 且包含目标自身的有序当前路径；每个公开节点包含 code、name、type 与 `distanceToTarget`，其中目标自身为 `0`、父级为 `1`。为查询或索引派生的平行数组和组合 key 不属于 Organization Path 的公开结构。
_Avoid_: ancestorCodes, ancestorDepths, ancestorKeys, storage path encoding

**User Profile Filter DSL**:
User Profile Search 用于组合 User Profile Search Path 条件的非空类型化过滤表达式；JSON 节点统一为 `{ and: [...] }`、`{ or: [...] }`、`{ not: expression }`、`{ exists: { path, where } }` 或 `{ field, op, value }`，不兼容旧 `all`/`any`。它只决定用户是否匹配，不负责排序、分页或返回字段投影。集合条件使用带 `where` 的 `exists(path, where)` 建立元素作用域，内部字段路径相对于该作用域，并且不得把不同任职或其他不同关联事实拼成一个虚构事实；当前词汇不提供 null、空集合、字段缺失或无条件集合存在性查询。
_Avoid_: generic query DSL, result projection DSL, flattened relation filter, `all`/`any` boolean vocabulary, null/empty/missing predicate

**User Profile Search Condition**:
User Profile Filter DSL 中对一个 User Profile Search Path 施加的类型化条件；标量 `eq`/`in` 使用规范事实的精确值，不做隐藏 trim、大小写转换或模糊匹配，标量数组使用 `containsAny`/`containsAll` 且查询值去重、非空。条件采用二值逻辑：null 上的原子条件为 false，`not` 对匹配结果取反，因此 `not (mobile eq X)` 包含 mobile 为 null 的用户。Organization 引用的 `withinSubtreeOf` 是“其 Organization Path 中存在给定 Organization code”的简化表达，包含给定 Organization 自身。
_Avoid_: implicit normalization, fuzzy equality, empty membership condition, raw path containment

**User Profile Search Budget**:
保护统一 User Profile Search 的契约资源边界：Filter DSL 最大深度为 8、最多 64 个节点、每个 `and`/`or` 最多 16 个子表达式、每个 `in`/`contains` 最多 50 个去重值、字符串值最长 128；结果最多 500 个 User Profile，并保留数据库查询与请求级超时保护。非法、空或超预算过滤器以及超过结果上限都整体返回 422；无匹配返回 200 空数组，Profile 不可用、文档损坏或查询超时返回 503，任何情况都不截断或返回部分结果。
_Avoid_: unbounded filter, unbounded result set, caller-controlled query cost

**Current Privilege Delegation**:
自身未删除、状态为 Enable 且服务端观察时刻位于闭区间 `[startTime, endTime]` 内的 Privilege Delegation；其引用对象的 Pause 或 Disable 状态以及委托人当时是否拥有该 Privilege 都不参与判定。
_Avoid_: effective authorization, currently authorized delegation

**Privilege Delegation Lifecycle**:
Privilege Delegation 创建时为 Enable，未结束时允许在 Enable 与 Pause 间切换并修改期间或说明；委托人、受托人、组织范围及权限绑定创建后不可修改。Disable 是不可重开的结束状态，结束后不能修改业务字段，纯重复结束保持原有事实。
_Avoid_: mutable delegation bindings, delegation reopening, repeated end time rewrite

**Privilege Delegation Scope**:
一条 Privilege Delegation 适用的组织集合，由指定 Organization 及其全部后代组成；只有被解析的 Organization 属于该集合时，这条委托才可能被匹配。
_Avoid_: exact organization only, global organization scope

**Privilege Delegation Conflict**:
同一委托人的两条未删除且未结束委托，在权限集合、闭区间业务期间和 Privilege Delegation Scope 三者均有交集时形成的冲突；Pause 仍占用期间，受托人相同也不豁免。相同组织及祖先与下级组织的范围有交集，互不包含的部门或独立组织树允许并存。
_Avoid_: global privilege exclusivity, exact-scope-only conflict, nearest-scope override

**Privilege Delegation Resolution Input**:
Privilege Delegation Resolution 中以 username、Organization code 或 Privilege code 指向的存在且未删除领域对象；Pause 或 Disable 状态不影响识别。任一输入无法识别时解析整体失败，不返回部分结果。
_Avoid_: enabled-only resolution input, missing input as no delegation

**Privilege Delegation Resolution**:
在同一服务端观察时刻，对一组已识别 User 和一个指定 Organization、Privilege，按照 Organization scope 覆盖该 Organization 的 Current Privilege Delegation，为每个 User 确定零或一个直接 Delegatee；没有 Current Privilege Delegation 时结果为 null。它不沿委托链递归，也不重新验证委托人当前是否拥有该 Privilege。
_Avoid_: authorization resolution, recursive delegation resolution, missing user as no delegation

**Privilege Delegation Resolution Integrity Violation**:
同一观察时刻、Organization 与 Privilege 下，一个已识别 User 匹配多条 Current Privilege Delegation、匹配记录发生自委托，或匹配记录引用缺失或已删除的 User、Organization 或 Privilege 的数据异常；多条记录即使指向同一 Delegatee 仍属异常，直接委托形成双向环则不属于异常。解析必须整体失败，不得选择或折叠记录、把异常降级为 null 或返回部分结果。
_Avoid_: delegation winner selection, duplicate delegation collapse, self-delegation, multi-delegate resolution

**Legacy User Detail Read Model**:
`user_profile.detail` 中面向既有用户详情与搜索接口预计算的完整 `UserDetailDto` 文档；在这些接口迁移前它仍是被实际使用的读模型，而不是 Custom SSO 兼容字段。Client Subject Projection Module 的 Repository Port 不得暴露、查询或回退到该文档，只能读取 Subject Facts 所需的显式字段；待全部既有消费者迁移后再单独删除。
_Avoid_: Subject Facts, SSO projection fallback, compatibility alias

**User Profile Read Model Row**:
`user_profile` 为每个用户保存一行发布后的读模型，共包含 `user_id`、`subject_identifier`、`username`、`name`、`mobile`、`wx_id`、`status`、`is_delete`、`search_visible`、`profile_schema_version`、`source_dirty_version`、`detail`、`search_doc`、`subject_facts`、`rebuilt_at`、`create_time`、`update_time` 十七列。Subject Facts Repository 只从明确的类型化列与 `subject_facts` 组装内部事实，不读取 `detail` 或 `search_doc`。
_Avoid_: protocol session row, client projection row, untyped profile blob

**Subject Identifier**:
IAM 身份域为一个用户持有的稳定 opaque 标识，也是 User Profile Search 的公开精确身份路径；登录协议可以将它映射到各自契约，但任何协议都不拥有该标识。
_Avoid_: OIDC-owned subject, protocol session ID, username

**IAM Entry**:
调用方访问 IAM 时选用的内网或公网入口，决定同入口导航使用的 IAM 地址及 OIDC issuer；显式配置的 Custom SSO 回调可以跨入口。它表达所选入口，不表示用户实际身处哪个网络，也不构成独立用户或 Client。
_Avoid_: client network location, independent IAM tenant

**Principal Reference**:
Session Kernel 用 `{ principalType, subjectId }` 指向会话主体的最小引用；用户主体的 `subjectId` 是 Subject Identifier，不包含数据库主键、显示名称或档案快照。Principal Session 不再另存通用 Principal Snapshot；协议确需固化的声明快照由各协议自行拥有。
_Avoid_: user snapshot, display user, database user reference

**UserSession**:
用户一次 IAM 认证形成的根登录关系，拥有该次可信主体、原认证事实、主体访问代际和固定到期时间。协议活动不延长它，同一账号的不同根登录彼此独立。
_Avoid_: ClientSession, protocol Token, renewable login slot

**ClientSession**:
指定 UserSession 与一个 Client 的持续应用关系，同一对最多存在一个有效实例，在线使用同时要求该实例和原根有效；后续授权可更新其协议标记并在原根期限内延长。协议切换本身不终止该关系，符合协议前置条件的 Code 兑换失败可触发原实例终止；实例终止或过期后新授权建立新实例，旧 Code/Token 不随之改绑或延长。
_Avoid_: Provider Session, protocol Token, per-protocol relationship, per-authorization scope container

**Authenticated Subject Context**:
共享 HTTP 认证中间件验证 Principal Session 或 Gateway Local Session 后产生的最小请求上下文，只包含 Subject Identifier、已验证的 client code，以及适用时独立保存的 ORCAS session 引用。它不包含 `UserDetailDto`、数据库用户主键、username 或 Client Subject Projection；需要内部账号字段的旧用例必须通过自己的 Account Resolver 按 Subject Identifier 获取。
_Avoid_: request user detail, shared user DTO, protocol claim payload

**Organization Responsibility Type**:
IAM 封闭枚举中可被 Organization Responsibility Assignment 引用的一种组织责任类型；其 code、业务含义与 `assignmentCardinality` 永久稳定且不可复用，任一项需要改变时必须使用新的 Type，历史 Assignment 始终通过 code 解析当前名称和说明而不保存展示文本快照。Type 没有状态或生命周期，已发布成员永久保留并始终可用于新任命；它不表示具体任命或授予 Role、Privilege。
_Avoid_: Organization Responsibility Definition, Organization Responsibility Assignment, Employment, Role Assignment

**Organization Responsibility Type Catalog**:
IAM 唯一拥有的封闭枚举目录，首版只包含 `head` 与 `supervising`，发布后只增不减；全部 Type 及其展示元数据和基数只随受控 IAM 发布演进，当前规范名称全局唯一，Admin 只读且外部来源不得覆盖。目录所有权本身就是来源事实，不为每个 Type 重复保存 source。
_Avoid_: Admin-managed responsibility catalog, HR-synchronized definition catalog

**Head Organization Responsibility**:
code 为 `head`、`assignmentCardinality` 为 `single` 的内置 Organization Responsibility Type，表示目标 Organization 的负责人责任；它由通用 Type 与 Assignment 规则解释，不拥有专用运行逻辑。
_Avoid_: Primary Employment, head role, organization administrator

**Supervising Organization Responsibility**:
code 为 `supervising`、`assignmentCardinality` 为 `multiple` 的内置 Organization Responsibility Type，规范中文名称为“分管领导”，表示目标 Organization 的分管领导责任；它由通用 Type 与 Assignment 规则解释，不拥有专用运行逻辑。
_Avoid_: 分管负责人, Primary Employment, supervising role, organization administrator

**Organization Responsibility Assignment**:
一次 Employment 在明确业务有效期内，为某个 Organization Responsibility Type 承担目标 Organization 责任的持久事实；三项绑定创建后永久不可修改，目标 Organization 不受 Employment 所属组织或组织树位置限制。它具有稳定身份且保留结束后的生命周期记录，录错或调整绑定时结束旧 Assignment 并创建新 Assignment；它不表示任职、角色分配或授权。
_Avoid_: Organization Responsibility Definition, Employment, Role Assignment, Effective Role

**Organization Responsibility Assignment Authority**:
一条 Organization Responsibility Assignment 的唯一权威事实来源，决定其创建和生命周期命令；只有 IAM Admin 命令面可以写入，授权的完整管理员与 HR Administrator 均通过该命令面操作，其他外部系统与 Internal reader 只读。Employment、Organization 或 User 生命周期触发的系统级联仍执行同一 Authority 已声明的后果，并非第二来源；未来引入外部来源必须重新定义所有权，不能与 IAM 通过最后写入覆盖同一事实。
_Avoid_: multi-source assignment authority, external assignment upsert, last-writer-wins responsibility

**Organization Responsibility Period**:
Organization Responsibility Assignment 的权威业务时间边界，采用 `[startTime, endTime)`；创建使用当前事务时刻，Open 期间 `endTime` 为空，只有 End 命令能以当前事务时刻写入该边界。管理员不能预约、回溯或直接设置、改写这些时间。
_Avoid_: scheduled responsibility period, administrator-supplied responsibility dates, audit time

**Organization Responsibility Assignment Lifecycle**:
Organization Responsibility Assignment 创建时为 Enable，Open 期间可在 Enable 与 Pause 间显式切换，End 后进入不可恢复的 Disable 终态；已完成命令的重试不改写既有时间或历史。生命周期记录不物理删除，录入错误通过结束旧 Assignment 并创建新 Assignment 处理。
_Avoid_: scheduled assignment, arbitrary status update, assignment deletion

**Organization Responsibility Assignment History**:
普通历史由 Assignment 的创建时间、结束时间及当前或最终状态表达，不保存可按任意历史时刻查询的 Pause/Resume 状态区间。每条直接或级联状态转换都以统一业务时刻、触发原因和目标写入该 Assignment 自身的审计记录；级联仍归因于发起业务事务的 IAM Admin，只有系统自主发起时 actor 才是 system，且只有 IAM Admin 可查看全部 Open 与 Ended 记录及其审计，Internal、User Profile 与协议投影只消费 Effective 事实。
_Avoid_: bitemporal assignment history, retroactive responsibility reconstruction

**Open Organization Responsibility Assignment**:
尚未 End、状态为 Enable 或 Pause 的 Organization Responsibility Assignment；两种状态都占用所属 Type 的基数槽位，Pause 不释放槽位，也不允许同一持有关系以另一条 Open Assignment 重复占用。
_Avoid_: effective responsibility, enabled assignment, available cardinality slot

**Effective Organization Responsibility Assignment**:
当前时刻处于 Organization Responsibility Period 内、状态为 Enable，且 holder Employment 与目标 Organization 均为 Enable、目标 Organization 未删除的 Assignment；祖先 Organization 的状态和删除标记不参与该判定，User 账号状态同样不参与。
_Avoid_: Open Organization Responsibility Assignment, enabled user responsibility, Role Assignment

**Employment Responsibility Snapshot**:
面向 Internal、User Profile 与协议投影，表示一条 Effective Employment 当前承担的全部 Effective Organization Responsibility Assignment 的非授权档案事实。每项只使用当前 Organization Responsibility Type 的 code 与名称，以及目标 Organization 的 code、名称、类型和从根到目标的当前完整路径，不暴露 Assignment identity、生命周期或期间；没有责任时仍表达空集合，非 Effective Employment 不进入当前快照。
_Avoid_: Organization Responsibility Assignment History, assignment administration detail, Role Assignment, Client Authorization Claim

**Organization Responsibility Assignment Cardinality**:
`single` 要求每个目标 Organization 与 Type 最多存在一条 Open Assignment；`multiple` 允许不同 Employment 并存，但同一目标 Organization、Type 与 Employment 最多存在一条 Open Assignment。同一 User 的不同 Employment 是不同持有关系。
_Avoid_: enabled-only cardinality, per-user responsibility deduplication, duplicate holder assignment

**Organization Responsibility Assignment Integrity**:
Assignment 创建或 Resume 时必须引用 Enable Employment；任何 Open Assignment 都必须引用 Open Employment、自身为 Enable 且未删除的目标 Organization、满足所属 Type 的 Open 基数，且 holder Employment 为 Pause 时不能保持 Enable，目标 Organization 的祖先状态不参与完整性判定。Employment Pause 必须 Pause 其 Enable Assignment，Employment Resume 不自动恢复责任，Employment End、Transfer 或 User Resignation 必须 End 其全部 Open Assignment；当 Organization 自身或任意 descendant 是 Open Assignment 的目标时，该 Organization 不得 Pause、Disable 或 Delete，仅有 Enable descendant 不构成阻断，任何来源造成的规则不满足均是 Organization Responsibility Integrity Violation。
_Avoid_: best-effort responsibility cleanup, orphan responsibility, dynamically resurrected responsibility

**Organization Responsibility Integrity Violation**:
Open Assignment 与其 Employment、目标 Organization 本身或 Type 基数不再满足完整性规则的数据异常；祖先 Organization 的状态或删除不属于该完整性条件。异常不是正常生命周期状态，也不产生 Effective Organization Responsibility Assignment；正常读写必须 fail closed 并报告异常，修复流程不得借读取隐式改写事实。
_Avoid_: paused assignment, automatic read repair, effective orphan responsibility

**Employment**:
用户以某个 Position 在某个 Organization 持有的一次任职期事实；常规 Admin 管理不预约未来任职，也不回溯或改写任职期边界。暂停可在同一 Employment 上恢复，结束后不可重开；返聘、重新任职或转岗产生新 Employment，它只描述组织归属与岗位身份，不表示组织责任或直接授予角色与权限。
_Avoid_: reusable employment slot, Organization Responsibility Assignment, Role Assignment

**Open Employment**:
非 Legacy Employment Tombstone 且尚未结束的 Employment；它可以当前生效或暂停，但仍保持任职关系，因此会阻止其 Position 或所属 Organization 停用与软删除。同一用户在同一 Organization 和 Position 下最多只有一条 Open Employment，结束后的同组合历史不受此限制。
_Avoid_: active employment, enabled employment

**Employment End**:
Open Employment 真实任职期的终态边界；结束后记录仍作为历史事实存在，不可删除、恢复或改写为继续任职。常规 Admin 对录入错误也通过结束旧任职并新建正确 Employment 处理。
_Avoid_: employment deletion, reversible disable

**Legacy Employment Tombstone**:
旧版 Admin 删除入口产生的 `isDelete=true` Employment 兼容记录；它不等同于 Employment End，也不能据其更新时间推断真实结束时间。既有墓碑继续排除在任职、档案与授权计算之外，正式写路径不再产生新的墓碑。
_Avoid_: ended employment, inferred employment history

**Employment Lifecycle**:
Employment 在 Open 期间只能通过显式命令暂停、恢复或结束；暂停与恢复可逆，结束不可逆，已完成的同一命令重试是不改写时间或审计的幂等操作。
_Avoid_: generic status update, arbitrary status transition

**Employment Transfer**:
在同一时刻结束旧 Employment 并以新组织或岗位创建新 Employment 的原子业务过程；新任职始终启用，即使旧任职曾暂停，且旧任职的组织责任不继承。管理员必须在转岗中明确选择新任职是否为 Primary Employment，不从旧任职默认继承。
_Avoid_: in-place employment update, pause-preserving transfer

**Primary Employment**:
由管理员在一个用户的 Open Employment 中最多指定一条的可选主职标记；用户可以没有主任职，系统不根据任职数量或顺序自动选择或改派。暂停的 Employment 可以保留或被指定为主任职，Employment End 才会清除该标记。
_Avoid_: required employment, automatically selected employment

**Employment Authority**:
一条 Employment 的唯一权威事实来源，决定其生命周期命令和任职期边界；当前是 IAM 自主管理，未来可扩展为受信任的外部任职源，但不允许多个来源通过最后写入覆盖同一任职。
_Avoid_: last-writer-wins source, direct database writer

**Employment Period**:
一条 Employment 的权威业务时间边界，采用 `[startTime, endTime)`；空 `endTime` 表示尚未计划结束，非空时必须严格晚于 `startTime`。该区间由 Employment Authority 提供并与接收、处理及审计时间分离；当前 IAM Authority 使用命令的统一事务时刻。
_Avoid_: Employment Tenure Interval, display-only employment dates, message receipt interval

**Employment Integrity**:
Open Employment 必须引用已启用且未软删除的 Position 和所属 Organization；违反时是数据完整性异常，不是 Employment 的一种正常失效状态。正式写路径阻止异常产生，Subject Facts 发布前拒绝异常数据，已发布投影的下游不再联表重查父对象。
_Avoid_: implicit employment pause, downstream parent-state filtering

**Effective Employment**:
当前时刻位于 Employment Period 内且生命周期状态为启用的 Employment。Primary Employment 标记和 User 账号状态不参与该判定；Position 与所属 Organization 的有效性由 Employment Integrity 保证，不作为运行时开关。
_Avoid_: Open Employment, enabled user employment

**Effective Role**:
对一条 Effective Employment 生效的启用角色；其角色分配目标和角色必须启用且未删除。Position 与所属 Organization 由 Employment Integrity 保证，User 账号状态不属于该概念并由使用方单独判断。
_Avoid_: parsed role, assigned role

**HR Administrator**:
对至少一条 Effective Employment 具有 `iam:hr-admin` Effective Role 的管理员主体；`iam:hr-admin` 是绑定 `iam-admin` Client、沿用普通 Role 生命周期的角色，不是内置或受保护角色。该角色自身只授予限定管理能力，其组织范围只从承载该 Effective Role 的 Employment 推导，其他普通 Employment 不扩大范围；与其他角色组合时权限取并集，本角色不撤销其他角色授予的能力。
_Avoid_: full administrator, global administrator, deny-override role

**Admin Authorization Policy**:
IAM Admin 服务端把当前有效管理角色映射为模块、动作与数据范围能力的集中式授权规则；`iam:admin` 授予完整能力，正确绑定 `iam-admin` Client 的 `iam:hr-admin` 授予 HR 限定能力，多角色能力取并集。它不以 `role_privilege`、前端可见性、管理入口 allowlist 或调用方声明的组织范围作为授权事实。
_Avoid_: UI access flag, admin admission allowlist, role-privilege policy, caller-declared scope

**HR Administration Scope Root**:
HR Administrator 的某条角色承载任职所属 Organization Path 中首个一级 Organization；`iam:hr-admin` 通过任职、Position 或 Organization 分配成为该任职的 Effective Role 时口径相同，角色分配目标和路径中的 Company 节点都不替代该结构根。
_Avoid_: nearest Company, role assignment target, ordinary-employment root

**HR Administration Scope**:
HR Administrator 全部 HR Administration Scope Root 自身及其各自完整后代子树的并集；它从当前 Effective Role、Effective Employment 与 Organization Path 推导，任一事实变化都使后续请求立即使用新范围，无法确定时不授予范围，已经通过授权检查的在途请求遵守 Admin Authorization Policy 的请求时一致性边界。
_Avoid_: primary-employment scope, login snapshot, caller-declared organization scope

**HR-Managed User**:
至少有一条 Open Employment 的所属 Organization 位于 HR Administration Scope 内的未删除 User；Pause Employment 仍使用户满足条件，只有已结束任职不满足。该资格允许编辑用户基础档案，但不把范围外任职纳入 HR Administration Scope。
_Avoid_: all-employments-in-scope user, Effective-Employment-only user, employment authorization

**HR-Visible Employment**:
所属 Organization 位于 HR Administration Scope 内的非墓碑 Employment；Open Employment 与已结束历史都可查看，但只有 Open Employment 可执行其允许的生命周期操作，已结束历史不使 User 成为 HR-Managed User。默认管理列表只显示 Open Employment，已结束历史由管理员显式筛选。
_Avoid_: open-only employment view, editable employment history, Legacy Employment Tombstone

**HR User Profile Administration**:
HR Administrator 对未删除 User 的全局读取和对 HR-Managed User 的受限档案管理能力；User 详情与 `iam:admin` 一样展示其全部非墓碑 Employment 及 Role、Privilege，范围外任职保持只读且不能进入任职管理，普通档案编辑只包含 name、mobile、wxId 与 userType。它不创建或删除 User；Credential 重置与 User Status 变更是另行约束的全局账号动作。
_Avoid_: scoped user visibility, user provisioning, user deletion

**HR Credential Reset**:
HR Administrator 为状态为 Enable 的 HR-Managed User 生成一次性展示的新随机密码并撤销该 User 全部现有 Session 的全局账号动作；目标存在范围外 Open Employment 不阻断该动作。它不是管理员指定密码、Account Recovery 或普通档案编辑，Pause 或 Disable User 不允许执行。
_Avoid_: administrator-selected password, Account Recovery, profile edit

**HR User Status Administration**:
HR Administrator 修改 HR-Managed User 全局状态的账号动作；只有目标 User 的每一条 Open Employment 都位于当前 HR Administration Scope 内时才允许，已结束历史不参与判断。它允许既有 User Status 之间的变更，但不授权 User Deletion。
_Avoid_: any-employment status authority, historical-employment scope check, User Deletion

**HR User Resignation**:
HR Administrator 仅在目标是 HR-Managed User 且每一条 Open Employment 都位于当前 HR Administration Scope 内时可以首次执行的 User Resignation；它整体结束这些任职及其开放责任任命、禁用 User 并撤销全部 Session，存在任一范围外 Open Employment 时整体拒绝。已结束历史不参与首次执行的范围判断，也不提供局部离职语义；已 Disable 且没有 Open Employment 的 User 只要至少有一条已结束 Employment 位于当前范围内，就允许幂等重试并再次尝试撤销 Session。
_Avoid_: partial resignation, single-root employment ending, historical-employment scope check

**HR Self-Administration**:
HR Administrator 以自己为目标时仍适用与其他 User 相同的管理规则，不享有额外能力，也不受特殊禁止；动作可以改变或撤销其账号、任职和 HR Administration Scope。已获授权的事务可以完成，后续请求立即使用变化后的当前权限。
_Avoid_: self-management bypass, mandatory self-action prohibition, pre-change authorization snapshot

**HR Organization Administration**:
HR Administrator 对 HR Administration Scope 内 Organization 的管理能力，包括查看根及后代、在范围内父组织下创建子组织，以及在既有完整性门禁内修改名称、类型、状态或删除；它不创建一级根组织、不修改 Organization code，也不移动组织树。
_Avoid_: root provisioning, organization code rename, organization reparenting

**HR Organization Responsibility Administration**:
HR Administrator 对 target Organization 与 holder Employment 所属 Organization 均位于当前 HR Administration Scope 内的 Organization Responsibility Assignment，具有与完整管理员相同的查询、创建和显式生命周期管理能力；两端可以位于不同的 HR Administration Scope Root。Type Catalog 保持只读，Ended 历史继续按请求时当前范围可见，任一端位于范围外都不授予读取或写入能力，本能力也不包含 Assignment 操作日志读取。
_Avoid_: target-only responsibility administration, holder-only responsibility administration, single-root responsibility administration, historical scope snapshot

**HR Employment Responsibility Cascade**:
HR Administrator 改变 HR-Visible Employment 生命周期时，为保持 Organization Responsibility Assignment Integrity 而同步暂停或结束该任职全部相应责任任命的强制后果；Assignment 的目标 Organization 可以位于 HR Administration Scope 外，但只有 holder Employment 与 target Organization 均位于当前范围内时才授予独立管理能力。
_Avoid_: one-sided responsibility administration, optional responsibility cleanup

**HR Primary Employment Administration**:
HR Administrator 可以为 HR Administration Scope 内的 Open Employment 设置或清除 Primary Employment，不要求该 User 的其他 Open Employment 也位于范围内；设置时为保持全局最多一个 Primary Employment，可以清除范围外任职原有的 Primary 标记。该能力不允许把范围外 Employment 直接作为操作目标。
_Avoid_: scope-local primary invariant, out-of-scope employment administration

**HR Employment Administration**:
HR Administrator 可以为任意未删除 User 在 HR Administration Scope 内创建 Employment，并对 HR-Visible Open Employment 修改描述、暂停、恢复或结束；Position 从全局目录选择，已结束 Employment 保持只读。Employment Transfer 的源 Employment 与目标 Organization 都必须位于当前范围并集内，可以跨 HR Administration Scope Root，并继续遵守 HR Employment Responsibility Cascade 与 HR Primary Employment Administration。
_Avoid_: user provisioning, out-of-scope employment mutation, single-root transfer

**ORCAS Session Identity**:
Gateway Custom SSO 显式启用 ORCAS 集成后，由 ORCAS 返回并绑定到本次 local session 的外部 user/session 引用；它只存在于 ORCAS 专用上下文、Cookie 和端点，不是 IAM 用户档案属性，也不进入 Subject Claim Catalog、Client Subject Projection 或 Gateway Subject Header。
_Avoid_: user detail field, user profile attribute, subject claim, Independent client context

**Custom SSO Authorization Grant**:
授予指定 Client 一次性继续 Custom SSO 登录的 Code。适用认证和原实例定位通过后消费；后续失败不恢复 Code，并按兑换规则在本请求内有界尝试终止原 ClientSession。
_Avoid_: local session, client session, recoverable authorization code, replayable exchange result

**Independent Client Credential**:
业务自行接入 Custom SSO 时取得的 Client scoped Token；第三方可以据此建立自己的本地会话，但本地会话不属于 IAM。
_Avoid_: third-party local session, IAM-created third-party session

**Gateway Local Session**:
IAM 托管接入为浏览器保存的 Custom SSO Token 及其 ClientSession 关系；它受根登录、应用关系和当前接入规则约束。
_Avoid_: Independent Client Credential, third-party local session

**Credential Identity**:
标识一次协议 Token 签发的身份，用于在该次签发结果不确定时确认或补偿作用。
_Avoid_: reusable credential slot, bearer token, user identity

**Credential**:
旧模型中访问凭据的名称；统一模型以协议 Token 表达访问凭据，以 UserSession 和 ClientSession 表达登录关系。
_Avoid_: Principal Session, Authorization Grant, unconditional access permission

**Custom SSO Client Configuration**:
一个选择 Custom SSO 的 Client 对单个回调地址、回调类型、允许的业务落地地址和主体披露范围的声明；回调类型由管理员显式选择为托管回调或业务回调，表达由 IAM 还是业务处理，与地址独立。普通编辑不等于终止已有会话，接入启用意图由 SSO Enablement 表达；显式回调类型见 [ADR-0037](docs/adr/0037-classify-managed-sso-callbacks-by-path.md)。
_Avoid_: Independent/Gateway mode, OIDC client configuration, per-request callback selection, ClientSession state

**SSO Enablement**:
一个 Client 对所选 SSO 协议接入能力的启用意图，独立于 Client 的整体状态、Internal API 调用能力和显式会话撤销。关闭时保留配置和既有访问关系，恢复启用只允许仍在原期限内且未被终止的访问继续使用。
_Avoid_: Client Disablement, configuration deletion, Session Revocation

**SSO Client Secret**:
IAM 为 Client 签发、用于所选 SSO 协议的客户端认证凭据，与 Internal API 凭据独立。轮换替换当前值而不撤销既有会话或协议授权，IAM 不主动提供新旧值并存的宽限期。
_Avoid_: Internal API credential, user password, Authorization Code, Session Token

**Client Protocol Selection**:
Client 当前采用的 SSO 协议及其相应配置，决定后续操作允许使用的协议。改变选择不自动撤销已有应用关系，后续授权可以复用有效关系；切回后仍满足自身条件的旧访问可以恢复，永久终止由显式撤销表达。
_Avoid_: immutable ClientSession protocol, protocol revocation epoch, Session Revocation

**Client Runtime Snapshot**:
IAM 在线协议入口为一次业务操作取得的 Client 通行状态与所选协议配置，两者来自同一次源事实观察，后续变更不追溯推翻本操作已接受的事实。新操作重新取得，传播失败时仍可能取得先前已发布的事实；它不代表全局最新配置、Secret 认证结果或会话及协议产物的有效性。
_Avoid_: live Client row, protocol config version, linearizable Client state, Client authentication result

**Protocol Configuration Revocation**:
旧模型中配置编辑驱动协议代际撤销的名称，已退役；当前配置维护与显式会话撤销相互独立。
_Avoid_: validation failure cleanup, unconditional client-wide revocation, Runtime Snapshot invalidation

**Client Maintenance**:
Client 可恢复地暂停在线协议流量的状态；它保留配置、启用意图和原有期限，恢复后未过期且未被撤销的访问可以继续。退出与显式撤销仍可执行，discovery、JWKS 和健康检查不属于该门禁。
_Avoid_: configuration freeze, protocol disablement, maintenance bypass

**Client Disablement**:
Client 被明确行政停用并拒绝在线协议流量的状态；配置和既有关系保留，恢复不会续期，永久终止由显式撤销表达。
_Avoid_: Client Maintenance, configuration removal, protocol reset

**Client Maintenance Unavailable**:
Client Snapshot 明确表示目标 Client 处于 Client Maintenance 时，IAM 在线协议入口产生的可重试暂态结果。配置进入维护本身不终止会话或协议产物；普通访问遇到维护不清除仍可能恢复有效的 Cookie。兑换若已完成认证并定位原 ClientSession，后续失败仍按该兑换操作的既定补偿规则终止原实例，不能由“维护可恢复”推导豁免；认证前拒绝不消费 Code 或作用于会话。Custom SSO 将维护映射为 HTTP `503`、稳定错误码 `AUTH.MAINTENANCE` 和可选重试提示，OIDC 使用相应 endpoint 的 `temporarily_unavailable` 或 HTTP `503` 语义。无法取得可信 Client Snapshot 属于通用暂态不可用，不得冒充明确的 Client Maintenance。
_Avoid_: invalid client, invalid token, unauthorized, protocol revocation

**Custom SSO Redirect Pattern**:
Custom SSO client 对允许的实际 redirect URI 使用的显式受限模式。无通配的 URI 只匹配精确路径；只有以 `/*` 结尾才匹配路径子树，主机 `*.` 只匹配一级子域且不匹配根域或多级子域；scheme 与 port 必须精确一致。禁止裸 `*`、公共后缀或 IP 通配、URL credentials、动态 query 与 fragment，动态往返信息改由 `state` 承载。Authorization 阶段先按模式允许实际 URI，随后 Code 保存该规范化实际值，callback 或 token 兑换必须与 Code 逐字匹配；允许列表变化约束新授权，不以已退役的配置版本比较使旧 Code 失效。
_Avoid_: exact-only redirect registry, implicit origin/path subtree, grant-time pattern rematch

**Custom SSO State**:
Custom SSO V1 中由 client 可选提供的 opaque 流程关联值；存在时 IAM 将其绑定进 Authorization Grant 并在 callback 原样返回，不解释、不修改、不写入普通日志，client 负责校验。缺失时 V1 仍允许继续，IAM 不生成默认值；它不是 Session Token、Authorization Code 或身份声明，未来若改为必填必须通过新的契约版本完成。
_Avoid_: required V1 state, session credential, server-side return URL

**OIDC Client Binding**:
旧 OIDC 模型中的 Client 关系名称；统一模型由协议中性的 ClientSession 表达应用关系。
_Avoid_: generic Client Binding, Custom SSO binding, client configuration, credential

**Client Subject Projection**:
IAM 向指定 Client 实际交付的主体属性视图，始终包含 Subject Identifier，其余字段受该 Client 当前披露配置和 IAM 允许词汇约束，不暴露数据库用户标识。两协议在实际交付时使用同一主体事实与裁剪语义，但保留各自响应形状；OIDC UserInfo 的新披露范围也适用于旧 Token，已签 ID Token 内容固定。
_Avoid_: User Profile, session payload, mode-specific user info

**Subject Projection Not Ready**:
实际主体交付时无法取得合法已发布 Subject Facts 的暂态结果，不表示未认证或无权限。已消费 Code 不恢复；既有 Token 的 UserInfo 可以稍后重试。
_Avoid_: unauthorized, forbidden, dirty-state response

**Gateway Subject Header**:
`/auth/authz` 成功时通过 `X-User-Info` 交付的版本化最小主体信息；编码后的 JSON 始终包含 Subject Identifier，只在 Custom SSO client 已声明相应 claim 时包含 username 或 name。它不包含数据库用户主键、phone、employments 或 `iam:authorization`，也不是完整 Client Subject Projection。
_Avoid_: authorization header payload, UserDetail header, legacy id compatibility

**Subject Claim Catalog**:
IAM 定义的版本化语义 claim 词汇，client 从服务端唯一 active Catalog 中声明 Client Subject Projection 所需字段；Catalog 版本不按 client 持久化或协商，代际升级只在维护窗口内全局硬切换，不提供 Client 代际选择、运行时混读或 fallback。Claim 由专用投影映射产生，不直接引用 User Profile DTO 字段或 JSON path。
_Avoid_: UserDetail field list, arbitrary JSON path, protocol scope

**Subject Claim Selection**:
IAM 按 Client 当前披露配置及适用协议规则确定的本次主体字段选择，始终包含 Subject Identifier。它不是客户端直接指定的字段清单，也不作为会话或 Token 的固定披露快照；OIDC UserInfo 不以旧 Token 原申请范围限制当前选择。
_Avoid_: ProjectionSpec, client configuration, protocol scope, requested HTTP fields

**Subject Facts**:
按 Subject Identifier 识别、供 IAM 内部投影使用的已发布协议中性主体事实，包含基础资料、发布版本中的 Effective Employment、组织及完整路径、岗位，以及按 Client 区分的 Effective Role 和派生权限；无角色的有效任职仍保留，无授权的 Client 在投影中表达空角色与空权限。它由同一主体的全部 Client Subject Projection 共同消费，不包含账号可访问性或授权决策，允许落后于源业务事实，且不承诺固定时间内完成更新；取得合法已发布事实不等于确认其与当前源事实一致。
_Avoid_: User Profile DTO cache, client projection cache, session payload, legacy detail document, live aggregate fallback, cached account status

**Subject Facts Publication**:
Worker 为指定 Dirty Version 构建候选事实后，在同一数据库事务内锁定并重新校验当前 Dirty 记录、写入带 `sourceDirtyVersion` 的 User Profile、再把同版本 Dirty 标记为 `processed`；版本或状态不匹配时必须丢弃候选结果，不得让旧任务覆盖新事实。数据库提交后才以 `sourceDirtyVersion` 做单调比较并更新 Redis，缓存失败不回滚数据库，旧版本缓存写入不得覆盖新版本。
_Avoid_: best-effort profile publication, separate profile/processed commits, unconditional cache set

**Subject Projection Cutover**:
在维护窗口内完成的新 Subject Projection 数据面硬切换；开放流量前必须为全部现存用户（包括禁用和已删除用户）发布 User Profile Read Model Row，保留并校验唯一非空的 Subject Identifier，使 Profile 的 `sourceDirtyVersion` 与状态为 `processed` 的 Dirty Version 一致，并为每个 Subject 预置与权威账号状态一致的 Subject Access Barrier。用户数、Subject 唯一性、Facts schema、版本一致性或 Barrier 覆盖率任一校验失败都中止发布；运行时 read-through 不是旧结构懒迁移或双读机制。
_Avoid_: login-time migration, partial active-user backfill, runtime dual read

**Subject Access Barrier**:
以 Subject Identifier 标识、拥有账号当前可访问状态及访问代际的协议中性屏障，用于判断独立业务操作能否取得 Subject Access Permission；它不属于允许使用已发布旧事实的 Subject Claims，状态缺失或不确定时不能授予许可。禁用与删除阻止后续操作取得许可，重新启用须满足账号与主体事实的发布条件，且不会恢复旧代会话或已撤销会话的有效性。
_Avoid_: profile cache field, eventual account disable, protocol-specific blacklist

**Subject Access Permission**:
一次独立业务操作开始时，根据可信主体、账号访问状态及适用的会话代际取得的访问许可，仅对该次操作的同一主体与代际有效；取得后账号状态变化不追加中途拒绝，但许可不替代会话生命周期、协议和业务授权约束。新的接口调用必须重新取得许可，持久化的代际信息本身不构成许可。
_Avoid_: request-wide boolean, persistent authorization, reusable access token

**Client Authorization Claim**:
`iam:authorization` 表达指定 Client 在已发布 Subject Facts 中可见的授权主体属性，包括有效任职及仅属于该 Client 的有效角色与派生权限，不包含其他 Client 的授权、数据库标识或授权决策。两协议实际交付时均可使用落后于源事实的已发布权限，无法取得合法 Facts 时不能省略必要声明伪装成功，第三方复制后的刷新由其自行负责。
_Avoid_: global roles, global privileges, authorization decision, guaranteed current authorization

**Employment Profile Claim**:
`profile:employments` 表达用户有效任职的非授权事实，包括主任职标记、组织及完整路径、岗位，不包含角色、权限、数据库标识或任职历史。Custom SSO 按当前 Catalog 声明交付，OIDC 按 Client 当前 `iam:employments` 披露范围交付到 UserInfo，不扩展标准 `profile` scope 或 ID Token。
_Avoid_: raw employment record, Client Authorization Claim, employment history

**Account Recovery**:
用户无法正常登录时，通过已绑定身份凭据重新取得 IAM 账号访问权的自助过程；它不包括普通登录或管理员代为重置凭据。
_Avoid_: open flow, public password helper

**User Resignation**:
管理员原子地结束用户全部 Open Employment 并禁用其 IAM 账号，提交后撤销离职前 IAM 活跃 Session 的业务流程；撤销失败不回滚已生效的离职结果。合法重复执行属于无业务变化，仍保留离职意图并尝试完成遗留 Session 撤销，不改写既有结束时间，迟到的撤销不终止恢复启用后新建立的 Session；它不同于普通任职变化、账号禁用或删除用户。
_Avoid_: account disable, employment deletion, user deletion

**User Deletion**:
在用户已不存在任何 Open Employment 后软删除其 IAM 账号；暂停任职仍会阻止删除，已结束的 Employment 与 Organization Responsibility Assignment 历史不会阻止并继续保留。它不替代 User Resignation，也不是普通账号禁用；普通账号 Disable 不改变 Organization Responsibility Assignment。
_Avoid_: User Resignation, account disable, employment cascade deletion

**OIDC Claims Snapshot**:
旧 OIDC 模型中授权时固化的声明视图，已退出当前在线模型；当前 UserInfo 按 Client 当前披露范围交付已发布 Subject Facts，已签发 ID Token 内容固定。
_Avoid_: token-endpoint live projection, current user profile, current authorization view

**Valid Principal Session**:
旧模型中有效根登录的名称；当前使用有效 UserSession，要求根未过期、未撤销且主体访问许可仍成立。
_Avoid_: online session, 在线会话

**Principal Session Record**:
旧模型中管理可观察根记录的名称；当前管理查询观察 UserSession，记录可见不等于本次访问获准。
_Avoid_: valid session, online user, 在线用户

**Authentication Continuation**:
IAM 在身份验证前保留、并在身份验证后继续原 Custom SSO 或 OIDC 授权请求的上下文，包含首次已接受的授权事实。恢复不因普通配置编辑重新审核原 redirect/scope 允许范围，但仍受当前流量、协议启用与适用认证规则约束；有效根登录应被复用，普通登录页参数不能绕过续接。
_Avoid_: post-login homepage, new login attempt, generic redirect, force-login query

**Protocol Reauthentication Requirement**:
OIDC Client 对当前授权请求提出、并由 OIDC 验证和绑定到 Authentication Continuation 的新鲜身份验证要求；没有有效会话时它可通过首次登录满足，已有有效 UserSession 时 IAM 不再次执行身份验证，而以 `login_required` 终止本次授权。任意登录页 query 或 Custom SSO 参数不构成该要求。
_Avoid_: force-login query, repeated login, session refresh

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
使明确捕获的 UserSession 或 ClientSession 不再被 IAM 接受的终止操作；Token 使用验证根与应用关系，旁路协议清理失败不会恢复已终止关系。它不阻止未来登录，不保证第三方自行建立的本地会话退出。
_Avoid_: guaranteed third-party logout, reversible logout
