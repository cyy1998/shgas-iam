# 前端架构

本文记录 `apps/admin` 和 `apps/sso` 下 Umi Max + React 前端 app 的结构与 composition 约定。编码风格见
[../development/coding-style.md](../development/coding-style.md)。

## App 边界

- `apps/admin` 是管理前端。它应通过 `src/services/` 下的 page-side wrapper 消费 admin 能力，并把 tRPC client
  集中在 `src/lib/api-client.ts`。
- Admin `/sessions` 页面通过 `src/services/session-management.ts` 消费四个 intent：Valid Principal Session
  列表与单会话/用户全部撤销，以及 Temporary Login Restriction 列表与解除。页面使用“有效会话”和
  “临时登录限制”两个标签页；两个列表都复用用户远程搜索提交精确 numeric user ID，使用默认 20、最大 100 的分页
  与手动刷新，不轮询。
- “有效会话”每行统一提供“强制下线本次”和“下线该用户全部”。当前管理会话的单会话按钮禁用；本人全部下线仍可用，
  确认框明确保留当前根会话但撤销其关联 IAM 凭证与其他 roots。确认框同时说明点式撤销的并发窗口、不能保证第三方
  本地会话退出、不会阻止未来登录，以及凭据泄露时的密码重置、账号暂停或结束处置；不展示推测的关联应用清单，也不要求备注
  或原因。成功、幂等无变化和 cleanup 部分失败分别显示稳定提示并刷新当前列表；
  `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` 显示“作用可能已生效”，刷新状态且不自动重试 mutation。
- 页面只渲染后端安全 VO，不接触原始 User-Agent、Session Kernel 模型或 cleanup failure 内容。Transport 错误由
  service wrapper 使用共享 API error code 归一化为稳定的页面错误；页面不得解析 tRPC `httpStatus`、展示
  `serviceCode` 或原始错误 message。
- “临时登录限制”每行显示用户与账号状态、固定“登录失败次数过多”原因、最后 Trigger Method、自动解除时间与剩余
  时间。倒计时只在行内按服务端初值本地推进，不触发列表重载、服务端轮询或实时推送；异常 Trigger Method 显示为
  “未知”。
- 解除确认明确同时清除限制和当前失败历史、不创建白名单或宽限期、新失败立即重新计数，且不影响任何已有
  Principal Session；不提供阈值、窗口或时长配置，不要求备注，也不发送通知。成功与 `changed:false` 都刷新一次，
  Redis 503 保留当前状态且不显示假成功；`ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT` 提示作用可能已生效、刷新
  一次且不自动重试 mutation。
- Admin Organization Responsibility 使用 capability 驱动模块与 collection action，可由完整管理员或具有有效
  HR Administration Scope 的 `iam:hr-admin` 进入。独立 Assignment 页面和 Organization、Employment、User 嵌入面板
  复用同一 scoped service；holder 与 target selector 都只展示当前 scope 候选，但允许从不同 Scope Roots 选择两端。
  Assignment 行为按钮只消费服务端 `allowedActions`，mutation 后重新加载列表与详情；HR 不展示 Assignment Audit Tab
  或全局 Audit 菜单。不可管理的隐藏 blocker 只显示稳定安全文案，不渲染 Assignment、holder 或范围外 Organization。
- `apps/sso` 是 SSO 门户。它应通过 `src/services/` 下的 wrapper 消费 public/auth/self-service 能力，并把共享
  request 与浏览器 helper 集中在 `src/lib/` 和 `src/utils/`。
- Umi runtime integration 放在 `src/app.ts`、`src/access.ts` 和 app-local `src/models/`。这些文件只聚焦 runtime
  bootstrap、layout/auth hooks 和全局状态 wiring。
- 构建时公开 env 必须留在 Umi `UMI_APP_` 前缀和 env contract 定义的 app-specific namespace 之后。不要在
  page component 中散落 raw deployment env 名称。

## Pages、Components 与 Hooks

- Route-level screen 放在 `src/pages/` 下，并拥有 page workflow state，例如筛选条件、选中记录、modal open state
  和 submit orchestration。
- Page-private component 放在 page 目录下，通常是 `components/` 或 `_components/`。
- 多个 page 复用的 UI 放在 `src/components/`。
- 共享 hook 在表达可复用浏览器行为或 UI 行为时放在 `src/hooks/`；page-only hook 放在对应 page 旁边。
- `src/models/` 应保持薄层，只承载多个 route 都需要的 Umi/global state。

## API 与 Contract 边界

- Page 和 component code 应优先使用 app-local service wrapper，而不是直接导入低层 request client。
- Admin service wrapper 可以调用 `apiClient`，并应对 page component 隐藏 tRPC procedure path、response
  normalization 和推断出的 request/response type。
- SSO service wrapper 应对 page component 隐藏 raw REST path、request options、auth redirect 和 response-envelope
  handling。
- 优先使用来自 `@iam/contracts` 的共享 contract 或推断出的 tRPC type，避免本地 magic number 和重复 enum 定义，
  尤其是 user、client、employment、organization、position 和 role status 值。
- 当 component 当前为了狭窄 UI flow 需要低层 client access 时，先保持局部访问；当该 flow 变得共享、复杂或涉及
  contract 敏感逻辑时，再迁移到 service wrapper。

## 测试与生成路径

- 前端测试应在可用时使用 app-local Vitest setup、React Testing Library helper、MSW handler 和 Umi runtime mock。
  当前 test workflow 由两个前端 package 的 `vitest.unit.config.ts`、`vitest.integration.component.config.ts`、
  `playwright.config.ts`、canonical scripts 和已提交测试共同维护；
  命令入口见 [../development/commands.md](../development/commands.md)。
- Admin 与 SSO Unit 分别在单个 package-local Vitest 进程内使用 Node/DOM projects。普通 `*.test.ts[x]` 默认使用 Node 且不加载
  全局 DOM setup；确实使用浏览器全局或 React DOM render 的测试命名为 `*.dom.test.ts[x]`，由 jsdom project 加载
  Testing Library 和浏览器兼容 setup。这个后缀只表达 Unit 执行环境；Component Integration 仍整体使用 jsdom、完整
  setup 与 `*.integration.test.ts[x]` 收集规则。
- 不要直接编辑 Umi generated directory 或 frontend build output；generated 和 vendored path 规则见
  [repository-map.md](repository-map.md)。
