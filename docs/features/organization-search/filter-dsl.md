# Organization Filter DSL

本文定义 Organization Search 的接入方式、过滤语义与异步读取边界。
领域词汇见 [CONTEXT.md](../../../CONTEXT.md)，查询语言沿用 [User Profile Filter DSL](../user-profile-search/filter-dsl.md)，
读模型与响应来源的取舍见 [ADR-0042](../../adr/0042-search-organizations-with-published-documents.md)。

## 能力与数据来源

提供 `POST /internal/organizations/search-dsl`，以 Organization 为唯一结果根，支持组织自身属性和完整 Organization Path 条件。
不支持按成员、岗位、角色或组织责任持有人反查组织，也不提供组织移动或历史组织查询。

组织关系表继续作为唯一源事实。PostgreSQL JSONB 保存可从源事实重新构建的 Organization Search Document，
用于检索，不接受独立业务写入。组织读模型独立持有文档、待重建记录、版本与核验能力，不借用 User Profile 的发布状态。

搜索目标集合包含全部未删除组织，不自动排除 Pause 或 Disable；调用方通过 `organization.status` 显式选择状态。
DSL 观察异步发布后的文档，业务写入成功不保证立即可见。

## 公开搜索结构

```text
organization
├── code
├── name
├── type
├── status
├── level
├── isVirtual
├── isEntity
└── path[]
    ├── code
    ├── name
    ├── type
    ├── level
    └── distanceToTarget
```

字段类型与允许值以 [Organization Search schema](../../../packages/organization-search-read-model/src/schema.ts)
及其引用的枚举为准，其中 [OrganizationType](../../../packages/contracts/src/enums/organization.type.ts) 使用中文枚举值。
数据库 numeric ID、存储用 numeric-ID path 字符串、创建时间和业务父组织不进入公开搜索结构。
公开字段使用现有业务类型；`level` 沿用现有组织层级，从根的 1 开始，当前源模型最大为 5。

### 绝对层级与相对距离

`organization.level` 表示结果组织自身的绝对层级。`organization.path[]` 按根到自身排列，每个节点同时保存：

- `level`：该节点从根起算的绝对层级；不会因为搜索目标不同而改变。
- `distanceToTarget`：该节点到当前结果组织的相对距离；目标自身为 0，父级为 1。

例如，以第三层部门为目标时：

| 路径节点   | level | distanceToTarget |
| ---------- | ----- | ---------------- |
| 根组织     | 1     | 2                |
| 第二层公司 | 2     | 1                |
| 目标部门   | 3     | 0                |

在同一完整合法路径中，节点的 `level + distanceToTarget` 等于目标组织的 `level`。
最终返回同一完整文档，保留目标组织与路径节点的 `level`。
这一字段扩展属于新 Organization Search，不自动修改既有 User Profile 文档或协议投影的严格结构。
路径保留完整祖先链，不因祖先的 Pause 或 Disable 状态删去节点；结果组织的状态仍由调用方显式筛选。

## 过滤表达式

沿用用户 DSL 的 `{ filter: Expression }` 请求形式与 `and`、`or`、`not`、`exists`、`field/op/value` 节点。
普通标量使用 `eq`、`in`；`organization` 支持包含自身的 `withinSubtreeOf`。
`exists` 进入 `organization.path` 后，内部字段相对于同一个路径节点解释；组合条件不能由不同节点拼接满足。

匹配使用规范事实的精确值，不隐式 trim、不转换大小写，不增加模糊名称、范围、全文或 null 查询。
布尔和集合语义沿用用户 DSL，结果与资源预算见下文。

例如，查找路径上第二层节点 code 为 `COMPANY-A` 的组织：

```json
{
  "filter": {
    "exists": {
      "path": "organization.path",
      "where": {
        "and": [
          { "field": "code", "op": "eq", "value": "COMPANY-A" },
          { "field": "level", "op": "eq", "value": 2 }
        ]
      }
    }
  }
}
```

路径包含自身，因此符合条件的第二层组织本身也可匹配。需要限定结果层级时，另加根作用域的 `organization.level` 条件。

### 请求与响应示例

请求通过 `apikey` 头携带有效 Internal Client 的 Internal API Secret：

```http
POST /internal/organizations/search-dsl HTTP/1.1
Content-Type: application/json
apikey: <Internal API Secret>

{"filter":{"field":"organization.code","op":"eq","value":"ROOT"}}
```

匹配成功时返回 HTTP 200。例如，根组织的完整文档如下；没有匹配时 `data` 为 `[]`：

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "organization": {
        "code": "ROOT",
        "name": "根组织",
        "type": "分公司",
        "status": "Pause",
        "level": 1,
        "isVirtual": false,
        "isEntity": true,
        "path": [{ "code": "ROOT", "name": "根组织", "type": "分公司", "level": 1, "distanceToTarget": 0 }]
      }
    }
  ]
}
```

## 固定响应与查询预算

成功响应通过共享 success envelope 返回完整 Organization Search Document 数组；每项固定为
`{ organization: { code, name, type, status, level, isVirtual, isEntity, path } }`，路径节点包含上文列出的全部五个字段。
筛选与响应使用同一份文档，不另查源表详情或从另一份摘要副本拼装；调用方不能选择返回字段。

结果按内部组织 ID 升序稳定排列，该 ID 只用于内部处理，不进入公开文档。不支持分页或调用方排序。
最多返回 500 个组织，发现第 501 个匹配项时整体返回 422，不截断。

过滤器必须非空，并沿用用户 DSL 的结构预算：

- 最大表达式深度 8，最多 64 个节点，每个 `and`/`or` 最多 16 个子表达式。
- 每个 `in` 最多 50 个去重查询值，查询数组必须非空。
- 字符串查询值最长 128。

非法条件、空过滤器和结构超预算均整体返回 422。

### 错误与缺行行为

| 情况                                                       | 结果                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| 合法且匹配不超过上限                                       | 200，完整文档数组                                                  |
| 合法但没有当前版本匹配行                                   | 200，空数组                                                        |
| 文档行尚未发布、缺失或 schema 版本不是当前版本             | 该行不参与搜索；可以返回其他当前版本匹配行，不因覆盖率缺口整体拒绝 |
| 非法、空或超预算过滤器，或超过 500 个匹配项                | 422，不返回部分结果                                                |
| 命中的文档严格解析失败、数据库查询异常或超时、请求预算耗尽 | 503，不返回部分结果                                                |

搜索不在请求时检查源组织与文档的全量覆盖率、待重建状态或整库版本完整性，不临时联查源表生成返回文档。
未匹配的损坏文档不保证被本次查询发现；若损坏使数据库表达式执行失败，则按查询失败处理。
“不返回部分结果”约束一次查询的执行失败与结果超限，不表示对源组织覆盖完整性的保证。

同样保留 PostgreSQL statement timeout 2 秒与 handler budget 5 秒；handler 超时返回不等于已经取消底层数据库操作。
完整覆盖与发布核验由[维护流程](../../releases/data-maintenance.md#组织搜索全量重建)显式执行。

## 异步构建

源业务事务保存待重建记录，Worker 根据组织源事实重新构建并发布搜索文档；业务写入成功不等于文档已发布。
调用方接受在重建完成前读到旧事实。构建失败需要恢复能力，不能靠再次执行业务写入来补偿。

组织 code、name 或 type 的变化会影响本组织及全部后代文档中的路径节点，因此触发这些组织的重建。
这一影响范围同时覆盖 Admin 与 Internal 的正式组织写入口。并发创建后代与修改祖先时的更新传播也必须由该能力负责，
不能仅更新发起变更的组织文档。

按组织独立发布，单份文档内部保持一致，不要求整棵子树同时切换；一次查询可以同时返回不同组织各自的新旧文档。
新建组织首次发布前可能搜不到；软删除在文档更新完成前可能仍出现在结果中，删除处理完成后退出搜索。
查询中的“未删除”由已发布文档对应的可见状态表达，不在请求时重新读取源组织状态。

构建失败保留已有合法旧文档并重试，不因待重建而拒绝读取该文档，不承诺固定时间内更新完成。
单份文档的构建必须取得一致源快照；版本仲裁必须阻止旧任务覆盖较新发布。
失效登记还必须覆盖祖先修改与后代创建的并发交错，不能把文档级版本校验当作失效范围完整性的证明。

变化登记、提交后子树展开与发布仲裁的工程约束见
[Organization Search publication schema](../../architecture/contracts-and-database.md#organization-search-publication-schema)。

## Internal Client 访问范围

全部有效 Internal Client 使用相同的公开搜索字段，并读取相同的完整组织文档。
不按 Client 裁剪字段或限定组织子树；公开结构新增字段时，须作为向全部有效 Internal Client 开放数据的变更审查。

## 版本切换与维护

Organization Search 独立管理文档、发布与恢复，不与 User Profile 绑定升级，也不改变组织详情的读取方式。
组织搜索直接读取 PostgreSQL，不使用 Redis 文档缓存；模块所有权与公开出口见
[共享契约与数据库](../../architecture/contracts-and-database.md#专用能力包契约)。

组织搜索采用独立的单一当前 schema 版本；调用方不能选择版本，运行时不混读不同 schema 代际或回退旧结构。
同一 schema 版本内不同组织各自的新旧事实仍按异步发布规则处理。

首次构建、不兼容升级及全量恢复须在维护窗口完成重建和独立全量核验，通过后才恢复写入与 DSL。
核验失败保持维护状态，修复后重新完整核验。完整核验是发布与恢复门禁，在线查询仍按上文过滤缺行和非当前 schema。
操作步骤、命令、补偿调度与失败处置统一见[组织搜索维护](../../releases/data-maintenance.md#组织搜索全量重建)。

## 接口范围

面向其他内部服务的组织搜索只提供 `POST /internal/organizations/search-dsl`，使用有效 Internal Client 认证。
Public 和 Internal 非 DSL 组织搜索按 [ADR-0043](../../adr/0043-retire-public-and-legacy-internal-directory-search.md)
直接退役，不保留兼容期或源表搜索替代入口。

Internal 组织详情、写入口以及 Admin 搜索、组织树和选择器继续保留。DSL 使用本文的完整文档响应、状态范围、
500 条上限和异步读取边界，不为旧搜索参数新增操作符或兼容响应。
