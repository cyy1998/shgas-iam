# 管理端有效会话与临时登录限制管理

## Problem Statement

IAM 已经通过 Session Kernel 管理 Principal Session、OIDC、Custom SSO 等登录生命周期，也已经在密码和手机验证码登录中按用户记录失败次数并实施临时登录限制，但这些实时状态目前没有面向管理员的完整管理入口。

管理员无法分页查看当前仍可访问 IAM 的 Valid Principal Session，无法判断同一用户在哪些来源建立了多个会话，也无法直接撤销单个会话或某个用户的全部既有会话。账号禁用、删除或外围清理失败等异常情况下，即使仍残留有效会话，管理员也缺少集中发现和处置手段。

登录失败保护同样只有登录路径能够读取。管理员无法看到当前受到 Temporary Login Restriction 的用户、限制到期时间或最后触发方式，也无法在确认用户身份后即时解除限制。现有失败计数由密码和手机登录共享，但限制值只保存最后跨过阈值的方式；若把它直接展示为“限制原因”，会把混合失败错误描述成某一种认证方式独自产生了五次失败。

本功能需要提供一个用户中心的实时管理工具，同时保持 Session Kernel、登录失败保护、Admin API 分层、REST/tRPC 适配和现有审计边界。它不应建立第二套持久会话真相，不应把 User-Agent 推断包装成可信设备，也不应声称能够终止第三方自行建立的本地会话。

## Solution

管理端新增“会话管理”页面，以“有效会话”和“临时登录限制”两个标签页呈现实时登录状态。

“有效会话”指尚未过期且未被撤销的用户 Principal Session，而不是用户此刻是否正在操作。管理员可以分页查看全部已索引的有效会话、按用户精确筛选、查看账号状态、登录方式、登录时间、过期时间和 Session Origin，并执行“强制下线本次”或“下线该用户全部”。当前管理员的根会话受到保护：不能通过单会话操作撤销；对本人执行全部下线时保留当前根会话，但撤销其 IAM 管理的子凭证以及本人的其他根会话。

“临时登录限制”展示因滚动窗口内登录失败次数过多而暂时不能发起新认证的用户。列表把统一原因表达为“登录失败次数过多”，把 `password`、`mobile` 仅表达为最后跨过阈值的 Login Restriction Trigger Method。管理员可以原子地解除限制并清空当前失败历史；解除没有宽限期，之后发生的失败立即重新计数。

有效会话和临时登录限制继续以 Redis 为唯一实时事实来源，通过可重建的全局有序索引支持分页。PostgreSQL 审计只记录管理事件，不建立会话影子表或历史快照。本次不回填上线前已有状态：新版本开始双写索引后，旧 Principal Session 在后续续期或最长 24 小时自然过期时收敛，旧临时限制在最长约 30 分钟内自然过期；这一窗口内列表允许遗漏旧状态。

Admin API 暴露四个明确意图：查询有效会话、撤销单个或用户全部会话、查询临时登录限制、解除临时登录限制。REST 与 tRPC 共用同一 adapter，管理端通过 service wrapper 消费，不直接依赖传输路径。所有管理动作继续使用现有 `iam:admin` 权限。

## User Stories

1. 作为 IAM 管理员，我希望进入统一的会话管理页面，以便集中处理实时登录状态。
2. 作为 IAM 管理员，我希望页面把仍可访问 IAM 的状态称为“有效会话”，以便不会把它误解为用户此刻在线。
3. 作为 IAM 管理员，我希望关闭浏览器但凭证尚未过期的会话仍然出现在列表中，以便我能撤销仍有访问能力的凭证。
4. 作为 IAM 管理员，我希望分页查看全部已索引的有效用户会话，以便会话数量较大时页面仍可使用。
5. 作为 IAM 管理员，我希望列表按请求时刻的过期时间稳定排序，以便每次刷新都有确定顺序。
6. 作为 IAM 管理员，我希望按用户精确筛选有效会话，以便快速处理某个用户的登录状态。
7. 作为 IAM 管理员，我希望复用现有用户远程选择器筛选用户，以便不必手工输入用户 ID。
8. 作为 IAM 管理员，我希望看到用户 ID、用户名和姓名，以便确认会话所属身份。
9. 作为 IAM 管理员，我希望看到用户当前的正常、暂停、结束、已删除或未知状态，以便发现账号状态与有效会话不一致的异常。
10. 作为 IAM 管理员，我希望暂停、结束或已删除用户的残留会话不被隐藏，以便仍可完成安全处置。
11. 作为 IAM 管理员，我希望用户记录已经不存在时仍看到“未知用户”和用户 ID，以便会话不会因资料缺失而失去管理入口。
12. 作为 IAM 管理员，我希望看到会话的登录方式，以便区分密码、手机验证码、OA、微信及未知方式。
13. 作为 IAM 管理员，我希望看到登录时间和过期时间，以便判断会话的新旧和剩余生命周期。
14. 作为 IAM 管理员，我希望第一版不展示不可靠的“最后活跃时间”，以便不会根据部分协议的续期时间作出错误判断。
15. 作为 IAM 管理员，我希望看到完整登录 IP，以便获得安全调查线索。
16. 作为 IAM 管理员，我希望看到粗粒度设备类型、操作系统族和浏览器族，以便快速区分常见登录来源。
17. 作为 IAM 管理员，我希望设备无法识别时显示“未知”，以便系统不会伪造精确信息。
18. 作为 IAM 管理员，我希望登录来源明确只是调查提示而非可信设备身份，以便不会把可伪造的 User-Agent 用作授权依据。
19. 作为 IAM 管理员，我希望旧会话缺少 Session Origin 时仍可展示和撤销，以便新增字段不会迫使所有用户重新登录。
20. 作为 IAM 管理员，我希望当前管理会话有清晰标记，以便不会误操作自己的处置入口。
21. 作为 IAM 管理员，我希望当前管理会话的“强制下线本次”按钮不可用，以便管理操作不会意外切断当前处置会话。
22. 作为 API 调用者，我希望直接请求撤销当前管理会话时得到明确的冲突错误，以便前端保护不能被绕过。
23. 作为 IAM 管理员，我希望强制下线一个指定会话，以便只终止可疑来源而不影响该用户的其他登录。
24. 作为 IAM 管理员，我希望单会话下线级联撤销 IAM 管理的 binding、credential 和 artifact，以便被撤销的登录不能继续通过关联协议访问。
25. 作为 IAM 管理员，我希望确认框说明 IAM 不能保证第三方自行建立的本地会话退出，以便我理解处置边界。
26. 作为 IAM 管理员，我希望第一版不展示可能不完整的关联应用清单，以便界面不会暗示错误的完整影响范围。
27. 作为 IAM 管理员，我希望下线某个其他用户的全部既有会话，以便一次完成用户级处置。
28. 作为 IAM 管理员，我希望对本人执行“下线该用户全部”时保留当前管理端根会话，以便仍能完成后续安全操作。
29. 作为 IAM 管理员，我希望本人全部下线仍撤销当前根会话已经派生的 OIDC、Custom SSO 等子凭证，以便保留管理入口不等于保留其他应用访问。
30. 作为 IAM 管理员，我希望本人全部下线按钮仍使用统一的“全部”文案，并由确认框解释当前会话例外，以便操作入口保持一致。
31. 作为 IAM 管理员，我希望全部下线只处理操作开始时已索引的会话，以便第一版不为极小并发窗口引入用户级 session generation。
32. 作为 IAM 管理员，我希望确认框说明强制下线不会阻止未来重新登录，以便凭据疑似泄露时能配合密码重置或账号暂停。
33. 作为 IAM 管理员，我希望目标已经过期、撤销或被其他管理员处理时得到无变化成功，而不是伪造“目标不存在”故障。
34. 作为 IAM 管理员，我希望无变化结果明确显示“目标已失效或已被处理”，以便理解实际状态。
35. 作为 IAM 管理员，我希望核心撤销成功但外围 cleanup 失败时仍收到成功结果，以便不会误以为 IAM 凭证仍然有效。
36. 作为 IAM 管理员，我希望 cleanup 部分失败时看到明确警告和脱敏失败数量，以便可以继续排查关联清理。
37. 作为安全管理员，我希望 Session Revocation 不自动禁止未来登录，以便会话处置与账号状态、凭据处置职责保持清晰。
38. 作为 IAM 管理员，我希望查看当前 Temporary Login Restriction 列表，以便帮助因失败次数过多而无法登录的用户。
39. 作为 IAM 管理员，我希望限制列表同样显示用户摘要和账号状态，以便不会把账号禁用误解为临时限制。
40. 作为 IAM 管理员，我希望限制列表显示统一原因“登录失败次数过多”，以便混合认证失败不会被错误归因。
41. 作为 IAM 管理员，我希望看到最后跨过阈值的密码或手机认证方式，以便获得有限但准确的调查线索。
42. 作为 IAM 管理员，我希望异常或旧格式触发方式显示为“未知”，以便遗留数据仍可查看和解除。
43. 作为 IAM 管理员，我希望看到限制自动到期时间和剩余时间，以便判断是否需要人工解除。
44. 作为 IAM 管理员，我希望按用户精确筛选临时登录限制，以便快速定位求助用户。
45. 作为 IAM 管理员，我希望解除限制时同时清除限制状态和当前失败历史，以便用户获得完整的即时重置。
46. 作为 IAM 管理员，我希望解除限制不创建白名单或宽限期，以便暴力破解保护不会被管理操作暂时关闭。
47. 作为 IAM 管理员，我希望解除之后发生的新失败立即重新计数，以便安全策略保持连续。
48. 作为 IAM 管理员，我希望限制自然过期或已被解除时重复操作返回无变化成功，以便管理请求可以安全重试。
49. 作为合法用户，我希望攻击者触发 Temporary Login Restriction 时已有有效会话不会自动被撤销，以便失败计数不能被用作远程踢人手段。
50. 作为安全管理员，我希望 Temporary Login Restriction 只阻止新的认证，与 Session Revocation 完全正交，以便需要撤销时由管理员显式判断。
51. 作为登录用户，我希望密码和手机验证码失败继续共享同一用户级失败窗口，以便现有保护强度不因管理功能改变。
52. 作为登录用户，我希望安全策略继续保持 30 分钟窗口内 5 次失败并限制 30 分钟，以便本功能不暗中改变登录规则。
53. 作为登录用户，我希望登录保护 Redis 不可用时系统拒绝登录并返回服务不可用，而不是错误声称密码错误或账号已受限。
54. 作为运维人员，我希望登录保护基础设施故障与真实 Temporary Login Restriction 使用不同错误和审计原因，以便排障数据可信。
55. 作为 IAM 管理员，我希望管理端 Redis 状态不可用时收到 503，而不是空列表或虚假成功，以便不会对不完整状态作出处置判断。
56. 作为 IAM 管理员，我希望所有管理能力继续只授予现有 `iam:admin`，以便第一版不引入半套细粒度权限和二次认证。
57. 作为 IAM 管理员，我希望下线与解除操作使用确认框，但不要求输入自由文本备注，以便操作保持直接且审计数据结构化。
58. 作为被下线用户，我希望下一次请求按现有方式进入未登录状态，以便客户端不需要理解新的撤销原因协议。
59. 作为安全管理员，我希望系统不向可能持有被盗凭证的人暴露管理员身份或处置详情，以便安全响应信息留在管理审计中。
60. 作为审计人员，我希望单会话撤销记录内部 `principalSessionId`，以便同一用户的多个会话可以精确区分。
61. 作为审计人员，我希望用户全部下线和解除限制记录目标用户、是否变化、撤销数量和清理结果，以便管理动作完整可追溯。
62. 作为审计人员，我希望幂等无变化和当前会话保护失败也产生审计事件，以便每次管理尝试都有记录。
63. 作为安全维护者，我希望任何外部 token、lookup hash、HMAC 信息、任意 session metadata、cleanup ref、原始异常和目标 User-Agent 不进入管理审计，以便审计库不持久化凭证或不必要敏感数据。
64. 作为审计人员，我希望现有登录审计中的请求 IP 和 User-Agent 行为保持不变，以便本功能不改变既有审计保留策略。
65. 作为 IAM 管理员，我希望 Redis 状态已经改变但 PostgreSQL 审计失败时收到明确的“作用已发生”错误，以便不会盲目自动重试。
66. 作为运维人员，我接受 Redis 生效后进程崩溃可能留下极小的审计缺口，以便本功能不引入独立 outbox 和异步命令系统。
67. 作为 IAM 管理员，我希望 REST 与 tRPC 提供一致的四个管理意图，以便不同调用方获得相同语义。
68. 作为前端维护者，我希望管理页面只依赖稳定 service wrapper，以便传输路径和响应映射不泄漏到 React 组件。
69. 作为 IAM 管理员，我希望页面在操作后刷新当前页并允许手动刷新，以便看到最新实时状态。
70. 作为 IAM 管理员，我接受翻页期间新登录、续期和过期造成顺序漂移，以便不为实时列表建立昂贵快照。
71. 作为 IAM 管理员，我希望第一版不轮询或订阅实时推送，以便页面保持简单并避免持续查询压力。
72. 作为安全管理员，我接受第一版不能按 IP、设备或登录方式跨用户检索，以便本模块保持用户中心而不是扩展为安全狩猎平台。
73. 作为运维人员，我希望有效会话和临时登录限制只以 Redis 实时状态为事实来源，以便不存在 Redis 与 PostgreSQL 双重真相。
74. 作为运维人员，我接受 Redis 状态丢失会使既有会话失效并清空管理视图，以便系统不承诺重建历史会话。
75. 作为审计人员，我希望通过登录和管理审计追溯事件，但不要求从审计重建任一历史时刻的完整会话清单。
76. 作为发布人员，我希望新版本上线后只对新建、续期或新触发的状态建立全局索引，以便不增加生产 Redis 回填步骤。
77. 作为发布人员，我接受上线后最长约 24 小时的会话列表遗漏窗口和约 30 分钟的限制列表遗漏窗口，以便发布不被旧状态迁移阻塞。
78. 作为后端维护者，我希望 Session Kernel 的原始模型与 Redis 访问继续由既有 owner 和 composition 持有，以便管理 route 不越过架构守卫。
79. 作为后端维护者，我希望登录失败保护成为 API 与 Admin API 可共同消费的共享模块，以便 key、阈值、原子状态变化和清理语义只有一个所有者。
80. 作为后端维护者，我希望管理服务只依赖消费方拥有的窄端口，以便会话查询、撤销、用户摘要和审计实现可以独立替换和测试。
81. 作为测试维护者，我希望通过共享登录状态公开接口验证 Redis 行为，以便不依赖内部 helper 或命令排列。
82. 作为测试维护者，我希望用真实 Redis 对同一公开接口验证脚本和并发原子性，以便 Fake Redis 不会掩盖协议错误。
83. 作为测试维护者，我希望通过 Admin API 意图接缝覆盖四个管理操作，以便 REST、tRPC 和 service 不重复维护同一行为矩阵。
84. 作为测试维护者，我希望通过 Playwright 验证两个标签页和管理交互，以便浏览器行为由用户可见结果锁定。

## Implementation Decisions

- 领域与界面统一使用 `Valid Principal Session`、`Temporary Login Restriction`、`Login Restriction Trigger Method`、`Session Origin` 和 `Session Revocation`。界面不使用“在线会话”或“黑名单”作为规范名称。
- 管理端新增 `/sessions` 路由和“会话管理”菜单，继续使用现有 `isAdmin` 前端访问判断和后端 `iam:admin` 授权。
- 页面使用 `PageContainer` 与两个标签页：“有效会话”和“临时登录限制”。两个列表均使用现有分页结果形状，默认每页 20 条、最大 100 条。
- 查询只支持可选的精确 `userId` 条件。前端复用现有用户远程搜索完成选择；IP、设备、登录方式和账号状态不作为第一版服务端查询条件。
- 有效会话固定按 `expiresAt` 倒序。分页 `total` 表示单次请求时刻清理已过期索引后的数量，不承诺跨请求快照一致性。
- Admin application service 暴露四个意图：`listSessions`、`revokeSessions`、`listLoginRestrictions` 和 `releaseLoginRestriction`。撤销输入用 `session` 或 `user` 目标判别表达单会话与用户全部会话，不新增通用命令执行器。
- Actor user ID、username、当前 `principalSessionId`、请求 ID、trace、请求 IP 和请求 User-Agent 只能由认证后的服务端上下文生成，客户端不得提交或覆盖。
- REST 端点固定为 `POST /admin/session-management/sessions/search`、`POST /admin/session-management/sessions/revoke`、`POST /admin/session-management/login-restrictions/search` 和 `DELETE /admin/session-management/login-restrictions/{userId}`。tRPC 固定为 `admin.sessionManagement.listSessions`、`revokeSessions`、`listLoginRestrictions` 和 `releaseLoginRestriction`。REST 与 tRPC 必须复用同一 adapter 和响应映射。
- 有效会话列表只包含 `principalType=user`、仍存在、未过期且未撤销的根 Principal Session。Binding、credential 和 artifact 不作为独立行。
- 会话 VO 只返回内部 `principalSessionId`、用户摘要与账号状态、登录方式、`authTime`、`expiresAt`、归一化 Session Origin、`isCurrentSession` 和 `isCurrentUser`。
- 会话 VO 不返回 `lastActiveAt`。当前各协议续期路径不一致，第一版不得把该字段表达为真实最后活动时间。
- 登录方式由 `amr` 归一化：`pwd` 显示为密码，`sms` 显示为手机验证码，`oa` 与 `wechat` 使用对应名称，其他值归为未知；多种方式可以同时展示。
- 用户摘要批量读取现有管理用户数据，避免逐行查询。命中软删除记录时返回已删除状态；未命中记录时保留 subject user ID 并返回未知用户。数据库基础设施错误正常传播为 5xx，不把整页用户伪装成未知。
- `PrincipalSession` 增加可选的 Session Origin，包含登录时观测到的 IP 和有界原始 User-Agent。该字段向后兼容，不提升现有对象版本，不要求旧会话重新登录。
- 密码、手机验证码、OA 和微信创建 Principal Session 时都传入最终创建请求的 Session Origin。IP 继续使用可信网关清洗后的请求头提取规则，User-Agent 只按有界字符串保存。
- 原始 User-Agent 不进入管理 VO。管理端使用无新依赖的确定性粗分类，设备类型只包含桌面、手机、平板、未知；操作系统族只包含 Windows、macOS、iOS、Android、Linux、未知；浏览器族只包含 Chrome、Edge、Firefox、Safari、微信、其他。
- Session Origin 只作为调查提示，不生成设备指纹、持久设备 ID 或可信设备状态，也不参与授权判断。
- Session Kernel 增加全局 Principal Session 有序索引 `sess:v2:idx:principal_sessions`，成员为编码后的内部 Principal Session ID，score 为 `expiresAt`。
- Principal Session 创建、续期和撤销与全局索引更新使用同一 Redis 原子写入边界。自然过期成员由列表查询按 score 批量清理；解析不到真实对象的悬空成员被移除并继续补足当前页面。
- 按用户筛选和用户全部撤销继续使用现有用户级 Session Kernel 索引；请求路径不得为列表执行 Redis 全库 `SCAN`。
- 原始 Session Kernel 查询与撤销仍只由现有 session runtime owner 或 composition 持有。新的 Admin session management service 消费会话 inventory/control port，不获得 raw Redis、Kernel store 或 token lookup 能力。
- 单会话撤销使用 `admin_revoke` 原因并级联 IAM 管理的全部子对象。Independent client 已自行建立的第三方本地会话不属于保证范围。
- 当前管理员的单会话撤销由前端禁用，并由后端以 `409 / ADMIN_SESSION_CURRENT_PROTECTED` 强制拒绝。拒绝发生前后都不得改变 Redis 状态。
- 对本人执行用户全部撤销时自动以当前 `principalSessionId` 作为根会话例外。现有 Kernel 语义保持不变：保留该根 Principal Session，同时撤销其子对象和本人的其他根会话。
- 若目标用户是 actor 自己但服务端无法取得当前 `principalSessionId`，操作 fail closed，不得退化为撤销当前根会话。
- 用户全部撤销读取一次当前用户索引并处理当时已索引的会话，不新增 user session generation、revocation epoch 或登录冻结。操作期间或之后新创建的会话允许存在。
- 撤销已过期、已撤销或不存在的目标返回 HTTP 200 和 `changed:false`。两个管理员并发处置同一目标时，后执行者得到相同幂等语义。
- 撤销结果返回 `changed`、目标 scope、各类 IAM 对象的脱敏撤销数量、是否排除当前根会话，以及 cleanup 的 attempted、succeeded 和 failed count；不得返回 cleanup failure 内容。
- IAM tombstone 与索引失效成功后即认为 Session Revocation 成功。外围 cleanup 失败不回滚，响应保持 HTTP 200，返回脱敏的 `cleanup.failedCount`，界面显示“会话已下线，部分关联清理失败”。
- Cleanup 的原始失败对象、ref 和外部异常只进入受控的脱敏系统日志，不进入 API 响应或审计详情。
- 登录失败保护下沉为共享 `LoginRestriction` 模块，统一拥有现有 key、5 次阈值、30 分钟滚动窗口、30 分钟限制、状态查询、格式化所需事实和清理操作。
- 密码与手机验证码失败继续共享用户级失败集合。服务端原子记录失败时先移除窗口外成员、加入唯一失败成员、读取计数并刷新失败集合 TTL；达到阈值时在同一 Redis 脚本中创建 Temporary Login Restriction 并写入全局限制索引。
- Temporary Login Restriction 的规范原因恒为 `too_many_login_failures`。`password`、`mobile` 或 `unknown` 只保存和返回为最后跨过阈值的 Trigger Method。
- 临时限制继续使用现有用户级限制 key，并增加 `login-blacklist:idx:users` 全局有序索引；成员为十进制用户 ID，score 为限制到期时间。遗留 key 名只作为兼容持久化名称，不进入领域或界面文案。
- 限制列表按自动到期时间倒序分页。查询先移除已过期索引成员，再解析真实限制 key；旧值或异常 trigger method 映射为 `unknown`，状态仍可解除。
- `releaseLoginRestriction` 在一个 Redis 原子操作中删除限制 key、当前失败历史和全局限制索引成员，返回是否实际改变状态以及 `failureStateCleared:true`。
- 成功登录也复用同一失败状态清理能力。管理员解除之后的新失败立即重新计数；不设置 allowlist、宽限 key 或免限时间。
- Temporary Login Restriction 只在新认证入口检查，不触发任何 Session Revocation。解除限制也不创建、续期或恢复 Principal Session。
- 登录入口无法读取限制状态时 fail closed，返回 `503 / LOGIN_PROTECTION_UNAVAILABLE`，并使用 `login_protection_unavailable` 审计原因；不得映射为凭据错误或已受限。
- Admin 列表或操作无法访问 Redis 登录状态时返回 `503 / ADMIN_LOGIN_STATE_UNAVAILABLE`，不得返回空列表或虚假成功。
- 限制 VO 返回用户 ID、用户摘要与账号状态、`cause`、`triggerMethod`、`restrictedUntil` 和 `remainingSeconds`。前端可以本地更新剩余时间显示，但不为此轮询服务端。
- 管理动作新增 `admin.session.revoke`、`admin.session.revoke_user` 和 `admin.login_restriction.release` 三个审计动作及展示标签。
- 单会话审计允许把内部 `principalSessionId` 作为目标标识；它不是 bearer credential。用户全部撤销和解除限制使用用户作为审计目标。
- 审计记录 success、幂等无变化和当前会话保护 failure。详情仅包含目标 scope、`changed`、脱敏撤销数量、当前会话例外、cleanup 失败数量、限制 cause/trigger method 和失败状态是否清除。
- 管理审计禁止保存 Principal Session 外部 token、lookup hash、HMAC key 信息、任意 session metadata、cleanup ref、目标原始 User-Agent、目标 IP 或原始异常。Actor 请求 IP/User-Agent 继续通过现有审计字段记录。
- Redis 状态变化先执行，随后同步写 PostgreSQL 审计。审计写入失败时不回滚已经生效的 Redis 状态，返回 `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，记录结构化错误日志，前端刷新状态且不自动重试。
- 接受 Redis 生效后进程在审计前崩溃可能产生无审计事件的极小窗口；本功能不新增 durable command、outbox、异步任务状态或持久重试。
- 有效会话与 Temporary Login Restriction 只以 Redis 为实时事实来源，遵守 ADR-0005。PostgreSQL 不新增会话、限制或索引表，也不提供历史会话查询。
- 本次不执行 Redis backfill，不新增维护命令或菜单开放门禁。新版本开始双写后立即开放页面，并接受旧 Principal Session 和旧 Temporary Login Restriction 在 TTL 窗口内不可见。
- 管理端有效会话表展示用户与账号状态、登录方式、登录时间、过期时间、IP、粗粒度设备和操作；不展示最后活跃时间、原始 User-Agent 或关联应用清单。
- 有效会话行提供“强制下线本次”和“下线该用户全部”。当前会话的单会话按钮禁用；全部下线确认框在目标为本人时明确说明当前根会话保留、其关联 IAM 凭证仍会撤销。
- 临时登录限制表展示用户与账号状态、统一原因、最后触发方式、自动解除时间、剩余时间和解除操作。
- 操作结果分别使用成功、无变化、cleanup 警告、当前会话保护、状态不可用和审计已失败但作用可能生效的明确提示。操作完成或作用可能已生效时重新加载当前页。
- 第一版不要求管理员填写自由文本原因，不向被处置用户发送站内、短信、微信或其他通知，也不向客户端暴露管理员身份和撤销原因。用户下一次请求继续按现有未登录语义处理并清除 Cookie。
- 文档更新使用新的领域词汇、Redis 唯一事实来源决策、Admin 会话管理契约和必要的测试命令；冻结的 OpenSpec 历史不修改。

## Testing Decisions

- 好的测试只观察公开模块、管理意图、HTTP/tRPC contract 和浏览器交互，不断言私有 helper、内部函数顺序、React 组件实现、具体 Redis pipeline 排列或 repository 查询文本。
- 共享登录状态是第一条核心测试 seam。Session Kernel 与 `LoginRestriction` 的公开接口承担所有 Redis 生命周期行为测试，clock、random 和外部 cleanup 使用确定性边界。
- Session Kernel 普通测试沿用现有 Fake Redis，覆盖可选 Session Origin 向后兼容、全局索引创建与续期、撤销移除、过期清理、用户筛选、固定排序、悬空成员修复、页面补足和敏感字段不出现在管理 VO。
- Session Kernel 普通测试覆盖单会话级联、其他用户全部撤销、本人当前根会话例外及子对象仍撤销、并发幂等无变化和 cleanup 部分失败。
- `LoginRestriction` 普通测试覆盖第 1 至第 4 次失败不限制、第 5 次原子限制、密码与手机混合计数、Trigger Method 只代表阈值跨越方式、自然过期、遗留或异常 trigger 映射、成功清理和管理员解除时三类状态同时删除。
- 新增显式 `@iam/api-core` `test:redis` 外部通道，以调用方提供的专用 Redis URL和随机 namespace 运行同一公开接口。测试不得自行启动 Docker、不得清空共享 Redis，缺少 URL 时快速失败而不是 skip。
- 真实 Redis contract 只覆盖 Fake Redis 无法证明的 Lua/transaction 行为：并发失败不丢计数、阈值与限制索引原子出现、解除与并发失败按 Redis 执行顺序线性化、状态与索引不会产生中间可见不一致。
- `test:redis` 不进入默认 `pnpm test` 或 `pnpm verify`，按改动类型显式运行并在测试架构与命令文档中登记。
- 密码和手机登录继续使用现有 use-case seam，补充共享限制模块委托、混合失败文案、成功清理、真实受限和 `LOGIN_PROTECTION_UNAVAILABLE` 不被误审计为 Temporary Login Restriction 的回归测试。
- OA、微信、密码和手机登录的现有 use-case 测试验证创建 Principal Session 时传递 Session Origin；测试不解析具体 Redis object。
- Admin API 意图是第二条核心测试 seam。测试构造真实 session management service 与共享 adapter，只 fake Session inventory/control、LoginRestriction、用户批量读取、审计、clock 和 logger 等系统边界。
- Admin API seam 覆盖四个意图、分页默认与上限、精确用户筛选、请求时排序、用户状态与缺失用户映射、`amr` 映射、Session Origin 白名单和不返回 `lastActiveAt`。
- Admin API seam 覆盖当前单会话 409 且无 Redis 改动、本人全部撤销的当前根例外、其他用户全部撤销、点式并发边界、幂等 `changed:false`、cleanup 警告和 Redis 503。
- Admin API seam 覆盖三类审计动作、内部 `principalSessionId` 目标、success/no-op/protected failure、审计字段脱敏和作用后审计失败的专用错误。
- REST 与 tRPC contract 测试证明两种传输复用同一 adapter，具有相同输入校验、actor context、响应 VO 和错误映射；OpenAPI 测试锁定四个 REST 路径和 schema。
- Port contract 与 architecture tests 证明 Admin route/service 不直接导入 raw Session Kernel 或 Redis，LoginRestriction 只有一个共享实现 owner，production composition 通过 structural typing 满足 consumer-owned ports。
- 管理端 Playwright 是第三条核心测试 seam，沿用现有 mock Admin API fixture，覆盖路由与菜单、两个标签页、用户筛选、分页、账号状态、来源展示和空态。
- Playwright 覆盖当前会话按钮禁用、单会话确认、本人全部下线确认、普通成功、无变化、cleanup 警告、Redis 503和作用后审计失败刷新提示。
- Playwright 不测试 Redis 算法、审计内容或第三方退出；这些行为由共享后端与 Admin API seam 覆盖。
- 生产 composition 发生变化时运行现有 API 与 Admin API process smoke，证明真实 entry、env parsing 和 wiring 可启动；smoke 不替代登录状态行为测试。
- 文档变更运行 `pnpm check:docs`，稳定 module edge 运行 `pnpm check:architecture`。各受影响 workspace 运行聚焦 lint、typecheck 和测试；管理端浏览器行为显式运行相关 E2E。
- 本功能不修改 PostgreSQL schema，因此不新增数据库 migration 或 `test:postgres` 场景。准备 merge 时在最终实现内容上按仓库工作流运行一次完整 `pnpm verify`，并进行 Standards / Spec 双轴评审。

## Out of Scope

- 建立 PostgreSQL 会话影子表、临时限制表、历史状态投影或任一历史时刻的会话快照。
- 对上线前已有 Principal Session 或 Temporary Login Restriction 执行 Redis backfill、迁移、维护扫描或菜单开放门禁。
- 修改现有 Principal Session 24 小时默认 TTL、5 次失败阈值、30 分钟失败窗口或 30 分钟限制时长。
- 在管理端编辑登录保护策略、按用户定制阈值或建立策略发布机制。
- 新增 `iam:session:manage` 等细粒度权限、敏感操作二次认证或近期认证要求。
- 增加任意多选批量撤销、跨用户全部下线、计划任务或自动化处置。
- 按 IP、设备、浏览器、登录方式或账号状态进行服务端筛选和安全狩猎。
- 展示关联应用清单、第三方本地会话状态或保证 Independent client 的本地会话同步退出。
- 自动因 Temporary Login Restriction 撤销已有会话，或因 Session Revocation 自动禁用账号、重置密码或禁止未来登录。
- 为解除限制增加白名单、宽限期、免限 token 或持续绕过失败计数。
- 引入 user session generation、revocation epoch、登录冻结或“全部下线”与并发新登录之间的严格屏障。
- 统一所有协议的 Principal Session activity touch、增加 Redis 写入节流或展示 `lastActiveAt`。
- 建立可信设备、设备指纹、持久设备 ID、浏览器版本或具体手机型号识别。
- 引入第三方 User-Agent 解析依赖或把原始 User-Agent 暴露给管理前端。
- 向被处置用户发送站内、短信、微信或其他通知，或向客户端暴露管理员身份、审计原因和具体撤销原因。
- 要求管理员填写自由文本原因、工单号或结构化处置原因码。
- 为 Redis 状态与 PostgreSQL 审计增加分布式事务、outbox、durable command、异步任务状态或自动重试。
- 保证 Redis 生效与审计事件之间零丢失，或把系统日志当作可重建的会话状态。
- 修改既有登录审计的 IP/User-Agent 保留策略，或新增目标来源信息的持久审计副本。
- 增加 WebSocket、SSE、服务端轮询或跨请求一致的分页快照。
- 修改账号暂停、结束、删除、密码重置和 User Resignation 的现有业务编排。
- 修改第三方 SSO、OIDC 或 Session Kernel 的外部 token 格式、Cookie、HTTP contract 与第三方接入协议。
- 修改数据库 schema、Gateway 配置、部署拓扑或冻结的 OpenSpec 历史。

## Further Notes

- `Valid Principal Session` 表示仍可被 IAM 接受的根登录会话，不表示用户当前在线；本功能有意移除不可信的最后活跃时间。
- `Temporary Login Restriction` 与 `Session Revocation` 是正交概念：前者阻止新认证但保留已有访问，后者终止已有 IAM 访问但不阻止未来认证。
- `Login Restriction Trigger Method` 只表示最后一次跨过阈值的方式。四次密码错误加一次手机验证码错误必须显示统一原因和手机触发方式，不能显示“手机验证码错误达到五次”。
- `Session Origin` 只保存登录请求的观测来源。完整 IP 和粗粒度设备摘要只对现有管理员可见，不构成可信设备证明。
- ADR-0005 已记录 Redis 唯一事实来源的长期边界；本 spec 记录本功能选择不回填旧状态、接受上线窗口遗漏的可逆发布取舍。
- 现有 Admin API 每次认证不会续期 Principal Session，因此 `lastActiveAt` 当前不能作为跨协议活动事实；未来若统一 activity touch，应作为独立 feature 重新设计性能和语义。
- 当前 Session Kernel 已经保证被排除的本人根会话仍会撤销子对象，本功能复用该已测试语义，不在 Admin service 重写级联算法。
- 当前登录失败逻辑把失败计数和限制写入拆成两个步骤；本功能将其收口为一个共享原子操作，以避免达到阈值后进程中断造成未限制状态。
- 当前 Session Kernel 与登录失败状态都缺少全局列表索引。本功能只增加 Redis 派生索引，不改变现有按用户撤销和直接限制检查的事实键。
- Spec 已完成测试接缝确认，适合继续使用 `/to-tickets` 按依赖切分实现；本次发布 spec 不构成实现、合并、推送或部署授权。
