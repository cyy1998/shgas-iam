# 确定责任定义目录的生命周期与治理规则

Type: grilling

Status: resolved

Blocked by: None — can start immediately

## Question

Admin 动态维护的 Organization Responsibility Definition 应采用怎样的身份、状态与变更规则，才能既允许业务扩展责任类型，
又不破坏既有任命和历史解释？

本 ticket 需要与维护者共同决定：

- definition code 是否创建后不可修改，名称、说明、显示顺序等哪些字段允许变化；
- 启用、停用、删除或恢复分别如何影响新建、未来预约、当前有效和历史任命；
- `assignmentCardinality` 从 `single` 改为 `multiple`，或从 `multiple` 收紧为 `single` 时的冲突检查与拒绝规则；
- `head`、`supervising` 是迁移 seed、普通预置数据还是受保护系统定义；
- Definition 的权威来源是 IAM Admin，还是需要接受 HR/组织主数据同步，并如何记录来源。

## Answer

Organization Responsibility Definition 使用创建后不可修改且永久不得复用的 `code` 作为稳定身份。`name`、
`description` 和 `displayOrder` 是可原地修改的展示元数据；历史 Assignment 展示当前文案，旧值由 Audit Log
追溯。启用或停用状态均允许修改这些展示元数据，也允许按下述门禁修改 `assignmentCardinality`；软删除后除恢复外
一律只读。

新建 Definition 默认启用。只有启用状态才允许创建当前生效或未来预约的 Assignment。存在当前有效或未来预约
Assignment 时不得停用 Definition：管理员必须先结束当前任命，并取消、软删除未来预约；已经结束的历史 Assignment
不阻止停用。停用的 Definition 可以重新启用，但重新启用不会恢复任何已经结束、取消或软删除的 Assignment。

从未生效的 Assignment 可以取消并软删除；一旦生效，只能结束并保留历史。因此，Definition 只有在从未产生过有效
Assignment，且所有未生效 Assignment 均已取消并软删除时才允许软删除。符合条件的启用 Definition 可以直接软删除，
无需先停用；删除必须原子重查上述条件。软删除保留 Definition 墓碑并永久占用原 `code`。Definition 可以恢复，恢复后
处于停用状态，且不会恢复任何 Assignment。

`assignmentCardinality` 从 `single` 放宽为 `multiple` 时允许直接修改并记录审计。从 `multiple` 收紧为 `single`
时，必须在同一原子操作中检查该 Definition 在每个目标 Organization 上的全部未软删除 Assignment，包括历史、当前和
未来时间段；只有完全不存在有效期重叠时才允许修改。发现冲突时拒绝变更，不自动结束或取消任何 Assignment。

`head` 与 `supervising` 是初始化时创建并启用的普通预置 Definition，遵守相同的身份、生命周期和基数规则；业务代码
不得按这两个 `code` 建立特殊分支或赋予系统保护。

首版由 IAM Admin 单一权威维护 Definition，不接受 HR 或组织主数据系统同步写入。Definition 不保存 `source` 或
`authority` 字段；创建、展示元数据修改、基数变更、启停、软删除和恢复都通过 Audit Log 记录 actor 与 `sourceApp`，
预置数据使用 system actor 记录初始化来源。
