# 09 — 提供只读 Employment Cutover Verifier

**What to build:** 运维人员可以在切换 Employment 新生命周期前运行一个只读检查，获得所有阻断异常的可定位分类；工具只报告事实，绝不猜测或修改业务数据。

**Blocked by:** 04 — 手动维护可选 Primary Employment；06 — 用 Open Employment 守卫 Position、Organization 与 User 生命周期；08 — 发布 Effective Employment 并对完整性异常 fail closed

**Status:** resolved

- [x] Verifier 只读取 Employment、User、Position、Organization 与所需组织关系，不执行 insert、update、delete 或自动修复。
- [x] 检查并阻断非墓碑未知状态、无效 Position/Organization、无效或矛盾 Employment Period、Open Employment 带 `endTime`、Ended 缺少有效 `endTime`。
- [x] 检查并阻断当前 Admin 不支持的未来 Open `startTime`、同用户组织岗位的重复 Open Employment，以及同用户多个 Open Primary。
- [x] Legacy Employment Tombstone 可以单独计数和报告，但不因缺少可信 `endTime` 阻断切换。
- [x] 无阻断异常时返回成功；存在一个或多个阻断异常时返回非零，并聚合全部可安全定位的记录标识与稳定分类。
- [x] 输出不把 `updateTime` 解释为业务结束时间，不生成修复 SQL，也不包含真实用户秘密或认证凭据。
- [x] Verifier 是显式切换前命令，不在每次 Admin 启动或请求中执行全表扫描。
- [x] 工具文档说明调用方式、成功/失败含义、墓碑处理和“由管理员依据真实业务修正后重跑”的流程。
- [x] 使用可控数据集的测试覆盖每种异常、多个异常聚合、墓碑非阻断、零异常成功和数据库绝对只读。
- [x] 本 ticket 不运行生产检查、不修改生产数据、不增加 schema、数据库约束、锁或并发协议。
