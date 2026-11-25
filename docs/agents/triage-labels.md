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
