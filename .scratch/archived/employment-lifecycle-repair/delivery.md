# Employment 生命周期修复开发记录

## 当前状态

- 2026-08-11 已完成代码与两份 handoff 的只读调查，并与维护者逐项确认领域和范围。
- feature spec 已发布，长期领域语言与 ADR-0011 已同步。
- 当前分支为 `codex/employment-lifecycle-design`，目标固定点为 `main@41b9233e`。
- Ticket 01 至 Ticket 09 已完成实现、聚焦验证和 Standards/Spec 双轴评审，状态均为 `resolved`。
- Ticket 09 的 review fixed point 为 `84939229`；当前没有剩余实现 ticket 或依赖前沿。
- 未修改 Employment schema、状态数值、索引、数据库约束、Session/Token TTL 或运行数据。
- 下一安全动作由维护者决定：按仓库工作流执行整个 feature 的本地验证、归档与合入；未获授权前不 archive、merge、push 或 deploy。

## 验收与验证计划

- 主要行为 Seam：Admin API 的 Employment Lifecycle Interface，覆盖显式状态机、统一时间、写入完整性、审计、Dirty 与事务回滚。
- 投影 Seam：User Profile Builder 与 Subject Facts Publication，覆盖 Effective Employment 和发布前 fail-closed 完整性守卫。
- 展示 Seam：Admin 页面，覆盖合法操作、必填 Transfer Primary 选择，以及删除、通用状态和可编辑时间入口的移除。
- repository 只补 Open Employment 查询与计数的窄测试；Cutover Verifier 使用可控数据集验证全部阻断分类和只读性质。
- ticket 内循环运行受影响 collection、lint、typecheck、`pnpm check:docs` 与 `git diff --check`；准备本地合入时再运行一次最终完整验证。

## 事件

- 2026-08-11 — **Decision**：Employment 是一次不可重开的任职期；Enable/Pause 属于 Open，Ended 为终态。
- 2026-08-11 — **Decision**：当前 Admin 只支持即时命令，未来 HR 集成仅保留扩展能力，不在本 feature 实现。
- 2026-08-11 — **Decision**：父对象完整性由写入端保证，Subject Facts 发布前 fail closed，下游不现场重查。
- 2026-08-11 — **Decision**：当前低并发场景不新增数据库约束、锁或并发重试，切换前只读审计阻断现存异常。
- 2026-08-11 — **Decision**：普通 Employment 变化不撤销 Session；账号禁用和离职保留现有撤销安全语义。
- 2026-08-11 — **Decision**：历史软删除记录保留为 Legacy Employment Tombstone，不自动推断或修复。
- 2026-08-11 — **Scope**：当前代码不存在 Organization Responsibility 模块，本 feature 不增加任何占位实现。
- 2026-08-11 — **Authorization**：维护者批准 9 张 tracer-bullet tickets 的粒度与 blocking edges，并授权发布到本地 tracker；未授权实现。
- 2026-08-11 — **Authorization**：维护者显式授权 `/implement ticket01`；实现范围仅限 Ticket 01。
- 2026-08-11 — **Validation**：Admin API 28 项 unit、207 项 component，Admin 17 项 unit、28 项 component 全部通过；两个 workspace 的 lint/typecheck，以及 Architecture Guard、Docs Guard、whitespace 检查通过。
- 2026-08-11 — **Review**：Standards 与 Spec 双轴评审发现的 use-case 边界、Clock port、Open Primary、事务回滚测试和重复范围校验问题均已修复；最终两轴均为 0 finding。
- 2026-08-11 — **Delivery**：Ticket 01 建立 `CreateEmploymentUseCase`，Admin 创建改为即时任职，Open 重复包含 Enable/Pause，Primary 创建只替换其他 Open Primary，创建写入/审计/Dirty 保持同一 UnitOfWork。
- 2026-08-11 — **Authorization**：维护者显式授权 `/implement ticket02`；实现范围仅限 Ticket 02。
- 2026-08-11 — **Validation**：Ticket 02 的 Admin API 28 项 unit、222 项 component，Admin 17 项 unit、30 项 component 全部通过；两个 workspace 的 lint/typecheck、Architecture Guard 和 whitespace 检查通过。
- 2026-08-11 — **Review**：Standards 初审发现 Port 状态写入不够窄和跨页面重复逻辑，Spec 初审发现页面刷新覆盖不足；修复后完整范围复评为 Standards 0 hard/0 smell、Spec 0 missing/partial、0 scope creep、0 behavior error。
- 2026-08-11 — **Delivery**：Ticket 02 增加显式 Pause/Resume Application Use Case 与 Admin API/UI 操作；Resume 复核父对象、组织范围和排除自身后的 Open 冲突，幂等重试不重复写审计/Dirty，普通任职变化不接入 Session 撤销。
- 2026-08-11 — **Authorization**：维护者显式授权 `/implement ticket03`；实现范围仅限 Ticket 03。
- 2026-08-11 — **Validation**：Ticket 03 的 Admin API 28 项 unit、229 项 component，Admin 17 项 unit、31 项 component 全部通过；两个 workspace 的 lint/typecheck、Architecture Guard、Test Collection Guard、Docs Guard 和 whitespace 检查通过。
- 2026-08-11 — **Review**：Ticket 03 从 `7c514ae3` 到候选 `48fd5a18` 的 Standards/Spec 双轴评审均为 0 finding。
- 2026-08-11 — **Delivery**：Ticket 03 增加不可逆 End Application Use Case 与 Admin API/UI 操作，Ended 重试保持幂等；通用 status update、Employment delete 和可编辑生命周期时间入口已硬移除，普通任职变化不撤销 Session。
- 2026-08-11 — **Authorization**：维护者显式授权 `/implement ticket04`；实现范围仅限 Ticket 04。
- 2026-08-11 — **Validation**：Ticket 04 的 Contracts 31 项 unit、Admin API 28 项 unit/236 项 component、Admin 17 项 unit/33 项 component 全部通过；三个受影响 workspace 的 lint/typecheck，以及 Architecture Guard、Test Collection Guard、Docs Guard 和 whitespace 检查通过。
- 2026-08-11 — **Review**：Ticket 04 从 `e5161c45` 到最终候选的 Standards 复评为 0 hard/0 smell，Spec 复评为 0 missing/partial、0 scope creep、0 behavior error；初审发现的取消主任职审计动作目录缺口已由 focused fix 闭合。
- 2026-08-11 — **Delivery**：Ticket 04 增加显式 Set/Clear Primary Application Use Case 与 Admin API/UI 操作，Enable/Pause 可手动设置或取消主任职；原子替换只影响 Open Primary，Ended/墓碑拒绝，重复命令幂等，普通主任职变化不撤销 Session。
- 2026-08-11 — **Authorization**：维护者显式授权 `/implement ticket05`；实现范围仅限 Ticket 05。
- 2026-08-11 — **Validation**：Ticket 05 的 Admin API 28 项 unit、248 项 component，Admin 17 项 unit、35 项 component 全部通过；两个 workspace 的 lint/typecheck，以及 Architecture Guard、Test Collection Guard、Docs Guard 和 whitespace 检查通过。
- 2026-08-11 — **Review**：Ticket 05 从 `98a3b9e5` 到最终候选的 Standards 复评为 0 hard/0 smell，Spec 复评为 0 missing/partial、0 scope creep、0 behavior error；初审指出的退役 Reader Port 和无用前端 mock 已由 focused fix 删除。
- 2026-08-11 — **Delivery**：Ticket 05 增加独立 Transfer Application Use Case，以同一事务时刻结束旧 Employment 并创建新 ID 的 Enable Employment；管理员必须显式选择新任职是否为主任职，目标完整性、Open 唯一性、审计与 Dirty 原子完成，不继承 Pause/Primary，不撤销 Session。
- 2026-08-11 — **Authorization**：维护者显式授权 `/implement ticket06`；实现范围仅限 Ticket 06。
- 2026-08-11 — **Validation**：Ticket 06 的 Domain 69 项 unit、Admin API 28 项 unit/270 项 component 全部通过；最终 `pnpm verify`、Admin API lint/typecheck、Architecture Guard、Test Collection Guard、Docs Guard 和 whitespace 检查通过。
- 2026-08-11 — **Review**：Ticket 06 从 `ab11509d` 到最终候选的 Standards 复评为 0 hard/0 smell，Spec 复评为 0 missing/partial、0 scope creep、0 behavior error；初审指出的 Open 领域命名、重复 query helper 与最高层矩阵未真实消费 repository 谓词问题均已修复。
- 2026-08-11 — **Delivery**：Ticket 06 以统一 Open Employment（Enable/Pause 且非墓碑）守卫 Position、Organization 层级和 User 软删除；Ended/墓碑不阻断，父对象重新启用与普通 User Disable 不级联改写 Employment，Admin REST/tRPC 保持稳定冲突语义。
- 2026-08-11 — **Authorization**：维护者显式授权 `/implement ticket07`；实现范围仅限 Ticket 07。
- 2026-08-11 — **Validation**：Ticket 07 的 Admin API 28 项 unit、273 项 component 全部通过；Admin API lint/typecheck、Architecture Guard、Test Collection Guard、Docs Guard 和 whitespace 检查通过。
- 2026-08-11 — **Review**：Ticket 07 从 `813f9e1a` 到最终候选的 Standards 复评为 0 hard/0 smell，Spec 复评为 0 missing/partial、0 scope creep、0 behavior error；初审指出的重复离职有状态覆盖缺口与测试内 Drizzle predicate 重复均已由 focused test fix 闭合。
- 2026-08-11 — **Delivery**：Ticket 07 让 User Resignation 从注入 Clock 读取一次权威时刻，以统一 Open Employment 谓词结束全部 Enable/Pause 非墓碑任职并清除 Primary；Ended/墓碑和既有 `endTime` 保持不变，Employment、User Disable、审计与 Dirty 继续在 Subject Access 保护的同一事务内完成，提交后 Session 撤销语义不变。
- 2026-08-11 — **Authorization**：维护者显式授权 `/implement ticket08`；实现范围仅限 Ticket 08。
- 2026-08-11 — **Validation**：Ticket 08 的 User Profile Read Model 2 项 unit、102 项 component、31 项 PostgreSQL，以及 Role Assignment 2 项 component、45 项 PostgreSQL 全部通过；两个 workspace 的 lint/typecheck、Architecture Guard、Test Collection Guard、Docs Guard 和 whitespace 检查通过。
- 2026-08-11 — **Review**：Ticket 08 从 `825e17dd` 到最终候选的 Standards 复评为 0 hard/0 smell，Spec 复评为 0 missing/partial、0 scope creep、0 behavior error；初审发现的 Current 架构文档冲突、legacy detail/search scope creep 和测试展示字符串控制语义均已由 focused fix 闭合。
- 2026-08-11 — **Delivery**：Ticket 08 让 User Profile Builder 只发布位于 `[startTime, endTime)` 的 Enable 非墓碑 Employment，并在映射前校验全部 Open Employment 的 Position/直属 Organization；完整性异常整次失败、Dirty 保持 failed 而非 processed。Role Assignment 正向解析不再以 Employment 父对象状态静默清空角色，同时保留 assignment target、Role、client、组织闭包、去重、排序、反向 scope 与批量查询契约；legacy detail/search 与公开 Subject Facts wire 边界保持不变。
- 2026-08-11 — **Authorization**：维护者显式授权 `$implement ticket09`；实现范围仅限 Ticket 09，review fixed point 为 `84939229`。
- 2026-08-11 — **Validation**：Ticket 09 的 User Profile Read Model 2 项 unit、107 项 component、33 项 PostgreSQL，以及 Worker 12 项 unit、18 项 component、2 项 PostgreSQL 全部通过；两个 workspace 的 lint/typecheck、Architecture Guard、Test Collection Guard、Docs Guard 和 whitespace 检查通过。
- 2026-08-11 — **Review**：Ticket 09 从 `84939229` 到最终候选的 Standards 复评为 0 hard/0 smell，Spec 复评为 0 missing/partial、0 scope creep、0 behavior error；初审发现的 finding 聚合重复、跨 package 测试快照重复和原始进程生命周期管理问题均已由 focused fix 闭合。
- 2026-08-11 — **Delivery**：Ticket 09 增加显式只读 `employment:cutover-verify` Worker CLI；在数据库只读事务中一次聚合稳定异常分类与全部可定位 Employment ID，阻断时返回非零，Legacy Tombstone 仅计数且不阻断。工具不读取 `updateTime` 推断业务事实、不生成修复 SQL、不自动修改数据；管理员须依据真实业务通过正式入口修正后重跑。
