# SHGAS IAM

本词汇表定义 IAM 的用户与组织、角色与委托、登录会话和应用接入术语。

## Language

### 目录文档与搜索

档案描述用户本身，目录文档记录已发布的事实。[目录搜索与时效](docs/features/directory-management.md#目录搜索) · [统一文档模型](docs/adr/0046-unify-user-and-organization-read-documents.md#事实来源与发布边界)

**User Profile**:
IAM 中关于一个用户的稳定档案视图，包括用户基础身份信息、任职、角色和组织责任。
_Avoid_: session payload, protocol payload

**User Document**:
按用户发布的目录事实，供用户搜索、精确详情和 SSO 资料交付共用。对外隐藏内部标识，每条有效任职只披露本应用可见的角色，没有可见角色也保留该任职。
_Avoid_: User Profile Search Document, User Profile Base, protocol payload

**Organization Document**:
按组织发布的目录事实，包含组织属性和完整路径，供搜索与精确详情共用。它可以落后于组织源记录。
_Avoid_: Organization Search Document, organization source of truth, editable organization document

**Organization Path**:
从根组织到目标自身的有序路径，保留暂停或禁用的祖先。根的层级为 1，目标到自身的距离为 0。[公开节点字段](docs/guides/README.md#单点登录的共同处理)
_Avoid_: ancestorCodes, ancestorDepths, storage path encoding

**User Search**:
以用户为结果根，按用户及其明确公开的关联事实筛选，并返回当前 Client 可见的 User Document 或其选定字段的查询能力。
_Avoid_: generic entity query, historical profile search

**Organization Search**:
按组织自身属性和完整路径查询未删除组织的能力。启用、暂停、禁用的组织均可查，调用方可筛选状态，查询范围限于组织目录。
_Avoid_: organization member search, generic entity query

**Internal Role Visibility**:
已认证 Internal Client 可查询的角色范围，包括各有效任职上的全局角色和该 Client 的应用角色。过滤、计数、结果和详情使用同一范围，独立于 SSO 启用与披露配置。
_Avoid_: cross-Client private role search, caller-selected client, response-only role filtering

**Internal Directory Detail**:
按公开标识读取的已发布用户或组织资料，范围包括未删除的启用、暂停和禁用对象。同一发布版本和披露范围下，详情与未裁剪字段的搜索单项一致。
_Avoid_: Admin detail, source-table DTO, protocol payload

**Directory Tombstone**:
已发布目录中标记对象已删除的带版本记录，仅保留对象标识和版本信息。暂停、禁用或目录缺行都不能作为删除依据。
_Avoid_: missing document, disabled account, deleted source record

**Directory Search Path**:
目录条件可引用的公开文档字段路径，由文档结构和字段类型限定。角色路径还受 Internal Role Visibility 约束。
_Avoid_: arbitrary JSON path, source-table path, caller-selected client

**Filter DSL**:
组合目录查询条件的非空表达式，只决定是否匹配。`exists` 内的条件须由同一集合元素满足，例如同一条任职或同一个路径节点。
_Avoid_: generic query DSL, result projection DSL, flattened relation filter

**Directory Search Condition**:
公开字段上的精确值比较，字符串保留大小写和首尾空格，集合值非空且去重。空值上的原子条件为假，否定对结果取反，角色比较限于当前 Client 可见集合。[组织子树与组合条件](docs/guides/search.md#组合条件)
_Avoid_: fuzzy equality, implicit normalization, global role filtering

**Directory Search Budget**:
目录查询对条件复杂度、返回规模和执行时间的限制。分页只限制本页，每页独立观察发布状态，本页任何对象读取失败都会使整页失败。[查询预算与失败结果](docs/guides/search.md#处理结果)
_Avoid_: unbounded filter, unbounded result set, partial search success

**Document Outbox Entry**:
源事实变更产生的一项文档更新义务。处理完成表示受影响对象的重建要求已登记，已有合法文档仍可读，新版本可能尚未发布。
_Avoid_: published document change, queue delivery receipt, document rebuild state

**Document Rebuild State**:
目标文档应达到的版本及其处理进度，完成后仍可用来判断已发布文档是否满足最新重建要求。[文档更新的发布与恢复](packages/documents/README.md#共享发布与恢复)
_Avoid_: queue job, business status, event checkpoint

### 用户生命周期与任职

任职的日期通过状态转换生效。[状态计算](docs/features/directory-management.md#任职状态计算) · [按日有效期决策](docs/adr/0011-model-employment-as-an-immutable-tenure-lifecycle.md#按日有效期)

**Employment**:
用户在某一组织担任某一岗位的一次任职，角色分配与组织责任分别记录。启用或暂停且未删除的账号可新增任职，返聘、重新任职或转岗均建立新记录。
_Avoid_: reusable employment slot, Organization Responsibility Assignment, Role Assignment

**Open Employment**:
未结束且非历史墓碑的任职，包括未启用、启用和暂停。同一用户在同一组织与岗位组合下最多有一条开放任职，它阻止删除该用户，也阻止停用或删除该组织和岗位。
_Avoid_: active employment, enabled employment

**Effective Employment**:
已启用且非历史墓碑的任职，即使已到截止日，在状态转为结束前仍然有效。主任职标记与用户账号状态均不参与判定。
_Avoid_: Open Employment, enabled user employment

**Pending Employment**:
等待按日期启用的开放任职，中文称“未启用任职”。它尚未生效，可人工暂停以阻止自动启用，不能强制提前启用。
_Avoid_: paused employment, ended employment, effective employment

**Employment Period**:
任职按北京时间自然日计算的左闭右开区间，包含开始日，不含截止日。两端分别可空，同时指定时开始日须早于截止日。
_Avoid_: Employment Validity Period, Employment Lifecycle, actual lifecycle timestamps, message receipt interval

**Employment Lifecycle**:
任职的未启用、启用、暂停和结束四种状态，结束不可逆。到期优先结束，暂停在到期前保持至显式恢复，恢复时按日期重算，重复操作保留既有事实。
_Avoid_: generic status update, arbitrary status transition

**Employment End**:
一次任职不可逆的结束，以实际结束日作为截止日。结束的任职只读并保留历史，重新任职或纠正绑定须另建记录。[结束时的日期修正](docs/features/directory-management.md#任职状态计算)
_Avoid_: employment deletion, reversible disable

**Employment Transfer**:
同一次操作中当天结束旧任职，并在新组织或岗位创建当日生效的新任职，旧任职即使暂停也如此。停用账号不能转岗，新任职须明确是否为主任职，截止日另定，组织责任不继承。
_Avoid_: in-place employment update, pause-preserving transfer

**Primary Employment**:
获授权的管理员从用户的开放任职中指定的主任职，每人最多一条，也可没有。未启用或暂停的任职仍可被指定，结束后清除标记，不自动改派。
_Avoid_: required employment, automatically selected employment

**Employment Authority**:
对一条任职的创建、生命周期与期间拥有唯一决定权的事实来源。当前由 IAM 自主管理。
_Avoid_: last-writer-wins source, direct database writer

**Employment Integrity**:
每条开放任职都须关联启用且未删除的岗位和所属组织。违反这一前提属于数据异常，不能据此将任职解释为暂停。[任职完整性与发布](docs/adr/0011-model-employment-as-an-immutable-tenure-lifecycle.md#理由与代价)
_Avoid_: implicit employment pause, downstream parent-state filtering

**Legacy Employment Tombstone**:
旧管理入口删除任职后留下的兼容记录，排除在任职、档案和授权计算之外。墓碑的更新时间不能用来推断实际结束日。
_Avoid_: ended employment, inferred employment history

**User Resignation**:
原子地结束用户全部开放任职及关联开放责任并禁用账号，提交后再撤销离职前的会话。撤销失败时离职仍生效，重试可继续清理遗留会话，保留原结束时间及重新启用后的新登录。[会话清理边界](packages/subject-access/README.md#账号生命周期)
_Avoid_: account disable, employment deletion, user deletion

**User Disablement**:
账号可恢复的停用状态，阻止新增任职和转岗。已有任职及其责任保留，开放任职仍可维护，账号恢复后可新增任职。
_Avoid_: permanent user end, User Deletion, Employment End

**User Deletion**:
软删除 IAM 账号的操作，前提是用户没有开放任职，也没有作为任一方被未结束委托引用。已结束的任职和组织责任历史继续保留。
_Avoid_: User Resignation, account disable, employment cascade deletion

### 组织责任

责任记录谁以哪条任职对哪个组织负责。[任命与联动](docs/features/directory-management.md#组织责任管理) · [写入与一致性](docs/adr/0014-model-organization-responsibility-as-employment-bound-fact.md#理由与代价)

**Organization Responsibility Type**:
IAM 定义的组织责任种类。编码、业务含义和名额规则永久固定，已发布类型始终可任命，历史任命沿用该类型的当前名称。
_Avoid_: Organization Responsibility Definition, Organization Responsibility Assignment, Employment, Role Assignment

**Organization Responsibility Type Catalog**:
由 IAM 统一发布、只增不减的责任类型目录，现有 `head` 和 `supervising`。目录名称全局唯一，管理员和外部系统只读。
_Avoid_: Admin-managed responsibility catalog, HR-synchronized definition catalog

**Head Organization Responsibility**:
目标组织的负责人责任，编码为 `head`，每个组织最多保留一条该类型的开放任命。
_Avoid_: Primary Employment, head role, organization administrator

**Supervising Organization Responsibility**:
目标组织的分管领导责任，编码为 `supervising`，允许多个不同任职同时承担。
_Avoid_: 分管负责人, Primary Employment, supervising role, organization administrator

**Organization Responsibility Assignment**:
一条任职在业务有效期内为目标组织承担某类责任的非授权档案事实，目标可跨组织树。任职、责任类型和目标一经绑定即固定，调整时须结束原任命并新建。
_Avoid_: Organization Responsibility Definition, Employment, Role Assignment, Effective Role

**Organization Responsibility Assignment Authority**:
一条组织责任任命的唯一权威来源。由获授权的完整管理员或 HR 通过 IAM 管理，任职等关联对象变化可按同一规则触发联动，外部系统只读。
_Avoid_: multi-source assignment authority, external assignment upsert, last-writer-wins responsibility

**Organization Responsibility Period**:
责任任命从创建到结束的业务期间，含创建时刻，不含结束时刻，开放任命没有结束时刻。两端由实际业务操作确定，不能预约、回溯或直接改写。
_Avoid_: scheduled responsibility period, administrator-supplied responsibility dates, audit time

**Organization Responsibility Assignment Lifecycle**:
任命创建即启用，开放期间可暂停和恢复，结束后永久只读。重复操作保留原有业务时间与历史。
_Avoid_: scheduled assignment, arbitrary status update, assignment deletion

**Organization Responsibility Assignment History**:
任命的起止时刻及当前或最终状态，显示关联对象的当前名称和删除状态，无法还原历次暂停区间或旧名称。直接或级联变更均记入任命审计，管理员发起的级联归因于本人，系统自主变更归因于系统，历史和审计的查看权限分别判断。[责任历史](docs/features/directory-management.md#组织责任管理)
_Avoid_: bitemporal assignment history, retroactive responsibility reconstruction

**Open Organization Responsibility Assignment**:
启用或暂停且尚未结束的责任任命。两种状态都占用所属类型的名额，同一持有关系不能重复占位。
_Avoid_: effective responsibility, enabled assignment, available cardinality slot

**Effective Organization Responsibility Assignment**:
处于有效期间的启用任命，持有任职须启用，目标组织自身须启用且未删除。持有人账号和目标组织祖先的状态均不参与判定。
_Avoid_: Open Organization Responsibility Assignment, enabled user responsibility, Role Assignment

**Employment Responsibility Snapshot**:
一条有效任职当前承担的全部有效责任，可为空。对外只披露责任类型的编码、名称及目标组织的编码、名称、类型和完整路径，不交付任命标识、历史或授权。
_Avoid_: Organization Responsibility Assignment History, assignment administration detail, Role Assignment, Client Authorization Claim

**Organization Responsibility Assignment Cardinality**:
对同一目标组织和责任类型，`single` 只允许一条开放任命，`multiple` 允许多个持有任职各占一条。同一用户的不同任职分别计数。
_Avoid_: enabled-only cardinality, per-user responsibility deduplication, duplicate holder assignment

**Organization Responsibility Assignment Integrity**:
开放任命须关联开放任职及启用、未删除的目标组织并满足名额限制，创建和恢复还要求持有任职有效。任职暂停或退回未启用时联动暂停责任，再启用须显式恢复责任，任职结束时一并结束开放责任，开放责任阻止暂停、停用或删除目标组织及其祖先。
_Avoid_: best-effort responsibility cleanup, orphan responsibility, dynamically resurrected responsibility

**Organization Responsibility Integrity Violation**:
开放任命违反持有任职、目标组织自身或类型名额约束的数据异常。遇到异常时整批拒绝并报告，修复须显式进行。[责任解析与完整性检查](packages/assignment-resolution/README.md#organization-responsibility-解析)
_Avoid_: paused assignment, automatic read repair, effective orphan responsibility

### 角色、管理授权与 HR 范围

IAM 交付角色事实，接入应用解释自己的业务权限。[角色归属](docs/adr/0048-model-global-roles-without-client-ownership.md) · [组合继承](docs/adr/0049-compose-roles-across-clients.md) · [HR 管理范围](docs/features/roles-and-authorization.md#admin-权限与-hr-范围)

**Effective Role**:
一条有效任职通过有效分配直接或经组合继承获得的角色，分配目标与继承路径上的每个角色均须启用且未删除。任一有效路径即可授予该角色，使用方另行判断账号状态。
_Avoid_: parsed role, assigned role

**Basic Role**:
仅授予自身的角色，可通过角色分配或组合继承在任职上生效。基本形态在创建时确定，与角色归属独立。

**Composite Role**:
显式创建、允许包含其他角色的角色，组合形态在创建时确定，与角色归属独立。它生效时授予自身及同一任职上的有效成员，
空组合仍可分配并授予自身。
_Avoid_: assignment template

**Role Inclusion**:
一个 Composite Role 包含另一个角色的有向授予关系，允许跨 Client 且可多层嵌套，禁止自引用与循环。
同一任职通过多条有效路径获得同一个 Role 时，该角色只计一次。
_Avoid_: Role Assignment, Client Delegation

**Client Role**:
归属一个 Client 的角色。成为 Effective Role 后，只有所属 Client 可以在应用侧读取该角色事实。

**Global Role**:
由 IAM 统一管理、无 Client 归属的角色。成为 Effective Role 后，各 Client 可在各自的披露范围内读取该任职上的角色事实。
_Avoid_: global administrator, automatic grant

**Admin Authorization Policy**:
IAM 管理端按请求时的有效角色授予模块、动作和数据范围。`iam:admin` 拥有完整能力，归属 `iam-admin` 的 `iam:hr-admin` 拥有限定能力，多角色取并集。[授权事实与观察时点](docs/adr/0017-centralize-admin-role-policy-with-request-time-scope.md#权威与观察时点)
_Avoid_: UI access flag, admin admission allowlist, role-privilege policy, caller-declared scope

**HR Administrator**:
至少在一条有效任职上具有 `iam:hr-admin` 有效角色的管理员。该角色归属 `iam-admin`，遵循普通角色生命周期，仅以承载它的任职推导 HR 范围。
_Avoid_: full administrator, global administrator, deny-override role

**HR Administration Scope Root**:
承载 HR 有效角色的任职所在组织路径的一级根。直接分配与组合继承使用同一规则，分配目标和路径中的公司节点不能替代该根。
_Avoid_: nearest Company, role assignment target, ordinary-employment root

**HR Administration Scope**:
管理员全部 HR 范围根及其后代子树的并集，每次请求按当前角色、任职和组织路径判断。无法确定范围时不授权，已获授权的在途请求仍可能完成。
_Avoid_: primary-employment scope, login snapshot, caller-declared organization scope

**HR-Managed User**:
至少有一条开放任职位于当前 HR 范围内的未删除用户。该资格允许维护基础档案，范围外任职仍然只读，仅有已结束任职不足以取得资格。
_Avoid_: all-employments-in-scope user, Effective-Employment-only user, employment authorization

**HR-Visible Employment**:
所属组织在当前 HR 范围内的非墓碑任职，含开放任职和已结束历史。默认列表展示开放任职，历史只读，也不能单独使用户成为 HR-Managed User。
_Avoid_: open-only employment view, editable employment history, Legacy Employment Tombstone

**HR User Profile Administration**:
HR 可读取全部未删除用户及其全部非墓碑任职和角色，范围外任职只读。HR 仅可为 HR-Managed User 编辑姓名、手机号和用户类型，无权创建或删除用户，账号状态与凭据重置另有条件。
_Avoid_: scoped user visibility, user provisioning, user deletion

**HR Credential Reset**:
HR 为已启用的 HR-Managed User 重置随机密码并撤销其全部现有会话的账号操作，新密码只展示一次。该用户有范围外开放任职也可重置，暂停或停用账号不适用。
_Avoid_: administrator-selected password, Account Recovery, profile edit

**HR User Status Administration**:
HR 仅可变更全部开放任职均在当前范围内的 HR-Managed User 的全局账号状态。已结束任职不参与判断，无开放任职的停用账号须由完整管理员先恢复。
_Avoid_: any-employment status authority, historical-employment scope check, User Deletion

**HR User Resignation**:
HR 首次办理离职须有至少一条开放任职，且全部开放任职都在当前范围内，须整体离职。用户已停用且无开放任职时，只要有一条已结束任职在当前范围内，就允许重试清理离职前的会话。
_Avoid_: partial resignation, single-root employment ending, historical-employment scope check

**HR Self-Administration**:
HR 管理自身时遵循与其他用户相同的规则。已获授权的操作可完成，由此改变或撤销的权限对后续请求生效。
_Avoid_: self-management bypass, mandatory self-action prohibition, pre-change authorization snapshot

**HR Organization Administration**:
HR 可查看范围根及其后代，在范围内父组织下创建子组织，并在完整性约束内编辑名称、类型、状态或删除组织。创建一级根、改组织编码和移动组织树超出该能力。
_Avoid_: root provisioning, organization code rename, organization reparenting

**HR Organization Responsibility Administration**:
任职所属组织与目标组织均在当前 HR 范围时，HR 可查询、创建及管理任命，两端可跨不同范围根。已结束历史也按当前双端范围读取，类型目录只读，操作日志需独立权限。[双端范围](docs/adr/0017-centralize-admin-role-policy-with-request-time-scope.md#hr-组织责任的双端边界)
_Avoid_: target-only responsibility administration, holder-only responsibility administration, single-root responsibility administration, historical scope snapshot

**HR Employment Responsibility Cascade**:
HR 改变范围内任职状态时，必须相应暂停或结束其责任，即使责任目标在范围外。该联动不授予对范围外责任的独立管理权。
_Avoid_: one-sided responsibility administration, optional responsibility cleanup

**HR Primary Employment Administration**:
HR 可设置或清除范围内开放任职的主任职标记，无须目标用户的其他开放任职均在范围内。设置新主任职会清除旧标记，即使旧主任职位于范围外。
_Avoid_: scope-local primary invariant, out-of-scope employment administration

**HR Employment Administration**:
HR 可为未删除且未停用的用户在范围内新增任职，从全局岗位目录选岗，可修改范围内开放任职的备注和有效期，也可按生命周期规则暂停、恢复或结束任职。转岗要求源任职与目标组织均在当前范围，可跨授权根。
_Avoid_: user provisioning, out-of-scope employment mutation, single-root transfer

### 应用委托

[委托调用与错误处理](docs/guides/delegation.md) · [写入与事务](packages/delegation/README.md#装配与事务)

**Client Delegation**:
一个应用中，为委托人在指定组织范围确定直接代办人的关系。受托人使用自己的身份，角色和权限保持独立。
_Avoid_: permission grant, role inheritance, impersonation

**Client Delegation Scope**:
委托覆盖所选组织及其当前全部后代，后来新增的后代也在范围内。
_Avoid_: exact organization only, implicit global scope, creation-time subtree snapshot

**Client Delegation Lifecycle**:
委托无需受托人确认，双方用户、应用及所选组织固定。未手动结束时可改期间与说明、暂停或恢复，即使自然到期仍可延期，手动结束后只读且不能重开。
_Avoid_: delegatee approval, mutable delegation bindings, delegation reopening, delegation deletion

**Client Delegation Conflict**:
同一委托人在同一应用的两条开放委托，组织范围和闭区间期间同时重叠即冲突。时间端点相接算重叠，暂停或受托人相同都不豁免。
_Avoid_: nearest-scope override, duplicate delegation collapse, paused-slot reuse

**Current Client Delegation**:
已启用且观察时刻在闭区间业务期间内的委托。双方用户或组织暂停、停用不影响已有委托的解析，能否登录或代办业务由相应应用另行判断。
_Avoid_: effective authorization, delegatee login permission, automatic delegation termination

**Open Client Delegation**:
已启用或暂停且尚未手动结束的委托，包括尚未开始和已自然到期的记录。它阻止删除任一方用户、所绑定的应用及所选组织。
_Avoid_: Current Client Delegation, automatic delegation expiry, implicit cascade termination

**Client Delegation Resolution**:
按同一观察时点，为指定用户和组织在已认证 Client 内查找零或一个直接代办人。无匹配返回 `null`，不沿委托链递归，也不检查双方角色或权限。[读取一致性](docs/adr/0020-provide-fail-closed-privilege-delegation-resolution.md#直接解析与公开边界)
_Avoid_: caller-selected client, cross-client delegation resolution, authorization resolution

**Client Delegation Resolution Input**:
由用户名或组织编码标识的未删除用户或组织，暂停、停用均可识别。任一输入无法识别时整次解析失败。
_Avoid_: enabled-only resolution input, missing input as no delegation, caller-selected client

**Client Delegation Resolution Integrity Violation**:
同一用户在给定应用、组织和时刻匹配多条委托、匹配到自委托，或匹配记录引用缺失、已删除的对象时，整次解析失败。多条记录指向同一人也属异常，两人分别直接委托对方则允许。
_Avoid_: delegation winner selection, duplicate delegation collapse, self-delegation, multi-delegate resolution

### 主体身份、会话与认证

[根登录与应用会话](docs/features/login-and-session.md#登录与应用会话) · [会话关系与观察](packages/session-kernel/README.md#会话与可信观察)

**Subject Identifier**:
IAM 为用户分配的稳定、不透明的公开身份标识，可用于精确查询用户。各协议都可引用它，其归属始终在 IAM 身份域。
_Avoid_: OIDC-owned subject, protocol session ID, username

**IAM Entry**:
调用方选用的 IAM 内网或公网入口，决定同入口导航地址及 OIDC issuer。显式配置的 Custom SSO 回调可跨入口，入口选择本身不能证明用户实际所在网络。
_Avoid_: client network location, independent IAM tenant

**Principal Reference**:
会话通过 Subject Identifier 对 IAM 用户建立的身份引用，只标识主体。显示名称、档案和协议声明各有自己的来源。
_Avoid_: user snapshot, display user, database user reference

**UserSession**:
用户一次 IAM 认证形成的根登录关系，拥有该次可信主体、原认证事实、主体访问代际和固定到期时间。协议活动不延长它，同一账号的不同根登录彼此独立。
_Avoid_: ClientSession, protocol Token, renewable login slot

**ClientSession**:
一个 UserSession 与一个 Client 至多有一个有效应用会话，在线使用须原根与原实例同时有效，后续授权可跨协议复用并在根期限内延长它。终止或过期后，新授权建立新实例，旧 Code 和 Token 仍绑定原实例，期限不延长。
_Avoid_: Provider Session, protocol Token, per-protocol relationship, per-authorization scope container

**Authenticated Subject Context**:
一次请求经根会话或网关局部会话认证后取得的最小身份信息，只含 Subject Identifier，以及适用时已验证的 Client 编码。用例所需的账号字段另行获取。
_Avoid_: request user detail, shared user DTO, protocol claim payload

**Authentication Continuation**:
认证前保留的原 Custom SSO 或 OIDC 授权请求，供认证后或复用有效根登录时继续。普通允许列表编辑保留首次接受的地址和范围，续接仍受当前通行、协议和认证规则约束。[登录页续接](docs/adr/0013-guard-login-page-reentry-with-authentication-continuation.md)
_Avoid_: post-login homepage, new login attempt, generic redirect, force-login query

**Protocol Reauthentication Requirement**:
由 OIDC 校验并绑定到本次授权续接的新鲜认证要求，普通页面参数或 Custom SSO 参数不能提出此要求。无有效根时可由首次登录满足，已有有效根而必须重新认证时返回 `login_required`。
_Avoid_: force-login query, repeated login, session refresh

**企业微信跨设备扫码登录**:
用户在手机端通过企业微信证明登录身份并确认本次登录，再由发起请求的电脑浏览器完成 IAM 登录、继续原 Authentication Continuation 的认证方式。
_Avoid_: 企业微信工作台免登、企业微信第三方登录回调

**企业微信身份绑定**:
经企业微信验证的身份与既有 IAM 账号的关联，一个账号可绑定一个本企业成员身份及多个外部身份，每个身份同时只归一个账号。停用账号保留绑定，完整管理员可逐条解绑。[扫码与绑定](docs/features/login-and-session.md#企业微信跨设备扫码登录) · [旧接口兼容](docs/adr/0053-bind-wecom-identities-through-one-qr-flow.md#旧接口兼容)
_Avoid_: 手机号自动匹配、扫码开户

**Account Recovery**:
用户无法正常登录时，通过已绑定身份凭据恢复账号访问权的自助过程，与管理员代为重置凭据分别处理。
_Avoid_: open flow, public password helper

**Image CAPTCHA Proof**:
IAM 确认图片验证码已答对后授予的一次性人机校验证明。它只适用于原操作及其目标，短信发送还受原短信用途约束。
_Avoid_: SMS verification code, login credential, session token

**Temporary Login Restriction**:
用户在统计窗口内登录失败过多后，对新认证施加的临时限制。已有会话保留，账号状态不变。
_Avoid_: blacklist, 黑名单, disabled account

**Login Restriction Trigger Method**:
使登录失败计数达到限制阈值的最后一种认证方式，之前的失败可以来自其他认证方式。
_Avoid_: restriction cause, failure breakdown

**Session Origin**:
登录时观测的客户端 IP 与根据 User-Agent 推断的粗粒度设备描述，仅供调查，不能证明设备身份或授予访问权。
_Avoid_: trusted device, device identity, device fingerprint

**Session Revocation**:
终止已确定的根登录或应用会话实例，使依赖它的后续 IAM 在线访问失效。附带清理失败不会恢复原关系，也不妨碍以后重新登录，第三方自建会话由第三方负责。[批量撤销与重试](packages/session-kernel/README.md#列表与撤销) · [运维清理](docs/releases/authentication-and-session.md#会话清理)
_Avoid_: guaranteed third-party logout, reversible logout

### 应用接入、单点登录与网关

**Client Protocol Selection**:
Client 当前选用的 SSO 协议及配置，决定后续操作可使用哪种协议。切换保留有效应用关系，切回时仍在原期限内且满足条件的旧访问可恢复。
_Avoid_: immutable ClientSession protocol, protocol revocation epoch, Session Revocation

**SSO Enablement**:
Client 是否启用所选协议登录的设置，独立于应用整体状态、Internal API 凭据和会话撤销。关闭保留配置与原关系，重新开启仅允许仍有效的访问。
_Avoid_: Client Disablement, configuration deletion, Session Revocation

**Client Maintenance**:
可恢复的应用维护状态，暂停在线协议流量，保留配置、SSO 启用意图、原关系与期限。退出、显式撤销、服务发现、JWKS 和健康检查仍可使用。
_Avoid_: configuration freeze, protocol disablement, maintenance bypass

**Client Maintenance Unavailable**:
目标应用明确处于维护时的可重试结果，普通访问保留 Cookie，配置无法确认时只能判为通用暂态失败。OIDC 或 Custom SSO 业务兑换已完成适用认证并定位原实例时，即使遇到维护也可能终止该实例。[一次消费与失败作用](docs/adr/0035-unify-user-and-client-session-lifecycles.md#一次消费与失败作用)
_Avoid_: invalid client, invalid token, unauthorized, protocol revocation

**Client Disablement**:
行政停用应用并拒绝在线协议流量的可恢复状态。配置、已有关系与原到期时间保留。
_Avoid_: Client Maintenance, configuration removal, protocol reset

**Client Deletion**:
应用的软删除，任何未删除的所属角色或未结束的应用委托都会阻止删除。已删除角色和已结束委托的历史可以保留，删除后尝试终止相关应用会话。[删除应用与清理失败](docs/features/application-integration.md#删除应用)
_Avoid_: Client Disablement, implicit role cascade, enabled-only role blocker

**Client Runtime Snapshot**:
一次操作对 Client 通行状态、所选协议配置及应用准入策略取得的同一份观察，不包含凭据认证结果或会话许可。后续变更不追溯已接受的快照，传播失败时新操作仍可能读到旧配置。[读取与失效](packages/client-snapshot/README.md#读取与失效) · [快照修复](docs/releases/authentication-and-session.md#client-snapshot-修复)
_Avoid_: live Client row, protocol config version, linearizable Client state, Client authentication result

**Application Admission Policy**:
IAM 为该应用签发新登录授权前，按已发布 User Document 判断用户是否符合准入条件的规则。默认关闭，关闭保留条件，开启后只允许匹配者取得新授权，已签发凭据与原会话仍按原规则使用。[应用准入](docs/features/application-integration.md#应用准入)
_Avoid_: Admin Authorization Policy, Client Authorization Claim, Session Revocation

**Application Admission Condition**:
基于 User Document 公开属性的非空条件表达式，支持全部满足、任一满足与排除，同一集合元素作用域内的条件由同一个元素满足。角色条件使用目标应用的有效 Client Role 与有效 Global Role，独立于应用的资料披露配置。
_Avoid_: arbitrary JSON path, cross-Client private role condition, disclosure selection

**SSO Client Secret**:
IAM 为 Client 签发、用于所选 SSO 协议的客户端认证凭据，与 Internal API 凭据独立。轮换替换当前值而不撤销既有会话或协议授权，IAM 不主动提供新旧值并存的宽限期。
_Avoid_: Internal API credential, user password, Authorization Code, Session Token

**Internal API Client Secret**:
IAM 为 Client 持有、用于服务间调用身份验证的秘密凭据，与 SSO Client Secret 独立。Gateway 配置管理使用它证明调用方能够以目标 Client 的身份操作，凭据本身不授予额外的环境或配置项权限。
_Avoid_: SSO Client Secret, APISIX Admin Key, ClientSession Token, public Client metadata

**Custom SSO Client Configuration**:
Client 对回调类型、允许的落地地址及资料披露范围的声明。管理员显式选择托管或业务回调，前者从已接受落地地址的 origin 推导，后者使用登记的完整地址。[原授权与回调类型变化](docs/adr/0038-derive-managed-sso-callback-from-redirect-origin.md#原授权与实际入口)
_Avoid_: Independent/Gateway mode, OIDC client configuration, caller-supplied callback selection, ClientSession state

**Custom SSO Redirect Pattern**:
新授权用来核准业务落地地址的登记规则，协议与端口须精确匹配，主机 `*.` 限一级子域，路径 `/*` 匹配子树。授权后 Code 绑定含 fragment 的规范化实际地址，回调或兑换须逐字匹配，普通列表编辑不重新判定旧授权。[地址匹配与编码](docs/guides/custom-sso.md#client-code-与地址编码) · [模式校验](packages/domain/src/client/redirect-url-pattern.ts)
_Avoid_: exact-only redirect registry, implicit origin/path subtree, grant-time pattern rematch

**Custom SSO State**:
由 Client 可选提供并负责校验的不透明流程关联值。IAM 将其绑定到本次授权并原样回传，省略时仍允许 V1 授权且不补默认值。
_Avoid_: required V1 state, session credential, server-side return URL

**Custom SSO Authorization Grant**:
供指定 Client 一次性继续 Custom SSO 登录的 Code，消费后失败也不恢复。业务兑换完成适用认证并可靠定位原实例后失败，会尝试终止原 ClientSession，托管回调则保留共享实例。
_Avoid_: local session, client session, recoverable authorization code, replayable exchange result

**Independent Client Credential**:
业务应用自行接入 Custom SSO 时取得的、限该 Client 使用的 Token。第三方可据此建立并管理自己的本地会话。
_Avoid_: third-party local session, IAM-created third-party session

**Gateway Local Session**:
IAM 为托管接入的浏览器保存的 Custom SSO Token 及其 ClientSession 关系。使用时受根登录、应用关系及当前接入规则约束。
_Avoid_: Independent Client Credential, third-party local session

**Gateway Application Configuration**:
归属一个 IAM Client 的网关配置集合，可包含多条路由和多个上游。子应用可独立归属或共用一个 Client，配置归属本身不授予操作权限。[网关发布与恢复](docs/releases/apisix-gateway-release.md)
_Avoid_: Gateway Local Session, SSO Client Configuration, caller authorization

**Credential Identity**:
标识一次协议 Token 签发的身份，用于在该次签发结果不确定时确认或补偿作用。
_Avoid_: reusable credential slot, bearer token, user identity

### 主体事实、披露投影与访问屏障

[已发布事实与披露](packages/client-subject-projection/README.md#已发布-facts-与披露) · [角色披露与业务权限](docs/adr/0045-retire-privilege-permission-points.md)

**Subject Facts**:
各应用共享的、按 Subject Identifier 识别的已发布主体事实，包含基础资料、有效任职及其组织路径、岗位、全局角色和各应用角色，无角色任职也保留。事实可能落后于源数据，没有固定更新期限，账号通行与业务授权另行判断。
_Avoid_: User Profile DTO cache, client projection cache, session payload, legacy detail document, live aggregate fallback, cached account status

**Subject Facts Publication**:
同一版本 User Document 或删除墓碑成为主体事实依据并向读取方传播的过程。旧版本不能覆盖新版本，后续传播失败时已提交文档仍有效，缺行也不等于删除。[文档发布与缓存传播](packages/documents/README.md#user-document-与-subject-facts-发布)
_Avoid_: unconditional cache set, queue delivery as publication, parallel facts source

**Subject Projection Cutover**:
在维护窗口内将主体投影整体切换到新一代数据布局。全量核验完成后恢复流量，保留有效会话与凭据。[停流、重建与放流条件](docs/releases/data-maintenance.md#统一-document-硬切换)
_Avoid_: login-time migration, partial active-user backfill, runtime dual read

**Subject Access Barrier**:
按 Subject Identifier 和访问代际判断账号当前能否取得访问许可的实时屏障。停用、删除或状态无法确定时不授予新许可，重新启用也不恢复旧代会话。[重新启用条件](packages/subject-access/README.md#恢复与重新启用) · [运维修复](docs/releases/data-maintenance.md#subject-access-恢复)
_Avoid_: profile cache field, eventual account disable, protocol-specific blacklist

**Subject Access Permission**:
独立业务操作开始时授予同一主体和访问代际的许可。账号随后变化时已获许可的操作仍可继续，新操作须重新判断，协议、会话和业务授权约束仍适用。[单次许可的范围](packages/subject-access/README.md#单次操作许可)
_Avoid_: request-wide boolean, persistent authorization, reusable access token

**Subject Claim Catalog**:
IAM 统一维护的版本化主体声明词汇，所有 Client 均从当前唯一生效的目录选择所需字段，不能分别协商版本。[目录演进与披露边界](docs/adr/0032-consume-published-subject-facts-for-authorization.md#catalog-与披露边界)
_Avoid_: UserDetail field list, arbitrary JSON path, protocol scope

**Subject Claim Selection**:
IAM 根据 Client 当前配置与适用协议为本次交付选出的字段，始终包含 Subject Identifier。OIDC UserInfo 按当前范围披露，旧 Token 也可取得新获准的字段。
_Avoid_: ProjectionSpec, client configuration, protocol scope, requested HTTP fields

**Client Subject Projection**:
IAM 向指定 Client 实际交付的主体资料，必含 Subject Identifier，其余按当前披露规则裁剪，排除数据库用户标识。Custom SSO 和 OIDC 共用事实与裁剪语义，各自决定响应格式，已签发的 ID Token 内容固定。[投影与协议接线](packages/client-subject-projection/README.md#协议接线)
_Avoid_: User Profile, session payload, mode-specific user info

**Subject Projection Not Ready**:
本次交付所需的合法 Subject Facts 暂不可得。持原有效 Token 可稍后重试 UserInfo，已消费的 Code 不恢复。
_Avoid_: unauthorized, forbidden, dirty-state response

**Client Authorization Claim**:
`iam:authorization` 向应用披露已发布的有效任职、本应用有效角色及任职上的有效全局角色，排除内部标识。角色事实可滞后，必要资料不可得时交付失败，业务权限判断与副本刷新由接入应用负责。
_Avoid_: global roles, global privileges, authorization decision, guaranteed current authorization

**Employment Profile Claim**:
`profile:employments` 披露有效任职的主任职标记、组织路径、岗位等档案事实，排除角色、权限、数据库标识和任职历史。Custom SSO 按当前声明目录披露，OIDC 通过 `iam:employments` 在 UserInfo 中交付，标准 `profile` 和 ID Token 不扩展。[协议字段与披露范围](docs/guides/oidc.md#tokenscope-与当前披露)
_Avoid_: raw employment record, Client Authorization Claim, employment history

**Gateway Subject Header**:
网关鉴权成功后通过 `X-User-Info` 交付的最小主体信息。必含 Subject Identifier，仅在配置允许时附加用户名或姓名，不交付数据库主键、联系方式、任职或角色。[网关鉴权响应](docs/guides/custom-sso.md#用户信息与-gateway-鉴权)
_Avoid_: authorization header payload, UserDetail header, legacy id compatibility

### 已退役与历史映射术语

以下名称用于解读旧设计。[统一会话模型](docs/adr/0035-unify-user-and-client-session-lifecycles.md) · [旧版本迁移入口](docs/releases/README.md#一次性迁移与旧版本)

**Credential**:
旧称，指用于访问的凭据。当前用协议 Token 表达访问凭据，用 UserSession 和 ClientSession 表达登录关系。
_Avoid_: Principal Session, Authorization Grant, unconditional access permission

**Valid Principal Session**:
有效根登录的旧称，对应当前的有效 UserSession，要求根未过期、未撤销且主体访问许可仍成立。
_Avoid_: online session, 在线会话

**Principal Session Record**:
管理端可观察的根登录记录的旧称。当前查询 UserSession，记录可见不能证明本次访问已获准。
_Avoid_: valid session, online user, 在线用户

**OIDC Client Binding**:
旧 OIDC 模型中根登录与应用的关系，现由跨协议的 ClientSession 表达。
_Avoid_: generic Client Binding, Custom SSO binding, client configuration, credential

**OIDC Claims Snapshot**:
旧 OIDC 模型中授权时固定的声明视图。现行 UserInfo 按当前披露范围读取已发布事实，已签 ID Token 内容固定。
_Avoid_: token-endpoint live projection, current user profile, current authorization view

**Protocol Configuration Revocation**:
旧模型中由配置编辑触发的协议代际撤销。现行配置维护与显式会话撤销相互独立。
_Avoid_: validation failure cleanup, unconditional client-wide revocation, Runtime Snapshot invalidation

**ORCAS Session Identity**:
已退役 ORCAS 集成使用的外部用户与会话引用。IAM 已停止保存和交付，历史外部会话的期限与注销仍由 ORCAS 负责。[退役决定](docs/adr/0040-retire-orcas-custom-sso-integration.md#决定与取舍)
_Avoid_: user detail field, user profile attribute, subject claim, Independent client context
