# 领域文档消费规则

本仓库采用单上下文（single-context）领域布局，工程 skills 在探索或设计业务改动前按以下入口消费领域知识：

- **[功能与业务规则](../features/README.md)**：查找相关业务主题、权限范围、生命周期与失败语义。
- **[`GLOSSARY.md`](../../GLOSSARY.md)**：稳定领域术语字典。
- **`docs/adr/`**：相关已接受架构决策（完整清单见[文档索引](../index.md#架构决策)）。

## 术语与决策约束

- **术语一致**：issue 标题、重构方案、假设、类型与测试命名统一沿用 `GLOSSARY.md` 定义的领域词汇，不随意漂移到 `GLOSSARY.md` 排除的同义词。若出现词表尚未收录的新概念，评估是否为词汇漂移或真实领域缺口（后者交由 `/domain-modeling` 补齐）。
- **显式上报 ADR 冲突**：产出若与现有已接受 ADR 冲突，必须显式标出并说明理由，不得静默覆盖：

  > _Contradicts ADR-0007 (`<decision title>`) — but worth reopening because…_
