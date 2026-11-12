---
status: accepted
---

# 将组织与用户搜索收口为 Internal Filter DSL

本文作为 Historical 记录保留旧入口退役范围与代价。当前查询规则见[目录读模型决定](0046-unify-user-and-organization-read-documents.md#搜索与可见范围)和[搜索接入](../guides/search.md)。

[ADR-0046](0046-unify-user-and-organization-read-documents.md) 已修订原用户摘要与 Internal 详情契约：两类目录返回完整 Document，用户角色过滤与返回限于认证 Client。
本页旧搜索退役、保留现有 Internal DSL 路径和独立委托能力的决定继续适用。

组织与用户面向其他内部服务的搜索统一使用现有 Internal Filter DSL，直接退役 Public 搜索和 Internal 非 DSL 搜索。
本页界定搜索能力的调用边界和退役取舍，目标环境的切换仍由发布流程负责。

## 理由与取舍

统一服务间搜索入口，减少 Public 搜索能力和旧参数契约的维护范围。选择直接删除旧入口，不提供兼容期、兼容别名、
退役响应占位或自动转发；接受旧调用方必须调整调用方式的代价，不以查明全部仓库外消费者或完成其迁移作为代码删除的前置条件。
这取代此前继续保留 Public 用户搜索和旧组织搜索的决定。

现有 DSL 与旧搜索不保证等价：用户与组织 DSL 分别返回当前完整公开 User Document 和 Organization Document；
两者最多返回 500 条，调用方显式筛选状态，组织文档允许异步滞后。不为迁就旧请求、响应或实时读取方式扩展 DSL。

## 退役范围

删除以下五个 `POST` 入口及其 OpenAPI 声明，并清理失去全部消费者的专用 schema、类型、适配器、查询分支与测试：

| 入口                                     | 能力                           |
| ---------------------------------------- | ------------------------------ |
| `/public/users/search`                   | Public 用户搜索                |
| `/public/organizations/search`           | Public 组织搜索                |
| `/internal/users/search`                 | Internal 旧参数用户搜索        |
| `/internal/organizations/search`         | Internal 旧参数组织搜索        |
| `/internal/users/search-with-delegation` | 旧参数用户搜索与委托的组合查询 |

保留 `POST /internal/users/search-dsl` 与 `POST /internal/organizations/search-dsl`，继续使用现有有效 Internal Client
认证，不新增 Public DSL、调用方专属字段授权或其他搜索入口。过滤语言、固定响应、排序、结果上限、超时、错误映射、
发布与恢复契约均沿用各自现有定义，见[用户 DSL](../guides/search.md)和
[组织 DSL](../guides/search.md)。

需要先筛选用户再解析委托的调用方，使用用户 DSL 返回的 username 调用现有 `POST /internal/delegations/resolve`。
两次调用分别取得结果，不提供原组合接口的响应兼容或新增跨请求一致性保证；Client Delegation 继续独立于搜索文档。

## 保留边界

组织和用户的 Internal 精确详情、写入口，以及 Admin 搜索、组织树和选择器继续保留。
`POST /internal/delegations/search` 搜索委托实体，`POST /internal/delegations/resolve` 解析显式用户的直接委托，均不在退役范围内。

Internal 用户与组织详情只读已发布目录，不保留旧 `user_profile.detail` 副本或源表 OrganizationDto 作为回退。登录与账号恢复使用各自必要的窄事实；Admin 管理 DTO、组织闭包和源事实继续由实际业务消费者拥有。

本决定保留 [ADR-0015](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0015-adopt-schema-driven-user-profile-filter-dsl.md) 与 [ADR-0042](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0042-search-organizations-with-published-documents.md) 的有界 DSL 和异步发布取舍；原详情保留范围见[固定历史版本](https://github.com/cyy1998/shgas-iam/blob/95dc4871c62e36b63b26a3f71c5670ae449c79e2/docs/adr/0043-retire-public-and-legacy-internal-directory-search.md)。
