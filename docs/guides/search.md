# 搜索接入

内部应用通过以下接口搜索用户或组织。先取得有效 Internal Client 的 Internal API Secret，通过 `apikey` 请求头提交；不要使用 SSO Secret。

| 目标 | POST 路径                            | 成功响应的 data                                                  |
| ---- | ------------------------------------ | ---------------------------------------------------------------- |
| 用户 | `/internal/users/search-dsl`         | 用户摘要数组，含 username、name、mobile、wxId、subjectIdentifier |
| 组织 | `/internal/organizations/search-dsl` | 完整组织搜索文档数组，含组织属性和从根到自身的路径               |

以下路径为 API 服务路径，经标准 Gateway 访问时加 `/api/iam` 前缀。
搜索范围与更新延迟见[用户搜索](../features/search/user-profile-search.md)和[组织搜索](../features/search/organization-search.md)。

## 发起查询

例如，按用户名查找用户：

```http
POST /internal/users/search-dsl
Content-Type: application/json
apikey: <Internal API Secret>

{"filter":{"field":"user.username","op":"eq","value":"alice"}}
```

成功返回 `{ "code": 200, "message": "success", "data": [...] }`；无匹配时 `data` 为 `[]`。
两个接口均要求非空 filter，按内部 ID 稳定排序，不能分页、指定排序或选择返回字段。
账号及组织的暂停、禁用状态不会自动排除，需要时显式筛选 `user.status` 或 `organization.status`。

## 组合条件

用 `and`、`or`、`not` 组合条件。标量使用 `eq` 或 `in`，标量数组使用 `containsAny` 或 `containsAll`；
组织引用可用 `withinSubtreeOf` 匹配某个组织及其后代。字符串精确比较，空格和大小写保留。

对象集合用 `exists: { path, where }`。where 中的路径相对于当前元素，同一个 where 的条件须由同一元素满足。
例如，要求同一条有效任职同时属于指定组织子树并担任指定岗位：

```json
{
  "filter": {
    "exists": {
      "path": "employments",
      "where": {
        "and": [
          { "field": "organization", "op": "withinSubtreeOf", "value": "ORG-A" },
          { "field": "position.code", "op": "eq", "value": "MANAGER" }
        ]
      }
    }
  }
}
```

拆成两个 exists 会允许不同任职分别满足。组织路径同理；`organization.path` 内的 code、level 等条件须匹配同一节点。
组织路径包含自身；`level` 从根的 1 起算，`distanceToTarget` 从目标自身的 0 起算。

空字段上的原子条件为 false，not 再取反，所以“手机号不等于某值”会包含没有手机号的用户。
`not exists(...)` 与 `exists(... where not ...)` 不等价。不能直接查询 null、空集合或缺失字段，也不支持模糊搜索。
表达式和查询值数组须非空；旧 all/any/nested、权限点路径和任意 JSON path 均无效。

## 处理结果

最多返回 500 项，超限整体返回 422，须收窄条件；不会截断结果。
过滤器限深度 8、节点 64、每个 and/or 的子条件 16、每个查询数组去重后 50 项、字符串 128 字符。
非法字段、类型或超预算条件也返回 422。文档解析失败、查询异常或超时返回 503，不返回部分结果。

搜索只使用当前版本的已发布数据；尚未发布或版本不符的行可能缺席，成功响应不保证完整覆盖或最新事实。
组织响应使用参与匹配的同一份文档；用户响应固定为摘要，筛选用的任职、角色不会随响应返回。
需要代办人时，再按 username 调用[委托解析](delegation.md)；每批最多 100 人，各批的观察时点可能不同。

## 查字段与接口定义

字段类型、枚举和错误响应直接查代码，接入指南不另维护字段清单：

- [用户搜索 schema](../../packages/user-profile-read-model/src/schema/profile-search.schema.ts)与[用户 HTTP 定义](../../apps/api/src/routes/internal/user/user.routes.ts)。
- [组织搜索 schema](../../packages/organization-search-read-model/src/schema.ts)与[组织 HTTP 定义](../../apps/api/src/routes/internal/organization/organization.routes.ts)。
- [共有表达式解析](../../packages/filter-engine/src/filter-transport.ts)。

旧 Public 搜索、Internal 非 DSL 搜索和搜索合并委托接口已退役；详情及管理端查询仍使用各自接口。
