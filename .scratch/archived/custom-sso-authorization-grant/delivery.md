# Custom SSO Authorization Grant 模块深化开发记录

## 当前状态

- 2026-07-25 已在功能分支 `codex/custom-sso-authorization-grant` 发布 [spec](./spec.md)。
- 目标分支为 `main`，创建功能分支时的目标 tip 为 `ab7e427c`。
- `01 — 建立 API production composition smoke` 已完成实现、聚焦验证与 Standards/Spec 双轴评审，状态为 `resolved`。
- `02 — 打通 Independent Authorization Grant` 已完成实现、聚焦验证与 Standards/Spec 双轴评审，状态为 `resolved`。
- `03 — 在共同 Grant 上完成 Gateway Local Session` 已完成实现、聚焦验证与 Standards/Spec 双轴评审，状态为 `resolved`。
- `04 — 收缩旧接口并锁定架构` 已完成实现、聚焦验证与 Standards/Spec 双轴评审，状态为 `resolved`。
- Ticket `01` 的 review fixed point 为 `ab7e427c3e4c957174f4cc88089f2efe113e5896`，最终实现范围截至 `a1df7ea7`。
- Ticket `02` 的 review fixed point 为 `74437b3fb3db1060dabf37b146b9e2edc54dbb02`，最终实现范围截至 `95298e47`。
- Ticket `03` 的 review fixed point 为 `9860c89105b0d1d94e23a8fc6c690a7e93c589f3`，最终实现范围截至 `919cd3ff`。
- Ticket `04` 的 review fixed point 为 `1365dd9fca6a31486a67404e58d767b2f4c0902a`，最终实现范围截至 `350c2992`。
- 四张 implementation tickets 已全部 `resolved`；下一安全动作是请求维护者明确授权归档与本地合入策略，获授权前不运行最终 `pnpm verify`、不归档、不合入。

## 验收与验证计划

- Ticket 内循环使用最高相关 module interface tests、受影响的 use-case/route/architecture tests，以及 `@iam/api` lint 和 typecheck。
- Production composition 改动前先建立 `@iam/api test:smoke`，由真实入口解析隔离测试环境、构造 production composition 并完成 HTTP readiness probe；不得连接真实数据库、Redis 或 ORCAS。
- 文档变更运行 `pnpm check:docs`；每张 ticket 提交前运行 `git diff --check`。
- 所有 tickets 完成并准备本地合入时，在最终实现内容上运行一次 `pnpm verify`；Custom SSO 功能测试保持在 hermetic 普通测试通道，不连接真实 Redis 或 ORCAS，进程 smoke 与普通测试收集互斥。
- 每张 ticket 在 focused implementation commit 后执行 Standards 与 Spec 双轴评审，finding 清零后再更新 ticket 与本 journal。

## 事件

- 2026-07-25 — **Decision**：Gateway 被定义为 Authorization Grant 协议路径的超集；共同 grant resolution 是 Custom SSO 模块的私有 seam，不通过公开 Independent 操作复用。
- 2026-07-25 — **Decision**：Independent `sid` 保留 IAM 验证、撤销、user-info 和 logout notification 生命周期，但不代表第三方本地会话。
- 2026-07-25 — **Decision**：核心测试 seams 为 `issueAuthorizationCode`、`redeemIndependentGrant` 和 `completeGatewayLogin` 三个 consumer-owned 操作。
- 2026-07-25 — **Decision**：采用四票 DAG；`01` 与 `02` 可并行，`03` 汇合 API smoke 与 Independent grant，`04` 在完整迁移后收缩旧接口并锁定架构。
- 2026-07-25 — **Authorization**：维护者明确要求进入 `/to-spec`；本次授权只包含发布 spec 与跨会话 journal，不包含拆票或实现。
- 2026-07-25 — **Authorization**：维护者调用并确认 `/to-tickets`；本次授权只包含发布 implementation tickets 及同步 tracker，不包含领取 ticket 或实现。
- 2026-07-25 — **Authorization**：维护者确认进入 `/implement`；按依赖顺序领取 ticket `01`，不扩大到尚未领取的后续 tickets。
- 2026-07-25 — **Validation**：Ticket `01` 通过结构契约 13/13、API Core ordinary 102/102、API ordinary 204/204，以及根 smoke 的 API Core 1、OIDC 8、API 1 共 10 项；3 个 smoke tasks 均 cache bypass。受影响 package lint/typecheck、文档、env naming 和 whitespace checks 通过，未发现相关进程或临时目录残留。
- 2026-07-25 — **Review**：以 `ab7e427c3e4c957174f4cc88089f2efe113e5896` 为 fixed point 的 Standards 与 Spec 双轴评审在完整实现范围上清零；修复覆盖 parent env/env-file 隔离、共享 harness ownership、无 PID close、Windows cleanup deadline 与 post-kill exit confirmation。
- 2026-07-25 — **Decision**：共享 process smoke harness、普通契约测试与 Windows Job smoke 由 `@iam/api-core` 持有；API 与 OIDC 只提供各自 environment、启动命令和 readiness probe。
- 2026-07-25 — **Authorization**：在 feature 级 `/implement` 授权下，ticket `01` handoff 后按依赖前沿领取 `02`，继续使用全新子代理实现上下文。
- 2026-07-25 — **Validation**：Ticket `02` 通过 API ordinary 209/209 与真实 API entry smoke 1/1；受影响的 module、use-case、route、port contract、audit/session 行为，以及 `@iam/api` lint/typecheck、文档、env naming 和 whitespace checks 全部通过。
- 2026-07-25 — **Review**：以 `74437b3fb3db1060dabf37b146b9e2edc54dbb02` 为 fixed point 的 Standards 与 Spec 双轴评审在完整实现范围上清零；唯一 finding 通过把 redirect policy tests 归回 validator/use-case seam 并去重修复。
- 2026-07-25 — **Decision**：Independent 路径只消费 `issueAuthorizationCode` 与 `redeemIndependentGrant`；旧 `consumeAuthCode` 与 `createLocalSession` 暂时仅供尚未迁移的 Gateway callback 使用。
- 2026-07-25 — **Authorization**：在 feature 级 `/implement` 授权下，ticket `02` handoff 后按已解阻依赖前沿领取 `03`，继续使用全新子代理实现上下文。
- 2026-07-25 — **Validation**：Ticket `03` 通过 API ordinary 211/211 与真实 API entry smoke 1/1；受影响的 module、use-case、handler、route、port contract、audit/session tests，以及 `@iam/api` lint/typecheck、文档、env naming 和 whitespace checks 全部通过。
- 2026-07-25 — **Review**：以 `9860c89105b0d1d94e23a8fc6c690a7e93c589f3` 为 fixed point 的 Standards 与 Spec 双轴评审在完整实现范围上清零；修复覆盖最窄 ORCAS consumer port、Gateway 失败资源 outcome，以及只通过 Custom SSO module interface 观察补偿。
- 2026-07-25 — **Decision**：ORCAS 由 Custom SSO module composition 通过最窄 consumer-owned port 注入；Gateway callback use case 只负责入口校验、一次 `completeGatewayLogin` 委托和结果映射。
- 2026-07-25 — **Authorization**：在 feature 级 `/implement` 授权下，ticket `03` handoff 后领取最终 ticket `04`，继续使用全新子代理实现上下文。
- 2026-07-25 — **Validation**：Ticket `04` 的初始 RED 由 architecture synthetic controls 精确识别旧两阶段 aliases、重复 consumed-code 类型与应用层 Session Kernel 模型泄漏；修复后 API ordinary 213/213、真实 API entry smoke 1/1、architecture/port contract 21/21，以及 `@iam/api` lint/typecheck、文档、env naming 和完整范围 whitespace checks 全部通过。
- 2026-07-25 — **Review**：以 `1365dd9fca6a31486a67404e58d767b2f4c0902a` 为 fixed point 的 Standards 与 Spec 双轴评审在完整范围 `1365dd9f...350c2992` 上清零；唯一 P2 finding 通过负向 public-key 类型契约修复，并以临时暴露 `resolveAuthorizationGrant` 触发 TS2344 后撤销 mutation 的方式证明防回归能力。
- 2026-07-25 — **Decision**：Production adapter 只公开三个 consumer-owned 目标操作；`resolveAuthorizationGrant`、`issueClientCredential` 及旧 `consumeAuthCode`、`createLocalSession` 均由类型契约禁止进入公开返回面。
