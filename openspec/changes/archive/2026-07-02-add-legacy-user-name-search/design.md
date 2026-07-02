## Context

`apps/api` 的 public/internal legacy 用户搜索通过 `UserQueryDtoSchema` 接收请求体，再由 `UserService.searchUsers()` 委托 `@iam/user-profile-read-model` 的 `searchLegacyUsers()`。当前 legacy DTO 已支持 `usernames`、`phones`、`wxIds` 和任职相关条件，但不支持按用户姓名筛选。

用户姓名已经存在于 profile search document 的 `searchDoc.user.name` 中，且 `user_profile` 表已有 `search_doc` JSONB GIN index。现有 DSL 也已经将 `user.name` 视为可查询字段，因此 legacy 查询可以在不新增数据库列、不迁移数据、不重建 profile 的前提下复用该字段。

## Goals / Non-Goals

**Goals:**

- 为 legacy `UserQueryDto` 增加 `names?: string[]`，保持与 `usernames`、`phones`、`wxIds` 一致的数组式精确匹配风格。
- 让 `/public/users/search`、`/internal/users/search` 和继承 legacy DTO 的 `/internal/users/search-with-delegation` 支持姓名过滤。
- 保持旧任职条件 nested employment 语义、profile current schema version 过滤和 `search_visible=true` 过滤不变。
- 用聚焦单元测试覆盖 legacy 查询编译行为。

**Non-Goals:**

- 不支持 `name` 单值字段；避免同一语义同时存在单数和复数字段。
- 不实现姓名模糊搜索、拼音搜索、全文检索或相关性排序。
- 不新增 `user_profile.name` 反范式列，不新增 PostgreSQL trigram/text index，不生成迁移。
- 不改变 response DTO 或暴露 profile 元数据。

## Decisions

### 1. 使用 `names` 数组字段

选择在 `UserQueryDtoSchema` 增加 `names?: string[]`，而不是 `name?: string`。现有 legacy 查询字段均采用复数数组命名，并通过 `in` 或 contains-any 语义表达“命中任一值”；`names` 与 `usernames`、`phones`、`wxIds` 一致，客户端也能一次查询多个姓名。

替代方案是增加 `name?: string`。它对单次查询更短，但会让 legacy DTO 同时出现数组字段和单数字段，后续如果再扩展其他字段会放大不一致。

### 2. 将 `names` 编译为 `user.name` 的精确匹配

legacy 编译器应将 `names` 映射为 `{ field: "user.name", op: "in", value: names }`。`user.name` 不属于 employment 字段，因此与 username、phone、wxId 一样位于顶层 user 条件组；与任职条件组合时仍通过顶层 `all` 表达 AND 语义。

`user.name` 当前没有独立表列映射，repository 会通过 `searchDoc.user.name` 的 JSONB containment 查询完成匹配。这样可以复用现有 `search_doc` GIN index，并避免数据库 schema 变更。

### 3. 不在本次引入模糊搜索

姓名模糊搜索需要重新选择查询形态，例如 `ILIKE`、trigram index、额外 profile 列、search vector 或外部检索系统。它会影响性能、索引和排序语义，超出 legacy DTO 小幅扩展的范围。

如果后续需要模糊搜索，应作为独立 OpenSpec change 设计，明确字段、大小写/中文匹配策略、索引和分页限制。

### 4. `search-with-delegation` 继承姓名过滤

`UserQueryWithPrivilegeDelegationDtoSchema` 基于 `UserQueryDtoSchema` 扩展，因此 `names` 会自然进入 search-with-delegation 请求体。服务应继续先使用 profile legacy search 得到用户列表，再用匹配用户的 usernames 查询 live 权限委托；委托查询规则不改变。

## Risks / Trade-offs

- [Risk] 客户端误以为 `names` 是模糊搜索 → Mitigation: OpenAPI 描述和规格明确为“姓名列表精确匹配”。
- [Risk] 同名用户会返回多条记录 → Mitigation: `names` 是过滤条件而非唯一查找，响应仍为 `UserDto[]`，与现有 search 语义一致。
- [Risk] JSONB containment 精确匹配无法满足包含搜索诉求 → Mitigation: 本 change 明确不做模糊搜索，后续用独立 change 评估索引和查询策略。
- [Risk] 派生 DTO 让 search-with-delegation 行为隐式扩大 → Mitigation: 在 proposal、spec 和测试任务中显式记录该接口继承姓名过滤能力。

## Migration Plan

无需数据库迁移、profile rebuild 或运行时配置变更。部署后，新请求体字段 `names` 可被 OpenAPI schema 接受；未传 `names` 的既有客户端行为保持不变。

回滚时移除 schema 字段和 legacy 编译逻辑即可，数据库状态无需回滚。

## Open Questions

无。姓名搜索本次按 `names` 数组精确匹配处理。
