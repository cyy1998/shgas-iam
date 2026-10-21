# User Profile Filter DSL 规则

本文定义 User Profile Search v3 的过滤契约。查询与固定 Base 响应的决定见 [ADR-0015](../../adr/0015-adopt-schema-driven-user-profile-filter-dsl.md)；领域术语以根目录 [CONTEXT.md](../../../CONTEXT.md) 为准。全部搜索入口使用同一 canonical Filter engine。

## 1. 能力边界

`POST /internal/users/search-dsl` 使用有效 Internal Client 认证，始终搜索 User Profile，并返回固定的 User Profile Base。User、Employment、Organization、Position、Role、Privilege 和 Organization Responsibility 可以提供条件，但不会变成结果根或进入响应摘要。

- 搜索范围是所有未删除用户，包括 Enable、Pause 和 Disable；账号状态需要通过 `user.status` 显式筛选。
- 关联任职只观察 Effective Employment，历史、暂停或已结束任职不能满足条件。
- 搜索只读取已发布 User Profile Search Document，不实时联查源业务表。
- 所有有效 Internal Client 使用相同路径和操作符，不存在 client 级字段授权。
- Filter DSL 不提供调用方排序、分页、字段投影或其他实体查询；User Profile Base 是服务端固定响应，不是 projection DSL。
- Client Delegation 不进入 Search Document 或 Filter DSL。

## 2. 表达式结构

请求通过 `apikey` 头携带 Internal API Secret，body 固定为 `{ "filter": Expression }`。例如：

```http
POST /internal/users/search-dsl HTTP/1.1
Content-Type: application/json
apikey: <Internal API Secret>

{"filter":{"field":"user.username","op":"eq","value":"alice"}}
```

匹配成功时返回 HTTP 200。下面是固定 Base 响应示例；没有匹配时 `data` 为 `[]`：

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "username": "alice",
      "name": "张三",
      "mobile": null,
      "wxId": null,
      "subjectIdentifier": "00000000-0000-4000-8000-000000000001"
    }
  ]
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

v3 的公开搜索结构如下；未列出的存储辅助结构不是合法路径。字段类型、枚举和可空性以
[Search Document schema](../../../packages/user-profile-read-model/src/schema/profile-search.schema.ts)为准，
响应的五个字段以 [UserProfileBaseSchema](../../../packages/domain/src/user/schema.ts) 为准。

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

| 路径类型                           | 操作符            | 规则                                                                 |
| ---------------------------------- | ----------------- | -------------------------------------------------------------------- |
| string、enum、number、boolean 标量 | `eq`              | 字段值精确等于一个同类型值。                                         |
| string、enum、number、boolean 标量 | `in`              | 字段值精确等于非空候选数组中的任一值，相当于多个 `eq` 用 `or` 组合。 |
| 标量数组                           | `containsAny`     | 文档数组至少包含一个非空查询数组中的值。                             |
| 标量数组                           | `containsAll`     | 文档数组包含非空查询数组中的全部值。                                 |
| Organization reference             | `withinSubtreeOf` | Organization 自身或其当前完整路径中存在给定 Organization code。      |

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

- `/internal/users/search-dsl` 按内部 user ID 升序返回 User Profile Base；内部 ID 只用于稳定排序，不进入响应。
- 每项固定包含 `username`、`name`、`mobile`、`wxId` 与 `subjectIdentifier`；`mobile`、`wxId` 缺失时返回 `null`。五项事实来自 `user_profile` 类型化列，全部有效 Internal Client 都能读取 Subject Identifier。
- 匹配行的 Search Document 继续严格校验；`detail` 不读取、不校验，单纯的 Detail 损坏不影响本端点。类型化列不与 `search_doc.user` 做跨副本一致性比较，不一致时仍返回类型化列值。
- 最多返回 500 个用户；查询第 501 个匹配项后整体返回 422，不截断。
- DSL 最大深度 8，最多 64 个节点，每个 `and`/`or` 最多 16 个子表达式。
- 每个 `in`、`containsAny` 或 `containsAll` 最多 50 个去重查询值；字符串查询值最长 128。
- 保留数据库查询和请求级超时保护。

HTTP 结果统一如下：

| 情况                                                           | 结果                           |
| -------------------------------------------------------------- | ------------------------------ |
| 合法且有不超过上限的匹配                                       | `200` + User Profile Base 数组 |
| 合法但无匹配                                                   | `200` + `[]`                   |
| 空过滤器、未知路径、类型或操作符错误、结构超预算、结果超过 500 | `422`                          |
| 命中文档解析失败、数据库查询异常或超时、请求预算耗尽           | `503`                          |

任何失败都不返回部分结果。

当前请求路径只查询当前 schema 版本且未删除的 Profile 行，不执行源用户与 Profile 的全量覆盖或版本完整性检查。
表存在但尚无已发布行时，合法查询可返回 `200` 空数组；Profile 缺行或旧版本行被排除，也可能只返回其余当前版本匹配行。
匹配行在返回前严格解析，未匹配的损坏文档不保证被发现；损坏导致 SQL 执行异常时仍按查询失败返回 `503`。
这些行为不同于发布与恢复流程中的完整数据门禁，不能把后者理解为每次 DSL 请求都会执行的验证。

## 9. 接口范围与委托组合

面向其他内部服务的用户搜索只提供 `POST /internal/users/search-dsl`。
Public 搜索、Internal 旧参数搜索和旧用户搜索与委托的组合接口按
[ADR-0043](../../adr/0043-retire-public-and-legacy-internal-directory-search.md) 直接退役，不保留兼容期或转换适配器。
DSL 继续使用本文定义的固定 Base 响应与过滤语义，不扩展为旧响应的兼容替代。

调用方需要委托信息时，使用搜索结果中的 username 独立调用 `/internal/delegations/resolve`，其输入预算和失败行为遵守
[委托解析契约](../../adr/0020-provide-fail-closed-privilege-delegation-resolution.md)。搜索最多返回 500 个用户，
解析每次接受 1–100 个唯一 username，调用方按需分批；各次解析独立观察当前委托，不保证跨请求的共同快照。

Internal 用户详情、Admin 用户搜索与 Delegation 实体搜索继续保留；登录等流程使用的 Detail 能力不受搜索退役影响。

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

Filter 随全局 profileSchemaVersion=v3 发布，不维护独立 searchDocVersion。
调用方不能选择版本，不接受旧 all/any，也不双读或逐用户回退。
当前 Profile、Detail、Search 与 Subject Facts 的重建、恢复窗口和双数据门禁，
统一由[Profile 维护手册](../../releases/user-profile-maintenance.md)拥有。
backfill 的 enqueued 仅表示投递，不证明发布完成；门禁失败不能用部分结果放流。
