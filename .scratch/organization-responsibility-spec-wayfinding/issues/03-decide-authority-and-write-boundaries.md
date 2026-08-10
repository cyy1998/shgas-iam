# 裁定组织责任事实的权威来源与写入边界

Type: grilling

Status: unclaimed

Blocked by: None — can start immediately

## Question

谁拥有 Organization Responsibility Definition 与 Assignment 的权威写入权，Admin、HR 同步和第三方 Internal API 应分别具备
哪些命令或只读能力，才能避免多源写入和不可追溯覆盖？

本 ticket 需要与维护者共同决定：

- IAM Admin 是否是首版权威写入面，`api/internal` 是否严格只读；
- 若存在外部来源，使用 source metadata、external identity、幂等 upsert 还是人工接管语义；
- 是否允许批量任命、批量结束或导入，以及它们是否属于本 spec；
- 写入的 optimistic concurrency、幂等和审计 actor/source 需要达到什么契约；
- 哪些 reader 可以看到未来与历史任命，哪些只看当前有效事实。
