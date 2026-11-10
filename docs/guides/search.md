# 搜索接入

内部应用通过以下接口搜索用户或组织。先取得有效 Internal Client 的 Internal API Secret，通过 `apikey` 请求头提交；不要使用 SSO Secret。

| 目标 | POST 路径                            | 成功响应的 data                                          |
| ---- | ------------------------------------ | -------------------------------------------------------- |
| 用户 | `/internal/users/search-dsl`         | 查询结果对象；items 默认仅含 subjectIdentifier、username |
| 组织 | `/internal/organizations/search-dsl` | 查询结果对象；items 默认仅含 code、name                  |

以下路径为 API 服务路径，经标准 Gateway 访问时加 `/api/iam` 前缀。
搜索范围与更新延迟见[用户搜索](../features/search/user-search.md)和[组织搜索](../features/search/organization-search.md)。

`GET /internal/users/:username` 和 `GET /internal/organizations/:orgCode` 使用相同认证，返回完整公开 Document，与同发布版本、同 Client 上下文下显式选择全部根字段的搜索单项一致。
详情也包含未删除的暂停、禁用用户与组织，只读已发布目录；没有当前可读条目返回 404，损坏或查询失败返回 503。
404 不保证源对象不存在，接口不会回源拼装另一份详情。

## 发起查询

例如，按用户名查找用户：

```http
POST /internal/users/search-dsl
Content-Type: application/json
apikey: <Internal API Secret>

{"filter":{"field":"username","op":"eq","value":"alice"}}
```

成功返回 `{ "code": 200, "message": "success", "data": { "items": [...], "total": 1, "page": null, "pageSize": null } }`。
无匹配时 items 为 `[]`、total 为 0。省略 filter（例如请求 `{}`）查询全部当前可见的已发布文档；显式提供时仍须是合法非空表达式，null 和 `{}` 无效。
paginate 省略或为 false 时一次返回全部匹配项，最多 500 项，total 等于 items.length，page/pageSize 均为空；显式传入 page 或 pageSize 返回 422。
省略 sort 时结果按内部 ID 升序。
账号及组织的暂停、禁用状态不会自动排除，需要时在对应接口显式筛选根字段 `status`。

## 分页浏览

显式设置 paginate 为 true 开启分页，例如：

```json
{
  "paginate": true,
  "page": 2,
  "pageSize": 50,
  "sort": [{ "field": "name", "direction": "asc" }]
}
```

开启时 page 从 1 开始，省略时采用 1；pageSize 省略时采用 50，最多 500。两者必须为正安全整数，计算后的偏移量也必须能安全表示。
字符串、null、非整数及无法安全计算的偏移量均返回 422；paginate 只接受布尔值，不进行隐式转换。
分页不限制总匹配数，可浏览超过 500 项的集合；先对全部匹配项排序，再取请求页，最后执行字段选择。
响应返回精确 total 和实际 page/pageSize。没有匹配项时 items 为 []、total 为 0；越过末页时 items 仍为 []，total 保留真实匹配数。

一次响应的本页和精确总数来自同一数据库快照。不同翻页请求各自读取当时的已发布数据，可能因更新而重复或漏看，不适合用作固定快照导出。
只完整校验本页文档；本页未选字段损坏仍整体返回 503，计数不会逐份核验其他页，所以 total 不代表全部匹配文档都已通过完整性检查。
精确计数与深页查询仍受数据库语句 2 秒、HTTP 请求 5 秒的期限约束，失败不退化为估算总数、截断列表或部分成功。

## 选择返回字段

select 使用公开字段路径数组，例如用户请求 `{"select":["name","mobile","employments.organization.path.code","employments.roles"]}`。
显式选择只返回所选字段，不补充默认身份字段；过滤和排序可以使用未返回的公开字段。
嵌套选择保留对象与数组形状、次序、空数组和 null；过滤命中某条任职或某个路径节点，仍返回所选字段下的全部元素。
选择父对象或数组字段返回其完整公开子树，重复路径合并，父路径覆盖子路径。
需要完整文档时显式选择公开 schema 的全部根字段；默认值只用于省略 select。

select 去重后最多 64 个路径。空数组、非法或内部路径、通配符、别名、计算字段、数组索引和切片均返回 422。
服务先校验本次返回范围的完整文档，再按认证 Client 生成公开内容，最后裁剪字段；该范围内未选字段损坏也会导致整次查询返回 503。
本次响应和默认字段直接切换，调用方应读取 data.items，不保留旧数组格式。

## 排列结果

sort 是有序数组，最多三项，每项使用 field 和 direction。例如按组织层级降序、名称升序查询，只返回编码：

```json
{
  "sort": [
    { "field": "level", "direction": "desc" },
    { "field": "name", "direction": "asc" }
  ],
  "select": ["code"]
}
```

两个接口都只允许各自公开 Document 的根级标量字段，方向为 asc 或 desc；对象、任职、角色、组织路径等数组及其子字段均不能排序。
字段按原始类型比较：数字按数值，布尔值按 false、true，字符串按固定、区分大小写的字节序，不按拼音或自然排序。
null 在升序和降序中都置于末尾；全部排序键同值时按内部唯一 ID 升序，ID 不出现在结果中。
排序作用于整个匹配集合，不改变文档内部数组的次序，也不改变非分页 500 项总上限。
空 sort、超过三项、非法字段或方向均使整次请求返回 422。

## 组合条件

用 `and`、`or`、`not` 组合条件。标量使用 `eq` 或 `in`，标量数组使用 `containsAny` 或 `containsAll`；
组织子树通过完整路径中存在指定组织的 `code` 表达，匹配该组织自身及其后代。字符串精确比较，空格和大小写保留。

对象集合用 `exists: { path, where }`。where 中的路径相对于当前元素，同一个 where 的条件须由同一元素满足。
例如，要求同一条有效任职同时属于指定组织子树并担任指定岗位：

```json
{
  "filter": {
    "exists": {
      "path": "employments",
      "where": {
        "and": [
          {
            "exists": {
              "path": "organization.path",
              "where": { "field": "code", "op": "eq", "value": "ORG-A" }
            }
          },
          { "field": "position.code", "op": "eq", "value": "MANAGER" }
        ]
      }
    }
  }
}
```

将任职条件拆成两个独立 exists 会允许不同任职分别满足。组织路径同理；`organization.path` 内的 code、level 等条件须匹配同一节点。
组织路径包含自身；`level` 从根的 1 起算，`distanceToTarget` 从目标自身的 0 起算。

独立组织搜索的路径位于文档根，使用 `exists.path = "path"`；任职中的组织使用 `organization.path`，
责任元素中的目标组织使用 `targetOrganization.path`。`not` 应包裹整个 exists 才表示排除该组织子树。

空字段上的原子条件为 false，not 再取反，所以“手机号不等于某值”会包含没有手机号的用户。
`not exists(...)` 与 `exists(... where not ...)` 不等价。不能直接查询 null、空集合或缺失字段，也不支持模糊搜索。
表达式和查询值数组须非空；旧 all/any/nested、`withinSubtreeOf`、旧根路径 `user.*`、独立组织的 `organization.*`、权限点路径和任意 JSON path 均无效。

## 处理结果

关闭分页时最多匹配 500 项，超限整体返回 422，可收窄条件或显式开启分页；不会截断结果。分页时 500 仅为每页上限。
过滤器限深度 8、节点 64、每个 and/or 的子条件 16、每个查询数组去重后 50 项、字符串 128 字符。
非法字段、类型或超预算条件也返回 422。文档解析失败、查询异常或超时返回 503，不返回部分结果。

搜索只使用当前版本的已发布数据；尚未发布或版本不符的行可能缺席，成功响应不保证完整覆盖或最新事实。
两类响应都从参与匹配的同一份公开文档选择字段。用户角色过滤、精确计数、返回和详情都使用已认证 Client 的有效角色和任职上的有效全局角色。
Client 由认证身份确定，否定、组合及 exists 条件也只在该可见范围内求值。无可见角色的有效任职在选择角色时返回 `roles: []`。
Internal 角色可见范围独立于 SSO 启用状态和授权声明配置。
需要代办人时，再按 username 调用[委托解析](delegation.md)；每批最多 100 人，各批的观察时点可能不同。

## 查字段与接口定义

字段类型、枚举和错误响应直接查代码，接入指南不另维护字段清单：

- [用户搜索 schema](../../packages/contracts/src/document.ts)与[用户 HTTP 定义](../../apps/api/src/routes/internal/user/user.routes.ts)。
- [组织搜索 schema](../../packages/documents/src/organization/schema.ts)与[组织 HTTP 定义](../../apps/api/src/routes/internal/organization/organization.routes.ts)。
- [共有表达式解析](../../packages/filter-engine/src/filter-transport.ts)。

旧 Public 搜索、Internal 非 DSL 搜索和搜索合并委托接口已退役；Internal 详情使用相同已发布文档，管理端查询继续使用管理专属模型。
