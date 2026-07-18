# 02 — 迁移 admin Effective Role 查询

**What to build:** 让 admin 用户详情和任职详情通过共享 resolver 读取 Effective Role，使两个管理视角遵循同一严格规则，并让包含多条任职的用户详情只进行一次批量角色解析，同时保持现有角色、权限和协议输出不变。

**Blocked by:** 01 — 建立角色分配解析模块

**Status:** ready-for-agent

- [ ] admin composition root 使用自身 `DbClient` 创建 resolver，并通过消费方拥有的最窄端口注入用户与任职能力。
- [ ] 用户详情一次批量解析全部任职，不再按任职执行角色查询；单任职详情复用同一批量接口。
- [ ] 角色 ID 继续驱动现有 privilege 聚合，角色编码、权限、DTO、REST、tRPC 和 OpenAPI contract 保持不变。
- [ ] admin 的本地 Effective Role 查询与组织闭包解析谓词被删除，角色管理 CRUD 与 assignment 写入仍由原模块拥有。
- [ ] 调用方测试覆盖批量协作、空角色结果、角色/权限映射和既有错误行为，但不复制共享模块的 assignment 规则矩阵。
- [ ] admin-api 的聚焦测试、lint、typecheck 以及共享模块显式 PostgreSQL 测试通过并记录证据。
