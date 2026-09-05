# 管理端会话管理页面契约

本文定义 Admin `/sessions` 的列表、会话撤销与临时登录限制交互。通用请求、权限和状态归属见
[前端架构](../../architecture/frontend-architecture.md)；审计字段、作用顺序与作用后审计失败语义见
[审计契约](../audit/audit-logging.md)。

## 页面入口与数据边界

页面通过 `src/services/session-management.ts` 消费 Valid Principal Session 列表与单会话/用户全部撤销，
以及 Temporary Login Restriction 列表与解除能力。页面使用“有效会话”和“临时登录限制”两个标签页；两个列表都复用
用户远程搜索提交精确 numeric user ID，使用默认 20、最大 100 的分页与手动刷新，不轮询。

页面只渲染后端安全 VO，不接触原始 User-Agent、Session Kernel 模型或 cleanup failure 内容。Transport 错误由
service wrapper 使用共享 API error code 归一化为稳定的页面错误；页面不得解析 tRPC `httpStatus`、展示
`serviceCode` 或原始错误 message。

## 有效会话与撤销

每行统一提供“强制下线本次”和“下线该用户全部”。当前管理会话的单会话按钮禁用；本人全部下线仍可用，确认框明确
保留当前根会话但撤销其关联 IAM 凭证与其他 roots。确认框同时说明点式撤销的并发窗口、不能保证第三方本地会话退出、
不会阻止未来登录，以及凭据泄露时的密码重置、账号暂停或结束处置；不展示推测的关联应用清单，也不要求备注或原因。

成功、幂等无变化和 cleanup 部分失败分别显示稳定提示并刷新当前列表；
`ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` 显示“作用可能已生效”，刷新状态且不自动重试 mutation。

## 临时登录限制与解除

每行显示用户与账号状态、固定“登录失败次数过多”原因、最后 Trigger Method、自动解除时间与剩余时间。
倒计时只在行内按服务端初值本地推进，不触发列表重载、服务端轮询或实时推送；异常 Trigger Method 显示为“未知”。

解除确认明确同时清除限制和当前失败历史、不创建白名单或宽限期、新失败立即重新计数，且不影响任何已有
Principal Session；不提供阈值、窗口或时长配置，不要求备注，也不发送通知。

成功与 `changed:false` 都刷新一次；Redis 503 保留当前状态且不显示假成功；
`ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` 提示作用可能已生效、刷新一次且不自动重试 mutation。

## 验收关注点

修改相关交互时，通过现有前端测试通道验证精确用户筛选、分页与手动刷新、当前会话保护、确认内容、安全 VO 和稳定错误
呈现。覆盖成功、幂等无变化、cleanup 部分失败、Redis 不可用及作用后审计失败；验证行内倒计时不重载列表、作用后
审计失败不自动重试。测试通道与预算见 [测试架构](../../architecture/testing-architecture.md)。
