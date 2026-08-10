# 定义 User Profile V2 的任职责任快照

Type: prototype

Status: unclaimed

Blocked by: 04 — 设计组织责任领域模块与接口

## Question

User Profile V2、Legacy User Detail V2 与 Subject Facts V2 应如何把当前有效责任嵌套到所属 employment 下，才能让 Internal
详情、DSL 搜索和 client projection 共享同一事实语义，而不混入角色、权限或数据库实现字段？

本 ticket 应用具体 JSON/DTO 示例与边界场景决定：

- `employment.responsibilities[]` 的最小字段：definition、目标 organization、有效期和 assignment identity 哪些应该出现；
- 只发布当前有效责任，还是在 Internal detail 中同时提供历史/未来；若需要后者，如何与 Subject Facts 窄视图区分；
- definition 改名、停用与 organization 路径变化后，快照展示当前语义还是任命时语义；
- 去重、稳定排序、无责任时空数组/省略字段，以及 employment 非当前时的处理；
- Assignment/Definition/Organization/Employment 变化如何进入 `UserProfileInvalidation`，并触发 V2 publication。
