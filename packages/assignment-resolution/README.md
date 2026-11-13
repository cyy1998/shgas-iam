# @iam/assignment-resolution

## 角色分配解析

`@iam/assignment-resolution/role-assignment` 拥有正向有效角色及反向受影响用户解析。Composition 绑定当前连接，失效使用事务实例。
正向检查任职、分配目标和角色有效性，岗位与直属组织的完整性由 Document builder 校验。反向覆盖角色、岗位或组织已失效的用户。
管理端维护 assignment，协议读取已发布 Facts。
[公开接口](src/role-assignment/index.ts) · [ADR-0002](../../docs/adr/0002-centralize-role-assignment-resolution.md)

## 任职结束

`@iam/assignment-resolution/employment-lifecycle` 结束调用方已锁定的任职、清除主任职标记，使用同一结束时刻执行责任级联，
并返回需要写入 User Document Outbox 的变化。责任级联可通过 `@iam/assignment-resolution/organization-responsibility/assignment-lifecycle`
结束仍开放的已锁定责任并取得审计所需变化。调用方负责选集、锁序、事务与审计，按原事务顺序登记 Outbox。

## Organization Responsibility 解析

`@iam/assignment-resolution/organization-responsibility` 按显式观察时间解析有效责任和跨树 holder。查询及完整性重查排除已结束责任，
开放责任的引用、生命周期、期间或名额异常，以及未知状态，均拒绝整批。组织变更覆盖子树任职用户和跨树 holder，Type 披露或排序变化也使 holder 失效。

`/assignment-lifecycle-store` 提供选中责任的有序锁定与生命周期更新，由 Admin 责任 repository 和 Worker 的任职调度装配绑定到当前事务。
`/parent-lifecycle` 提供父组织写入侧预检，由 composition 绑定事务，责任 repository 与父生命周期 participant 复用，其他业务通过注入 port 使用。
父组织暂停或停用按实际修改范围预检，拒绝时事实、审计及两类 Outbox 一并回滚。预检不额外加锁或保护 phantom。
[公开接口](src/organization-responsibility/index.ts) · [责任规则](../../docs/features/directory-management.md#组织责任管理) · [ADR-0014](../../docs/adr/0014-model-organization-responsibility-as-employment-bound-fact.md)
