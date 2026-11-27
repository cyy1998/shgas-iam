# @iam/assignment-resolution

## 角色分配解析

`@iam/assignment-resolution/role-assignment` 负责正向解析有效角色，以及反向查找受变更影响的用户。常规查询由 composition 绑定当前连接，失效展开使用事务实例。
正向解析校验任职、分配目标和角色的有效性，岗位与直属组织的完整性由 Document builder 校验；反向解析覆盖因角色、岗位或组织失效而受影响的用户。
管理端直接维护角色分配（assignment），协议层读取已发布的 Facts。
[公开接口](src/role-assignment/index.ts) · [ADR-0002](../../docs/adr/0002-centralize-role-assignment-resolution.md)

## 任职结束

`@iam/assignment-resolution/employment-lifecycle` 结束调用方已锁定的任职、清除主任职标记，并使用同一结束时刻级联处理组织责任，
同时返回需要写入 User Document Outbox 的变更列表。责任级联通过 `@iam/assignment-resolution/organization-responsibility/assignment-lifecycle`
结束仍开放的已锁定责任并获取审计所需变化。调用方负责目标选集、加锁顺序、事务与审计，并按原事务顺序登记 Outbox。

## Organization Responsibility 解析

- **读取与完整性**：`@iam/assignment-resolution/organization-responsibility` 按显式基准时间解析有效责任和跨树持有人（holder）。查询及完整性重查均排除已结束责任；
  若开放责任存在引用、生命周期、有效期或名额异常，或出现未知状态，均拒绝整批结果。组织变更覆盖子树任职用户和跨树持有人，责任类型的披露配置或排序变化也会使对应持有人文档失效。

- **生命周期更新**：`/assignment-lifecycle-store` 提供目标责任的有序锁定与生命周期更新，由 Admin 责任 repository 和 Worker 任职调度装配并绑定到当前事务。

- **父级停用预检**：`/parent-lifecycle` 提供父组织写入侧预检，由 composition 绑定当前事务，供责任 repository 与父生命周期 participant 复用，其他业务通过注入 port 调用。
  父组织暂停或停用时按实际修改范围预检，拒绝时业务事实、审计及两类 Outbox 一并回滚；预检不额外加锁，也不防护并发幻读（phantom）。
  [公开接口](src/organization-responsibility/index.ts) · [责任规则](../../docs/features/directory-management.md#组织责任管理) · [ADR-0014](../../docs/adr/0014-model-organization-responsibility-as-employment-bound-fact.md)
