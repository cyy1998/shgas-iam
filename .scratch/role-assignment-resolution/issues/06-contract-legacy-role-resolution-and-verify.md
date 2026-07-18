# 06 — 收缩旧解析面并完成集成验证

**What to build:** 完成角色分配解析的 contract 阶段：删除 API 无生产调用的旧角色解析链和所有残留兼容面，用架构守卫阻止生产调用方重新实现 Effective Role/受影响用户规则，更新 Current 文档，并证明整个仓库只保留一个解析事实来源且外部行为未变。

**Blocked by:** 02 — 迁移 admin Effective Role 查询；03 — 迁移 OIDC client-scoped 授权解析；05 — 迁移 User Profile 反向 dirty scope

**Status:** ready-for-agent

- [ ] API 中无生产调用的旧角色 repository、旧 user-detail builder、关联 ports、composition wiring 和仅证明旧链存在的契约断言被删除。
- [ ] 仓库中不再存在 admin、OIDC 或 User Profile 的本地 Effective Role/受影响用户解析副本，也不存在 compatibility wrapper、旧 re-export、production 双读或 shadow comparison。
- [ ] 聚焦架构守卫允许角色管理 CRUD 等合法 assignment 访问，同时阻止已迁移调用方重新导入角色分配表、目标类型或组织闭包来复制解析规则。
- [ ] repository map、后端架构或共享 package 边界说明、角色分配发布手册和文档索引按最终事实更新。
- [ ] Effective Role 领域定义、ADR、approved spec、tickets 和实现保持一致；任何行为差异均已先取得 amendment 批准。
- [ ] 所有受影响 package 的聚焦测试、lint 和 typecheck 通过，共享模块 `test:postgres` 通过并留存专用测试库证据。
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm check:docs`、冻结锁文件安装验证和 `git diff --check` 全部通过。
- [ ] 相对目标分支完成 Standards 与 Spec 双轴评审，且没有未解决 findings。
