# Internal API 重构变更说明

## 概述

本次对 `internal` tier 的路由进行了两项重构：

1. **域拆分**：将原扁平的 `internal.*` 文件按业务域拆分为独立子目录（`organization/`、`user/`、`delegation/`），结构与 `admin` tier 保持一致。
2. **RESTful 化**：将非 REST 风格的路径（动词路径、query 参数做资源标识）改为标准 RESTful 形式。

---

## 路径变更

### Organization 域（basePath: `/organizations`）

| 变更类型 | 原路径 | 新路径 | 说明 |
|----------|--------|--------|------|
| 重构 | `POST /organizations/search` | `POST /organizations/search` | 路径不变，从扁平文件迁移至独立域 |
| RESTful | `GET /organizations/getByCode?orgCode=` | `GET /organizations/:orgCode` | 资源标识符改为路径参数 |
| RESTful | `POST /purveyor/register` | `POST /organizations/purveyors` | 去除动词，归入 organizations 域 |

### User 域（basePath: `/users`）

| 变更类型 | 原路径 | 新路径 | 说明 |
|----------|--------|--------|------|
| RESTful | `GET /user-info?username=` | `GET /users/:username` | 资源标识符改为路径参数 |
| 重构 | `POST /users/search` | `POST /users/search` | 路径不变，从扁平文件迁移至独立域 |
| RESTful | `POST /users/searchWithPrivilegeDelegation` | `POST /users/search-with-delegation` | camelCase 改为 hyphen-case |
| RESTful | `POST /purveyor/contact/register` | `POST /users/purveyor/contacts` | 去除动词，归入 users 域 |

### Delegation 域（basePath: `/delegations`）

| 变更类型 | 原路径 | 新路径 | 说明 |
|----------|--------|--------|------|
| 重构 | `POST /delegations/search` | `POST /delegations/search` | 路径不变，从扁平文件迁移至独立域 |
| RESTful + 扩展 | `POST /delegations/update-status` | `PATCH /delegations/:id` | 动词路径改为 PATCH 资源，同时支持更新所有字段 |
| RESTful | `POST /delegations/set` | `POST /delegations/` | 去除动词，语义明确为创建操作 |

---

## 接口变更详情

### `GET /organizations/:orgCode`

**原接口**
```
GET /organizations/getByCode?orgCode={orgCode}
```

**新接口**
```
GET /organizations/:orgCode
```

---

### `POST /organizations/purveyors`

**原接口**
```
POST /purveyor/register
```

**新接口**
```
POST /organizations/purveyors
```

Request body（不变）：
```json
{
  "orgCode": "统一社会信用代码",
  "orgName": "供应商A",
  "parentOrg": "GY"
}
```

---

### `GET /users/:username`

**原接口**
```
GET /user-info?username={username}
```

**新接口**
```
GET /users/:username
```

---

### `POST /users/search-with-delegation`

**原接口**
```
POST /users/searchWithPrivilegeDelegation
```

**新接口**
```
POST /users/search-with-delegation
```

Request body（不变）：`UserQueryWithPrivilegeDelegationDto`

---

### `POST /users/purveyor/contacts`

**原接口**
```
POST /purveyor/contact/register
```

**新接口**
```
POST /users/purveyor/contacts
```

Request body（不变）：
```json
{
  "username": "身份证号",
  "orgCode": "供应商统一社会信用代码",
  "mobile": "12345678",
  "name": "1234"
}
```

---

### `PATCH /delegations/:id`

**原接口**
```
POST /delegations/update-status

Body: { "id": 1, "status": "2" }
```

**新接口**
```
PATCH /delegations/:id

Body: PrivilegeDelegationUpdateDto（所有字段均为可选）
```

Request body（新增，全部可选）：
```json
{
  "startTime": "2024-01-01T00:00:00Z",
  "endTime":   "2024-01-31T23:59:59Z",
  "status":    "2",
  "description": "备注说明"
}
```

> **注意**：原接口仅支持更新 `status`，新接口支持同时更新时间范围、状态和描述。委托状态为"结束（3）"时不允许修改。

---

### `POST /delegations/`

**原接口**
```
POST /delegations/set
```

**新接口**
```
POST /delegations/
```

Request body（不变）：`PrivilegeDelegationCreateDto`

---

## 服务层新增

| 文件 | 新增内容 |
|------|----------|
| `privilegeDelegation.schema.ts` | `PrivilegeDelegationUpdateDtoSchema` |
| `privilegeDelegation.type.ts` | `PrivilegeDelegationUpdateDto` 接口 |
| `privilegeDelegation.repository.ts` | `createPrivilegeDelegationRepository(db).updateDelegation(id, data)` |
| `privilegeDelegation.service.ts` | `updateDelegation(id, dto)` |
