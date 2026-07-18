# 01 — 建立角色分配解析模块

**What to build:** 建立 `@iam/role-assignment-resolution` 深模块，使维护者能够通过一个经过真实 PostgreSQL 验证的公开接口批量取得任职的 Effective Role，并反向取得角色变更可能影响的用户，而无需任何生产调用方理解 assignment 来源、组织闭包、状态过滤、去重或排序。

**Blocked by:** None — can start immediately

**Status:** claimed

- [ ] 新 workspace package 只通过公开入口暴露 resolver factory、正反向操作及调用方需要的最小类型，并接收组合层提供的 `DbClient`。
- [ ] 正向操作批量接收任职 ID、支持可选 client 范围，并为每个请求 ID 返回只包含角色 ID 与编码的结果。
- [ ] 正向操作统一处理任职直接、岗位、组织精确和允许下级继承的组织分配，按角色去重并按角色编码稳定排序。
- [ ] 正向操作只返回符合规格所定义严格有效性条件的 Effective Role，且不根据用户状态过滤。
- [ ] 反向操作批量接收角色 ID，只要求匹配任职启用且未删除，并返回去重、按用户 ID 升序排列的保守影响集。
- [ ] 两个操作对重复输入去重、对空输入零查询，数据库查询次数不随输入数量增长。
- [ ] 显式 `test:postgres` 使用 `IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL`、随机隔离 schema 和当前 migrations 验证公开接口，完成后只清理本次 schema。
- [ ] PostgreSQL 测试覆盖全部分配来源、组织继承、状态与软删除、client 过滤、空/重复/未知输入、去重排序及反向非对称有效性。
- [ ] 默认测试不启动 Docker 容器、不要求外部数据库；未配置专用 URL 时显式 PostgreSQL 命令明确失败而非跳过或连接开发库。
- [ ] package lint、typecheck、默认测试、显式 PostgreSQL 测试及冻结锁文件安装验证通过。
