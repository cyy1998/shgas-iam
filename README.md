# hono

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.\


# 采招系统用户统一查询接口替换

path: /api/iam/internal/users/searchWithPrivilegeDelegation
method: POST

替换原有接口
/api/iam/internal/search-users/org-roles
/api/iam/internal/search-users/under-org
/api/iam/internal/search-users/org-position



## ToDo

1. 组织角色同时授予下级组织
2. Admin API
3. 权限项分解为Resource与Action
4. 权限代理
