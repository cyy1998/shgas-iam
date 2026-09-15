# 纯展示测试盘点（2026-09-15）

本文记录基线 `fd436c8fc487193c8d588acf7342f0b872ff59b2` 上的只读盘点及维护者已确认的清理边界。
它是固定基线的调查记录，不表示测试已删除或行为验证已通过；后续规范由
[禁止纯展示测试](../architecture/testing-architecture.md#禁止纯展示测试)维护。

## 已确认的边界

- Q1：删除纯静态展示测试，保留状态、权限和操作驱动的界面行为测试。
- Q2：同步删除混合用例中的纯展示断言，保留行为断言及必要的定位、等待和功能状态检查。
- Q3：固定 mock 数据的原样回显也属于删除范围；排序、格式化、缺失值回退、权限裁剪等实际规则继续保留。
- Q4：维护者已确认以上整体理解，并授权按清单实施和验证。

规则覆盖所有 collection，由测试编写者与评审者按保护目标判断，不增加断言语义扫描器。
它不改变生产行为、测试 collection 或资源所有权。

## 整条删除的用例

以下行号均对应上述基线，共 5 条用例、4 个文件。只有维护页测试可整文件删除。

| 文件 | 基线行号与测试名 | 原观察目标 |
|---|---|---|
| [Admin shell](../../apps/admin/test-integration/browser/shell.spec.ts) | 5：`users page opens with admin shell and user list` | 固定标题、菜单及 mock 用户回显。 |
| 同上 | 63：`global Organization Responsibility navigation opens the read-only Type Catalog` | 直接打开页面后检查目录固定字段；未执行导航或验证只读限制。 |
| [AuditLogTable](../../apps/admin/test-integration/component/AuditLogTable.integration.test.tsx) | 50：`labels the exact Principal Session audit target` | 静态字典中的固定英文标签。 |
| `apps/sso/test-integration/component/system-maintenance-page.integration.test.tsx` | 5：`shows concise business system maintenance copy` | 固定维护提示、重试按钮文字及旧说明缺席；未执行重试逻辑。 |
| [SSO 资料页](../../apps/sso/test-integration/browser/user-info.spec.ts) | 7：`user info displays the shared Custom SSO profile wire` | 固定 mock 姓名、用户名、电话及标题回显。 |

删除理由是这些观察本身被维护者排除于永久行为测试范围，并非声称另一个测试已经证明其全部内容。
维护页重试逻辑原本未由该静态测试覆盖；资料 formatter 与匿名入口跳转的行为测试继续保留。

## 混合用例中的展示断言

以下 13 个文件保留行为用例，只清理列出的展示部分及专用 import、变量或 helper。
其中 AuditLogTable 和 SSO 资料页也包含上节的整条删除项；总计涉及 15 个不同测试文件。

| 文件 | 删除的展示部分 | 保留的行为 |
|---|---|---|
| [authorization.test.ts](../../apps/admin/src/services/authorization.test.ts) | 36–59 行：八项固定中文理由文案。 | null 输入回退与 capability service 调用。 |
| [AuditLogTable](../../apps/admin/test-integration/component/AuditLogTable.integration.test.tsx) | 11–16、23 行：已知 action 和 outcome 固定标签。 | 未知 action 回退、查询条件映射及 request/trace ID 去空白。 |
| [Type Catalog](../../apps/admin/test-integration/component/OrganizationResponsibilityTypeCatalogPage.integration.test.tsx) | 23–27、30–38 行：固定说明、样例行数和字段回显。 | 数据加载完成后的只读无写入口约束及 service 调用。生产页面直接呈现返回顺序，没有客户端排序逻辑；保留有效的数据就绪等待，不能只等静态标题。 |
| [clients.spec.ts](../../apps/admin/test-integration/browser/clients.spec.ts) | 25–26、31 行：固定标题、mock 名称和协议值回显。 | 功能字段选择、单一编辑入口、点击后的精确 URL。 |
| [EmploymentDetailDrawer](../../apps/admin/test-integration/component/EmploymentDetailDrawer.integration.test.tsx) | 166–176 行：按钮 CSS class 检查循环。 | 服务端授权动作与备注编辑提交参数。 |
| [OrganizationResponsibilityAssignmentModule](../../apps/admin/test-integration/component/OrganizationResponsibilityAssignmentModule.integration.test.tsx) | 196 行：状态标签的 `ant-tag` 样式要求。 | 状态本身、请求筛选参数、详情身份及 Audit context。 |
| [hr-administration.spec.ts](../../apps/admin/test-integration/browser/hr-administration.spec.ts) | 291、303–305 行的固定姓名回显；397–399、403–410 行的 class、padding、字重采样和比较。 | 权限菜单、操作可用性、mutation、scope 与导航。 |
| [SSO login-page](../../apps/sso/test-integration/component/login-page.integration.test.tsx) | 47、50 行：错误弹窗的 `centered` 和 `okText`；使用部分对象匹配保留功能要求。 | 提交失败触发错误反馈，及其他登录 guard 状态。 |
| [SSO login browser](../../apps/sso/test-integration/browser/login.spec.ts) | 16 行：首个用例中的固定欢迎标题。 | 输入、提交、失败反馈及其他续接/恢复行为。 |
| [SSO reset-password](../../apps/sso/test-integration/browser/reset-password.spec.ts) | 12、16、21 行：标题与常驻步骤条文案。 | 验证码、新密码输入和完成弹窗；常驻步骤文字不能证明当前步骤。 |
| [SSO user-info](../../apps/sso/test-integration/browser/user-info.spec.ts) | 58 行：匿名跳转用例末尾的欢迎标题。 | 跳转路径和 client/redirectUrl 参数。 |
| [Worker HTTP](../../apps/worker/test-integration/component/http.integration.test.ts) | 95 行：第三方页面固定 `Bull Dashboard` 标题。 | 认证后的 HTTP 成功与 HTML 内容类型，以及其他认证/只读配置行为。 |
| [Responsibility journey](../../e2e/system/src/responsibility-journey.ts) | 39–42、49–50 行：固定 ID 表头/标签缺席。 | 创建、详情、只读操作约束；同一 helper 本来允许显示编号，这些缺席断言不证明保密。 |

不能因为使用文字或 HTML 断言而删除权限拒绝、登录互斥状态、错误反馈、数据处理、CSRF、协议响应或敏感信息隔离的证明。
UI 操作所用的标签与 placeholder 也不是独立展示断言。

## 盘点范围与验证状态

- Admin：42 个 canonical 文件，212 处测试声明入口；参数化和循环未展开。
- SSO：15 个 canonical 文件，42 个展开用例。
- 其他范围：全仓非前端 UI/HTML/snapshot 候选搜索，聚焦复核 API Browser/HTML、Worker Dashboard、三条系统 E2E 及 journey helpers。
- 这些数字是源码盘点口径，不是 runner 执行结果；本次调查未运行行为测试。
- 规范文档已运行 `pnpm check:docs` 与 `git diff --check`。实施后仍须验证实际最终修改，不能把本记录作为测试通过证据。

最终删除与混合清理按已确认清单实施。清理后同步检查失去使用者的 import、fixture、helper 和文档引用，
并按受影响范围执行静态、类型和行为验证；保留、已执行与未执行的通道分别报告。

## 实施时的补充处理

- 同步删除 Responsibility 组件中与系统 journey 相同的 ID 表头及 ID 展示位置断言，保留实际详情身份和权限约束。
- Worker HTTP 测试把响应 JSON 的 Bun async matcher 改为先 `await`、后同步断言，遵守仓库已有的异步 I/O 约束。
- 系统 E2E 在 `admin-custom-sso.spec.ts` 的填写步骤等待旧 `Callback 完整地址` label 超时；当次 trace 与实际表单确认
  当前字段为 `回调地址`，地址列表则已改为 `Redirect URIs` 的 tags Select。修正操作定位、用 Enter 提交 URI，
  并在保存重读后检查已选 URI；继续验证配置持久化，不删除或降低该行为要求。此修正额外涉及一个测试文件，
  不改变生产表单或协议行为，也不将首次失败记录为通过。
