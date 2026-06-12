## Context

IAM API 当前在 `/sso/.well-known/authentication-configuration` 中用请求 URL 的 origin 拼接 authorize、logout 和第三方 OA 端点。该做法在同一 APISIX 承接内外网双域名时不够稳定：后端看到的 host/protocol 可能来自反向代理链路，且未知 Host 不应生成可继续使用的 SSO discovery 响应。

SSO authorize/callback 当前用 `redirectUrl.startsWith(validRedirectUrl)` 校验 client 回跳地址。这个模型可以表达简单前缀，但不能安全表达一级子域或路径树，也会让 `https://app.example.com.evil.com`、`/foobar` 这类字符串前缀误匹配成为风险。

## Goals / Non-Goals

**Goals:**

- 让 `/sso/.well-known/authentication-configuration` 根据可信入口网络返回内网或外网 SSO endpoint URL。
- 由 APISIX 依据内外网双域名注入 `X-IAM-Entry-Network: internal | external`，API 只校验枚举值。
- 强制 API 配置 `SSO_INTERNAL_ORIGIN` 和 `SSO_EXTERNAL_ORIGIN`，端点 path 继续复用现有 endpoint env。
- 将 `validRedirectUrls: string[]` 的语义升级为受限 URL pattern，并由 API 与 Admin API 共享同一 matcher/parser。
- 保持现有 client extAttributes 存储结构，不做 DB migration。

**Non-Goals:**

- 不改 `/sso/authorize`、`/sso/callback`、`/sso/logout`、`loginOA`、`loginWX` 的现有重定向链路。
- 不把 `entryNetwork` 暴露到 discovery 响应体。
- 不支持任意正则、协议通配、端口通配、host 中间通配或 path 中间通配。
- 不在 Admin 前端复制完整 matcher 逻辑；前端仅更新提示文案。

## Decisions

### 入口网络由 APISIX 判定

APISIX 使用内外网双域名分别匹配 IAM SSO route，并覆盖注入 `X-IAM-Entry-Network`：

- 外网 route 注入 `external`
- 内网 route 注入 `internal`
- 不保留无 host 限制的 `/sso/*` 兜底 route

API 不再根据 `Host`、`X-Forwarded-Host` 或源 IP 自行判断内外网，只接受 header 枚举。缺失或非法值 SHALL 返回 400。

替代方案是 API 解析 trusted proxy header 或源 IP/CIDR。拒绝这些方案是因为入口域名是 discovery URL 的权威来源，且 APISIX 最接近入口事实；后端重复维护 host alias 会产生配置漂移。

### Discovery 只切换 origin

API 新增必填 env：

- `SSO_INTERNAL_ORIGIN`
- `SSO_EXTERNAL_ORIGIN`

两个 origin 在启动时校验为 URL，并规范化为无尾斜杠。`AUTHORIZATION_ENDPOINT`、`LOGOUT_ENDPOINT` 和 `THIRDPARTY_OA_ENDPOINT` 继续表示 path。响应 URL 用选中的 origin 和现有 path 拼接。

替代方案是为内外网分别配置完整 authorize/logout/OA URL。拒绝该方案是因为当前内外网仅 origin 不同，拆成多组完整 URL 会增加配置漂移概率。

### Redirect pattern 保持 string[] 存储

`validRedirectUrls` 继续是 `string[]`，但每个字符串解释为受限 URL pattern。共享 helper 放在 `packages/domain`，供 `apps/api` 运行时校验与 `apps/admin-api` 写入校验复用。

替代方案是将配置迁移为结构化对象。拒绝该方案是因为当前需求可以用 string pattern 表达，DB migration 和 Admin 表单重构会扩大变更面。

### 受限 URL pattern 规则

Pattern SHALL 使用 `new URL()` 解析，并遵循以下规则：

- 允许 `http` 和 `https`，但 redirectUrl 与 pattern 的协议必须一致。
- hostname 精确匹配，或仅允许最左侧一级通配 `*.example.com`。
- `*.example.com` 只匹配一级子域，不匹配根域，也不匹配多级子域。
- port 严格匹配，并遵循 URL 默认端口归一化；不支持端口通配。
- pattern 不允许 query/hash；redirectUrl 可携带 query/hash，但校验只看 protocol、host、port、pathname。
- origin-only pattern 表示该 origin 下所有 path。
- 普通 path pattern 表示该 path 节点及其子树，必须遵守 segment 边界；`/app` 匹配 `/app`、`/app/`、`/app/a`，不匹配 `/application`。
- path 末尾 `/*` 表示至少位于该子路径下；`/callback/*` 不匹配 `/callback`，匹配 `/callback/` 和 `/callback/a`。
- path 大小写敏感，不做自定义 URL decode 归一化。
- IDN 和 IPv6 由 URL parser 规范化；wildcard 不适用于 IP 地址。

运行时遇到历史非法 pattern 时跳过该 pattern，并记录结构化 warn。只要存在一条合法 pattern 匹配，redirectUrl 即通过；否则返回现有 `InvalidRedirectUriError`。

## Risks / Trade-offs

- [Risk] 旧配置依赖字符串前缀边界外行为，例如 `/foo` 匹配 `/foobar`。→ Mitigation: 在 proposal 标记 breaking，并通过测试和文档明确新 segment 边界。
- [Risk] APISIX route 拆分后缺少某个域名导致 SSO route 不命中。→ Mitigation: route 不保留兜底，发布前运行 `gateway:apisix:validate` 和 dry-run diff，失败尽早暴露。
- [Risk] header 被客户端伪造。→ Mitigation: APISIX route 使用覆盖写入 header；API 只作为二道防线校验枚举，不用用户可控 Host 推导。
- [Risk] Admin API 与 API runtime matcher 规则不一致。→ Mitigation: matcher/parser 放 `packages/domain`，两端复用同一 helper 和测试夹具。
- [Risk] 历史脏 pattern 造成运行时 500。→ Mitigation: 运行时跳过坏规则并记录 warn，最终按“不匹配”处理。

## Migration Plan

1. 添加 domain redirect URL pattern helper 和单元测试。
2. 在 Admin API client 创建/更新路径接入 pattern 校验，并更新 Admin 表单提示文案。
3. 在 API env 中加入 `SSO_INTERNAL_ORIGIN`、`SSO_EXTERNAL_ORIGIN`，并更新 dev/prod compose 示例。
4. 修改 `/sso/.well-known/authentication-configuration` 按 `X-IAM-Entry-Network` 选择 origin，缺失/非法返回 400。
5. 修改 SSO authorize/callback redirect 校验为共享 pattern matcher。
6. 拆分 dev/prod IAM SSO APISIX routes，按 hosts 注入 `X-IAM-Entry-Network`，保留 CORS 和限流语义。
7. 更新文档和 OpenSpec baseline 后再归档。

Rollback 策略：回滚 API 与 APISIX manifest 到旧版本，并保留新增 env 不使用；redirect pattern helper 不改变 DB 结构，因此无需数据回滚。

## Open Questions

无。
