# 管理端会话管理页面契约

本文定义 Admin `/sessions` 的列表、会话撤销与临时登录限制交互。通用请求、权限和状态归属见
[前端架构](../../architecture/frontend-architecture.md)；审计字段、作用顺序与作用后审计失败语义见
[审计契约](../audit/audit-logging.md)。

## 页面入口与数据边界

页面通过 `src/services/session-management.ts` 消费 Principal Session Record 列表与单会话/用户全部撤销，
以及 Temporary Login Restriction 列表与解除能力。页面使用“会话记录”和“临时登录限制”两个标签页；两个列表都复用
用户远程搜索提交精确 numeric user ID，使用默认 20、最大 100 的分页与手动刷新，不轮询。

页面只渲染后端安全 VO，不接触原始 User-Agent、Session Kernel 模型或 cleanup failure 内容。Transport 错误由
service wrapper 使用共享 API error code 归一化为稳定的页面错误；页面不得解析 tRPC `httpStatus`、展示
`serviceCode` 或原始错误 message。

## 会话记录与撤销

生产列表通过中性 Kernel 返回尚未过期且未撤销的记录，不逐目标检查 Subject Access Barrier，
也不因读取列表而触发账号拒绝清理。管理员自身仍在本次 REST/tRPC 调用取得许可。
页面明确提示“记录存在不代表当前允许访问”：账号状态或所属代际可能已经失效，尚未清理的旧代记录仍可查询与撤销。
管理员自身的访问许可、角色与范围授权继续生效；撤销目标不以目标账号当前可访问为前提。

每行统一提供“强制下线本次”和“下线该用户全部”。当前管理会话的单会话按钮禁用；本人全部下线仍可用，确认框明确
保留当前根会话，撤销其他 roots，并尽力处理所有目标根（包括当前根）的关联 IAM 凭证。确认框同时说明点式撤销的并发窗口、不能保证第三方本地会话退出、
不会阻止未来登录，以及凭据泄露时的密码重置、账号暂停或结束处置；不展示推测的关联应用清单，也不要求备注或原因。

撤销成功采用 `{ changed, result }`，`result` 保留 scope、实际撤销数量、当前根会话例外及 cleanup 数量摘要。
`changed` 只依据实际撤销数量，不因 cleanup 失败而翻转。成功、幂等无变化和 cleanup 部分失败分别显示稳定提示并刷新当前列表；
`ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` 显示“作用可能已生效”，刷新状态且不自动重试 mutation。页面持续显示审计仍需修复的提示，普通读取成功或切换标签页不会清除该提示。

## 临时登录限制与解除

每行显示用户与账号状态、固定“登录失败次数过多”原因、最后 Trigger Method、自动解除时间与剩余时间。
倒计时只在行内按服务端初值本地推进，不触发列表重载、服务端轮询或实时推送；异常 Trigger Method 显示为“未知”。

解除确认明确同时清除限制和当前失败历史、不创建白名单或宽限期、新失败立即重新计数，且不影响任何已有
Principal Session；不提供阈值、窗口或时长配置，不要求备注，也不发送通知。

解除成功采用 `{ changed, result:{ failureStateCleared:true } }`。`changed` 只表示是否解除有效限制，
`failureStateCleared:true` 表示原子清理已完成；只有失败历史而没有有效限制时仍是 `changed:false`，不把清理完成视为限制变化。
成功与 `changed:false` 都刷新一次；Redis 503 保留当前状态且不显示假成功；
`ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` 提示作用可能已生效、刷新一次且不自动重试 mutation；刷新成功后仍保留审计修复提示。

## 验收关注点

修改相关交互时，通过现有前端测试通道验证会话记录提示、不可访问账号的记录仍可管理、精确用户筛选、分页与手动刷新、
当前会话保护、确认内容、安全 VO 和稳定错误呈现。覆盖成功、幂等无变化、cleanup 部分失败、Redis 不可用及作用后审计失败；验证行内倒计时不重载列表、作用后
审计失败不自动重试。测试通道与预算见 [测试架构](../../architecture/testing-architecture.md)。

## 根撤销与关联对象尽力处理

[#165](https://github.com/cyy1998/shgas-iam/issues/165) 将根撤销结果与子枚举、单个子撤销及比较冲突分开：子处理失败不阻止根与其余可独立作用；根失败或结果未知仍返回错误，已经发生的作用不回滚。漏撤 Credential 不保证立即失效，也没有后台最终撤销承诺。

页面按实际根数量提示“已撤销 N 个根会话”；只有子对象变化时明确“本次未撤销根会话”，无新作用时也包含当前根保留的可能。外围 cleanup 失败单独提示，不能将它理解为权威撤销失败。仅子对象实际撤销时 `changed:true`，原根缺失、已撤销、比较冲突或计划数量都不计为实际撤销。

用户级及密码重置的当前根例外只保护根自身；账号状态撤销继续按指定失效代际选择，保留新代。密码 `changed` 仍表达密码提交，原本不下线的自助改密和找回密码不新增撤销。真实 Redis 的服务/认证、页面 Component 与 Browser tests 分别证明存储作用、当前根保护、准确反馈与作用后审计恢复。
