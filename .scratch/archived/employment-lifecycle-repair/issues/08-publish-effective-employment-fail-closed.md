# 08 — 发布 Effective Employment 并对完整性异常 fail closed

**What to build:** IAM 只把当前时间内 Enable 的 Employment 发布到 Subject Facts；如果候选任职引用无效 Position 或 Organization，整次发布失败而不是静默丢弃异常记录。

**Blocked by:** 03 — 不可逆结束 Employment 并退役通用状态与删除入口；06 — 用 Open Employment 守卫 Position、Organization 与 User 生命周期

**Status:** resolved

- [x] Effective Employment 按当前时刻位于 `[startTime, endTime)`、状态 Enable 且非墓碑判定；Primary 与 User 状态不参与。
- [x] Pause、Ended、尚未开始、已越过结束边界和 Legacy Employment Tombstone 不进入 Subject Facts。
- [x] User Profile 构建读取足够的候选 Employment 与父对象事实，不能在完整性守卫之前通过查询过滤隐藏异常。
- [x] 发布前完整性守卫检查全部 Open Employment，包括不进入 Subject Facts 的 Pause；任一 Open Employment 引用停用或软删除的 Position/Organization 时，Builder 返回稳定内部完整性失败。
- [x] 完整性失败时不发布部分 User Profile/Subject Facts，不把对应 Dirty 标为 processed，也不回退 Legacy Detail 或现场联查。
- [x] Role Assignment Resolution 的正向解析不再把 Employment 的 Position/Organization 状态静默转换为空角色。
- [x] Role、Role Assignment target、client 范围、组织闭包、去重、排序以及反向 Dirty scope 的既有 ADR-0002 契约保持不变。
- [x] 已发布 Subject Facts 的 OIDC、Custom SSO 与 Client Subject Projection 消费者不新增 Employment 父对象现场联查，公开 wire shape 不变。
- [x] User Profile Builder 与 Subject Facts Publication Component Integration 测试覆盖状态、半开时间边界、父对象异常、全量失败及 Dirty 保留。
- [x] Role Assignment Resolution 的聚焦测试证明 ADR-0011 的局部替代和 ADR-0002 其余契约，并保持批量查询特性。
