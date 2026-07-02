## Why

现有 `apps/api` legacy 用户搜索已支持按 username、phone、wxId 和任职条件筛选，但不能直接按用户姓名筛选。业务调用方需要在保持旧 `UserQueryDto` 接口形态和 profile 读取路径不变的前提下，按 `name` 精确查找启用用户。

## What Changes

- 为 legacy `UserQueryDto` 增加可选 `names` 字段，用于按用户姓名列表筛选用户。
- public/internal legacy 用户搜索 SHALL 支持按姓名列表筛选，并继续只返回当前 schema version 且 `search_visible=true` 的 profile 用户。
- legacy 查询编译 SHALL 将 `names` 映射为 `user.name` 的精确匹配条件，并保留现有 username、phone、wxId 与任职条件的组合语义。
- `/internal/users/search-with-delegation` 因继承 legacy 查询 DTO，也 SHALL 支持将 `names` 传递给 profile 用户搜索，再按匹配用户查询 live 权限委托。
- 不引入模糊搜索、全文检索、排序相关性、数据库迁移或 profile rebuild。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `directory-and-self-service`: public/internal 用户目录查询新增按姓名列表过滤能力。
- `user-profile-read-model`: legacy `UserQueryDto` profile 查询编译新增 `names` 到 `user.name` 的精确匹配。
- `privilege-delegation`: 搜索用户并附带权限委托的 internal 接口继承 legacy 姓名过滤能力。

## Impact

- Affected packages: `packages/user-profile-read-model` 的 legacy 查询 DTO、OpenAPI schema 和 profile filter 编译逻辑。
- Affected apps: `apps/api` 中引用 `UserQueryDtoSchema` 的 public/internal legacy 用户搜索与 search-with-delegation 路由。
- Affected APIs: `/public/users/search`、`/internal/users/search`、`/internal/users/search-with-delegation`。
- Affected tests: `@iam/user-profile-read-model` legacy query 编译单元测试；必要时补充 `@iam/api` service/handler 层传递行为测试。
