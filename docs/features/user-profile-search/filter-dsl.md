# User Profile Filter DSL 规则

本文定义当前已激活的 User Profile Search v3 过滤契约。它采用 [ADR-0015](../../adr/0015-adopt-schema-driven-user-profile-filter-dsl.md)；领域术语以根目录 [CONTEXT.md](../../../CONTEXT.md) 为准。全部搜索入口只使用 canonical Filter engine；旧的 Organization Responsibility DSL、别名解释和版本回退均已撤销。

## 1. 能力边界

`POST /internal/users/search-dsl` 始终搜索 User Profile，并返回完整 User Profile Detail。User、Employment、Organization、Position、Role、Privilege 和 Organization Responsibility 可以提供条件，但不会变成结果根。

- 搜索范围是所有未删除用户，包括 Enable、Pause 和 Disable；账号状态需要通过 `user.status` 显式筛选。
- 关联任职只观察 Effective Employment，历史、暂停或已结束任职不能满足条件。
- 搜索只读取已发布 User Profile Search Document，不实时联查源业务表。
- 所有有效 Internal Client 使用相同路径和操作符，不存在 client 级字段授权。
- Filter DSL 不提供排序、分页、字段投影或其他实体查询。
- Privilege Delegation 不进入 Search Document 或 Filter DSL。

## 2. 表达式结构

请求体固定为：

```json
{
  "filter": { "field": "user.username", "op": "eq", "value": "alice" }
}
```

`filter` 必须是下列五种严格节点之一，未知属性无效：

```text
Expression =
  { "and": [Expression, ...] }
  | { "or": [Expression, ...] }
  | { "not": Expression }
  | { "exists": { "path": CollectionPath, "where": Expression } }
  | { "field": ComparablePath, "op": Operator, "value": Value }
```

`and`、`or` 和所有查询值数组必须非空。旧名称 `all`、`any`、`nested` 及其任何别名都无效。

## 3. Search Document 公开结构

v3 的公开搜索结构如下；未列出的存储辅助结构不是合法路径：

```text
user
├── subjectIdentifier
├── username
├── name
├── mobile                       nullable
├── wxId                         nullable
├── userType
└── status

employments[]                    Effective Employment
├── isPrimary
├── organization                Organization reference
│   ├── code
│   ├── name
│   ├── type
│   └── path[]
│       ├── code
│       ├── name
│       ├── type
│       └── distanceToTarget
├── position
│   ├── code
│   └── name
├── roles[]                      Role code
├── privileges[]                 Privilege code
└── responsibilities[]
    ├── type
    │   ├── code
    │   └── name
    └── targetOrganization       Organization reference
        ├── code
        ├── name
        ├── type
        └── path[]
            ├── code
            ├── name
            ├── type
            └── distanceToTarget
```

公开类型结构是合法路径与通用操作符的机器事实来源：新增公开可比较字段会随对应 Profile schema 版本自动开放给所有有效 Internal Client。numeric ID、Employment Period、`ancestorCodes`、`ancestorDepths`、`ancestorKeys`、`companyCodes` 和其他派生索引字段不属于公开结构。

## 4. 路径与集合作用域

根表达式使用 `user.*` 字段，或通过 `exists` 进入 `employments`。进入集合后，`where` 中的路径相对于当前元素：

- Employment 内使用 `isPrimary`、`organization.code`、`position.code`、`roles` 等；
- Employment 内通过 `exists` 进入 `organization.path` 或 `responsibilities`；
- Responsibility 内使用 `type.code`、`targetOrganization.type` 等，并可进入 `targetOrganization.path`。

同一个 `exists.where` 中组合的条件必须由同一个集合元素满足。两个彼此独立的 `exists` 可以由不同元素满足。例如，在同一个 Employment `where` 中组合 Organization 与 Position 条件，必须由同一条任职同时满足；把它们写成两个根级 Employment `exists`，则允许两条不同任职分别满足。

`not` 可以包裹 `exists`，表达“不存在满足 where 的关联对象”。当前词汇不提供无条件集合存在性；`exists` 必须始终包含真实、非空的 `where`。

## 5. 通用操作符

| 路径类型 | 操作符 | 规则 |
| --- | --- | --- |
| string、enum、number、boolean 标量 | `eq` | 字段值精确等于一个同类型值。 |
| string、enum、number、boolean 标量 | `in` | 字段值精确等于非空候选数组中的任一值，相当于多个 `eq` 用 `or` 组合。 |
| 标量数组 | `containsAny` | 文档数组至少包含一个非空查询数组中的值。 |
| 标量数组 | `containsAll` | 文档数组包含非空查询数组中的全部值。 |
| Organization reference | `withinSubtreeOf` | Organization 自身或其当前完整路径中存在给定 Organization code。 |

`in` 只用于单值字段；`roles`、`privileges` 等数组字段使用 `containsAny` 或 `containsAll`。所有查询数组先去重，再应用数量限制。

比较使用已发布事实的规范值，不隐式 trim、不转换大小写、不进行分词或模糊匹配。当前词汇不提供范围、正则、前后缀、全文、null、空集合或字段缺失操作符。

## 6. Organization 层级

Organization Path 按根到目标排列并包含目标自身。每个节点的 `distanceToTarget` 表示到目标的距离：目标为 `0`，父级为 `1`，依次递增。

对 Organization reference 使用：

```json
{
  "field": "organization",
  "op": "withinSubtreeOf",
  "value": "ORG-A"
}
```

等价于在同一作用域内表达“`organization.path` 中存在 `code eq ORG-A` 的节点”。它是语法简写，不拥有另一套层级语义，也不依赖 `ancestorKeys` 等存储编码。

## 7. `null` 与 `not`

DSL 使用二值匹配语义。nullable 字段为 null 时，任何原子比较都为 false；`not` 对这个匹配结果取反。因此，`not (user.mobile eq "123")` 会包含 mobile 为 null 的用户。

不能用 `eq null`、`in [null]` 或专用操作符直接查询 null。`not` 所在的作用域具有实际含义：`not exists(...)` 表示没有匹配元素，而 `exists(... where not ...)` 表示至少存在一个不匹配该内部条件的元素，二者不等价。

## 8. 结果与资源边界

- `/internal/users/search-dsl` 按内部 user ID 升序返回完整 User Profile Detail；ID 虽不可作为过滤路径，仍保留在既有 Detail 中。
- 不支持调用方排序、分页或字段投影。
- 最多返回 500 个用户；查询第 501 个匹配项后整体返回 422，不截断。
- DSL 最大深度 8，最多 64 个节点，每个 `and`/`or` 最多 16 个子表达式。
- 每个 `in`、`containsAny` 或 `containsAll` 最多 50 个去重查询值；字符串查询值最长 128。
- 保留数据库查询和请求级超时保护。

HTTP 结果统一如下：

| 情况 | 结果 |
| --- | --- |
| 合法且有不超过上限的匹配 | `200` + 完整结果数组 |
| 合法但无匹配 | `200` + `[]` |
| 空过滤器、未知路径、类型或操作符错误、结构超预算、结果超过 500 | `422` |
| Profile 不可用、文档损坏、版本门禁失败或查询超时 | `503` |

任何失败都不返回部分结果。

## 9. 既有接口适配

- Internal `/internal/users/search` 保留原请求字段和 `UserDto[]` 响应，但作为 deprecated 参数适配器接入统一引擎；删除必须等调用方迁移完成并通过独立变更批准。
- Public `/public/users/search` 继续作为正式 Public 契约，不直接开放 Filter DSL；它保留原请求与响应格式，只在内部转换为统一过滤表达式。
- 旧数组参数内部取 `or`，不同参数取 `and`，全部 Employment 参数仍约束同一条任职。适配后采用新的未删除用户集合、Effective Employment、非空过滤器、500 条上限和错误规则。
- `ancestorOrgCodes` 与 `ancestorOrgDepths` 同时提供时，必须由该 Employment 的同一个 Organization Path 节点满足：节点 code 属于前者且 depth 属于后者；只提供其中一个参数时，只检查对应条件。
- `/internal/users/search-with-delegation` 先执行相同的基础用户搜索，再独立组合实时 Delegation；Delegation 不进入 Search Document。

## 10. 代表性示例

按用户字段筛选：

```json
{
  "filter": {
    "and": [
      { "field": "user.status", "op": "in", "value": ["Enable", "Pause"] },
      { "field": "user.name", "op": "eq", "value": "张三" }
    ]
  }
}
```

要求同一条任职同时属于指定组织子树并担任指定岗位：

```json
{
  "filter": {
    "exists": {
      "path": "employments",
      "where": {
        "and": [
          { "field": "organization", "op": "withinSubtreeOf", "value": "ORG-A" },
          { "field": "position.code", "op": "in", "value": ["MANAGER", "DIRECTOR"] }
        ]
      }
    }
  }
}
```

排除在指定组织子树承担 `head` 责任的用户：

```json
{
  "filter": {
    "not": {
      "exists": {
        "path": "employments",
        "where": {
          "exists": {
            "path": "responsibilities",
            "where": {
              "and": [
                { "field": "type.code", "op": "eq", "value": "head" },
                { "field": "targetOrganization", "op": "withinSubtreeOf", "value": "ORG-A" }
              ]
            }
          }
        }
      }
    }
  }
}
```

## 11. 版本切换

本契约把全局 `profileSchemaVersion` 从 v2 提升到 v3，不增加独立 `searchDocVersion`，也不增加 v2/v3 并行代际。现有 JSONB 与版本列能够保存 v3 文档；本契约不因版本切换本身要求数据库 schema migration 或预选新索引。

切换必须在维护窗口内完成：停止相关 User Profile 业务读取、源事实写入和旧 v2 Worker，只启动固定的 v3 Worker；运行既有 `user-profile:backfill` 为全部 User 登记 dirty 并投递 rebuild job，再等待队列与 dirty 状态全部收敛。`user-profile:backfill` 返回的 `enqueued` 只表示投递完成，不是数据切换完成。

恢复流量前必须全量验证 PostgreSQL Profile 都是最新 builder 产生的 v3 文档，并验证 Redis Subject Facts、版本、完整性和 freshness。门禁失败时所有依赖 v3 Profile 的入口保持关闭，不允许用部分结果恢复服务；门禁通过后 Internal DSL、Internal legacy adapter、Public adapter、Internal Detail、Subject Facts 及其他 Profile reader 一次恢复并只接受 v3。调用方不能请求 v2 或 v3，也不能在新 DSL 中继续使用 `all`/`any`；运行时不双读、不逐用户回退。Detail 和 Subject Facts 即使外形不变，也随整个 User Profile 的这次硬切换一起前进。
