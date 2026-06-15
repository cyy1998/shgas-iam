## ADDED Requirements

### Requirement: Tender internal auth forward-auth SHALL forward only apikey
仓库管理的 tender dev/prod APISIX manifest 中，调用 IAM `/auth/internal-authz` 的 `forward-auth` route SHALL 仅向该 auth endpoint 转发 `apikey` 请求头。

#### Scenario: Tender internal-authz request headers are minimal
- **WHEN** 开发者查看 `gateway/manifests/dev/tender/routes.yaml` 或 `gateway/manifests/prod/tender/routes.yaml` 中指向 `/auth/internal-authz` 的 `forward-auth` 配置
- **THEN** `request_headers` SHALL 只包含 `apikey`
- **AND** `request_headers` MUST NOT 包含 `IP-Chain`
- **AND** `request_headers` MUST NOT 包含 `Cookie`
- **AND** `request_headers` MUST NOT 包含 `Authorization`
