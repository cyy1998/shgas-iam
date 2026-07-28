# 03 — 用 package seam 集中 Role Assignment 与 User Profile ownership

**What to build:** 先用 package exports、专用 subpath 和 import path 让 Role Assignment table、resolver factory、User Profile producer/worker 的 ownership 成为 module edge 事实，再由根 Architecture Guard 只按 owner path、规范静态 edge、type/value 与 Docker manifest closure 检查。

**Blocked by:** 01 — 建立根级 Architecture Guard 并守住 consumer-owned port

**Status:** resolved

- [x] `@iam/db` 暴露 dedicated Role Assignment schema subpath（例如 `@iam/db/schema/role-assignments`），`roleAssignments` 不再由 broad `@iam/db/schema` barrel re-export；resolver 与 Admin Role Management repository 改用专用 subpath，package exports 与 consumer typecheck 承担 symbol ownership。
- [x] `@iam/user-profile-read-model` root 与 `/query` 只公开 query-safe service/schema/read port/pure helpers，不公开 repository implementation；producer 与 worker 只从显式 `/producer`、`/worker` subpath 暴露，query repository/infrastructure 只从 `/query/repository` 暴露。
- [x] `role-resolution-owner` 只按 source owner path 与专用 schema module edge，允许 Role Assignment Resolver implementation 和 Admin Role Management repository，拒绝其他 production owner；不检查 `RoleAssignmentTargetType`、organization closure property 或 relational query property。
- [x] `@iam/role-assignment-resolution` 的 value dependency 只允许少量 composition/module owner；type-only dependency 可作为 consumer contract 使用，规则不识别具体 resolver factory symbol。
- [x] `@iam/user-profile-read-model/producer` 与 `/worker` 的所有静态 dependency（type/value import 与 re-export）都只允许对应 composition/module owner，普通业务 module 不能通过 type-only edge 泄漏 provider type。
- [x] `@iam/user-profile-read-model/query/repository` 的所有静态 dependency 只允许 API composition，普通业务 module 不能依赖 read-model infrastructure。
- [x] 从全部 Workspace manifests 推导 backend image 穿过任意中间 workspace 的 Role Assignment Resolution/User Profile dependency closure；缺失相应 package manifest 或 source directory 的 Dockerfile 字面 `COPY` 时产生稳定 violation。
- [x] Fixtures 证明 resolver type-only consumer 合法、resolver value edge 只允许 owner、User Profile producer/worker type/value edge 均只允许 owner、root/query consumer 合法、query repository 只允许 API composition；只为不同 owner path/module edge 增加 case。
- [x] 删除当前候选中的 property access、symbol name、barrel provenance/export graph、namespace member 分析及逐业务规则的 named/default/namespace/star/alias/property 语法矩阵。
- [x] Production 改动仅限建立可见 seam 所需的 package export/subpath/import path refactor，不改变业务、query、transaction、runtime 或 wire semantics。
- [x] `pnpm check:architecture`、根 guard focused tests、受影响 package/consumer typecheck 与 tests、Docker closure fixtures 和 `git diff --check` 通过。
