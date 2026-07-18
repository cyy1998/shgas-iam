# 01 — 建立角色分配解析模块

**What to build:** 建立 `@iam/role-assignment-resolution` 深模块，使维护者能够通过一个经过真实 PostgreSQL 验证的公开接口批量取得任职的 Effective Role，并反向取得角色变更可能影响的用户，而无需任何生产调用方理解 assignment 来源、组织闭包、状态过滤、去重或排序。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 新 workspace package 只通过公开入口暴露 resolver factory、正反向操作及调用方需要的最小类型，并接收组合层提供的 `DbClient`。
- [x] 正向操作批量接收任职 ID、支持可选 client 范围，并为每个请求 ID 返回只包含角色 ID 与编码的结果。
- [x] 正向操作统一处理任职直接、岗位、组织精确和允许下级继承的组织分配，按角色去重并按角色编码稳定排序。
- [x] 正向操作只返回符合规格所定义严格有效性条件的 Effective Role，且不根据用户状态过滤。
- [x] 反向操作批量接收角色 ID，只要求匹配任职启用且未删除，并返回去重、按用户 ID 升序排列的保守影响集。
- [x] 两个操作对重复输入去重、对空输入零查询，数据库查询次数不随输入数量增长。
- [x] 显式 `test:postgres` 使用 `IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL`、随机隔离 schema 和当前 migrations 验证公开接口，完成后只清理本次 schema。
- [x] PostgreSQL 测试覆盖全部分配来源、组织继承、状态与软删除、client 过滤、空/重复/未知输入、去重排序及反向非对称有效性。
- [x] 默认测试不启动 Docker 容器、不要求外部数据库；未配置专用 URL 时显式 PostgreSQL 命令明确失败而非跳过或连接开发库。
- [x] package lint、typecheck、默认测试、显式 PostgreSQL 测试及冻结锁文件安装验证通过。

## Resolution

- Commit: `6ef5544e`
- Validation:
  - `pnpm --filter @iam/role-assignment-resolution lint` — passed
  - `pnpm --filter @iam/role-assignment-resolution typecheck` — passed
  - `pnpm --filter @iam/role-assignment-resolution test` — passed (2 tests)
  - `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed (45 tests)
  - `pnpm install --frozen-lockfile` — passed with Node 24 and pnpm 11.5.0
  - `pnpm check:docs` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
