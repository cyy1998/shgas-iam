---
status: accepted
---

# 由服务端统一拥有 Subject Claim Catalog 代际

IAM 只运行一个全局 active Subject Claim Catalog；Client 继续持久化完整 `subjectClaims`，但不再持久化、提交、读取或协商 `subjectClaimCatalogVersion`。协议 Adapter 仍用服务端 active Catalog 构造带版本的瞬时 Subject Claim Selection，Custom SSO Wire 与 OIDC Claims Snapshot 继续拥有各自的契约版本。这个决定局部取代 [ADR-0007](0007-separate-versioned-custom-sso-client-configuration.md) 中按 Client 配置持久化 Catalog version 的要求，不改变其独立 `customSsoConfigVersion` 屏障，也不改变 [ADR-0008](0008-adopt-client-subject-projection.md) 的协议中性投影 seam。

Catalog 代际升级采用全局维护窗口硬切换：关闭全部协议流量、配置写入和相关 runtime 后，migration 忽略旧 Catalog marker 的缺失或取值并统一删除该 key，再用当前 strict schema 验证剩余 Custom SSO 配置；未知 claim、非法 mode 或其他损坏配置阻断切换。随后完整 inventory cutover 为全部未软删除且已配置的 Custom SSO 与 OIDC Client 各推进一次协议 epoch，包含禁用、维护中及 `iam-admin`，再完成 generation-fenced cache invalidation、精确 artifact cleanup 和 verify 后恢复流量。阶段间不要求跨数据库 migration 与 epoch command 原子提交，因为完整停机使中间态不可观察；任一步失败都保持停流并只允许 forward 修复。

## Consequences

- Client protocol manifest 删除 `targetCatalogVersion`，但继续完整覆盖 Client/协议并保留 `expectedEpoch`、`ownerStatus`、显式 `null` 与 `expectedEpoch + 1` 幂等边界。
- active Catalog 的任何 claim disclosure 变化都推进全部已配置 Custom SSO Client 的 `customSsoConfigVersion`；旧 Grant、Independent Client Credential 与 Gateway Local Session 不得自动继承新披露。OIDC 继续推进 `oidcConfigVersion`，使旧 Claims Snapshot 失效。
- 后续 Catalog V3 仍是服务端全局单代切换，不提供 per-Client V2/V3 共存、caller 选择、运行时双读或 fallback。
- migration 只宽容已废弃 Catalog marker；删除 marker 后的配置必须完整通过当前 strict schema，不修剪未知 claim，也不补写其他默认值。
