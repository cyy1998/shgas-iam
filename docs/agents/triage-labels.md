# Triage Labels

Skills 使用五种 canonical triage roles；本仓库保持原标签字符串，不得因远端暂时缺少标签而静默改用其他名称。

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

## Spec 与实施票类型

`type:spec` 表示完整需求，`type:ticket` 表示有父 Spec 的 implementation ticket；两者互斥，独立于上表的准入状态。
原生父子/阻塞关系及准入校验规则见[Spec 任务图](issue-tracker.md#spec-任务图)。

## AFK 执行档位与暂停标签

Sandcastle AFK 在上述准入与类型标签之外，固定使用三个额外标签控制实施档位与异常暂停（详见 [Sandcastle AFK 工作流](sandcastle-afk.md) 与 [ADR-0059](../adr/0059-adopt-native-sandcastle-afk-orchestration.md)）：

| Label             | Scope         | Meaning                                                                                                                                                                         |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent:light`     | Ticket        | 设计期指定的轻量实施档位，AFK 路由至 `implementer_light`；与 `agent:deep` 互斥（同时存在时暂停 Spec 并显式报错）                                                                |
| `agent:deep`      | Ticket        | 设计期指定的深度实施档位，AFK 路由至 `implementer_deep`；未打档位标签的 ticket 默认路由至 `implementer_standard`                                                                |
| `needs-attention` | Spec / Ticket | AFK 因冲突、票失败、验证未通过或交付异常暂停时在 Spec 上添加的标记（配合暂停原因评论）；维护者解除阻塞后移除该标签即可续跑，也可用于主动软停止 Spec，或在 Ticket 上排除就绪派发 |
