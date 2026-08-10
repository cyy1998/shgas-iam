# 设计 Admin 责任定义与任命管理体验

Type: prototype

Status: unclaimed

Blocked by: 04 — 设计组织责任领域模块与接口

## Question

Admin 应如何管理 Responsibility Definition 与 Organization Responsibility Assignment，才能清楚呈现组织、任职、时间、基数冲突
和历史，而不把责任误解为任职或角色分配？

本 ticket 应使用 `prototype` 形成低保真交互稿，并与维护者决定：

- Definition 目录的导航、列表、表单、状态与基数变更流程；
- Assignment 的主入口位于组织详情、任职详情、用户详情还是独立页面，以及各入口共享哪些组件；
- 使用 OrganizationTreeSelector、Employment remote selector、ProTable、Drawer、ModalForm 和 AuditLogTable 的具体形态；
- 当前、未来、历史和取消记录的筛选、展示与可用操作；
- `single` 重叠、失效 holder/organization/definition、并发修改与作用后失败如何提示和刷新；
- Definition 与 Assignment 是否沿用全局 admin 权限，还是需要资源级访问控制。
