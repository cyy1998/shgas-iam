---
status: accepted
---

# Internal Filter DSL 返回 User Profile Base

`POST /internal/users/search-dsl` 改为返回固定的 `UserProfileBase`，只包含 `username`、`name`、`mobile`、`wxId` 和 `subjectIdentifier`；`mobile` 与 `wxId` 缺失时仍以 `null` 返回。该共享 DTO 由 `@iam/domain/user` 拥有，全部有效 Internal Client 都能看到 Subject Identifier，不提供 client 级裁剪或调用方字段投影。本决策只修订 [ADR-0015](0015-adopt-schema-driven-user-profile-filter-dsl.md) 中 Internal Filter DSL 返回完整 User Profile Detail 的部分；Internal/Public legacy search、Internal Detail 与 Delegation search 的响应保持不变。

Filter DSL 继续以已发布 Search Document 匹配用户，并严格校验匹配行的 Search Document；响应的五项事实只从同一 `user_profile` 行的类型化列组装，不读取或校验 `detail`，也不比较类型化列与 `search_doc.user` 的重复值。两者不一致时仍返回类型化列值，因此损坏场景下响应可能不满足刚执行的 Search Document 条件；这是为使固定摘要不再依赖未返回 Detail 或跨副本一致性门禁而接受的取舍。其余 envelope、按内部 user ID 排序、结果预算、错误语义与 Filter DSL 保持不变。

## Consequences

- 单纯的 Detail 损坏不再使 Internal Filter DSL 返回 `503`；Search Document 损坏仍整批失败。
- `subjectIdentifier` 成为全部有效 Internal Client 可批量读取的响应字段；仓外调用方的破坏性响应迁移由人工协调，不建立代码或发布门禁。
- Filter DSL E2E 只证明匹配集合与 `UserProfileBase` transport；完整任职、角色、权限和组织责任由既有 Internal Detail endpoint 验证。
