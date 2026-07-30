---
status: accepted
---

# 采用集中治理、分布式执行的 OPA 授权架构

IAM 作为跨 client 的 Authorization Control Plane 和共享主体属性权威，负责授权策略的生命周期、版本发布与决策审计，但不作为所有业务请求同步调用的中央 PDP。每个受保护 client 在自己的 Authorization Enforcement Boundary 内就近运行 OPA，并由业务服务或网关执行判定结果；IAM 管理端作为首个接入方。相比中央远程判定服务，这一选择避免为所有业务流量增加网络跳转和 IAM 可用性耦合，同时接受策略与共享属性分发是需要显式监控、版本化和治理的最终一致过程。
