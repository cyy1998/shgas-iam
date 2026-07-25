# 08 — 收缩旧失效接口和投影 composition

**What to build:** 在所有在线写入和 worker maintenance 完成迁移后，移除旧 marker 与不再需要的投影实现暴露，使 User Profile 失效知识只存在于所属模块。

**Blocked by:** 04 — 让 worker maintenance 复用统一 dirty workflow；05 — 迁移用户与任职写路径；06 — 迁移组织与岗位写路径；07 — 迁移角色与角色分配写路径

**Status:** resolved

- [x] 21 个生产旧 marker 调用全部归零，旧 `markUsersDirty`、`markScopeDirty` 及其公开 marker port 被删除。
- [x] API 与 Admin API 的普通 repository 聚合不再创建或暴露 dirty、affected-user 或 scope repository。
- [x] Transaction composition 只向业务调用方暴露 `userProfileInvalidation`，projection repository 与 role resolver 由模块内部创建。
- [x] Job producer 删除未使用的单条 rebuild enqueue，只保留迁移期间实际仍需要的 bulk rebuild 与待退役 scope producer。
- [x] Transactional invalidation 与 worker maintenance 复用同一个非公开 dirty/payload/delivery workflow。
- [x] `UserProfileDirtyReason.PrivilegeUpdated` 继续可读取，但不形成公开 source change。
- [x] 架构测试覆盖规范 casing 的静态 named/type import 与 re-export、常规跨 package 内部静态路径和直接 legacy identifier，能发现业务 production module 按仓库惯例重新引用旧 marker、legacy contract 或原始 projection repository。
- [x] 收缩过程不增加数据库 migration，也不改变 dirty schema、状态机或 rebuild wire contract。
