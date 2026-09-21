# 会话管理与本人安全

Admin `/sessions` 管理 UserSession、其 ClientSession 和 Temporary Login Restriction。
管理员每次请求认证并经集中策略授权；目标记录不因账号当前不可访问而无法管理。
公开生命周期见[Kernel](../sso/unified-session-kernel.md)，审计见[审计契约](../audit/audit-logging.md)。

## 列表与安全视图

页面有“会话记录”“临时登录限制”两个标签，使用远程用户搜索的精确 numeric user ID，
默认每页 20、HTTP 最大 100，手动刷新而不轮询。
只消费安全 VO，显示姓名、工号、账号状态与必要时间，不接触原始 User-Agent、存储模型、context 或 cleanup 错误。
service 用共享错误码归一化页面错误，不展示原始 message/serviceCode 或解析 tRPC httpStatus。

主表只列 UserSession，不展示/筛选类型；“应用会话”展开该根下的 ClientSession，
显示所属 Client、最近授权协议、授权/过期时间，支持独立分页、刷新和单独下线。
后端以 kind=clientSession 和 userSessionId 限定原根，通过 children 索引原子计算页和 total，
不在前端过滤全局页。当前根的 ClientSession 仍可单独终止。

列表不取得目标账号许可、不因读取触发撤销；记录存在也不表示当前允许访问。
每次响应的 allowedActions.revoke 决定按钮，缺失能力或读取失败关闭操作。
安全记录和管理 identity 不能转换成在线观察或许可。

Kernel 单次有界 Redis 操作最多列 1000 条；页内坏记录、悬空或错归属暂态失败，不交付假完整页。
整个索引缺失可能缩小可见集合，total 只是所选索引数量，不是在线人数或完整库存；
在线 Token 查原根/实例，索引漏项不恢复已终止关系。无索引库存由维护 owner 处理。

## 精确撤销与未完成批次

单根撤销保护当前管理根；用户级操作先捕获根与子集合再执行。
每个索引最多扫描 10000 个成员，聚合目标最多 10000 个，超预算在作用前拒绝并要求缩小范围。
捕获不是全局快照，不保证覆盖之后落库的在途对象；删除前完成全部捕获。

captured 目标在同一集中权限下按原 ID/instance 执行，当前根始终排除；
排除当前根不排除其 ClientSession，不跟随当前关系槽或重新扫描扩大原批次。
响应保留 `generation: unified`、实际 sessions、batch 及独立 artifactCleanup：

- terminated 才计入两类成功终止数；already_terminated、missing、expired、replaced、excluded 分开报告。
- failed/unknown 不计成功，不因此翻转 changed；unfinished 只含原失败/未知 identity。
- 本管理流程不调用协议产物回收，artifactCleanup 的三类尝试数量为真实零次，不表示库存为空或后台进度。

页面保留 unfinished，经主动确认后重试原集合；刷新、能力变化、切换标签不自动提交或清除。
有未完成集合时关闭其他新撤销按钮，避免覆盖；响应丢失而无集合时重新查询并明确发起新操作。
权威根终止不依赖子索引，子清理失败不回滚根；协议产物由各自 TTL/维护负责。

## 本人改密与全部下线

本人全部下线、改密排除当前根自身，但继续终止其 ClientSession。
本人缺少当前根时在改密前拒绝。改密先执行同行事务和密码审计，提交后调用同一撤销服务并记录实际作用；
后续失败保持密码已提交语义，不自动再改密码。

作用后审计失败使用 ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT；
只有 unknown 而确认终止数为零也属于可能已有作用。changed 保持实际事实，页面刷新并持续提示审计修复，
读取成功不抹去提示。本人改密外层以 ADMIN_MUTATION_COMMITTED 表达密码已提交后的处理失败。
failed-only 且没有确认变化/unknown 的审计失败仍是普通审计失败，详见[审计契约](../audit/audit-logging.md)。

## 账号与 Client 删除

账号禁用/删除保持 Subject Access transition、源事务及指定前代撤销；
离职保留 prepared context 和合法 no-op 的撤销重试。准备失败退回 callback 的明确前代，
无前代不扩大为全账号，晚到旧 context 不伤重新启用后的新代。

删除 Client 业务对象，在同行锁/业务审计事务提交后执行 required Snapshot 失效和会话终止；
确认提交后终止未确认为 ADMIN_MUTATION_COMMITTED。显式重复删除允许 no-op 并重试残余 ClientSession。
Unknown COMMIT 只保守失效并保留原错误，不擅自执行删除后的会话作用。
普通配置编辑、启停、切换及轮换本身不撤销。
这些作用的可靠恢复与外部责任见[统一维护手册](../../releases/unified-session-maintenance.md#放流与人工恢复责任)。

## 临时登录限制

每行显示用户/账号状态、固定“登录失败次数过多”原因、最后 Trigger Method、自动解除及剩余时间。
倒计时按服务端初值在行内推进，不触发列表重载或轮询；异常 method 显示“未知”。

解除同时清限制和当前失败历史，不创建白名单/宽限期，新失败立即重新计数，不影响已有会话；
不提供阈值、窗口、时长配置或额外备注/通知。
成功为 `{ changed, result: { failureStateCleared: true } }`：
changed 只表示有效限制被解除，仅有失败历史时仍为 false，不能把原子清理完成当作限制变化。

成功或合法 no-op 刷新一次；Redis 503 保留状态不显示假成功；
作用后审计失败提示可能生效、刷新但不自动重试，持续保留审计修复提示。
没有自动审计补写、后台撤销或第三方本地会话退出保证。

## 验证入口

安全分页、能力变化、当前根保护、固定批次、unknown-only、改密已提交失败及限制解除通过各自公开行为验证。
前端替身不证明后端权限或存储作用；通道与范围见[架构验证归属](../../architecture/architecture-verification.md)。
