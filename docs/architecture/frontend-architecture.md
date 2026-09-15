# 前端架构

本文定义 `apps/admin` 和 `apps/sso` 下 Umi Max + React 前端 app 的通用结构与 composition 约定。
编码风格见 [../development/coding-style.md](../development/coding-style.md)，共享类型的所有权和运行环境边界见
[contracts-and-database.md](contracts-and-database.md)。下列规则适用于新增代码；旧代码的收敛时机见本文末节。

Admin 的 Custom SSO 配置 preview 与 Admin/SSO 协议类型统一消费 `@iam/custom-sso/wire`。该独立出口只加载浏览器可用的协议 schema/mapper/preview 与中性 Projection 契约，不通过服务端聚合入口加载 Kernel 或 Redis。Admin 的 Umi 配置将 `/wire` 精确映射到 workspace 源文件，与现有 Projection/Contracts alias 同路编译，避免 MFSU 预构建与 app 源模块混用。

## App 与状态边界

- `apps/admin` 是管理前端，通过 app-local `src/services/` 消费 admin 能力；共享 tRPC client 位于
  `src/lib/api-client.ts`。`apps/sso` 是 SSO 门户，通过 app-local service 消费 public/auth/self-service 能力；
  共享 request 与浏览器机制放在 `src/lib/` 和 `src/utils/`。
- Route-level screen 放在 `src/pages/`，拥有筛选、选中记录、弹窗、提交状态和 mutation 后的刷新编排。
  Page-private component 放在页面旁的 `components/` 或 `_components/`；多个 page 复用的 UI 放在 `src/components/`。
- 可复用浏览器或 UI 行为放在 `src/hooks/`；page-only hook 放在页面旁。`src/models/` 只承载跨 route 的全局状态。
- Umi runtime integration 放在 `src/app.ts`、`src/access.ts` 和 app-local models，聚焦 bootstrap、layout/auth hooks
  与全局状态 wiring；页面业务流程留在页面和对应 hook/service。
- 构建时公开 env 必须留在 Umi `UMI_APP_` 前缀和 env contract 定义的 app-specific namespace 之后。
  Page component 不散落 raw deployment env 名称。

## 请求、类型与错误的所有权

- 新增业务请求统一经过 app-local service。先复用已有方法，没有时增加最小 wrapper；页面、组件和页面 hook
  通过 service 发起请求。
- Service 拥有 endpoint、请求选项、transport 响应解析和必要的错误归一化。Admin service 拥有 tRPC procedure
  path 及从公开 tRPC 入口进行的 type-only request/response 推断；SSO service 拥有 REST path、auth redirect
  与 response-envelope handling。页面消费 service 公开的方法和类型。
- 简单 service 可以透传已有结果与错误，不强造 DTO、错误类或通用 CRUD 抽象。需要将协议错误转成稳定页面语义时，
  在 service 完成映射，页面按功能契约呈现；不要让页面解析 transport envelope 或 HTTP/tRPC 错误结构。
- 共享 transport 与浏览器机制由 `lib/utils` 拥有；特殊协议可由专用 service 使用 `fetch`，例如登录页 guard。
  这里约束的是业务请求调用与 transport 解析，不是一律禁止导入低层文件；页面仍可消费已有公共错误类型。
- 优先消费 `@iam/contracts` 的稳定枚举、schema 派生类型或 service 导出的 tRPC 推断类型，避免重复 enum、magic
  number 和为复用而复制 DTO。浏览器依赖边界遵守共享契约文档，type-only 推断不意味着可以 value-import 后端包。

## 管理路由与权限

现存 Admin mutation 已统一消费 `{ changed, result }`：页面区分已修改与无需修改，创建与凭据从 result 取得必要资源。
公共 service 归一化已提交错误，页面自动重读事实但不重放写入；普通刷新成功不清除尚需修复的提示。
Secret 未交付沿用指定提示和先修复再主动轮换流程。全部实际入口与代表性测试见
[最终契约核对](../features/admin/admin-mutation-contract.md)，后端/页面/外部消费者按[协调清单](../releases/admin-mutation-contract-cutover.md)切换。

- 新管理路由登记到 `admin-route-registry`，复用模块 access key 和既有拒绝访问路径。
- 模块可见性与 collection action 消费服务端 capability；服务端提供资源 `allowedActions` 时，行或详情按钮
  以它为准。新增需要资源级授权的操作时，同步设计服务端授权元数据，前端不复制角色字符串或组织范围策略。
- Capability 未加载或加载失败时不默认开放受保护功能。Capability 和按钮状态指导 UI，服务端仍须在每次请求时授权。
- Mutation 后按功能契约刷新数据和操作能力。“可能已生效”、部分失败和是否可重试由该功能明确规定，不能统一按
  失败自动重试。
- 修改 Sessions 的列表、撤销或临时登录限制交互时，读取
  [会话管理页面契约](../features/admin/session-management.md)。
- 修改 Organization Responsibility 的 scoped selector、嵌入面板、操作按钮、Audit 可见性或隐藏 blocker 时，读取
  [HR 管理设计](../features/organization-responsibility/hr-admin-management-design.md#响应与前端)。

Admin Sessions 使用会话记录语义：记录存在不代表账号当前可访问；筛选、分页、刷新与撤销反馈保持。
后端自身许可每请求重查，前端不复制 Barrier 或代际判断；统一发布见[Subject Access 维护手册](../releases/subject-access-operation-cutover.md)。

## SSO 登录守卫

- 受 guard 保护的登录流程只在 guard 明确允许登录后展示表单。检查中、续接中、无效请求和暂时不可用分别表达，
  检查失败不能回退成无会话。
- Service 解析协议结果；hook 管理超时、取消和过期响应；页面渲染互斥状态并执行对应交互。
- 修改 `/portal/login` 的重入检查、协议续接、超时重试或浏览器历史时，读取
  [统一登录页重入守卫设计](../features/sso/login-page-reentry-guard.md)，其中定义适用范围、状态转换和协议语义。

## 测试与生成路径

- 前端测试应在可用时使用 app-local Vitest setup、React Testing Library helper、MSW handler 和 Umi runtime mock。
  当前 test workflow 由两个前端 package 的 `vitest.unit.config.ts`、`vitest.integration.component.config.ts`、
  `playwright.config.ts`、canonical scripts 和已提交测试共同维护；
  命令入口见 [../development/commands.md](../development/commands.md)。
- Admin 与 SSO Unit 分别在单个 package-local Vitest 进程内使用 Node/DOM projects。普通 `*.test.ts[x]` 默认使用 Node 且不加载
  全局 DOM setup；确实使用浏览器全局或 React DOM render 的测试命名为 `*.dom.test.ts[x]`，由 jsdom project 加载
  Testing Library 和浏览器兼容 setup。这个后缀只表达 Unit 执行环境；Component Integration 仍整体使用 jsdom、完整
  setup 与 `*.integration.test.ts[x]` 收集规则。
- 类型与公开出口通过 typecheck 验证，service 的响应与错误语义使用行为测试；路由、权限 UI 和 guard 状态使用
  组件或浏览器测试。具体通道与预算遵守 [testing-architecture.md](testing-architecture.md)。
- 禁止只验证静态 UI、固定文案或样式的测试；混合行为用例中的纯展示断言也应删除。权限、状态、输入和操作驱动的
  功能展示仍可通过组件或浏览器测试验证；判定示例与清理规则见[禁止纯展示测试](testing-architecture.md#禁止纯展示测试)。
- 不要直接编辑 Umi generated directory 或 frontend build output；generated 和 vendored path 规则见
  [repository-map.md](repository-map.md)。

## 现存差距与收敛时机

当前仍有页面直接调用低层 client，普通 service 也不都提供错误归一化。这些现状不表示新增调用可以继续绕过 service，
也不要求一次性重写所有 wrapper：修改旧请求的参数、调用流程、响应或错误处理时，将该调用收敛到上述边界；
纯布局、样式和文案改动不触发请求迁移。

本次文档整理不批量迁移代码或新增守卫。现有 Architecture Guard 的通过结果不能证明本页全部规则已被自动检查；
评审仍需检查请求和状态所有权，以及相关功能契约。
