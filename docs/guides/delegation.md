# 应用委托接入

接入应用用自己的 Internal API Secret，通过 `apikey` 请求头管理和解析本应用的委托。
业务规则见[应用委托](../features/delegation/client-delegation.md)。委托仅确定直接代办人，业务系统仍须检查其登录和操作权限。

## 解析代办人

以下为 API 服务路径，经标准 Gateway 访问时加 `/api/iam` 前缀：

```http
POST /internal/delegations/resolve
Content-Type: application/json
apikey: <Internal API Secret>

{"usernames":["alice","bob"],"orgCode":"ORG-A"}
```

usernames 为 1–100 个不重复的准确用户名。Client 从认证凭据确定，不能指定其他 Client 或旧 privilege 参数。
一次解析使用同一时刻和数据快照，按输入顺序返回：

```json
{
  "code": 200,
  "message": "success",
  "data": [
    { "username": "alice", "delegateeUsername": "carol" },
    { "username": "bob", "delegateeUsername": null }
  ]
}
```

null 表示没有当前委托，不沿委托链继续解析。用户或组织暂停、禁用不影响输入识别及已有委托解析；删除则不同。
输入格式错误返回 422，输入对象不存在或已删除返回 404；匹配多条、自委托、引用损坏或查询故障返回 503。
这些失败都是整批失败，不能当作“没有代办人”。结果不缓存，不保证后续请求仍有同一代办人。

## 管理记录

创建用 `POST /internal/delegations/`，搜索用 `POST /internal/delegations/search`，修改用 `PATCH /internal/delegations/:id`。
只能操作认证 Client 的记录；创建返回详情，修改返回 boolean，均放入响应 envelope 的 data。
结果未知时先查询，避免自动重发写请求；冲突或已结束的记录须先处理原因。

字段、错误码和响应以[HTTP 定义](../../apps/api/src/routes/internal/delegation/delegation.routes.ts)及
[共享 schema](../../packages/delegation/src/wire.ts)为准。旧权限委托参数、错误码和数据结构不兼容；
一次性迁移见[运维入口](../releases/README.md#一次性迁移与旧版本)，已使用新模型的环境保留现有记录。
