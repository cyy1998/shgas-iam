# 组织责任关系模型 Spec 寻路图

## Destination

产出一份经过维护者确认、可直接进入后续拆票的 Organization Responsibility spec：完整定义绑定任职的组织责任目录与
任命模型、时间和基数不变量、Admin 管理体验、Internal DSL 搜索、User Profile/UserInfo V2 契约及迁移边界。本地图只解决
规格决策，不授权实现数据库、API、投影或页面。

## Notes

- 当前事实固定点为 `main@d0b2149004f0be70ec6680ec83b29dce69f4035b`；当前行为以代码、可执行测试和 Current 文档为准。
- 输入交接为 `C:\Users\caiyi\AppData\Local\Temp\iam-service-organization-responsibility-model-handoff-20260809.md`。
- 已确认 Organization Responsibility Assignment 是独立于 Employment 与 Role Assignment 的业务事实：承担方绑定一条真实
  `Employment`，目标只允许 `Organization`；换任职不自动继承，一个任职负责多个组织时建立多条任命。
- Responsibility Definition 由 Admin 动态维护，使用稳定 code、名称、说明和生命周期；`head`、`supervising` 只是可预置定义，
  不是写死枚举。Definition 持有 `single | multiple` 基数规则；`single` 禁止同一组织上该定义的任命有效期重叠。
- Assignment 使用 `[validFrom, validTo)` 时间语义，支持历史和未来预约；未生效记录可取消，已生效记录只能结束并保留历史。
  首版不区分正式与代理任命。
- 责任不产生角色或权限，但属于用户档案事实。当前有效责任嵌套在对应 employment 下；只有
  `POST /internal/users/search-dsl` 增加责任条件，固定字段 Internal 搜索、Public 用户搜索和 Admin 用户搜索不增加该条件。
- UserInfo 中责任同样位于 `profile.employments[].responsibilities`。User Profile、Subject Facts、Custom SSO Wire 与 OIDC
  Claims Snapshot 采用协调式 V2 硬切换，不静默修改 V1，也不长期维护双读。
- 决策会话使用 `grilling` 与 `domain-modeling`；接口与模块形状使用 `codebase-design`，需要对比形状时使用
  `design-an-interface`；低保真契约或 Admin 体验使用 `prototype`。只有后续获实现授权时才使用 `db-schema` 与 `tdd`。
- `openspec/` 是冻结历史，不作为当前事实来源，也不得由本地图修改。

## Decisions so far

<!-- 每个已解决 ticket 在此只保留一行摘要和链接；完整答案只写在对应 ticket。 -->

- [Ticket 01](issues/01-govern-responsibility-definitions.md)：Definition 使用不可变且不可复用的 `code`、可审计的可变展示元数据和
  Admin 单一权威；启停、软删除、恢复及 `single | multiple` 变更均由保留任命历史的严格门禁约束。

## Not yet specified

- 责任数据量、按责任筛选的调用频率和第三方查询组合尚无规模事实；待领域接口与 DSL 语义确定后，再判断是否能把索引、
  查询预算或缓存边界表述成独立决策 ticket。

## Out of scope

- 让组织责任自动产生 Role Assignment、Effective Role、Privilege 或任何授权决策。
- 组织之外的业务域、项目、区域等责任目标，以及首版的正式、代理、委托等 appointment capacity。
- 为固定字段 `POST /internal/users/search`、`POST /public/users/search` 或 Admin 用户搜索增加责任筛选。
- 修改 Gateway Subject Header；它继续禁止 employments 与 organization responsibilities。
- 审批流、通知、签章、批量导入等尚未提出的任命流程产品化能力。
- 实现 schema/migration、production code、测试或 Admin 页面，发布 implementation tickets，执行 V2 backfill/cutover 或部署。
- 修改冻结的 `openspec/` 历史产物。
