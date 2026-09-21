---
status: accepted
---

# 分离会话核心、完整协议能力与应用适配

Session Kernel 只拥有协议中性的 UserSession / ClientSession 生命周期；Custom SSO 与 OIDC 各自拥有完整授权、Code、Token、
续接和交付能力。API 拥有根认证与 HTTP 适配，composition 显式注入数据库、Redis、短信、ORCAS 等外部能力。
本页按两类会话模型整理原模块提取决定。

## 理由与代价

不把协议用途、Cookie、HTTP 错误和外部交付塞进生命周期核心，也不只抽出 Redis 零件而把协议流程留在 app 拼装。
完整协议 module 使调用方消费明确能力，Kernel 能专注可信观察、原子关系和精确终止。

共享包不反向依赖 app 私有实现，使用公开窄出口和注入能力。操作许可与协议校验仍由上层协调，Kernel 不解释 Subject Access
Barrier 或主体投影；采用模块分离不表示协议作用可放进一个跨数据库、Redis 和外部服务的大事务。

代价是每个边界必须明确失败后已发生的作用与恢复 owner，而不能用一个总回滚承诺隐藏部分成功。
Worker 只编排各 owner 的维护能力，不由通用清理器猜测所有状态格式；旧布局能力仅供显式离线维护，不进入在线探测。

## 当前契约与历史

包位置和公开能力见[仓库地图](../architecture/repository-map.md#共享-packages)，
依赖与接线见[后端架构](../architecture/backend-architecture.md#核心依赖方向)。
生命周期选择见 [ADR-0035](0035-unify-user-and-client-session-lifecycles.md)，当前维护见
[统一维护手册](../releases/unified-session-maintenance.md)。

历史来源：[ADR-0028 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0028-extract-session-and-grant-state.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。
