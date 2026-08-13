# 修复 Employment 生命周期与完整性

## Problem Statement

当前 Employment 管理把一次真实任职当成可以任意修改的状态记录。Admin 可以通过通用状态接口在任意状态之间切换，已经结束的
Employment 能被重新启用并清空 `endTime`；创建、编辑和转岗可以直接提供 `startTime`，但当前有效任职、角色解析和 User
Profile 构建又普遍不使用 `startTime/endTime` 判断有效性。结果是未来才开始或已经越过结束时间的记录仍可能被当作当前任职，
而任职历史也可能被事后重写。

Employment 的删除入口只写入 `isDelete=true`，不会形成可信的 Employment End。与此同时，Position 或 Organization
停用后不会结束或阻断关联任职，创建与转岗也没有在所有路径上验证 Position 已启用；当前投影通过静默过滤无效父对象来遮蔽
异常，使源数据仍然可能保留 Enable Employment，且父对象重新启用时存在隐式“复活”语义。

现有数据库唯一索引只覆盖 Enable Employment，因此 Pause Employment 不会参与同一用户、组织、岗位组合的唯一性；用户删除
等门禁也有只统计 Enable 而漏掉 Pause 的路径。Primary Employment 同样依赖分散的更新顺序，缺少统一的 Open Employment
语义。离职批量结束任职时还在 repository 内直接读取系统时间，无法保证一次业务操作使用同一个权威时刻。

这些问题使 Admin 难以回答“用户何时开始、暂停、恢复、转岗或结束一次任职”，也使 User Profile、角色与权限建立在不稳定的
任职事实之上。未来 Organization Responsibility 若绑定 Employment ID，也不能安全依赖一个可重开、可删除或可静默失效的
任职生命周期。

## Solution

把 Employment 明确定义为用户在一个 Position 和 Organization 下的一次不可重开的任职期事实。由一个深的 Employment
Lifecycle Module 通过封闭的命令 Interface 持有状态机、业务时间、父对象完整性、Open 唯一性、Primary 基数、审计和 User
Profile Dirty 登记；route、Admin 页面和 repository 不再自行拼接状态更新。

当前 IAM Admin 只支持即时操作：创建时以一次注入的事务时刻写入 `startTime` 并进入 Enable；Pause 保留原任职期且可恢复；
End 写入不可改写的 `endTime` 并进入终态；Transfer 在同一事务、同一时刻结束旧 Employment 并创建新的 Enable
Employment。Admin 不再接收未来、回溯或任意编辑的任职期边界。未来受信任外部来源可以在独立 feature 中扩展
Employment Authority 与权威业务时间，不通过最后写入覆盖 IAM 事实。

Enable 与 Pause 都是 Open Employment。Open Employment 必须引用已启用且未软删除的 Position 和所属 Organization，
并继续满足现有岗位组织范围关系；同一用户、组织、岗位最多一条 Open Employment，每个用户最多一条可选 Primary
Employment。父 Position/Organization 的停用或软删除，以及 User 软删除，都必须在存在 Open Employment 时被阻断。

Effective Employment 只由 Employment Period `[startTime, endTime)` 和 Enable 状态决定。Position 与 Organization
有效性是写入不变量，不是下游运行时开关；User Profile/Subject Facts 发布候选结果前执行最后一次 fail-closed 完整性守卫，
发现异常时整次发布失败并保留 Dirty，不得通过过滤异常 Employment 发布部分结果。已发布投影的 OIDC、Custom SSO 和其他
消费者不再现场联表重查父对象。

历史 `isDelete=true` Employment 作为 Legacy Employment Tombstone 原样保留并继续排除在任职、档案和授权计算之外，
不根据 `updateTime` 猜测结束时间。切换前运行只读审计；任何非墓碑的父对象、状态、时间、Open 唯一性或 Primary 基数异常
都会阻止切换，由管理员依据真实业务修正。

普通 Employment 创建、暂停、恢复、结束、转岗或 Primary 调整不撤销 Session，也不改变现有 Session/Token TTL；允许已签发
OIDC Claims Snapshot 在当前 Access Token 生命周期内短暂保留旧权限。账号禁用和 User Resignation 继续使用 Subject Access
Barrier 并保留现有 Session 撤销，防止账号重新启用后旧登录恢复。

## User Stories

1. 作为 IAM 管理员，我希望一条 Employment 永远只表示一次任职，以便任职历史不会因恢复旧记录而被重写。
2. 作为 IAM 管理员，我希望创建 Employment 时立即开始任职，以便当前 Admin 操作具有清晰且一致的时间语义。
3. 作为 IAM 管理员，我希望 Admin 不允许预约未来开始时间，以便系统无需依赖尚不存在的定时激活机制。
4. 作为 IAM 管理员，我希望 Admin 不允许回填或修改 `startTime`，以便任职起点保持为可信生命周期事实。
5. 作为 IAM 管理员，我希望可以暂停一个 Open Employment，以便临时停止其生效而不结束真实任职关系。
6. 作为 IAM 管理员，我希望暂停不写入 `endTime`，以便暂停不会被误解为任职结束。
7. 作为 IAM 管理员，我希望可以恢复 Pause Employment，以便同一次任职在临时暂停后继续生效。
8. 作为 IAM 管理员，我希望恢复不改变原 `startTime`，以便任职期仍表示同一次连续任职事实。
9. 作为 IAM 管理员，我希望可以明确结束 Enable 或 Pause Employment，以便真实退出形成不可改写的结束边界。
10. 作为 IAM 管理员，我希望 Ended Employment 不能恢复、编辑或删除，以便历史事实保持稳定。
11. 作为 IAM 管理员，我希望返聘或重新任职总是创建新的 Employment ID，以便不同任职期可以独立审计。
12. 作为 IAM 管理员，我希望转岗一次完成旧任职结束和新任职创建，以便不会出现两个步骤之间的半成品状态。
13. 作为 IAM 管理员，我希望转岗的新 Employment 始终为 Enable，以便转岗结果不隐式继承旧任职的 Pause 状态。
14. 作为 IAM 管理员，我希望旧 Employment 的 `endTime` 与新 Employment 的 `startTime` 完全相同，以便任职时间线没有人为缝隙或重叠。
15. 作为 IAM 管理员，我希望转岗时必须明确选择新 Employment 是否为主任职，以便系统不猜测管理员意图。
16. 作为 IAM 管理员，我希望可以手动指定或取消 Primary Employment，以便主任职始终由管理员控制。
17. 作为 IAM 管理员，我希望用户可以没有 Primary Employment，以便系统不会自动选择一个并不真实的主任职。
18. 作为 IAM 管理员，我希望每个用户最多只有一条 Primary Employment，以便主职语义不会产生歧义。
19. 作为 IAM 管理员，我希望 Pause Employment 可以保留或被设置为 Primary，以便“主任职”与“当前是否生效”保持独立。
20. 作为 IAM 管理员，我希望结束 Primary Employment 时自动清除 Primary 标记，以便历史任职不再占用当前基数。
21. 作为 IAM 管理员，我希望同一用户、组织、岗位最多存在一条 Enable 或 Pause Employment，以便暂停不能绕过重复任职门禁。
22. 作为 IAM 管理员，我希望已结束的同组合历史可以再次出现，以便返聘或重复任职能够被真实记录。
23. 作为 IAM 管理员，我希望创建、恢复和转岗在 Position 已停用或软删除时被拒绝，以便不会产生无效 Open Employment。
24. 作为 IAM 管理员，我希望创建、恢复和转岗在 Organization 已停用或软删除时被拒绝，以便任职始终具有有效所属组织。
25. 作为 IAM 管理员，我希望岗位与组织的现有范围兼容规则继续生效，以便生命周期修复不会放宽组织归属约束。
26. 作为组织管理员，我希望仍有 Enable 或 Pause Employment 的 Position 不能停用或软删除，以便岗位生命周期不会破坏任职完整性。
27. 作为组织管理员，我希望仍有 Enable 或 Pause Employment 的 Organization 不能停用或软删除，以便组织生命周期不会破坏任职完整性。
28. 作为用户管理员，我希望存在 Pause Employment 也会阻止 User 软删除，以便删除账号不会留下仍然开放的任职。
29. 作为用户管理员，我希望普通 User Disable 不结束或暂停 Employment，以便账号访问状态与真实任职事实保持独立。
30. 作为用户管理员，我希望 User Resignation 一次结束全部 Open Employment 并禁用账号，以便离职结果完整且一致。
31. 作为用户管理员，我希望重复执行 User Resignation 不改写已有 Employment End 时间，以便重试不会篡改历史。
32. 作为安全管理员，我希望 User Resignation 和账号禁用继续阻断访问并撤销已有 IAM Session，以便旧登录不会在账号恢复后复活。
33. 作为普通用户，我希望 Employment 权限变化不会强制我退出所有已登录系统，以便日常组织调整不会造成不必要的重新登录。
34. 作为 OIDC client，我接受已签发 Claims Snapshot 在现有 Token 有效期内短暂保留旧权限，以便 Employment 变更不要求新增令牌黑名单机制。
35. 作为 Custom SSO client，我希望新的主体投影交付使用最新已发布 Subject Facts，以便后续查询能够收敛到新的任职事实。
36. 作为 Independent client 维护者，我希望明确知道复制到自有 Session 的快照由我方刷新，以便不把第三方缓存时限误认为 IAM 保证。
37. 作为授权消费者，我希望 Pause、Ended、尚未开始或已经越过结束边界的 Employment 不进入当前任职和权限投影，以便授权事实符合任职期。
38. 作为授权消费者，我希望父 Position 或 Organization 异常导致 Subject Facts 发布失败，而不是只丢掉一条 Employment，以便完整性错误不会被静默掩盖。
39. 作为授权消费者，我希望父对象重新启用不会自动恢复曾被静默过滤的 Employment，以便状态变化不会产生隐式任职复活。
40. 作为审计人员，我希望 Pause、Resume、End 和 Transfer 使用各自的业务动作，而不是统一的 status update，以便审计日志表达真实意图。
41. 作为审计人员，我希望重复提交已经完成的 Pause、Resume 或 End 不重写生命周期时间或重复产生状态变更审计，以便网络重试保持幂等。
42. 作为审计人员，我希望 Legacy Employment Tombstone 不被伪装成具有推测 `endTime` 的正常历史，以便报表不把技术删除时间当成业务离职时间。
43. 作为运维人员，我希望切换前得到只读异常清单，以便可以在改变运行语义前核对真实数据。
44. 作为运维人员，我希望发现非墓碑异常时切换命令失败，以便生产系统不会带着未知任职事实进入新模型。
45. 作为运维人员，我希望检查工具绝不自动修正 Employment，以便技术程序不会替业务人员猜测真实任职时间和关系。
46. 作为维护者，我希望一个 Employment Lifecycle Module 拥有状态机、时间和写入不变量，以便修复一次即可覆盖所有调用方。
47. 作为维护者，我希望 route 与 Admin 页面只能发出明确生命周期命令，以便它们不能继续绕过领域规则直接写状态。
48. 作为维护者，我希望 repository 只实现持久化所需操作，不决定允许哪些状态迁移，以便数据库 Adapter 不拥有业务生命周期。
49. 作为维护者，我希望 User Profile Builder 只承担发布前完整性守卫和投影映射，以便它不成为修复源数据的第二个写模型。
50. 作为维护者，我希望保留当前数据库数值状态、字段和索引，以便本次修复不引入不必要的 schema 迁移。
51. 作为维护者，我希望当前低并发 Admin 使用事务内顺序检查而不增加锁和重试协议，以便实现与已知使用规模相称。
52. 作为测试维护者，我希望从 Employment Lifecycle 的公开 Interface 验证完整行为，以便测试不依赖私有函数排列。
53. 作为测试维护者，我希望 User Profile Builder 对异常数据的 fail-closed 行为有独立验收，以便静默过滤不会回归。
54. 作为 Admin 前端维护者，我希望页面测试证明非法按钮和时间输入已经移除，以便 UI 与后端状态机保持一致。
55. 作为未来 HR 集成维护者，我希望每条 Employment 最终可以拥有唯一 Employment Authority 和权威业务时间，以便接收外部事实时不采用 last-writer-wins。
56. 作为未来 HR 集成维护者，我希望本次不提前增加未使用的来源字段、同步状态机或冲突协议，以便未来设计建立在真实集成需求上。
57. 作为未来 Organization Responsibility 维护者，我希望 Transfer 总是创建新 Employment ID，以便责任任命不会因旧任职被复用而自动继承。
58. 作为未来 Organization Responsibility 维护者，我希望本次不增加空的责任端口、事件或表，以便尚不存在的模块不会污染当前实现。

## Implementation Decisions

- 建立一个深的 Employment Lifecycle Module。它的 Interface 接受封闭的创建、暂停、恢复、结束、转岗和 Primary 调整命令，
  并隐藏状态机、父对象检查、Open/Primary 基数、统一业务时刻、审计和 User Profile Dirty 登记。
- User Resignation 继续由独立 Application Use Case 拥有跨 Employment、User、Subject Access、审计、Profile Dirty 和
  Session 撤销的编排；它复用同一套 Employment End 语义，而不是在 repository 内另造状态规则。
- Module 通过现有 UnitOfWork 执行写操作。一次命令内的 Employment 变更、相关审计和 Dirty 登记属于同一数据库事务；
  事务中任一步失败都不留下部分业务结果。
- Module 从注入的 Clock 只读取一次当前时刻。同一次 Transfer 的旧 `endTime` 与新 `startTime`，以及一次 Resignation
  批量结束的所有 `endTime`，必须使用该同一值；repository 不得自行调用系统时钟决定业务时间。
- 当前 Employment Authority 隐含为 IAM。Admin Adapter 不接受权威来源、外部事件时间或同步版本；本次也不新增对应字段。
  未来外部 Authority 必须通过独立受信任入口扩展，而不是复用 Admin DTO 或直接写表。
- Employment 状态机为 Enable、Pause、Ended。存储中现有结束数值保持不变；领域语言、命令和 UI 使用 Ended/结束，
  不再把它表述为可恢复的 Disable。
- Create 只创建 Enable Employment，`startTime` 为当前 IAM 事务时刻，`endTime=null`。创建输入不再包含 `startTime`、
  `endTime` 或任意 status。
- Pause 只把 Enable 变为 Pause，不改变 `startTime/endTime` 或 Primary。对已经 Pause 的同目标命令返回成功但不重复写状态、
  Dirty 或状态变更审计。
- Resume 只把 Pause 变为 Enable，不改变 `startTime/endTime` 或 Primary，并在写入前重新验证父对象和 Open 唯一性。
  对已经 Enable 的同目标命令保持幂等。
- End 可从 Enable 或 Pause 进入 Ended，写入当前事务时刻作为不可变 `endTime` 并清除 Primary。对已经 Ended 的同目标命令
  返回成功，不改写 `endTime`，也不重复写状态变更审计或 Dirty。
- Ended Employment 是终态，不允许恢复、更新描述、调整 Primary、转岗或删除。返聘和重新任职使用 Create 创建新 ID。
- Transfer 可从 Enable 或 Pause 执行，在一个事务中以同一时刻 End 旧 Employment 并创建新的 Enable Employment。
  旧 Employment 的 Pause 或 Primary 状态不自动继承。
- Transfer 输入必须明确包含新 Employment 的 `isPrimary: true | false`，不能省略、默认或从旧记录推断。若为 true，事务内
  清除该用户其他 Open Employment 的 Primary；若为 false，不自动选择替代主任职。
- Create 可以由管理员明确选择 Primary；未明确选择时为 false。设置 Primary 的命令原子清除该用户其他 Open Employment
  的 Primary 后设置目标记录；取消命令允许用户进入零 Primary 状态。
- 只有 `isDelete=false` 且状态为 Enable 或 Pause 的记录属于 Open Employment。Legacy Employment Tombstone 不属于 Open。
- 同一 `(user, organization, position)` 最多一条 Open Employment。Create、Resume 和 Transfer 在应用事务中检查 Enable 与
  Pause；Ended 历史不参与冲突。
- 每个用户最多一条 Open Primary Employment。Pause 参与该基数，Ended 和 Legacy Employment Tombstone 不参与。
- Open Employment 必须引用 Enable 且未软删除的 Position 和 Organization，并满足既有 Position assigned Organization
  范围规则。Create、Resume 和 Transfer 都执行该检查。
- Position 的停用与软删除在存在任何关联 Open Employment 时返回业务冲突；Organization 的停用与软删除在自身或受现有
  组织层级规则覆盖的范围中存在 Open Employment 时返回业务冲突。Enable 与 Pause 都计数。
- User 软删除在存在任何 Open Employment 时返回业务冲突。普通 User Disable 不改变 Employment；User Resignation End
  全部 Open Employment 后再禁用账号。
- 父对象重新启用只恢复父对象本身，不修改 Employment 状态。系统不通过父对象状态切换隐式暂停、结束或恢复 Employment。
- Effective Employment 的唯一正常判定是：当前时刻位于 Employment Period `[startTime, endTime)` 且状态为 Enable。
  `isPrimary` 与 User 状态不参与；Legacy Employment Tombstone 永远不参与。
- Position 与 Organization 状态不属于 Effective Employment 的正常运行时谓词，而属于 Employment Integrity。正式写路径
  防止异常；User Profile/Subject Facts 生成候选结果后、发布前对候选 Employment 及其直属父对象执行一次显式完整性验证。
- 发布前完整性验证发现异常时返回稳定的内部失败，整批候选不得发布，Dirty 不得被标记为已处理。不得以过滤异常 Employment、
  发布剩余部分或回退旧详情文档作为恢复策略。
- Role Assignment Resolution Module 继续拥有角色分配目标匹配、组织闭包、角色状态、client 范围、去重与排序；Employment
  是否有效由统一 Employment 语义提供。其正向解析不再把 Employment 的 Position/Organization 状态作为静默过滤开关。
- 上一条决定部分取代 ADR-0002 中“正向有效角色通过 Position 和任职 Organization 状态过滤”的口径；角色、角色分配目标和
  角色分配本身的有效性规则，以及反向 Dirty scope 规则保持不变。
- Subject Facts 只保存 Effective Employment。OIDC、Custom SSO 与 Client Subject Projection 消费已发布事实，不为
  Employment 现场联表，也不重新解释父对象状态。
- 普通 Employment 生命周期变化只登记 User Profile Dirty，不撤销 Principal Session、OIDC Client Binding、Access Token、
  Custom SSO Credential 或 Gateway Local Session，也不调整任何 TTL。
- OIDC 已签发 Claims Snapshot 可以在现有 Access Token 生命周期内保留旧权限，当前默认上限约一小时。Custom SSO 后续投影
  交付遵循现有新鲜度规则；Independent client 自己保存的快照不属于 IAM 持续一致性保证。
- User Disable 和 User Resignation 保留现有 Subject Access Barrier 与 Session 撤销语义。本次不削弱账号访问安全边界。
- Admin Adapter 以明确的 Pause、Resume、End、Transfer 和 Primary 操作替代通用 status update，并移除 Employment delete。
  Admin 前后端协调硬切换，不保留长期兼容 alias 或把旧接口转译成新状态机。
- 通用 Employment 编辑只保留仍有业务意义且不改变生命周期的字段，例如 Open Employment 的 description；`startTime`、
  `endTime`、status 和删除标记不属于编辑输入。
- Admin 页面不再显示删除按钮、任意状态选择器或可编辑起止时间。详情可以只读展示状态和时间；可用操作根据当前状态显式呈现。
- Legacy Employment Tombstone 原样保留，不迁移为 Ended，不补 `endTime`，不恢复到正式生命周期，也不再由生产写路径创建。
- 上线前提供只读 Cutover Verifier。它至少检查：非墓碑未知状态、父对象无效、时间区间无效、Open 记录带 `endTime`、Ended
  缺少有效 `endTime`、当前不支持的未来 Open `startTime`、重复 Open 组合和多个 Open Primary。
- Cutover Verifier 对任一非墓碑异常返回非零结果并给出可定位的记录标识与分类，不修改数据。Legacy Employment Tombstone
  可以单独计数或报告，但不会阻止切换。
- 当前 Admin 低并发假设下，只使用现有 UnitOfWork 内的顺序检查。不新增 `FOR UPDATE`、advisory lock、serializable、重试协议、
  partial unique/check constraint 或外键；已知 TOCTOU 竞态作为接受的范围限制记录。
- 保留现有 Employment 表字段、数值状态、`isDelete` 和索引，不删除已有数据库保护。应用层把 Enable 与 Pause 都纳入 Open
  检查，但不声称这能在并发写入下提供数据库级唯一性。
- 不为尚不存在的 Organization Responsibility 增加表、port、event、hook 或事务参与者。新的不可重开 Employment ID 与集中
  生命周期 Interface 是未来模块的接入前提，具体联动由该 feature 再设计。

## Testing Decisions

- 好的测试通过 Module Interface 观察状态、业务时间、返回结果、错误、审计、Dirty 和发布结果，不断言私有 helper、Drizzle
  调用排列或 route 内部转发细节。
- 主要测试 Seam 是 Admin API 的 Employment Lifecycle Interface。现有 Employment Application Component Integration
  测试是 prior art；它们应被重组为显式命令矩阵，而不是继续围绕通用 status update 和 delete 增量叠加。
- Create 测试覆盖即时 `startTime`、Enable 初态、父对象与范围校验、重复 Open 组合、可选 Primary、审计和 Dirty 的原子结果。
- Pause/Resume/End 测试覆盖全部允许迁移、禁止迁移、目标状态幂等、Primary 行为、不可变时间、父对象恢复校验及事务失败回滚。
- Transfer 测试覆盖 Enable 与 Pause 来源、同一 `endTime/startTime`、新记录始终 Enable、显式 `isPrimary`、重复组合阻断、
  审计/Dirty 和任一步失败时无半成品。
- Primary 测试覆盖零或一条、设置时原子替换、取消、Pause 目标可用、Ended/墓碑目标拒绝和相同目标幂等。
- Position、Organization 与 User 管理的现有 Application Component Integration 测试补充 Open Employment 口径，证明
  Enable 与 Pause 都阻止停用/删除，而 Ended 与墓碑不阻止。
- User Resignation 的现有 use-case Component Integration 测试继续作为跨模块 prior art，补充所有 Enable/Pause Employment
  使用同一注入时刻结束、重复离职不改写结束时间，以及 Session 撤销保持不变。
- repository 只增加必要的窄测试，验证 Open 查询、计数和重复检查包含 Enable 与 Pause，并排除 Ended 与 `isDelete=true`。
  本 spec 不增加并发测试或把应用检查宣称为数据库强约束。
- 第二个业务测试 Seam 是 User Profile Builder。现有 Builder Component Integration 测试是 prior art；它应覆盖 Enable、Pause、
  Ended、区间边界、墓碑，以及无效 Position/Organization 导致整次构建失败而非静默过滤。
- Subject Facts Publication 测试证明完整性失败时不会发布候选版本、不会完成对应 Dirty，且后续下游不会收到部分 Employment 集合。
- Role Assignment Resolution 的聚焦测试证明角色与分配规则仍然成立，同时 Employment 父对象异常不再被正向解析静默转换为空角色；
  ADR-0002 未被本 spec 取代的反向 Dirty scope 与批量查询契约继续通过。
- 第三个测试 Seam 是 Admin 页面。使用现有 Admin 前端测试 collection 验证创建、暂停、恢复、结束、转岗和 Primary 操作的可见性，
  并证明删除、通用状态选择和可编辑起止时间已经消失。
- Admin 页面测试验证 Transfer 必须明确选择 `isPrimary` 后才能提交，Ended 详情只读，Pause 仍可恢复、结束、转岗和调整 Primary。
- Adapter contract 测试只验证新的明确操作、输入校验、稳定业务错误和审计上下文；删除旧操作后不保留重复的新旧 route 行为测试。
- Cutover Verifier 使用可控数据集测试每类阻断异常、多个异常聚合、墓碑非阻断和绝不写数据库。它不依赖真实生产数据。
- Session 回归测试证明普通 Employment 变化不调用撤销能力；既有 User Disable 和 User Resignation Session 撤销测试必须继续通过。
- 不新增 Full-system E2E。该 feature 不改变登录协议或外部投影 wire contract，三个已确认的 Application、Builder 和 Admin 页面
  Seam 足以覆盖行为；实现 ticket 仍按受影响模块运行聚焦 collection、lint 和 typecheck。
- 文档变化运行仓库文档索引检查与 whitespace 检查。准备本地合入时才在最终实现内容上执行一次仓库规定的完整验证。

## Out of Scope

- 实现第三方 HR 连接器、Webhook、消息消费、批量同步、冲突协调、重放、幂等事件、来源优先级或 reconciliation。
- 为未来 HR 集成新增 Employment source/authority、external ID、source version、received time、processing state 或同步错误字段。
- 允许当前 Admin 创建未来或回溯任职，或者新增定时激活、定时结束、时间轮询和 Profile 定时失效机制。
- 实现 Organization Responsibility Definition、Assignment、数据库表、Admin 页面、投影字段、搜索或 Employment 联动。
- 让 Organization Responsibility、Role Assignment 或 Primary Employment 自动产生、继承或撤销彼此。
- 新增数据库外键、check constraint、partial unique index、锁、隔离级别、advisory lock、并发重试或跨请求幂等键。
- 修复已知的 Position/Organization 检查与 Employment 并发创建之间的 TOCTOU 竞态。
- 自动转换、恢复、删除或推断 Legacy Employment Tombstone 的业务含义。
- 自动修复 Cutover Verifier 发现的父对象、状态、时间、Open 唯一性或 Primary 基数异常。
- 删除 Employment 表的 `isDelete`、重编号现有状态值、删除现有索引或执行与本功能无关的 schema 清理。
- 修改 OIDC Claims Snapshot、Access Token、ID Token、Custom SSO Credential、Gateway Local Session 或第三方本地 Session 的 TTL。
- 因普通 Employment 变化撤销 Session、增加令牌黑名单或承诺即时收回所有已签发权限快照。
- 改变 User Disable、User Resignation、Subject Access Barrier 或现有账号 Session 撤销的安全语义。
- 修改 Custom SSO 或 OIDC 的公开 subject/claim wire shape，或者把 Employment 时间和状态加入现有 Subject Facts/claims。
- 重构 Role Assignment 的角色、分配目标、client 范围、组织闭包、去重、排序或反向 Dirty scope 规则。
- 扩大到 User、Position、Organization 之外的生命周期重构，或处理 handoff 中与 Employment 无关的候选问题。
- 执行生产数据检查、业务修正、部署、迁移窗口、merge、push 或发布。

## Further Notes

- 稳定领域语言记录在 `CONTEXT.md`；ADR-0011 记录不可重开任职期、写入完整性、投影 fail-closed 和运行时父对象口径。
- ADR-0011 只部分取代 ADR-0002 的正向 Employment 父对象过滤规则；Role Assignment Resolution 的其余所有权和契约继续有效。
- 当前事实固定点为 `main@41b9233e`。调查确认问题来自可达的生产写路径与查询谓词，而不是只存在于旧文档。
- 当前代码中不存在 Organization Responsibility 生产模块；相关 handoff 是后续规格寻路，不能作为本次实现依赖。
- 应用层顺序检查不解决并发竞态是维护者明确接受的最简实现取舍。若 Admin 写入规模或外部 Authority 引入并发，必须重新评估数据库级不变量。
- 当前默认 OIDC Access Token 生命周期约为一小时；这是接受短暂权限不一致的现有上限描述，不是新增 SLA。第三方自行建立的本地
  Session 可能更久，IAM 不承诺持续刷新其缓存。
- 本 spec 已按 `ready-for-agent` triage 意图发布，可以继续使用 `/to-tickets` 拆分；发布 spec 不授权实现、数据修改、部署、合并、
  push 或任何外部副作用。
