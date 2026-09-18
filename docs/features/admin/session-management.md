# 管理端会话管理页面契约

## #191 统一会话候选

本节为 #194 的默认生产图契约；旧四对象在线说明已退役，环境尚未切换。
`createRootSecurityComposition` 复用正式管理认证、集中授权、服务及 REST/tRPC adapter，明确选择 Unified Kernel。
同一候选不读取旧会话，不按 bearer 或记录格式回退。`lifecycleRevocation` 同时供 UserService、
`createAdminApiUseCases` 的离职流程和 `createClientSsoSnapshotManagement` 的 `sessionTermination` 消费。

会话页主列表仅列出用户会话（UserSession），不展示或筛选记录类型。用户列显示姓名、工号与账号状态，不展示内部 ID。
每条用户会话通过“应用会话”入口展开该根下的 ClientSession，显示所属 Client、最近授权协议、授权和过期时间，支持独立分页、手动刷新与单独下线；当前根下的应用关系仍可单独终止。
应用会话查询通过 `kind=clientSession` 与 `userSessionId` 限定到原根，由 Kernel 复用 children 索引原子计算分页和 total，不在前端过滤全局分页。
列表只取安全记录和账号展示字段，不读取目标账号许可，不因查询触发撤销；管理员自身每次请求仍认证并经集中策略授权。
页面按每次列表返回的 `allowedActions.revoke` 更新按钮，读取失败或缺少能力时关闭操作。记录及管理 identity
不能转成在线父观察或 Subject Access Permission。

Kernel `listSessions` 在一次 Redis Lua 中取索引页和总数，每页最多 1000 条，HTTP 每页最多 100 条；
两类全局索引及主体应用索引随原子创建/复用更新、随终止尽力移除，索引保留 TTL。页内损坏、悬空或错归属记录报暂态失败，
不返回假完整页面。缺少整个索引会缩小可见记录集合，因此 total 只表示所选索引记录数，不宣称全库存或在线用户数。
独立 Token 使用仍验证原根和实例；索引漏项不会使已终止根重新有效。完整库存与无索引对象由维护 owner 处理。

用户级操作先捕获根与子实例，再执行固定集合；单根仍保护当前管理根。本人全部下线/改密复用 #183，
只排除当前根自身，继续终止其 ClientSession。捕获每个索引最多扫描 10000 个成员，聚合目标最多 10000 个；
超过预算在作用前拒绝，管理员应缩小范围。捕获不是全局快照，不承诺涵盖捕获后才落库的在途对象。
`target.type=captured` 在同一集中撤销权限下只执行提交的原 identity，当前根始终排除，不追随关系槽或重新扫描目标。
结果分别返回 terminated、already_terminated、missing、expired、replaced、excluded、failed、unknown 和完整 unfinished。
成功终止数只计 terminated；未知不计成功，也不翻转 changed。

新结果保留 `generation: unified`、两类实际 `sessions` 计数，并附 `batch` 与独立 `artifactCleanup`。
捕获集合的审计使用 `session_batch` 目标类型，只保存实际分类数量，不伪装成某个根会话；原 identity 留在操作响应而不进入审计 details。
本管理流程不调用协议产物回收，故 artifactCleanup 的 attempted/succeeded/failed 均为真实零次；
它不表示队列进度、协议库存为零或稍后会自动补齐。协议 Code/Token 继续由各协议 TTL/维护 owner 回收。
页面保存未完成原集合，主动确认后重试；普通刷新、能力变化和切换标签不清除此集合，也不会自动提交。
未完成集合存在时其他新撤销按钮关闭，避免覆盖原批次。响应丢失而没有集合时重新查询、明确发起新操作。
作用后审计失败（包括 unknown-only）继续返回 `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，刷新并保留审计修复提示。

账号禁用/删除维持真实 Subject Access transition owner、源事务及指定前代撤销；离职保留 prepared context 与合法 no-op 重试。
准备失败只记录诊断并退回 callback 明确前代，没有前代时不扩大为全账号；晚到的旧 context 不伤重新启用后的新代。
新 Client 删除在同 Client 行锁/业务审计事务后执行 required Snapshot 失效和会话终止；明确提交后终止未确认返回
`ADMIN_MUTATION_COMMITTED`。显式重复删除允许 no-op 并重试残余 ClientSession，普通配置编辑、启停、切换和轮换仍零撤销。
Unknown COMMIT 仍只保守失效并保留原错误，不擅自执行删除后的会话作用。

### 管理消费者替代与 #121 剩余责任

| 旧消费者/结果 | 新候选与后续删除边界 |
|---|---|
| Principal inventory / 单根及用户撤销 | root-security 中性两类记录、固定身份执行；旧 production composition、port 与旧列表别名已在 #194 删除。 |
| UserService 状态/删除 | 同一服务和 UoW，改接 unified lifecycle adapter；不改账号代际权威。 |
| ResignUser prepared revocation | 同一 use case 接 lifecycleRevocation；捕获 context、fallback 与 no-op 重试保留。 |
| ClientService epoch selector 删除 | Client SSO 显式删除与会话终止；旧版本选择生产图已删除。 |
| revoked.principalSessions/bindings/credentials/artifacts 与 cleanup | sessions 实际终止计数、batch 原结果、artifactCleanup 实际尝试；#194 已协调严格生产者/消费者并删除旧 union 分支。 |
| Sessions、ResetPasswordModal、REST/tRPC 外部调用方 | 当前页面兼容分支只用于迁移；外部调用方需同步改计数、原批次重试及错误处理，环境切换由发布 owner 核验。 |

| #121 作用类别 | Owner、重试与可遗忘条件 |
|---|---|
| UserSession/ClientSession 权威终止 | Kernel 同记录终态与 TTL；未确认结果保留原 identity 主动重试，不能因 Promise fulfilled 视为完成；到期后新访问拒绝。 |
| 根到子尽力作用及索引漏项 | Admin/Subject Access 捕获范围；原根确认终止后 Token 新使用查根拒绝，子残余到期或维护回收；当前根排除时子终止失败仍需明确重试。 |
| Code/Token 存储回收 | OIDC/Custom SSO owner 的 TTL/维护；回收暂停不能恢复被终止实例，管理零次尝试不证明库存清零；旧无 TTL/pending 由 #193/#194 维护迁移。 |
| Custom 本次 Token 同步补偿 | Custom SSO owner 继续绑定本次产物；失败/未知及外部交付边界沿 #185/#186，不由 Admin 重放签发。 |
| 账号访问状态与 transition 恢复 | Subject Access / User Profile 既有 PG intent 与 Redis repair；已提交终态、前代与恢复责任仍需可靠处理，不能只依会话 TTL。 |
| 审计 | 业务审计同事务；会话作用后审计失败由管理员核查并显式修复，当前无自动补写承诺，不因列表刷新成功遗忘。 |
| ORCAS/第三方本地会话 | #145 与外部 owner；IAM 终止、TTL 或替身测试不证明外部退出，仍需独立可靠性裁定。 |

#121 保持 open；本票不新增后台撤销任务，也未交付通用可靠执行器、SLO 或自动审计补齐。
真实 PG/Redis/正式 REST/tRPC 证据集中于 `root-security.integration.test.ts`；页面的服务端能力、记录和原集合交互
由 Sessions browser 补证。实际运行命令和固定候选在 #191 评论登记，浏览器替身不替代后端作用或实际环境验收。

本文定义 Admin `/sessions` 的列表、会话撤销与临时登录限制交互。通用请求、权限和状态归属见
[前端架构](../../architecture/frontend-architecture.md)；审计字段、作用顺序与作用后审计失败语义见
[审计契约](../audit/audit-logging.md)。

## 页面入口与数据边界

页面通过 `src/services/session-management.ts` 消费 UserSession/ClientSession 安全记录 列表与单会话/用户全部撤销，
以及 Temporary Login Restriction 列表与解除能力。页面使用“会话记录”和“临时登录限制”两个标签页；两个列表都复用
用户远程搜索提交精确 numeric user ID，使用默认 20、最大 100 的分页与手动刷新，不轮询。

页面只渲染后端安全 VO，不接触原始 User-Agent、Session Kernel 模型或 cleanup failure 内容。Transport 错误由
service wrapper 使用共享 API error code 归一化为稳定的页面错误；页面不得解析 tRPC `httpStatus`、展示
`serviceCode` 或原始错误 message。

## 会话记录与撤销

生产列表通过中性 Kernel 返回尚未过期且未撤销的记录，不逐目标检查 Subject Access Barrier，
也不因读取列表而触发账号拒绝清理。管理员自身仍在本次 REST/tRPC 调用取得许可。
记录存在不代表当前允许访问：账号状态或所属代际可能已经失效，尚未清理的旧代记录仍可查询与撤销。
页面不常驻展示会话记录语义和登录来源参考用途的说明提示。
管理员自身的访问许可、角色与范围授权继续生效；撤销目标不以目标账号当前可访问为前提。

每行依据安全 record identity 和 allowedActions 执行精确撤销；当前根的单会话保护保留。
本人全部下线排除当前根自身，但包含该根 ClientSession。合法结果按实际两类会话 removed/failed/unknown 反馈，
未完成原集合显式重试；刷新不自动重放、不覆盖未完成批次。审计失败持续提示修复，不把读取成功视为修复完成。

## 临时登录限制与解除

每行显示用户与账号状态、固定“登录失败次数过多”原因、最后 Trigger Method、自动解除时间与剩余时间。
倒计时只在行内按服务端初值本地推进，不触发列表重载、服务端轮询或实时推送；异常 Trigger Method 显示为“未知”。

解除确认明确同时清除限制和当前失败历史、不创建白名单或宽限期、新失败立即重新计数，且不影响任何已有
UserSession；不提供阈值、窗口或时长配置，不要求备注，也不发送通知。

解除成功采用 `{ changed, result:{ failureStateCleared:true } }`。`changed` 只表示是否解除有效限制，
`failureStateCleared:true` 表示原子清理已完成；只有失败历史而没有有效限制时仍是 `changed:false`，不把清理完成视为限制变化。
成功与 `changed:false` 都刷新一次；Redis 503 保留当前状态且不显示假成功；
`ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` 提示作用可能已生效、刷新一次且不自动重试 mutation；刷新成功后仍保留审计修复提示。

## 验收关注点

修改相关交互时，通过现有前端测试通道验证不可访问账号的记录仍可管理、精确用户筛选、分页与手动刷新、
当前会话保护、确认内容、安全 VO 和稳定错误呈现。覆盖成功、幂等无变化、cleanup 部分失败、Redis 不可用及作用后审计失败；验证行内倒计时不重载列表、作用后
审计失败不自动重试。测试通道与预算见 [测试架构](../../architecture/testing-architecture.md)。

## 根撤销与关联对象尽力处理

根终止后 Token 在线访问验证根/关系并拒绝；子清理失败不反转根终态。管理响应分开报告两类会话作用与
未完成固定 identity 集合，协议产物清理由 owner TTL/显式维护负责，不把其清理计数混为会话终止。
