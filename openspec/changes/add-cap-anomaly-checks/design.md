## Context

当前 `apps/api` 的公开认证入口分布在 open/auth 两个 tier：`/open/code/send` 负责发送短信验证码，`/auth/login/password` 和 `/auth/login/mobile` 负责创建全局会话，`/open/users/userInfo` 用于忘记密码前查询用户脱敏手机号。现有登录失败计数已经以用户为维度记录密码登录和登录用途短信验证码失败，但短信发送、用户信息查询和首次自动化撞库请求缺少人机校验层。

cap.js 适合放在这些未登录、可被机器批量调用、且由用户主动触发的动作前。为了减少正常用户摩擦，本变更采用“短信发送强制 Cap，其余入口异常触发 Cap”的策略。

## Goals / Non-Goals

**Goals:**

- 在 `/open/code/send` 发短信前强制校验 Cap token，降低短信轰炸和短信成本风险。
- 在 `/auth/login/password`、`/auth/login/mobile`、`/open/users/userInfo` 的异常条件下要求 Cap token，降低撞库、验证码暴力猜测和用户枚举风险。
- 提供统一的后端 Cap 校验服务、风险判定服务和前端可识别错误，避免每个接口重复实现。
- 保留现有登录成功、失败计数、账号暂停、短信验证码 TTL、SSO session 创建和脱敏信息返回语义。
- 前端在收到需要 Cap 的错误后能够触发 cap.js 校验并携带 token 重试原请求。

**Non-Goals:**

- 不用 Cap 替代密码、短信验证码、session、权限校验或 Redis 限流。
- 不在已登录 admin CRUD、internal API、SSO 授权码兑换或网关鉴权中加入 Cap。
- 不在本变更中重做 `MAGIC_CODE`、redirect URL 校验、短信供应商、密码强度或用户枚举错误文案治理。
- 不要求引入新的 PostgreSQL 表；风险计数和 token 状态优先使用 Redis。

## Decisions

### 使用统一 `human-verification` 后端服务

新增应用侧服务模块承载 Cap 校验、token 消费和风险判定。route handler 只负责读取 `capToken`、基础请求信息和业务参数，然后调用统一服务判断是否允许继续。

原因：
- 四个入口跨 open/auth tier，散落实现容易出现策略不一致。
- 统一服务便于测试和后续扩展到更多高风险动作。
- 可以集中处理 Redis key、TTL、错误码和日志字段。

备选方案是直接在每个 handler 中调用 cap.js；实现更快，但规则会变脆，不适合后续维护。

### 内嵌 `@cap.js/server` 到 `apps/api`

在 `apps/api` 中内嵌 `@cap.js/server` 并暴露 Cap challenge/redeem 端点，使用现有 Redis 保存 challenge/token 状态。

原因：
- 当前后端已经是 Bun + Hono，内嵌方案部署最少，前端 API_PREFIX 也更容易复用。
- Redis 已经是 session、验证码和登录失败计数的基础设施。
- 当前 IAM 只有一个 SSO 前端和一个 public API 入口，独立 Cap 服务的 dashboard、多站点管理和额外运维成本暂时不是刚需。

实施时仅提供内嵌模式所需配置，例如 `CAP_SITE_KEY`、`CAP_SECRET`、`CAP_CHALLENGE_TTL`、`CAP_TOKEN_TTL`、`CAP_ENABLED` 和异常阈值配置。

### 用可识别业务错误驱动前端 Cap 重试

Cap 缺失、无效或异常触发时，API 返回统一业务错误码，例如在 `ServiceStatusCode` 中新增 `HumanVerificationRequired`。响应 message 可使用“需要人机校验”，前端据此触发 cap.js，并把得到的 token 放入下一次请求体的 `capToken` 字段。

原因：
- HTTP 仍可保持现有 envelope 结构，不破坏 `request<T>` 的基础处理方式。
- 前端可以在不同页面复用同一个“请求需要 Cap -> solve -> retry”的 helper。
- 比仅靠 message 文案判断更稳定。

### 风险判定按 action + subject + IP/client 组合建模

后端为每类动作定义 action：
- `sendSmsCode` 对应 `/open/code/send`
- `passwordLogin` 对应 `/auth/login/password`
- `mobileLogin` 对应 `/auth/login/mobile`
- `openUserInfoLookup` 对应 `/open/users/userInfo`

风险状态存入 Redis，维度包括 action、username 或 phoneNumber、IP、Client header。建议策略：
- `sendSmsCode`: 总是要求 Cap；另外保留手机号、IP、usage 维度频率限制。
- `passwordLogin`: 同一 username、IP 或 Client 在短窗口内失败达到阈值后，下一次请求要求 Cap。
- `mobileLogin`: 同一 phoneNumber、IP 或 Client 在短窗口内验证码错误达到阈值后，下一次请求要求 Cap。
- `openUserInfoLookup`: 同一 IP 或 Client 在短窗口内查询不同 username 数量达到阈值后，下一次请求要求 Cap。

风险判定应在不泄露用户存在性的前提下尽量记录统一状态。对于不存在用户导致的异常，也应记录 IP/client 维度的查询或登录尝试。

### Cap token 一次性消费并绑定动作

服务端校验 Cap token 成功后应将 token 标记为已消费，且 token 应绑定 action，避免用户在一个低风险动作上求解后复用于短信发送等高成本动作。内嵌 Cap 服务在兑换 token 时 SHALL 将 `cap-token:<tokenHash>` 与 action 上下文保存到 Redis，并在业务校验时消费。

原因：
- 防止 token 重放和跨动作复用。
- 便于审计“哪个动作触发了人机校验”。

## Risks / Trade-offs

- [Risk] cap.js 在老旧浏览器、低性能设备或脚本加载失败时影响登录。 → Mitigation: 提供明确错误提示，支持功能开关 `CAP_ENABLED=false`，并在前端只在必要时求解。
- [Risk] 异常阈值过低会让正常员工频繁遇到 Cap。 → Mitigation: 阈值使用环境变量配置，先以较宽松阈值上线，并记录触发日志观察。
- [Risk] 只做 Cap 不做限流仍可能被高并发消耗后端资源。 → Mitigation: Cap 与 Redis 频率限制并用，短信发送必须同时受手机号/IP 频控约束。
- [Risk] `/open/users/userInfo` 异常条件依赖 username 去重统计，可能增加 Redis 状态复杂度。 → Mitigation: 使用短 TTL set 或 sorted set，仅保存窗口内摘要，不落 PostgreSQL。
- [Risk] 内嵌 Cap 服务会让 `apps/api` 同时承担认证业务和 challenge/redeem 流量。 → Mitigation: 对 Cap 端点保留基础频控和日志，必要时后续另起变更评估独立部署。

## Migration Plan

1. 增加 Cap 配置和服务抽象，默认在非生产环境可通过 `CAP_ENABLED=false` 跳过真实校验。
2. 新增内嵌 Cap challenge/redeem 端点，并在 SSO 前端配置 site key 和 API endpoint。
3. 为四个 API request schema 增加可选 `capToken` 字段；短信发送业务强制要求 token，其余入口只在异常触发时要求 token。
4. 前端封装 cap.js 求解与重试 helper，逐步接入登录页、忘记密码页和用户中心手机号绑定入口。
5. 上线时先启用日志和宽松阈值，确认触发率后收紧阈值。
6. 回滚时关闭 `CAP_ENABLED` 或将阈值调高，保留字段兼容，不影响旧请求体。

## Open Questions

- `HumanVerificationRequired` 的业务码具体取值是否需要预留在 `packages/contracts` 的错误码区间中？
- `/open/users/userInfo` 的异常阈值应按 IP、Client 还是两者组合优先触发，需要结合网关是否能提供可信源 IP。
- 是否需要对 Cap 触发和失败事件接入集中审计日志，本变更先要求应用日志可观测。
