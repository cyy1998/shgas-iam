## Context

当前 `authentication-sessions` baseline 中，SSO 授权码由 `/sso/authorize` 写入 `auth_code:<code>`，Gateway 和 Independent 两种模式分别通过 `/sso/callback` 与 `/sso/token` 兑换局部会话。局部会话由三类 Redis 数据共同表达：`local_<client>_session:<sid>` 保存用户快照，`local_session_reverse:<sid>` 保存反向全局会话 ID，`local_session_set:<globalSessionId>` 保存全局会话下的局部会话索引。

现状风险集中在四个地方：授权码读取后不删除，局部会话三份 Redis 数据并发写入但没有一致性边界，登出过程中 Independent 客户端 `logoutEndpoint` 失败会阻断后续全局清理，以及鉴权侧只读取 local key 导致残留 local key 仍可能放行。

## Goals / Non-Goals

**Goals:**

- 让 SSO 授权码只能成功兑换一次，避免同一 code 创建多个局部会话。
- 让局部会话实体、反向映射和集合索引具备一致的创建语义，避免部分写入造成漏删或幽灵索引。
- 让 SSO 登出优先完成 IAM 自身 Redis 清理，并把 Independent 客户端通知失败降级为可观测事件。
- 让局部会话鉴权校验 local key、reverse key 和 global key 的一致性，避免残留 local key 继续放行。
- 通过 focused Bun tests 覆盖重复兑换、全局会话失效、原子写入失败、登出外部通知失败和残留 local key 等场景。

**Non-Goals:**

- 不改变现有 REST API 路径和响应主体结构。
- 不引入新的数据库表、Drizzle migration 或 PostgreSQL 事务。
- 不重新设计客户端注册模型，不改变 `managementLevel`、`callbackEndpoint` 或 `logoutEndpoint` 字段。
- 不把 Independent 客户端登出通知改造成异步队列；本次只保证 IAM Redis 状态不被外部失败阻断。

## Decisions

### Decision 1: 授权码使用 Redis 原子消费

`callback` 与 `setToken` SHALL 使用 Redis 原子读删语义消费 `auth_code:<code>`，优先使用 ioredis 支持的 `getdel`；如果运行环境兼容性不足，则用 Lua 脚本实现等价的 get-and-delete。

理由：授权码是一次性凭证，读取后不删除会导致重复兑换局部会话。单独 `get` 后 `del` 存在并发窗口，两个请求可能同时读到同一个 code。

替代方案：只在成功 `setLocalSession` 后删除 `auth_code`。该方案在局部会话创建失败时更容易重试，但仍有并发重复兑换窗口，且需要更复杂的幂等状态。

### Decision 2: 局部会话创建使用单一 Redis 原子单元

`setLocalSession` SHALL 先确认 `global_session:<globalSessionId>` 存在且 TTL 大于 0，再用 Redis transaction 或 Lua 脚本一次性写入 local key、reverse key、ZSET member 和 ZSET TTL。失败时不应留下可鉴权的局部会话实体。

理由：三份 Redis 数据表达同一业务事实，使用 `Promise.all` 并发写入时，任一命令失败都可能造成实体与索引不一致。

替代方案：保留并发写入并在 catch 中补偿删除。该方案实现简单，但补偿本身也可能失败，且难以证明没有短暂可鉴权窗口。

### Decision 3: 局部会话有效性校验包含 global session

读取局部会话用于鉴权或网关授权时，系统 SHALL 同时校验 local key、reverse key 和对应 global key。若 reverse/global 缺失，系统 SHALL 拒绝鉴权，并尽量删除当前 local key 与 reverse key。

理由：即使写删流程已经加强，生产环境仍可能存在历史残留或异常残留 local key。鉴权侧增加一致性校验可以把残留数据从“继续放行”降级为“拒绝并清理”。

替代方案：只依赖登出清理完整性。该方案对理想路径足够，但无法防御历史残留、Redis 局部故障或手工修复时的遗漏。

### Decision 4: 登出优先保证 IAM Redis 清理，外部通知失败可观测但不阻断

SSO 登出 SHALL 先获取有效局部会话列表，然后清理 IAM Redis 中的 local/reverse/global/set 数据。Independent 客户端 `logoutEndpoint` 通知失败 SHALL 被记录日志，但不阻断 IAM Redis 清理和 HTTP 登出响应。

理由：业务系统通知是跨系统副作用，不能成为 IAM 自身会话删除的事务前置条件。否则一个客户端异常会导致全局会话和其它客户端局部会话残留。

替代方案：保留当前同步失败即失败。该方案更容易暴露客户端通知问题，但会把外部系统可用性耦合到 IAM 登出一致性。

### Decision 5: 测试使用 Redis fake 覆盖失败边界

新增或扩展 SSO/session service tests，使用可注入或 mock 的 Redis fake 模拟 `getdel`、transaction/Lua 失败、TTL 失效和外部 fetch 失败，不依赖真实 Redis 或网络。

理由：这些问题的关键不是 happy path，而是并发、过期和部分失败边界。fake 能稳定验证契约，避免集成环境不稳定。

替代方案：只加真实 Redis 集成测试。该方案更贴近生产，但成本高、速度慢，不适合作为本次最小验证。

## Risks / Trade-offs

- [Risk] `GETDEL` 在目标 Redis 版本不可用 → Mitigation: 使用 Lua fallback 或直接用 Lua 作为统一实现。
- [Risk] 鉴权额外读取 reverse/global key 增加 Redis 请求数 → Mitigation: 仅对 local session 路径增加校验；可以用 pipeline 合并读取。
- [Risk] 登出不因 `logoutEndpoint` 失败而失败，业务系统可能短时保留自己的 session → Mitigation: 记录结构化日志，保留后续接入异步重试或运维告警的空间。
- [Risk] 历史残留 `local_session_set` member 仍会在 Redis 中存在到集合过期或下次清理 → Mitigation: 登出和鉴权路径都做过期/缺失清理，不把残留 member 作为有效会话。
- [Risk] 授权码消费后局部会话创建失败会导致用户需要重新发起授权 → Mitigation: 这是安全优先取舍；失败响应应明确为无效 code 或会话失效，由客户端重新走 `/sso/authorize`。
