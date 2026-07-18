---
status: accepted
---

# 以独立模块统一角色分配解析

Admin、OIDC 和用户档案构建需要从角色分配推导任职的有效角色，用户档案 dirty scope 还需要反向推导角色变更所影响的用户。为避免任职、岗位、组织及下级组织规则继续在调用方之间漂移，统一由 workspace package `@iam/role-assignment-resolution` 持有正向和反向解析；该模块接收 `DbClient`，并对调用方隐藏 Drizzle 查询、组织闭包匹配和去重实现。

有效角色采用统一的严格口径：任职及其岗位、任职组织、角色分配目标和角色都必须启用且未删除；用户自身状态由调用方判断。该模块不放入 `@iam/db`，避免基础设施包拥有授权语义；不放入 `@iam/domain`，避免纯领域逻辑依赖数据库；也不由 user-profile read model 持有，避免 admin 和 OIDC 反向依赖投影视图。

正向与反向解析有意采用非对称有效性：正向解析只返回当前有效角色；反向解析用于扩大角色变更的 dirty scope，只要求匹配的任职启用且未删除，不过滤角色、岗位或组织的当前状态。这样在角色已被停用后仍能找到并重建可能残留旧授权的用户，允许无害的额外重建，但不接受漏重建。

正向解析可以接受可选的 client 范围；admin 和用户档案构建读取全部有效角色，OIDC 传入当前 client，只读取该 client 的有效角色。角色状态和 client 归属过滤属于模块实现，调用方只保留各自的 DTO、read-model 或 claim 映射。

正向接口批量接收任职 ID，并返回以任职 ID 为键的只读有效角色集合；每个请求的任职都有结果，未命中时为空集合。角色只暴露调用方共同需要的 ID 和编码，模块隐藏分配来源与 target 细节，负责跨来源去重及按角色编码稳定排序。

反向接口批量接收角色 ID，只返回去重并按用户 ID 升序排列的受影响用户 ID；命中的任职和分配来源仍是模块内部细节。

Resolver 只由 app composition root 或 `createUserProfileWorkerModule` 这类 package composition root 创建，并注入叶子 repository 或 service；叶子模块不得自行绑定 production `DbClient` 或构造 resolver。

模块的 PostgreSQL 接口测试暂不自行启动 Docker 容器。默认测试保持无外部服务；显式 `test:postgres` 通过 `IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL` 连接专用测试库，在隔离的随机 schema 中应用当前 migrations、运行公开接口规则矩阵并清理。该命令在未提供 URL 时失败；迁移查询行为前必须人工运行通过，但暂不接入根目录 `pnpm test`。

批量接口保证数据库查询次数不随任职或角色 ID 数量增长，并对空输入零查询；具体使用一条复杂 SQL 还是固定数量的并行 set-based 查询属于实现细节，不构成接口承诺。

迁移采用 replace-don't-layer：删除 API 的旧角色解析 repository、无调用的 user-detail builder 及关联 ports，删除 admin、OIDC 和 user-profile 中的本地解析实现与被替代测试；不保留兼容 wrapper、旧函数 re-export、production 双读或结果比对。调用方特有的 DTO、claim 和 read-model 映射及其测试继续保留。
