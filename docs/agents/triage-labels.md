# Triage Labels

Skills 使用五种 canonical triage roles；本仓库保持原标签字符串。

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

Skill 要求应用某个 triage role 时，使用上表对应标签。

## Spec 与实施票类型

`type:spec` 表示完整需求，`type:ticket` 表示有父 Spec 的 implementation ticket；两者互斥，
独立于上表的准入状态。创建 Spec 时应用 `type:spec`，拆票时为每张子票应用 `type:ticket`。

AFK 只按类型标签识别，不从标题、正文或是否有子票猜测；缺失或冲突时报告并保留 issue，不自动实施。
父 Spec 与每张待派发子票都必须具有 `ready-for-agent`，父级放行不隐式授权全部子票。
原生父子关系确定归属，原生 blocking 关系确定先后，操作约定见[议题跟踪](issue-tracker.md)。
